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
    }

    setupPeerConnection(roomId, isInitiator, fileToSend = null) {
        console.log('Setting up peer connection. Initiator:', isInitiator);
        this.ui.updateStatus(isInitiator ? 'Waiting for peer...' : 'Connecting...');

        this.peerConnection = new RTCPeerConnection({ iceServers: this.config.iceServers });

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('candidate', { candidate: event.candidate, roomId: roomId });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
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
            console.log('Data channel opened');
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
        const chunkSize = this.config.chunkSize || 16384; // Default 16KB
        let offset = 0;
        const MAX_BUFFERED_AMOUNT = this.config.maxBufferedAmount || 65536; // Default 64KB
        let lastLogTime = 0;

        while (offset < file.size) {
            if (this.dataChannel.readyState !== 'open') {
                console.error('Data channel is not open');
                break;
            }

            if (this.dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                if (Date.now() - lastLogTime > 1000) {
                    console.log(`Backpressure: buffered ${this.dataChannel.bufferedAmount}, waiting...`);
                    lastLogTime = Date.now();
                }
                await new Promise(resolve => setTimeout(resolve, 10));
                continue;
            }

            const slice = file.slice(offset, offset + chunkSize);
            const buffer = await slice.arrayBuffer();

            try {
                this.dataChannel.send(buffer);
            } catch (e) {
                console.error('Error sending chunk:', e);
                break;
            }

            offset += buffer.byteLength;

            const percentage = Math.round((offset / file.size) * 100);
            this.ui.updateProgress(percentage, `Transferring... ${percentage}%`);

            if (Date.now() - lastLogTime > 2000) {
                console.log(`Progress: ${percentage}%, Offset: ${offset}/${file.size}`);
                lastLogTime = Date.now();
            }
        }

        if (offset >= file.size) {
            this.ui.updateProgress(100, 'Transfer Complete!');
        }
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
                this.ui.showTransfer(metadata.name, metadata.size);
                console.log('Receiving file:', metadata.name, metadata.size);
            }
        } else if (this.isReceiving) {
            this.receivedBuffers.push(data);
            this.receivedSize += data.byteLength;
            const percentage = Math.round((this.receivedSize / this.fileInfo.size) * 100);

            this.ui.updateProgress(percentage, `Transferring... ${percentage}%`);

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
            console.log('File received successfully');
        } catch (e) {
            console.error('Error completing file receive:', e);
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
                    console.error('Error adding received ice candidate', e);
                }
                break;
        }
    }

    createOffer(roomId) {
        if (this.peerConnection) {
            this.peerConnection.createOffer()
                .then((offer) => this.peerConnection.setLocalDescription(offer))
                .then(() => {
                    console.log('Sending offer');
                    this.socket.emit('offer', { offer: this.peerConnection.localDescription, roomId: roomId });
                })
                .catch(e => console.error('Error creating offer:', e));
        }
    }
}
