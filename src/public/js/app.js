// Main Application - AirShare Playground
import { logger, utils } from './utils.js';
import { PeerConnection } from './peer-connection.js';
import { FileTransfer } from './file-transfer.js';
import { UIManager } from './ui-manager.js';

class AirShareApp {
    constructor() {
        this.ui = new UIManager();
        this.peerConnection = null;
        this.fileTransfer = null;
        this.mode = null; // 'sender' or 'receiver'
        this.password = null;
        this.metadata = null;
        
        this.init();
    }

    async init() {
        logger.log('Initializing AirShare Playground...');
        
        // Check if receiver mode (has peer ID in URL)
        const params = new URLSearchParams(window.location.search);
        const remotePeerId = params.get('peer');
        
        if (remotePeerId) {
            await this.initReceiver(remotePeerId);
        } else {
            await this.initSender();
        }
        
        this.bindEvents();
    }

    async initSender() {
        this.mode = 'sender';
        this.ui.showSection('senderSection');
        this.ui.updateStatus('Ready - Select files to share');
        
        // Initialize peer connection
        this.peerConnection = new PeerConnection(
            (state) => this.onConnectionStateChange(state),
            (data) => this.onDataReceived(data)
        );
        
        try {
            const peerId = await this.peerConnection.initialize();
            const shareUrl = `${window.location.origin}?peer=${peerId}`;
            logger.info('Sender ready. Share URL:', shareUrl);
        } catch (err) {
            logger.error('Failed to initialize sender:', err);
            this.ui.showError('Failed to initialize. Please refresh the page.');
        }
    }

    async initReceiver(remotePeerId) {
        this.mode = 'receiver';
        this.ui.showSection('receiverSection');
        this.ui.updateStatus('Connecting to sender...');
        
        // Initialize peer connection
        this.peerConnection = new PeerConnection(
            (state) => this.onConnectionStateChange(state),
            (data) => this.onDataReceived(data)
        );
        
        try {
            await this.peerConnection.initialize();
            this.peerConnection.connectToPeer(remotePeerId);
            logger.info('Receiver connecting to:', remotePeerId);
        } catch (err) {
            logger.error('Failed to initialize receiver:', err);
            this.ui.showError('Failed to connect. Please check the link.');
        }
    }

    bindEvents() {
        // Theme toggle
        this.ui.elements.themeToggle.addEventListener('click', () => {
            this.ui.toggleTheme();
        });

        // File selection
        this.ui.elements.dropZone.addEventListener('click', () => {
            this.ui.elements.fileInput.click();
        });

        this.ui.elements.fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        // Drag and drop
        this.ui.elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.ui.elements.dropZone.classList.add('drag-over');
        });

        this.ui.elements.dropZone.addEventListener('dragleave', () => {
            this.ui.elements.dropZone.classList.remove('drag-over');
        });

        this.ui.elements.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.ui.elements.dropZone.classList.remove('drag-over');
            this.handleFileSelection(e.dataTransfer.files);
        });

        // Password toggle visibility
        this.ui.elements.passwordToggle?.addEventListener('click', () => {
            const input = this.ui.elements.passwordInput;
            input.type = input.type === 'password' ? 'text' : 'password';
            this.ui.elements.passwordToggle.textContent = input.type === 'password' ? '👁️' : '🙈';
        });

        // Copy link
        this.ui.elements.copyButton?.addEventListener('click', () => {
            this.ui.copyToClipboard(this.ui.elements.shareLinkInput.value);
        });

        // Remove file from list
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-file')) {
                const fileId = e.target.dataset.id;
                this.removeFile(fileId);
            }
        });

        // Receiver: password submit
        this.ui.elements.receiverPassword?.addEventListener('input', (e) => {
            if (e.target.value) {
                this.ui.elements.downloadButton.disabled = false;
            }
        });

        // Download button
        this.ui.elements.downloadButton?.addEventListener('click', () => {
            this.startDownload();
        });

        // Transfer controls
        this.ui.elements.pauseButton?.addEventListener('click', () => {
            this.togglePause();
        });

        this.ui.elements.cancelButton?.addEventListener('click', () => {
            this.cancelTransfer();
        });
    }

    handleFileSelection(fileList) {
        if (!fileList || fileList.length === 0) return;
        
        logger.log('Files selected:', fileList.length);
        
        // Initialize file transfer manager
        this.fileTransfer = new FileTransfer(this.peerConnection);
        const files = this.fileTransfer.addFiles(fileList);
        
        // Display files in UI
        this.ui.displaySelectedFiles(files);
        
        // Generate and show share link
        const shareUrl = `${window.location.origin}?peer=${this.peerConnection.peerId}`;
        this.ui.showShareLink(shareUrl, this.peerConnection.peerId);
        
        this.ui.updateStatus('Ready to share - Waiting for receiver...');
    }

    removeFile(fileId) {
        if (!this.fileTransfer) return;
        
        this.fileTransfer.files = this.fileTransfer.files.filter(f => f.id !== fileId);
        this.ui.displaySelectedFiles(this.fileTransfer.files);
        
        if (this.fileTransfer.files.length === 0) {
            this.ui.elements.passwordSection.classList.add('hidden');
            this.ui.elements.linkSection.classList.add('hidden');
        }
    }

    onConnectionStateChange(state) {
        logger.log('Connection state:', state);
        
        if (this.mode === 'sender') {
            this.ui.elements.senderStatus.textContent = this.getStatusText(state);
            
            if (state === 'connected' && this.fileTransfer) {
                // Send metadata when peer connects
                this.sendMetadataToReceiver();
            }
        } else {
            this.ui.elements.receiverStatus.textContent = this.getStatusText(state);
        }
        
        this.ui.updateStatus(this.getStatusText(state));
    }

    getStatusText(state) {
        const states = {
            'ready': 'Ready',
            'connecting': 'Connecting...',
            'connected': 'Connected',
            'disconnected': 'Disconnected',
            'error': 'Connection Error',
            'closed': 'Closed'
        };
        return states[state] || state;
    }

    async sendMetadataToReceiver() {
        this.password = this.ui.elements.passwordInput?.value || null;
        await this.fileTransfer.sendMetadata(this.password);
        this.ui.updateStatus('Metadata sent - Waiting for download request...');
    }

    async onDataReceived(data) {
        if (this.mode === 'sender') {
            // Sender receives download request
            if (data.type === 'start-download') {
                logger.info('Receiver requested download');
                this.startSending();
            }
        } else {
            // Receiver handles incoming data
            if (!this.fileTransfer) {
                this.fileTransfer = new FileTransfer(this.peerConnection);
            }
            
            const result = await this.fileTransfer.handleIncomingData(
                data,
                this.password
            );
            
            if (result) {
                this.handleReceiverData(result);
            }
        }
    }

    handleReceiverData(result) {
        if (result.type === 'metadata') {
            this.metadata = result.data;
            this.ui.showReceiverInfo(result.data);
            this.ui.updateStatus('Ready to download');
            logger.info('Metadata received');
        } else if (result.type === 'chunk') {
            // Show transfer section when receiving chunks
            this.ui.showTransferSection(true);
            this.ui.updateProgress(result.stats);
        } else if (result.type === 'complete') {
            logger.info('Transfer complete!');
            this.ui.showSuccess('Download complete!');
            this.ui.downloadFiles(result.files);
            this.ui.updateProgress({ progress: 100, speed: 0, bytesTransferred: 0, totalBytes: 0 });
        }
    }

    startDownload() {
        // Get password if required
        if (this.metadata.hasPassword) {
            this.password = this.ui.elements.receiverPassword.value;
            if (!this.password) {
                this.ui.showError('Password required');
                return;
            }
        }
        
        this.ui.showTransferSection();
        this.ui.updateStatus('Downloading...');
        
        // Request sender to start sending
        this.peerConnection.send({ type: 'start-download' });
        
        logger.info('Download started');
    }

    async startSending() {
        this.ui.showTransferSection();
        this.ui.updateStatus('Sending files...');
        
        await this.fileTransfer.startSending(
            this.password,
            (stats) => {
                this.ui.updateProgress(stats);
            },
            (stats) => {
                this.ui.showSuccess('Transfer complete!');
                logger.info('Send complete. Total:', utils.formatBytes(stats.bytesTransferred));
            }
        );
    }

    togglePause() {
        if (!this.fileTransfer) return;
        
        if (this.fileTransfer.paused) {
            this.fileTransfer.resume();
            this.ui.elements.pauseButton.textContent = '⏸️ Pause';
            this.ui.updateStatus('Transfer resumed');
        } else {
            this.fileTransfer.pause();
            this.ui.elements.pauseButton.textContent = '▶️ Resume';
            this.ui.updateStatus('Transfer paused');
        }
    }

    cancelTransfer() {
        if (!this.fileTransfer) return;
        
        if (confirm('Are you sure you want to cancel the transfer?')) {
            this.fileTransfer.cancel();
            this.ui.showTransferSection(false);
            this.ui.updateStatus('Transfer cancelled');
        }
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new AirShareApp();
    });
} else {
    window.app = new AirShareApp();
}
