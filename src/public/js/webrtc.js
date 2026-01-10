import { calculateCRC32, crc32ToHex } from './crc32.js';
import { formatBytes } from './utils.js';

export class WebRTCManager {
    constructor(socket, config, ui) {
        this.socket = socket;
        this.config = config;
        this.ui = ui;
        
        // Connection state
        this.peerConnection = null;
        this.dataChannel = null;
        this.roomId = null;
        this.isInitiator = false;
        
        // Send state
        this.sendState = {
            file: null,
            fileId: null,
            offset: 0,
            chunkSize: config.defaultChunkSize || 131072,
            currentChunkSize: config.defaultChunkSize || 131072,
            startTime: 0,
            backpressureCount: 0,
            paused: false
        };
        
        // Receive state
        this.receiveState = {
            fileInfo: null,
            chunks: new Map(), // chunkIndex -> { data, crc32 }
            totalChunks: 0,
            receivedChunks: 0,
            receivedSize: 0,
            streamWriter: null,
            streamHandle: null,
            useStreaming: false,
            lastValidationError: null
        };
        
        // Transfer stats
        this.stats = {
            lastProgressUpdate: 0,
            lastProgressPercentage: -1,
            startTime: null,
            speedSamples: [] // Track recent speeds for averaging
        };
    }

    setupPeerConnection(roomId, isInitiator, fileToSend = null) {
        this.roomId = roomId;
        this.isInitiator = isInitiator;
        this.ui.updateStatus(isInitiator ? 'Waiting for peer...' : 'Connecting...');

        this.peerConnection = new RTCPeerConnection({ iceServers: this.config.iceServers });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('candidate', { candidate: event.candidate, roomId });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            if (this.peerConnection.connectionState === 'connected') {
                this.ui.updateStatus('Connected');
                this.stats.startTime = Date.now();
            }
        };

        if (isInitiator) {
            this.dataChannel = this.peerConnection.createDataChannel('fileTransfer');
            this.setupDataChannel(this.dataChannel, fileToSend);
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }
    }

    setupDataChannel(channel, fileToSend) {
        channel.binaryType = 'arraybuffer';
        
        // Set backpressure thresholds for proper flow control
        channel.bufferedAmountLowThreshold = this.config.bufferLowWater || 262144; // 256KB
        
        channel.onopen = () => {
            if (fileToSend) {
                this.sendFile(fileToSend);
            }
        };

        channel.onmessage = (event) => {
            this.handleMessage(event);
        };

        // Resume sending when buffer drains below threshold
        channel.onbufferedamountlow = () => {
            if (this.sendState.paused && this.sendState.file) {
                this.sendState.paused = false;
                this.continueSendFile();
            }
        };

        channel.onclose = () => {
            this.ui.updateStatus('Connection closed');
        };

        channel.onerror = (error) => {
            this.ui.showError(`Data channel error: ${error.message || 'Unknown error'}`);
        };
    }

    async sendFile(file) {
        this.sendState.file = file;
        this.sendState.fileId = Math.random().toString(36).substring(7);
        this.sendState.startTime = Date.now();
        this.sendState.offset = 0;
        this.sendState.chunkSize = this.config.defaultChunkSize || 131072;
        
        this.ui.showTransfer(file.name, file.size);

        // Calculate metadata with integrity info
        const totalChunks = Math.ceil(file.size / this.sendState.chunkSize);
        const metadata = {
            type: 'metadata',
            fileId: this.sendState.fileId,
            name: file.name,
            size: file.size,
            fileType: file.type,
            lastModified: file.lastModified,
            totalChunks: totalChunks,
            chunkSize: this.sendState.chunkSize
        };

        try {
            this.dataChannel.send(JSON.stringify(metadata));
            await this.continueSendFile();
        } catch (e) {
            this.ui.showError(`Failed to start transfer: ${e.message}`);
        }
    }

    async continueSendFile() {
        if (!this.sendState.file || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }

        const file = this.sendState.file;
        const highWater = this.config.bufferHighWater || 1048576; // 1MB
        const lowWater = this.config.bufferLowWater || 262144; // 256KB

        while (this.sendState.offset < file.size) {
            // Check backpressure and pause if needed
            if (this.dataChannel.bufferedAmount > highWater) {
                this.sendState.backpressureCount++;
                
                // Adaptive chunk sizing: reduce on frequent backpressure
                if (this.sendState.backpressureCount > 5) {
                    this.sendState.currentChunkSize = Math.max(
                        this.config.minChunkSize || 32768,
                        Math.floor(this.sendState.currentChunkSize * 0.8)
                    );
                    this.sendState.backpressureCount = 0;
                }
                
                this.sendState.paused = true;
                return; // Wait for bufferedamountlow event
            }

            // Adaptive: increase chunk size if connection is stable
            if (this.sendState.backpressureCount === 0 && this.sendState.currentChunkSize < (this.config.maxChunkSize || 262144)) {
                this.sendState.currentChunkSize = Math.min(
                    this.config.maxChunkSize || 262144,
                    Math.floor(this.sendState.currentChunkSize * 1.1)
                );
            }

            const end = Math.min(this.sendState.offset + this.sendState.currentChunkSize, file.size);
            const slice = file.slice(this.sendState.offset, end);
            const buffer = await slice.arrayBuffer();

            // Compute CRC32 for integrity
            const crc32 = calculateCRC32(buffer);
            
            // Send chunk with header: [4-byte crc32][chunk data]
            const chunkWithCrc = new Uint8Array(buffer.byteLength + 4);
            new DataView(chunkWithCrc.buffer).setUint32(0, crc32, true); // little-endian
            chunkWithCrc.set(new Uint8Array(buffer), 4);

            try {
                this.dataChannel.send(chunkWithCrc.buffer);
            } catch (e) {
                this.ui.showError(`Send failed: ${e.message}`);
                break;
            }

            this.sendState.offset += buffer.byteLength;
            this.updateProgressStats(this.sendState.offset, file.size, true);

            // Yield to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        if (this.sendState.offset >= file.size) {
            this.ui.updateProgress(100, 'Transfer Complete!');
        }
    }

    updateProgressStats(transferred, total, isSender = false) {
        const now = Date.now();
        
        // Throttle: update at most 10x per second AND if percentage changed >=1%
        if (now - this.stats.lastProgressUpdate < 100) {
            return;
        }

        const percentage = Math.round((transferred / total) * 100);
        if (percentage === this.stats.lastProgressPercentage) {
            return;
        }

        this.stats.lastProgressPercentage = percentage;
        this.stats.lastProgressUpdate = now;

        // Calculate speed
        const elapsedMs = now - this.stats.startTime;
        const elapsedSec = elapsedMs / 1000;
        const speedBytesPerSec = transferred / elapsedSec;

        // Calculate ETA
        const remainingBytes = total - transferred;
        const etaSec = remainingBytes / speedBytesPerSec;
        
        const speedMbps = (speedBytesPerSec / (1024 * 1024)).toFixed(2);
        const eta = this.formatETA(etaSec);
        const message = `${percentage}% • ${speedMbps} MB/s • ETA ${eta}`;

        this.ui.updateProgress(percentage, message);
    }

    formatETA(seconds) {
        if (seconds < 60) return Math.round(seconds) + 's';
        if (seconds < 3600) return Math.round(seconds / 60) + 'm';
        return Math.round(seconds / 3600) + 'h';
    }

    async handleMessage(event) {
        const data = event.data;

        // Metadata message
        if (typeof data === 'string') {
            try {
                const metadata = JSON.parse(data);
                if (metadata.type === 'metadata') {
                    await this.initializeReceiver(metadata);
                }
            } catch (e) {
                this.ui.showError(`Invalid metadata: ${e.message}`);
            }
            return;
        }

        // Chunk data
        if (this.receiveState.fileInfo) {
            await this.handleChunkData(data);
        }
    }

    async initializeReceiver(metadata) {
        this.receiveState.fileInfo = metadata;
        this.receiveState.totalChunks = metadata.totalChunks;
        this.receiveState.chunks.clear();
        this.receiveState.receivedChunks = 0;
        this.receiveState.receivedSize = 0;

        this.ui.showTransfer(metadata.name, metadata.size);

        // Decide: in-memory vs streaming
        const maxInMemory = this.config.maxInMemorySize || 209715200; // 200MB
        if (metadata.size > maxInMemory) {
            // Try streaming
            if (await this.initializeStreaming(metadata)) {
                this.receiveState.useStreaming = true;
            } else {
                // Fallback to in-memory (user warned by initializeStreaming)
                this.receiveState.useStreaming = false;
            }
        } else {
            this.receiveState.useStreaming = false;
        }

        this.stats.startTime = Date.now();
    }

    async initializeStreaming(metadata) {
        // Try File System Access API first (Chrome 86+, Edge 86+)
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: metadata.name,
                    types: [{ accept: { [metadata.fileType || 'application/octet-stream']: ['.bin'] } }]
                });

                const writable = await handle.createWritable();
                this.receiveState.streamWriter = writable;
                this.receiveState.streamHandle = handle;
                return true;
            } catch (e) {
                // User cancelled or error occurred
            }
        }

        // Show warning if file is large
        if (metadata.size > this.config.maxInMemorySize) {
            this.ui.showWarning(
                `File is ${formatBytes(metadata.size)}. ` +
                `Your browser doesn't support streaming. ` +
                `Large file transfer may consume significant memory.`
            );
        }

        return false;
    }

    async handleChunkData(buffer) {
        if (!this.receiveState.fileInfo || buffer.byteLength < 4) {
            return;
        }

        // Extract CRC32 (first 4 bytes) and verify
        const view = new DataView(buffer);
        const receivedCrc32 = view.getUint32(0, true);
        const chunkData = buffer.slice(4);
        const computedCrc32 = calculateCRC32(chunkData);

        if (receivedCrc32 !== computedCrc32) {
            const err = `Chunk integrity check failed: expected ${crc32ToHex(computedCrc32)}, got ${crc32ToHex(receivedCrc32)}`;
            this.receiveState.lastValidationError = err;
            this.ui.showError(err);
            return;
        }

        // Store chunk
        const chunkIndex = this.receiveState.receivedChunks;
        this.receiveState.chunks.set(chunkIndex, {
            data: chunkData,
            crc32: receivedCrc32
        });

        this.receiveState.receivedChunks++;
        this.receiveState.receivedSize += chunkData.byteLength;

        this.updateProgressStats(this.receiveState.receivedSize, this.receiveState.fileInfo.size, false);

        // Stream to file if using streaming API
        if (this.receiveState.useStreaming && this.receiveState.streamWriter) {
            try {
                await this.receiveState.streamWriter.write(chunkData);
            } catch (e) {
                this.ui.showError(`Failed to write chunk: ${e.message}`);
                this.receiveState.useStreaming = false;
            }
        }

        // Check if transfer complete
        if (this.receiveState.receivedChunks >= this.receiveState.totalChunks) {
            await this.completeFileReceive();
        }
    }

    async completeFileReceive() {
        try {
            // Close stream if active
            if (this.receiveState.streamWriter) {
                await this.receiveState.streamWriter.close();
                this.ui.showDownload(null); // Streaming saved automatically
                return;
            }

            // Reconstruct file from chunks (in-memory path)
            const chunks = [];
            for (let i = 0; i < this.receiveState.receivedChunks; i++) {
                const chunk = this.receiveState.chunks.get(i);
                if (!chunk) {
                    this.ui.showError(`Missing chunk ${i}`);
                    return;
                }
                chunks.push(chunk.data);
            }

            const blob = new Blob(chunks, { type: this.receiveState.fileInfo.fileType });
            const file = new File([blob], this.receiveState.fileInfo.name, {
                type: this.receiveState.fileInfo.fileType,
                lastModified: this.receiveState.fileInfo.lastModified
            });

            this.receiveState.chunks.clear();
            this.ui.showDownload(file);
        } catch (e) {
            this.ui.showError(`Failed to complete transfer: ${e.message}`);
        }
    }

    downloadFile(file) {
        if (!file) return;

        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
    }

    async handleSignal(type, data) {
        if (!this.peerConnection) return;

        switch (type) {
            case 'offer':
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.socket.emit('answer', { answer, roomId: this.roomId });
                break;
            case 'answer':
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                break;
            case 'candidate':
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    // Silently fail on invalid candidates
                }
                break;
        }
    }

    createOffer() {
        if (!this.peerConnection) return;

        this.peerConnection.createOffer()
            .then((offer) => this.peerConnection.setLocalDescription(offer))
            .then(() => {
                this.socket.emit('offer', { offer: this.peerConnection.localDescription, roomId: this.roomId });
            })
            .catch(e => {});
    }
}

