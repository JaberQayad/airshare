export class WebRTCManager {
    constructor(socket, config, ui) {
        this.socket = socket;
        this.config = config;
        this.ui = ui;
        this.peerConnection = null;
        this.dataChannel = null;
        this.receivedBuffers = [];
        this.receivedSize = 0;
        this.fileInfo = {};
        this.receivedFile = null;
        this.isReceiving = false;
        this.lastProgressUpdate = 0;
        this.lastProgressPercentage = -1;
    }

    setupPeerConnection(roomId, isInitiator, fileToSend = null) {
        this.ui.updateStatus(isInitiator ? 'Waiting for peer...' : 'Connecting...');

        this.peerConnection = new RTCPeerConnection({ iceServers: this.config.iceServers });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('candidate', { candidate: event.candidate, roomId: roomId });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            if (this.peerConnection.connectionState === 'connected') {
                this.ui.updateStatus('Connected');
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
        channel.onopen = () => {
            if (fileToSend) {
                this.sendFile(fileToSend);
            }
        };

        channel.onmessage = (event) => {
            this.handleMessage(event);
        };
    }

    async sendFile(file) {
        this.ui.showTransfer(file.name, file.size);

        // Send metadata
        const metadata = {
            type: 'metadata',
            name: file.name,
            size: file.size,
            fileType: file.type
        };
        this.dataChannel.send(JSON.stringify(metadata));

        // Send file in chunks
        const chunkSize = this.config.chunkSize || 262144; // 256KB for better throughput
        let offset = 0;
        const MAX_BUFFERED_AMOUNT = this.config.maxBufferedAmount || 1048576; // 1MB for better performance

        while (offset < file.size) {
            if (this.dataChannel.readyState !== 'open') {
                break;
            }

            if (this.dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                await new Promise(resolve => setTimeout(resolve, 50)); // Increased from 10ms
                continue;
            }

            const slice = file.slice(offset, offset + chunkSize);
            const buffer = await slice.arrayBuffer();

            try {
                this.dataChannel.send(buffer);
            } catch (e) {
                break;
            }

            offset += buffer.byteLength;

            // Throttle progress updates to max 10x per second (100ms intervals)
            const now = Date.now();
            if (now - this.lastProgressUpdate > 100) {
                const percentage = Math.round((offset / file.size) * 100);
                if (percentage !== this.lastProgressPercentage) {
                    this.ui.updateProgress(percentage, `Transferring... ${percentage}%`);
                    this.lastProgressPercentage = percentage;
                }
                this.lastProgressUpdate = now;
            }
        }

        this.ui.updateProgress(100, 'Transfer Complete!');
    }

    handleMessage(event) {
        const data = event.data;

        if (typeof data === 'string') {
            const metadata = JSON.parse(data);
            if (metadata.type === 'metadata') {
                this.fileInfo = metadata;
                this.receivedBuffers = [];
                this.receivedSize = 0;
                this.isReceiving = true;
                this.lastProgressUpdate = 0;
                this.lastProgressPercentage = -1;
                this.ui.showTransfer(metadata.name, metadata.size);
            }
        } else if (this.isReceiving) {
            this.receivedBuffers.push(data);
            this.receivedSize += data.byteLength;

            // Throttle progress updates to max 10x per second (100ms intervals)
            const now = Date.now();
            if (now - this.lastProgressUpdate > 100) {
                const percentage = Math.round((this.receivedSize / this.fileInfo.size) * 100);
                if (percentage !== this.lastProgressPercentage) {
                    this.ui.updateProgress(percentage, `Transferring... ${percentage}%`);
                    this.lastProgressPercentage = percentage;
                }
                this.lastProgressUpdate = now;
            }

            // Check if file is completely received
            if (this.receivedSize >= this.fileInfo.size) {
                this.isReceiving = false;
                this.completeFileReceive();
            }
        }
    }

    completeFileReceive() {
        try {
            const blob = new Blob(this.receivedBuffers, { type: this.fileInfo.fileType });
            this.receivedFile = new File([blob], this.fileInfo.name, { type: this.fileInfo.fileType });
            this.receivedBuffers = []; // Clear buffer to free memory
            this.ui.showDownload();
        } catch (e) {
            this.ui.updateProgress(0, 'Transfer failed');
        }
    }

    downloadFile() {
        if (this.receivedFile) {
            const url = URL.createObjectURL(this.receivedFile);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.receivedFile.name;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    async handleSignal(type, data) {
        if (!this.peerConnection) return;

        switch (type) {
            case 'offer':
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.socket.emit('answer', { answer, roomId: data.roomId });
                break;
            case 'answer':
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                break;
            case 'candidate':
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    // Silently fail on invalid ICE candidates
                }
                break;
        }
    }

    createOffer(roomId) {
        if (this.peerConnection) {
            this.peerConnection.createOffer()
                .then((offer) => this.peerConnection.setLocalDescription(offer))
                .then(() => {
                    this.socket.emit('offer', { offer: this.peerConnection.localDescription, roomId: roomId });
                })
                .catch(e => {});
        }
    }
}
