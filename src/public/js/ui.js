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
            this.elements.copyButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="css/icons.svg#icon-check"></use></svg>`; // Note: icons.svg path might need adjustment or inline SVG
            // Using inline checkmark for simplicity
            this.elements.copyButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

            setTimeout(() => {
                this.elements.copyButton.innerHTML = originalIcon;
            }, 2000);
        });
    }

    onFileSelect(callback) {
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
        this.elements.downloadButton.addEventListener('click', callback);
    }

    showLinkSection(link) {
        this.elements.dropZone.classList.add('hidden');
        this.elements.linkSection.classList.remove('hidden');
        this.elements.shareLinkInput.value = link;

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
        document.querySelector('.link-container').style.display = 'none';
        document.querySelector('.card-header h3').textContent = 'Connecting...';
        this.elements.statusBadge.textContent = 'Connecting';
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

    showDownload() {
        this.elements.transferSection.classList.add('hidden');
        this.elements.downloadSection.classList.remove('hidden');
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
