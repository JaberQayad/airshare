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
        this.pendingFile = fileToSend; // Store file for later if needed
        this.ui.updateStatus(isInitiator ? 'Waiting for peer...' : 'Connecting...');

        this.peerConnection = new RTCPeerConnection({ iceServers: this.config.iceServers });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE candidate found:', event.candidate.candidate.substring(0, 80));
                this.socket.emit('candidate', { candidate: event.candidate, roomId });
            } else {
                console.log('ICE gathering complete');
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.ui.updateStatus('Connected');
                this.stats.startTime = Date.now();
            } else if (this.peerConnection.connectionState === 'failed') {
                console.error('Peer connection failed - ICE connection failed');
                this.ui.showError('Connection failed: Unable to establish peer connection (firewall issue?)');
            } else if (this.peerConnection.connectionState === 'disconnected') {
                this.ui.showError('Connection disconnected');
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log('ICE connection state:', state);
            if (state === 'failed') {
                console.error('ICE connection failed - no valid candidate pairs');
            } else if (state === 'disconnected') {
                console.warn('ICE connection disconnected');
            }
        };

        this.peerConnection.onicegatheringstatechange = () => {
            console.log('ICE gathering state:', this.peerConnection.iceGatheringState);
        };

        this.peerConnection.onerror = (event) => {
            console.error('Peer connection error:', event);
            this.ui.showError('Peer connection error: ' + (event.error?.message || 'unknown'));
        };

        if (isInitiator) {
            this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
                ordered: true  // Ensure chunks arrive in order
            });
            this.setupDataChannel(this.dataChannel, fileToSend);
        } else {
            this.peerConnection.ondatachannel = (event) => {
                console.log('Data channel received from sender');
                this.dataChannel = event.channel;
                this.setupDataChannel(this.dataChannel);
            };
        }
    }

    setupDataChannel(channel, fileToSend) {
        channel.binaryType = 'arraybuffer';
        
        // Set backpressure thresholds for proper flow control
        channel.bufferedAmountLowThreshold = this.config.bufferLowWater || 262144; // 256KB
        
        // Set a timeout to detect if channel never opens
        const openTimeout = setTimeout(() => {
            if (channel.readyState !== 'open') {
                console.error('Data channel did not open within 10 seconds');
                console.error('Current state:', channel.readyState);
                console.error('Peer connection state:', this.peerConnection?.connectionState);
                console.error('ICE connection state:', this.peerConnection?.iceConnectionState);
                this.ui.showError('Data channel failed to open - connection may be blocked by firewall');
            }
        }, 10000);
        
        channel.onopen = () => {
            clearTimeout(openTimeout);
            console.log('Data channel opened, fileToSend:', fileToSend ? fileToSend.name : 'none', 'pendingFile:', this.pendingFile ? this.pendingFile.name : 'none');
            const fileToTransfer = fileToSend || this.pendingFile;
            if (fileToTransfer) {
                console.log('Starting file transfer:', fileToTransfer.name);
                this.sendFile(fileToTransfer);
            } else {
                console.log('No file to send');
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
            clearTimeout(openTimeout);
            console.log('Data channel closed');
            console.log('Peer connection state:', this.peerConnection?.connectionState);
            console.log('ICE connection state:', this.peerConnection?.iceConnectionState);
            this.ui.updateStatus('Connection closed');
        };

        channel.onerror = (error) => {
            clearTimeout(openTimeout);
            console.error('Data channel error event:', error);
            console.error('Channel state:', channel.readyState);
            console.error('Channel buffered amount:', channel.bufferedAmount);
            console.error('Peer connection state:', this.peerConnection?.connectionState);
            console.error('ICE connection state:', this.peerConnection?.iceConnectionState);
            const errorMsg = error && error.message ? error.message : 'Unknown error';
            this.ui.showError(`Data channel error: ${errorMsg}. State: ${channel.readyState}`);
        };
    }

    async sendFile(file) {
        this.sendState.file = file;
        this.sendState.fileId = Math.random().toString(36).substring(7);
        this.sendState.startTime = Date.now();
        this.sendState.offset = 0;
        this.sendState.chunkSize = this.config.defaultChunkSize || 131072;
        
        this.ui.showTransfer(file.name, file.size);

        // Wait for channel to open if not already
        if (this.dataChannel.readyState !== 'open') {
            console.log('Waiting for data channel to open...');
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (this.dataChannel.readyState === 'open') {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
        }

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
            if (this.dataChannel.readyState === 'open') {
                this.dataChannel.send(JSON.stringify(metadata));
                console.log('Metadata sent, starting file transfer');
                await this.continueSendFile();
            } else {
                throw new Error('Data channel failed to open');
            }
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
                if (this.dataChannel.readyState !== 'open') {
                    console.log('Channel closed, stopping transfer');
                    break;
                }
                this.dataChannel.send(chunkWithCrc.buffer);
            } catch (e) {
                this.ui.showError(`Send failed: ${e.message}`);
                console.error('Send error:', e);
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
        if (!this.peerConnection) {
            console.error('No peer connection when handling signal:', type);
            return;
        }

        try {
            switch (type) {
                case 'offer':
                    console.log('Received offer, processing...');
                    if (!data.offer) {
                        throw new Error('No offer in data');
                    }
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                    console.log('Remote description (offer) set');
                    const answer = await this.peerConnection.createAnswer();
                    console.log('Answer created, setting as local description');
                    await this.peerConnection.setLocalDescription(answer);
                    console.log('Local description set, sending answer');
                    this.socket.emit('answer', { answer: this.peerConnection.localDescription, roomId: this.roomId });
                    break;
                case 'answer':
                    console.log('Received answer, processing...');
                    if (!data.answer) {
                        throw new Error('No answer in data');
                    }
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log('Remote description (answer) set');
                    break;
                case 'candidate':
                    if (data.candidate) {
                        console.log('Received ICE candidate');
                        try {
                            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                            console.log('ICE candidate added');
                        } catch (e) {
                            console.warn('Failed to add ICE candidate:', e.message);
                        }
                    }
                    break;
            }
        } catch (e) {
            console.error('Signal handling error:', type, e);
            this.ui.showError(`Signal error (${type}): ${e.message}`);
        }
    }

    createOffer() {
        if (!this.peerConnection) {
            console.error('Cannot create offer: no peer connection');
            return;
        }

        console.log('Creating offer...');
        this.peerConnection.createOffer()
            .then((offer) => {
                console.log('Offer created, setting as local description');
                return this.peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                console.log('Local description set');
                if (!this.peerConnection.localDescription) {
                    throw new Error('Local description not set');
                }
                const localDesc = this.peerConnection.localDescription;
                console.log('Sending offer via socket:', {
                    type: localDesc.type,
                    sdpLength: localDesc.sdp.length,
                    roomId: this.roomId
                });
                this.socket.emit('offer', { 
                    offer: localDesc, 
                    roomId: this.roomId 
                });
            })
            .catch(e => {
                console.error('Failed to create/send offer:', e);
                this.ui.showError(`Failed to create offer: ${e.message}`);
            });
    }
}

