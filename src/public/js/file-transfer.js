// File Transfer Manager
import { logger, utils } from './utils.js';

export class FileTransfer {
    constructor(connection) {
        this.connection = connection;
        this.files = [];
        this.currentTransfer = null;
        this.chunkSize = 16384; // 16KB chunks
        this.paused = false;
        this.cancelled = false;
        
        // Stats
        this.stats = {
            startTime: 0,
            bytesTransferred: 0,
            totalBytes: 0,
            speed: 0,
            progress: 0
        };
        
        // Callbacks
        this.onProgress = null;
        this.onComplete = null;
        this.onError = null;
    }

    // Sender: Add files to send
    addFiles(fileList) {
        this.files = Array.from(fileList).map((file, index) => ({
            id: utils.generateId(),
            file: file,
            name: file.name,
            size: file.size,
            type: file.type,
            index: index
        }));
        
        this.stats.totalBytes = this.files.reduce((sum, f) => sum + f.size, 0);
        logger.info('Added files:', this.files.length, 'Total:', utils.formatBytes(this.stats.totalBytes));
        
        return this.files;
    }

    // Sender: Send metadata about files
    async sendMetadata(password = null) {
        const metadata = {
            type: 'metadata',
            files: this.files.map(f => ({
                id: f.id,
                name: f.name,
                size: f.size,
                type: f.type,
                index: f.index
            })),
            totalSize: this.stats.totalBytes,
            fileCount: this.files.length,
            hasPassword: !!password,
            timestamp: Date.now()
        };

        if (password) {
            metadata.passwordHash = await utils.hashPassword(password);
        }

        this.connection.send(metadata);
        logger.info('Metadata sent:', metadata.fileCount, 'files');
    }

    // Sender: Start sending files
    async startSending(password = null, onProgress, onComplete) {
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.stats.startTime = Date.now();
        this.stats.bytesTransferred = 0;
        this.paused = false;
        this.cancelled = false;

        logger.log('Starting file transfer...');

        for (const fileInfo of this.files) {
            if (this.cancelled) {
                logger.warn('Transfer cancelled');
                return;
            }

            await this.sendFile(fileInfo, password);
        }

        // Send completion signal
        this.connection.send({
            type: 'complete',
            totalBytes: this.stats.bytesTransferred,
            duration: Date.now() - this.stats.startTime
        });

        logger.info('Transfer complete!');
        if (this.onComplete) {
            this.onComplete(this.stats);
        }
    }

    async sendFile(fileInfo, password) {
        const file = fileInfo.file;
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        let offset = 0;
        let chunkIndex = 0;

        logger.log('Sending file:', file.name);

        // Send file start signal
        this.connection.send({
            type: 'file-start',
            fileId: fileInfo.id,
            name: file.name,
            size: file.size
        });

        while (offset < file.size && !this.cancelled) {
            if (this.paused) {
                await new Promise(resolve => {
                    const checkPause = setInterval(() => {
                        if (!this.paused || this.cancelled) {
                            clearInterval(checkPause);
                            resolve();
                        }
                    }, 100);
                });
            }

            const chunk = file.slice(offset, offset + this.chunkSize);
            const arrayBuffer = await chunk.arrayBuffer();
            
            let dataToSend = arrayBuffer;
            let iv = null;

            // Encrypt if password provided
            if (password) {
                const encrypted = await utils.encryptData(arrayBuffer, password);
                dataToSend = encrypted.encrypted;
                iv = Array.from(encrypted.iv);
            }

            // Send chunk
            this.connection.send({
                type: 'chunk',
                fileId: fileInfo.id,
                chunkIndex: chunkIndex,
                totalChunks: totalChunks,
                data: dataToSend,
                iv: iv
            });

            offset += this.chunkSize;
            chunkIndex++;
            this.stats.bytesTransferred += arrayBuffer.byteLength;

            // Update stats
            this.updateStats();

            // Call progress callback for sender
            if (this.onProgress) {
                this.onProgress(this.stats);
            }

            // Small delay to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 1));
        }

        logger.info('File sent:', file.name);
    }

    // Receiver: Handle incoming data
    async handleIncomingData(data, password = null) {
        if (data.type === 'metadata') {
            return this.handleMetadata(data);
        } else if (data.type === 'file-start') {
            return this.handleFileStart(data);
        } else if (data.type === 'chunk') {
            return await this.handleChunk(data, password);
        } else if (data.type === 'complete') {
            return this.handleComplete(data);
        }
    }

    handleMetadata(metadata) {
        this.currentTransfer = {
            files: metadata.files.map(f => ({
                ...f,
                chunks: [],
                receivedChunks: 0,
                receivedBytes: 0
            })),
            totalSize: metadata.totalSize,
            fileCount: metadata.fileCount,
            hasPassword: metadata.hasPassword,
            startTime: Date.now()
        };

        this.stats.totalBytes = metadata.totalSize;
        this.stats.startTime = Date.now();
        
        logger.info('Metadata received:', metadata.fileCount, 'files');
        return { type: 'metadata', data: metadata };
    }

    handleFileStart(data) {
        const file = this.currentTransfer.files.find(f => f.id === data.fileId);
        if (file) {
            file.receiving = true;
            logger.log('Receiving file:', data.name);
        }
        return { type: 'file-start', data };
    }

    async handleChunk(data, password) {
        const file = this.currentTransfer.files.find(f => f.id === data.fileId);
        if (!file) {
            logger.error('File not found for chunk:', data.fileId);
            return null;
        }

        let chunkData = data.data;

        // Decrypt if password provided
        if (password && data.iv) {
            const iv = new Uint8Array(data.iv);
            chunkData = await utils.decryptData(data.data, iv, password);
        }

        file.chunks[data.chunkIndex] = chunkData;
        file.receivedChunks++;
        file.receivedBytes += chunkData.byteLength;
        this.stats.bytesTransferred += chunkData.byteLength;

        this.updateStats();

        if (this.onProgress) {
            this.onProgress(this.stats, file);
        }

        return { type: 'chunk', file, stats: this.stats };
    }

    handleComplete(data) {
        logger.info('Transfer complete signal received');
        
        // Assemble files
        const files = this.currentTransfer.files.map(fileInfo => {
            const blob = new Blob(fileInfo.chunks, { type: fileInfo.type });
            return {
                name: fileInfo.name,
                size: fileInfo.size,
                type: fileInfo.type,
                blob: blob
            };
        });

        if (this.onComplete) {
            this.onComplete({ files, stats: this.stats });
        }

        return { type: 'complete', files };
    }

    updateStats() {
        const elapsed = (Date.now() - this.stats.startTime) / 1000;
        this.stats.speed = elapsed > 0 ? this.stats.bytesTransferred / elapsed : 0;
        this.stats.progress = this.stats.totalBytes > 0 
            ? (this.stats.bytesTransferred / this.stats.totalBytes) * 100 
            : 0;
    }

    pause() {
        this.paused = true;
        logger.warn('Transfer paused');
    }

    resume() {
        this.paused = false;
        logger.info('Transfer resumed');
    }

    cancel() {
        this.cancelled = true;
        logger.warn('Transfer cancelled');
        
        this.connection.send({
            type: 'cancelled'
        });
    }
}
