import { formatBytes } from './utils.js';
import { logger, setLogLevel } from './utils/logger.js';

export class UIManager {
    constructor() {
        this.elements = {
            dropZone: document.getElementById('dropZone'),
            fileInput: document.getElementById('fileInput'),
            linkSection: document.getElementById('linkSection'),
            shareLinkInput: document.getElementById('shareLinkInput'),
            copyButton: document.getElementById('copyButton'),
            qrcodeElement: document.getElementById('qrcode'),
            downloadSection: document.getElementById('downloadSection'),
            downloadButton: document.getElementById('downloadButton'),
            transferSection: document.getElementById('transferSection'),
            progressBar: document.getElementById('progressBar'),
            transferStatus: document.getElementById('transferStatus'),
            fileNameDisplay: document.getElementById('fileName'),
            fileSizeDisplay: document.getElementById('fileSize'),
            statusBadge: document.querySelector('.status-badge'),
            themeToggle: document.getElementById('themeToggle'),
            sunIcon: document.querySelector('.sun-icon'),
            moonIcon: document.querySelector('.moon-icon'),
            donateLink: document.getElementById('donateLink'),
            termsLink: document.getElementById('termsLink'),
            separator: document.querySelector('.separator'),
            logo: document.querySelector('.logo'),
            connectionPromptModal: document.getElementById('connectionPromptModal'),
            promptMessage: document.getElementById('promptMessage'),
            acceptButton: document.getElementById('acceptButton'),
            rejectButton: document.getElementById('rejectButton')
        };

        this.fileSelectCallback = null;
        this.downloadCallback = null;
        this.acceptConnectionCallback = null;
        this.errorCallback = null;
        this.currentFile = null;
        
        // Track event listeners for cleanup
        this.eventListeners = [];
        
        this.initTheme();
        this.bindEvents();
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcons(savedTheme);
    }

    updateThemeIcons(theme) {
        if (theme === 'dark') {
            this.elements.sunIcon.classList.add('hidden');
            this.elements.moonIcon.classList.remove('hidden');
        } else {
            this.elements.sunIcon.classList.remove('hidden');
            this.elements.moonIcon.classList.add('hidden');
        }
    }

    bindEvents() {
        const addTrackedListener = (element, event, handler) => {
            element.addEventListener(event, handler);
            this.eventListeners.push({ element, event, handler });
        };

        addTrackedListener(this.elements.themeToggle, 'click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            this.updateThemeIcons(newTheme);
        });

        addTrackedListener(this.elements.dropZone, 'click', () => this.elements.fileInput.click());

        addTrackedListener(this.elements.dropZone, 'dragleave', () => {
            this.elements.dropZone.classList.remove('drop-zone--over');
        });

        addTrackedListener(this.elements.dropZone, 'dragover', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.add('drop-zone--over');
        });

        addTrackedListener(this.elements.copyButton, 'click', () => {
            this.elements.shareLinkInput.select();
            document.execCommand('copy');

            const originalIcon = this.elements.copyButton.innerHTML;
            this.elements.copyButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

            setTimeout(() => {
                this.elements.copyButton.innerHTML = originalIcon;
            }, 2000);
        });
    }

    onFileSelect(callback) {
        this.fileSelectCallback = callback;
        
        const fileInputHandler = (e) => {
            const file = e.target.files[0];
            if (file) callback(file);
        };
        
        const dropHandler = (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('drop-zone--over');
            const file = e.dataTransfer.files[0];
            if (file) callback(file);
        };

        this.elements.fileInput.addEventListener('change', fileInputHandler);
        this.eventListeners.push({ element: this.elements.fileInput, event: 'change', handler: fileInputHandler });
        
        this.elements.dropZone.addEventListener('drop', dropHandler);
        this.eventListeners.push({ element: this.elements.dropZone, event: 'drop', handler: dropHandler });
    }

    onDownloadClick(callback) {
        this.downloadCallback = callback;
        const handler = () => {
            if (this.currentFile) {
                callback(this.currentFile);
            }
        };
        this.elements.downloadButton.addEventListener('click', handler);
        this.eventListeners.push({ element: this.elements.downloadButton, event: 'click', handler });
    }

    onAcceptConnection(callback) {
        this.acceptConnectionCallback = callback;
    }

    showLinkSection(link) {
        this.elements.dropZone.classList.add('hidden');
        this.elements.transferSection.classList.add('hidden');
        this.elements.downloadSection.classList.add('hidden');
        this.elements.linkSection.classList.remove('hidden');
        this.elements.shareLinkInput.value = link;
        this.elements.statusBadge.textContent = 'Waiting for peer...';

        this.elements.qrcodeElement.innerHTML = '';
        new QRCode(this.elements.qrcodeElement, {
            text: link,
            width: 128,
            height: 128
        });
    }

    showReceiverUI() {
        this.elements.dropZone.classList.add('hidden');
        this.elements.linkSection.classList.remove('hidden');
        // Hide the link input and copy button for receiver
        const linkContainer = document.querySelector('.link-container');
        if (linkContainer) linkContainer.style.display = 'none';
        // Hide QR code for receiver
        if (this.elements.qrcodeElement) this.elements.qrcodeElement.style.display = 'none';
        // Update header text to indicate receiver mode
        const cardHeader = document.querySelector('.card-header h3');
        if (cardHeader) cardHeader.textContent = 'Ready to Receive';
        this.elements.statusBadge.textContent = 'Connecting to sender...';
    }

    updateStatus(text) {
        if (this.elements.statusBadge) this.elements.statusBadge.textContent = text;
    }

    showTransfer(fileName, fileSize) {
        this.elements.dropZone.classList.add('hidden');
        this.elements.linkSection.classList.add('hidden');
        this.elements.downloadSection.classList.add('hidden');
        this.elements.transferSection.classList.remove('hidden');
        this.elements.fileNameDisplay.textContent = fileName;
        this.elements.fileSizeDisplay.textContent = formatBytes(fileSize);
    }

    updateProgress(percentage, text) {
        this.elements.progressBar.style.width = `${percentage}%`;
        if (text) this.elements.transferStatus.textContent = text;
    }

    showDownload(file) {
        this.currentFile = file;
        this.elements.dropZone.classList.add('hidden');
        this.elements.linkSection.classList.add('hidden');
        this.elements.transferSection.classList.add('hidden');
        this.elements.downloadSection.classList.remove('hidden');
    }

    showError(message) {
        alert(`Error: ${message}`);
        if (this.errorCallback) this.errorCallback(message);
    }

    showWarning(message) {
        logger.warn('UI', message);
    }

    showConnectionPrompt(peerId, onAccept, onReject) {
        this.elements.promptMessage.textContent = `Peer ${peerId.substring(0, 8)}... wants to connect. Accept?`;
        this.elements.connectionPromptModal.classList.remove('hidden');

        // Clear previous listeners by cloning
        const acceptBtn = this.elements.acceptButton.cloneNode(true);
        const rejectBtn = this.elements.rejectButton.cloneNode(true);
        this.elements.acceptButton.replaceWith(acceptBtn);
        this.elements.rejectButton.replaceWith(rejectBtn);
        this.elements.acceptButton = document.getElementById('acceptButton');
        this.elements.rejectButton = document.getElementById('rejectButton');

        this.elements.acceptButton.addEventListener('click', () => {
            this.elements.connectionPromptModal.classList.add('hidden');
            if (onAccept) onAccept();
        });

        this.elements.rejectButton.addEventListener('click', () => {
            this.elements.connectionPromptModal.classList.add('hidden');
            if (onReject) onReject();
        });
    }

    cleanup() {
        this.eventListeners.forEach(({ element, event, handler }) => {
            try {
                element.removeEventListener(event, handler);
            } catch (e) {
                logger.warn('UI', `Failed to remove event listener: ${e.message}`);
            }
        });
        this.eventListeners = [];
        
        // Clear callbacks
        this.fileSelectCallback = null;
        this.downloadCallback = null;
        this.acceptConnectionCallback = null;
        this.errorCallback = null;
        this.currentFile = null;
    }

    applyConfig(config) {
        if (config.appTitle) {
            document.title = config.appTitle;
            if (this.elements.logo) {
                // Use textContent to prevent XSS injection via appTitle
                this.elements.logo.textContent = `🚀 ${config.appTitle}`;
            }
        }

        if (config.donateUrl) {
            this.elements.donateLink.href = config.donateUrl;
            this.elements.donateLink.classList.remove('hidden');
            if (config.termsUrl) this.elements.separator.classList.remove('hidden');
        }

        if (config.termsUrl) {
            this.elements.termsLink.href = config.termsUrl;
            this.elements.termsLink.classList.remove('hidden');
        }
    }
}

