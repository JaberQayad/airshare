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

        console.log(`=== Creating peer connection (${isInitiator ? 'sender' : 'receiver'}) ===`);
        console.log('Ice servers count:', this.config.iceServers.length);
        console.log('Ice servers:', JSON.stringify(this.config.iceServers));
        
        this.peerConnection = new RTCPeerConnection({ iceServers: this.config.iceServers });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[ICE] Candidate:', {
                    type: event.candidate.type,
                    protocol: event.candidate.protocol,
                    candidate: event.candidate.candidate.substring(0, 60)
                });
                this.socket.emit('candidate', { candidate: event.candidate, roomId });
            } else {
                console.log('[ICE] Gathering complete - all candidates sent');
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log(`[CONNECTION] State changed to: ${state}`);
            
            if (state === 'connected') {
                console.log('✓ Peer connection established');
                this.ui.updateStatus('Connected');
                this.stats.startTime = Date.now();
            } else if (state === 'connecting') {
                console.log('⏳ Peer connection connecting...');
            } else if (state === 'failed') {
                console.error('✗ Peer connection failed - no valid ICE candidate pairs found');
                console.error('  - Check firewall settings');
                console.error('  - Check if both peers have internet connectivity');
                this.ui.showError('Connection failed: Unable to establish peer connection (firewall/NAT issue?)');
            } else if (state === 'disconnected') {
                console.warn('⚠️  Connection disconnected');
                this.ui.showError('Connection disconnected');
            } else if (state === 'closed') {
                console.log('Connection closed');
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log(`[ICE-CONNECTION] State: ${state}`);
            
            if (state === 'checking') {
                console.log('⏳ ICE checking candidate pairs...');
            } else if (state === 'connected') {
                console.log('✓ ICE connection established');
            } else if (state === 'completed') {
                console.log('✓ ICE connection completed');
            } else if (state === 'failed') {
                console.error('✗ ICE connection failed - all candidate pairs failed');
            } else if (state === 'disconnected') {
                console.warn('⚠️  ICE disconnected');
            }
        };

        this.peerConnection.onicegatheringstatechange = () => {
            const state = this.peerConnection.iceGatheringState;
            console.log(`[ICE-GATHERING] State: ${state}`);
        };

        this.peerConnection.onerror = (event) => {
            console.error('[PEER-CONNECTION] Error:', event);
            this.ui.showError('Peer connection error: ' + (event.error?.message || 'unknown'));
        };

        if (isInitiator) {
            console.log('[DATA-CHANNEL] Creating data channel (sender)...');
            this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
                ordered: true  // Ensure chunks arrive in order
            });
            this.setupDataChannel(this.dataChannel, fileToSend);
        } else {
            console.log('[DATA-CHANNEL] Waiting for data channel from sender...');
            this.peerConnection.ondatachannel = (event) => {
                console.log('[DATA-CHANNEL] Received from sender:', event.channel.label);
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
                console.error('ICE gathering state:', this.peerConnection?.iceGatheringState);
                this.ui.showError('Data channel failed to open - connection may be blocked by firewall or NAT');
            }
        }, 10000);
        
        channel.onopen = () => {
            clearTimeout(openTimeout);
            console.log('✓ Data channel opened successfully');
            console.log('Channel ready state:', channel.readyState);
            console.log('Peer connection state:', this.peerConnection?.connectionState);
            console.log('fileToSend:', fileToSend ? fileToSend.name : 'none', 'pendingFile:', this.pendingFile ? this.pendingFile.name : 'none');
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
            console.log('[DRAIN] Buffered amount low event, current buffer:', (this.dataChannel.bufferedAmount / 1024).toFixed(1) + 'KB');
            if (this.sendState.paused && this.sendState.file) {
                console.log('[DRAIN] Resuming transfer from offset:', this.sendState.offset);
                this.sendState.paused = false;
                this.continueSendFile();
            }
        };

        channel.onclose = () => {
            clearTimeout(openTimeout);
            console.warn('✗ Data channel closed');
            console.log('Final states:');
            console.log('  - Channel readyState:', channel.readyState);
            console.log('  - Peer connection state:', this.peerConnection?.connectionState);
            console.log('  - ICE connection state:', this.peerConnection?.iceConnectionState);
            console.log('  - Transfer offset:', this.sendState.offset, 'of', this.sendState.file?.size || 'unknown');
            this.ui.updateStatus('Connection closed');
        };

        channel.onerror = (error) => {
            clearTimeout(openTimeout);
            console.error('✗ Data channel error event:', error);
            console.error('Channel details:');
            console.error('  - readyState:', channel.readyState);
            console.error('  - bufferedAmount:', channel.bufferedAmount);
            console.error('  - label:', channel.label);
            console.error('Peer connection details:');
            console.error('  - connectionState:', this.peerConnection?.connectionState);
            console.error('  - iceConnectionState:', this.peerConnection?.iceConnectionState);
            console.error('  - iceGatheringState:', this.peerConnection?.iceGatheringState);
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
            console.log('Cannot continue send: file=' + !!this.sendState.file + ', channel=' + !!this.dataChannel + ', state=' + this.dataChannel?.readyState);
            return;
        }

        const file = this.sendState.file;
        const highWater = this.config.bufferHighWater || 1048576; // 1MB
        const lowWater = this.config.bufferLowWater || 262144; // 256KB
        const chunkBatchSize = 3; // Reduced: process only 3 chunks per iteration for better backpressure handling
        let chunksThisBatch = 0;

        while (this.sendState.offset < file.size) {
            // Check backpressure BEFORE reading file
            if (this.dataChannel.bufferedAmount > highWater) {
                console.log(`[BACKPRESSURE] Buffered: ${(this.dataChannel.bufferedAmount / 1024).toFixed(1)}KB, pausing...`);
                this.sendState.backpressureCount++;
                
                // Adaptive chunk sizing: reduce on frequent backpressure
                if (this.sendState.backpressureCount > 3) {
                    const oldSize = this.sendState.currentChunkSize;
                    this.sendState.currentChunkSize = Math.max(
                        this.config.minChunkSize || 32768,
                        Math.floor(this.sendState.currentChunkSize * 0.7)
                    );
                    console.log(`[BACKPRESSURE] Reducing chunk size from ${oldSize} to ${this.sendState.currentChunkSize}`);
                    this.sendState.backpressureCount = 0;
                }
                
                this.sendState.paused = true;
                console.log('[SEND] Paused at offset', this.sendState.offset, 'waiting for drain...');
                return; // Wait for bufferedamountlow event
            } else {
                if (this.sendState.backpressureCount > 0) {
                    console.log('[BACKPRESSURE] Recovered, resuming with buffer at', (this.dataChannel.bufferedAmount / 1024).toFixed(1) + 'KB');
                    this.sendState.backpressureCount = 0;
                }
            }

            // Adaptive: increase chunk size if connection is stable and buffer low
            if (this.sendState.backpressureCount === 0 && this.dataChannel.bufferedAmount < lowWater && this.sendState.currentChunkSize < (this.config.maxChunkSize || 262144)) {
                this.sendState.currentChunkSize = Math.min(
                    this.config.maxChunkSize || 262144,
                    Math.floor(this.sendState.currentChunkSize * 1.05)
                );
            }

            const end = Math.min(this.sendState.offset + this.sendState.currentChunkSize, file.size);
            
            // Read the file slice
            let buffer;
            try {
                const slice = file.slice(this.sendState.offset, end);
                // Use FileReader for better handling of large files
                buffer = await this.readFileSliceAsBuffer(slice);
            } catch (e) {
                console.error('[READ] Failed to read file slice:', e);
                this.ui.showError(`Read error: ${e.message}`);
                break;
            }

            // Compute CRC32 for integrity
            const crc32 = calculateCRC32(buffer);
            
            // Send chunk with header: [4-byte crc32][chunk data]
            const chunkWithCrc = new Uint8Array(buffer.byteLength + 4);
            new DataView(chunkWithCrc.buffer).setUint32(0, crc32, true); // little-endian
            chunkWithCrc.set(new Uint8Array(buffer), 4);

            try {
                if (this.dataChannel.readyState !== 'open') {
                    console.log('[SEND] Channel closed during transfer, offset:', this.sendState.offset);
                    break;
                }
                this.dataChannel.send(chunkWithCrc.buffer);
            } catch (e) {
                console.error('[SEND] Send error:', e.message);
                this.ui.showError(`Send failed: ${e.message}`);
                break;
            }

            this.sendState.offset += buffer.byteLength;
            this.updateProgressStats(this.sendState.offset, file.size, true);

            // Batch processing: yield to event loop after N chunks
            chunksThisBatch++;
            if (chunksThisBatch >= chunkBatchSize) {
                chunksThisBatch = 0;
                // Longer yield to allow receiver to process and backpressure events
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        if (this.sendState.offset >= file.size) {
            console.log('[SEND] Transfer complete:', this.sendState.offset, 'bytes sent');
            this.ui.updateProgress(100, 'Transfer Complete!');
        }
    }

    // Helper: read file slice as ArrayBuffer using FileReader (non-blocking for large files)
    readFileSliceAsBuffer(slice) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve(reader.result);
            };
            reader.onerror = () => {
                reject(new Error('FileReader error'));
            };
            reader.readAsArrayBuffer(slice);
        });
    }

    updateProgressStats(transferred, total, isSender = false) {
        const now = Date.now();
        
        // Throttle: update at most 2x per second (500ms) AND if percentage changed >=1%
        // This prevents UI updates from blocking the send loop
        if (now - this.stats.lastProgressUpdate < 500) {
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
                    console.log('[SIGNAL] Received offer from sender');
                    console.log('[SIGNAL] SDP offer length:', data.offer?.sdp?.length);
                    if (!data.offer) {
                        throw new Error('No offer in data');
                    }
                    console.log('[SIGNAL] Setting remote description (offer)...');
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                    console.log('✓ [SIGNAL] Remote description (offer) set');
                    console.log('[SIGNAL] Creating answer...');
                    const answer = await this.peerConnection.createAnswer();
                    console.log('✓ [SIGNAL] Answer created, setting as local description');
                    await this.peerConnection.setLocalDescription(answer);
                    console.log('✓ [SIGNAL] Local description set');
                    console.log('[SIGNAL] Sending answer back to sender');
                    this.socket.emit('answer', { answer: this.peerConnection.localDescription, roomId: this.roomId });
                    console.log('✓ [SIGNAL] Answer emitted');
                    break;
                case 'answer':
                    console.log('[SIGNAL] Received answer from receiver');
                    console.log('[SIGNAL] SDP answer length:', data.answer?.sdp?.length);
                    if (!data.answer) {
                        throw new Error('No answer in data');
                    }
                    console.log('[SIGNAL] Setting remote description (answer)...');
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log('✓ [SIGNAL] Remote description (answer) set');
                    break;
                case 'candidate':
                    if (data.candidate) {
                        console.log('[SIGNAL] Received ICE candidate:', {
                            type: data.candidate.type,
                            protocol: data.candidate.protocol
                        });
                        try {
                            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                            console.log('✓ [SIGNAL] ICE candidate added');
                        } catch (e) {
                            console.warn('[SIGNAL] Failed to add ICE candidate:', e.message);
                        }
                    }
                    break;
            }
        } catch (e) {
            console.error(`✗ [SIGNAL] Error handling ${type}:`, e.message);
            console.error('  Stack:', e.stack);
            this.ui.showError(`Signal error (${type}): ${e.message}`);
        }
    }

    createOffer() {
        if (!this.peerConnection) {
            console.error('Cannot create offer: no peer connection');
            return;
        }

        console.log('[SIGNAL] Creating offer...');
        console.log('[SIGNAL] Peer connection state:', this.peerConnection.connectionState);
        console.log('[SIGNAL] ICE connection state:', this.peerConnection.iceConnectionState);
        
        this.peerConnection.createOffer()
            .then((offer) => {
                console.log('✓ [SIGNAL] Offer created');
                console.log('[SIGNAL] Offer SDP length:', offer.sdp.length);
                console.log('[SIGNAL] Setting as local description...');
                return this.peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                console.log('✓ [SIGNAL] Local description set');
                if (!this.peerConnection.localDescription) {
                    throw new Error('Local description not set');
                }
                const localDesc = this.peerConnection.localDescription;
                console.log('[SIGNAL] Sending offer to receiver via server');
                console.log('[SIGNAL] Offer details:', {
                    type: localDesc.type,
                    sdpLength: localDesc.sdp.length,
                    roomId: this.roomId
                });
                this.socket.emit('offer', { 
                    offer: localDesc, 
                    roomId: this.roomId 
                });
                console.log('✓ [SIGNAL] Offer emitted');
            })
            .catch(e => {
                console.error('✗ [SIGNAL] Failed to create/send offer:', e.message);
                console.error('  Stack:', e.stack);
                this.ui.showError(`Failed to create offer: ${e.message}`);
            });
    }
}

