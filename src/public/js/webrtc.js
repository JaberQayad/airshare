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
        
        // Track ICE candidates for diagnostics
        this.iceCandidates = {
            local: [],
            remote: [],
            gatheredLocal: false
        };
        
        this.peerConnection = new RTCPeerConnection({ iceServers: this.config.iceServers });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[ICE] Candidate:', {
                    type: event.candidate.type,
                    protocol: event.candidate.protocol,
                    priority: event.candidate.priority,
                    candidate: event.candidate.candidate.substring(0, 60)
                });
                this.iceCandidates.local.push({
                    type: event.candidate.type,
                    foundation: event.candidate.foundation
                });
                this.socket.emit('candidate', { candidate: event.candidate, roomId });
            } else {
                console.log('[ICE] ✓ Gathering complete - ' + this.iceCandidates.local.length + ' local candidates gathered');
                this.iceCandidates.gatheredLocal = true;
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
                this.logConnectionFailure();
                this.ui.showError('Connection failed: Unable to establish peer connection.\n\nTroubleshooting:\n• Check firewall/NAT settings\n• Try disabling VPN\n• Check if both devices are online\n• Allow pop-ups for camera/microphone (if prompted)');
            } else if (state === 'disconnected') {
                console.warn('⚠️  Connection disconnected');
                this.ui.showError('Connection disconnected - peer went offline');
            } else if (state === 'closed') {
                console.log('Connection closed');
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log(`[ICE-CONNECTION] State: ${state}`);
            
            if (state === 'checking') {
                console.log('⏳ ICE checking ' + this.iceCandidates.local.length + ' local candidates...');
            } else if (state === 'connected') {
                console.log('✓ ICE connection established');
            } else if (state === 'completed') {
                console.log('✓ ICE connection completed');
            } else if (state === 'failed') {
                console.error('✗ ICE connection failed');
                this.logICEFailureDetails();
            } else if (state === 'disconnected') {
                console.warn('⚠️  ICE disconnected - may reconnect');
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
        
        // Set a timeout to detect if channel never opens (30 seconds to allow for slow networks)
        const openTimeout = setTimeout(() => {
            if (channel.readyState !== 'open') {
                console.error('[DATA-CHANNEL] ✗ Channel did not open within 30 seconds');
                console.error('[DATA-CHANNEL] Current state:', channel.readyState);
                console.error('[DATA-CHANNEL] Peer connection state:', this.peerConnection?.connectionState);
                console.error('[DATA-CHANNEL] ICE connection state:', this.peerConnection?.iceConnectionState);
                console.error('[DATA-CHANNEL] ICE gathering state:', this.peerConnection?.iceGatheringState);
                this.logConnectionFailure();
                const message = this.peerConnection?.connectionState === 'failed' 
                    ? 'Could not connect to peer - firewall/NAT blocked.\n\nTry:\n• Disabling VPN\n• Using different WiFi/network\n• Checking firewall settings\n• Allowing browser permissions'
                    : 'Data channel opened but transfer preparation failed.\n\nCheck console for details.';
                this.ui.showError(message);
            }
        }, 30000);
        
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

        // Resume sending when buffer drains significantly
        channel.onbufferedamountlow = () => {
            const bufferedKB = (this.dataChannel.bufferedAmount / 1024).toFixed(1);
            console.log(`[DRAIN] Buffer drained to ${bufferedKB}KB, resuming if paused...`);
            if (this.sendState.paused && this.sendState.file && this.sendState.offset < this.sendState.file.size) {
                console.log(`[DRAIN] ✓ Resuming from offset ${this.sendState.offset}/${this.sendState.file.size}`);
                this.sendState.paused = false;
                // Resume immediately
                this.continueSendFile().catch(e => console.error('[DRAIN] Error resuming:', e));
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
            console.log('[SEND] Waiting for data channel to open (current state: ' + this.dataChannel.readyState + ')...');
            
            // Wait with timeout to prevent infinite waiting
            const channelOpenPromise = new Promise((resolve, reject) => {
                let resolved = false;
                const checkInterval = setInterval(() => {
                    if (this.dataChannel.readyState === 'open') {
                        resolved = true;
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
                
                // Timeout if channel doesn't open in 30 seconds
                setTimeout(() => {
                    if (!resolved) {
                        clearInterval(checkInterval);
                        reject(new Error(`Data channel did not open (state: ${this.dataChannel.readyState})`));
                    }
                }, 30000);
            });
            
            try {
                await channelOpenPromise;
                console.log('[SEND] ✓ Data channel is now open, proceeding with transfer');
            } catch (e) {
                console.error('[SEND] ✗ Timeout waiting for channel to open:', e.message);
                throw e;
            }
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
                console.log('[SEND] ✓ Metadata sent, starting file transfer');
                await this.continueSendFile();
            } else {
                throw new Error(`Cannot send metadata - data channel state is "${this.dataChannel.readyState}". Peer may have disconnected.`);
            }
        } catch (e) {
            console.error('[SEND] ✗ Transfer error:', e.message);
            this.ui.showError(`Transfer failed: ${e.message}`);
        }
    }

    async continueSendFile() {
        if (!this.sendState.file || !this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.log('[SEND] Cannot continue: file=' + !!this.sendState.file + ', channel=' + !!this.dataChannel + ', ready=' + (this.dataChannel?.readyState === 'open'));
            return;
        }

        const file = this.sendState.file;
        const highWater = 1048576; // 1MB - pause if this high
        const targetBuffer = 524288; // 512KB - aim for this
        
        // Dynamic batch size: start at 1, increase based on actual buffer levels
        let currentBatchSize = this.sendState.batchSize || 1;
        let yieldTimeMs = this.sendState.yieldTimeMs || 50;
        let chunksSentThisBatch = 0;

        while (this.sendState.offset < file.size) {
            const bufferedKB = this.dataChannel.bufferedAmount / 1024;
            
            // CRITICAL: Hard pause if buffer is dangerously full
            if (this.dataChannel.bufferedAmount > highWater) {
                console.log(`[BACKPRESSURE] 🛑 CRITICAL: Buffer ${bufferedKB.toFixed(1)}KB > 1MB! Pausing immediately.`);
                this.sendState.paused = true;
                return;
            }

            const end = Math.min(this.sendState.offset + this.sendState.currentChunkSize, file.size);
            const chunkSize = end - this.sendState.offset;
            
            // Read the file slice
            let buffer;
            try {
                const slice = file.slice(this.sendState.offset, end);
                buffer = await this.readFileSliceAsBuffer(slice);
            } catch (e) {
                console.error('[READ] Failed to read chunk:', e);
                this.ui.showError(`Read error: ${e.message}`);
                break;
            }

            // Compute CRC32
            const crc32 = calculateCRC32(buffer);
            const chunkWithCrc = new Uint8Array(buffer.byteLength + 4);
            new DataView(chunkWithCrc.buffer).setUint32(0, crc32, true);
            chunkWithCrc.set(new Uint8Array(buffer), 4);

            // Send
            try {
                if (this.dataChannel.readyState !== 'open') {
                    console.log('[SEND] Channel closed at offset:', this.sendState.offset);
                    break;
                }
                this.dataChannel.send(chunkWithCrc.buffer);
            } catch (e) {
                console.error('[SEND] Send failed:', e.message);
                this.ui.showError(`Send failed: ${e.message}`);
                break;
            }

            this.sendState.offset += buffer.byteLength;
            this.updateProgressStats(this.sendState.offset, file.size, true);

            // Dynamic batch processing
            chunksSentThisBatch++;
            
            if (chunksSentThisBatch >= currentBatchSize) {
                chunksSentThisBatch = 0;
                
                // Analyze buffer and adapt
                if (this.dataChannel.bufferedAmount < 128000) { // Buffer very low (< 128KB)
                    // We can send faster - increase batch size
                    if (currentBatchSize < 20) {
                        currentBatchSize = Math.min(20, currentBatchSize + 2);
                        yieldTimeMs = Math.max(10, yieldTimeMs - 5);
                        console.log(`[ADAPT] ⚡ Buffer low, speeding up: batch=${currentBatchSize}, yield=${yieldTimeMs}ms`);
                    }
                } else if (this.dataChannel.bufferedAmount > targetBuffer) {
                    // Buffer getting full - slow down
                    if (currentBatchSize > 1) {
                        currentBatchSize = Math.max(1, Math.floor(currentBatchSize * 0.7));
                        yieldTimeMs = Math.min(200, yieldTimeMs + 20);
                        console.log(`[ADAPT] 🐌 Buffer rising (${bufferedKB.toFixed(1)}KB), slowing: batch=${currentBatchSize}, yield=${yieldTimeMs}ms`);
                    }
                }
                
                // Yield
                await new Promise(resolve => setTimeout(resolve, yieldTimeMs));
            }
        }

        if (this.sendState.offset >= file.size) {
            console.log('[SEND] ✓ Complete! Sent', this.sendState.offset, 'bytes');
            // Store settings for next transfer
            this.sendState.batchSize = currentBatchSize;
            this.sendState.yieldTimeMs = yieldTimeMs;
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
                            this.addRemoteCandidate(data.candidate);
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

    logConnectionFailure() {
        console.error('\n=== CONNECTION FAILURE DIAGNOSTICS ===');
        console.error('[CONNECTION] Current state: ' + this.peerConnection.connectionState);
        console.error('[ICE-CONNECTION] Current state: ' + this.peerConnection.iceConnectionState);
        console.error('[ICE-GATHERING] Current state: ' + this.peerConnection.iceGatheringState);
        console.error('[ICE] Local candidates gathered: ' + this.iceCandidates.local.length);
        console.error('[ICE] Remote candidates received: ' + this.iceCandidates.remote.length);
        
        if (this.iceCandidates.local.length === 0) {
            console.error('⚠️  NO LOCAL ICE CANDIDATES - Possible causes:');
            console.error('   - STUN servers unreachable');
            console.error('   - Network interface problems');
            console.error('   - Corporate firewall blocking UDP');
        }
        if (this.iceCandidates.remote.length === 0) {
            console.error('⚠️  NO REMOTE ICE CANDIDATES - Possible causes:');
            console.error('   - Other peer not connected');
            console.error('   - Signal relay failed');
            console.error('   - Other peer behind symmetric NAT');
        }
        
        console.error('\nLocal candidates by type:', 
            this.iceCandidates.local.reduce((acc, c) => {
                acc[c.type] = (acc[c.type] || 0) + 1;
                return acc;
            }, {})
        );
        console.error('=== END DIAGNOSTICS ===\n');
    }

    logICEFailureDetails() {
        console.error('\n=== ICE FAILURE DIAGNOSTICS ===');
        console.error('[ICE] Local candidates: ' + this.iceCandidates.local.length);
        console.error('[ICE] Remote candidates: ' + this.iceCandidates.remote.length);
        console.error('[ICE] Local gathering complete: ' + this.iceCandidates.gatheredLocal);
        
        console.error('Possible causes:');
        if (this.iceCandidates.local.length > 0 && this.iceCandidates.remote.length > 0) {
            console.error('✓ Candidates exchanged but connection failed');
            console.error('   - Try disabling VPN');
            console.error('   - Try different network (avoid corporate WiFi)');
            console.error('   - Both peers may need TURN server');
        } else if (this.iceCandidates.local.length === 0) {
            console.error('✗ No local candidates (firewall or STUN issue)');
        } else if (this.iceCandidates.remote.length === 0) {
            console.error('✗ No remote candidates received (other peer unreachable)');
        }
        console.error('=== END ICE DIAGNOSTICS ===\n');
    }

    addRemoteCandidate(candidate) {
        if (candidate) {
            this.iceCandidates.remote.push({
                type: candidate.type,
                foundation: candidate.foundation
            });
        }
    }
}

