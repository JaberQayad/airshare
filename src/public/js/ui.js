import { formatBytes } from './utils.js';

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
            logo: document.querySelector('.logo')
        };

        this.fileSelectCallback = null;
        this.downloadCallback = null;
        this.acceptConnectionCallback = null;
        this.errorCallback = null;
        this.currentFile = null;
        
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
        this.elements.themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            this.updateThemeIcons(newTheme);
        });

        this.elements.dropZone.addEventListener('click', () => this.elements.fileInput.click());

        this.elements.dropZone.addEventListener('dragleave', () => {
            this.elements.dropZone.classList.remove('drop-zone--over');
        });

        this.elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.add('drop-zone--over');
        });

        this.elements.copyButton.addEventListener('click', () => {
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
        
        this.elements.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) callback(file);
        });

        this.elements.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('drop-zone--over');
            const file = e.dataTransfer.files[0];
            if (file) callback(file);
        });
    }

    onDownloadClick(callback) {
        this.downloadCallback = callback;
        this.elements.downloadButton.addEventListener('click', () => {
            if (this.currentFile) {
                callback(this.currentFile);
            }
        });
    }

    onAcceptConnection(callback) {
        this.acceptConnectionCallback = callback;
    }

    showLinkSection(link) {
        this.elements.dropZone.classList.add('hidden');
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
        this.elements.linkSection.classList.add('hidden');
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
        this.elements.transferSection.classList.add('hidden');
        this.elements.downloadSection.classList.remove('hidden');
    }

    showError(message) {
        alert(`Error: ${message}`);
        if (this.errorCallback) this.errorCallback(message);
    }

    showWarning(message) {
        console.warn(message);
        // Could also show a toast or banner instead of console
    }

    showConnectionPrompt(peerId, onAccept, onReject) {
        const accept = confirm(`Peer ${peerId.substring(0, 8)}... wants to connect. Accept?`);
        if (accept && onAccept) {
            onAccept();
        } else if (!accept && onReject) {
            onReject();
        }
    }

    applyConfig(config) {
        if (config.appTitle) {
            document.title = config.appTitle;
            if (this.elements.logo) {
                this.elements.logo.innerHTML = `🚀 ${config.appTitle}`;
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

