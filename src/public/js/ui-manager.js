// UI Manager
import { utils } from './utils.js';

export class UIManager {
    constructor() {
        this.elements = {};
        this.currentTheme = 'light';
        this.initElements();
        this.initTheme();
    }

    initElements() {
        this.elements = {
            // Sections
            senderSection: document.getElementById('senderSection'),
            receiverSection: document.getElementById('receiverSection'),
            transferSection: document.getElementById('transferSection'),
            
            // File input
            dropZone: document.getElementById('dropZone'),
            fileInput: document.getElementById('fileInput'),
            fileList: document.getElementById('fileList'),
            fileCount: document.getElementById('fileCount'),
            totalSize: document.getElementById('totalSize'),
            
            // Password
            passwordSection: document.getElementById('passwordSection'),
            passwordInput: document.getElementById('passwordInput'),
            passwordToggle: document.getElementById('passwordToggle'),
            
            // Sharing
            linkSection: document.getElementById('linkSection'),
            shareLinkInput: document.getElementById('shareLinkInput'),
            copyButton: document.getElementById('copyButton'),
            qrcode: document.getElementById('qrcode'),
            
            // Peer info
            senderId: document.getElementById('senderId'),
            senderStatus: document.getElementById('senderStatus'),
            receiverId: document.getElementById('receiverId'),
            receiverStatus: document.getElementById('receiverStatus'),
            
            // Receiver
            fileName: document.getElementById('fileName'),
            fileSize: document.getElementById('fileSize'),
            downloadButton: document.getElementById('downloadButton'),
            receiverPassword: document.getElementById('receiverPassword'),
            receiverPasswordSection: document.getElementById('receiverPasswordSection'),
            
            // Transfer progress
            progressBar: document.getElementById('progressBar'),
            progressText: document.getElementById('progressText'),
            speedText: document.getElementById('speedText'),
            etaText: document.getElementById('etaText'),
            pauseButton: document.getElementById('pauseButton'),
            cancelButton: document.getElementById('cancelButton'),
            
            // Status
            statusText: document.getElementById('statusText'),
            
            // Theme
            themeToggle: document.getElementById('themeToggle'),
            sunIcon: document.querySelector('.sun-icon'),
            moonIcon: document.querySelector('.moon-icon')
        };
    }

    initTheme() {
        this.currentTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.updateThemeIcons();
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        localStorage.setItem('theme', this.currentTheme);
        this.updateThemeIcons();
    }

    updateThemeIcons() {
        if (this.elements.sunIcon && this.elements.moonIcon) {
            if (this.currentTheme === 'dark') {
                this.elements.sunIcon.classList.add('hidden');
                this.elements.moonIcon.classList.remove('hidden');
            } else {
                this.elements.sunIcon.classList.remove('hidden');
                this.elements.moonIcon.classList.add('hidden');
            }
        }
    }

    showSection(section) {
        ['senderSection', 'receiverSection'].forEach(s => {
            this.elements[s]?.classList.add('hidden');
        });
        this.elements[section]?.classList.remove('hidden');
    }

    updateStatus(text, type = 'info') {
        if (this.elements.statusText) {
            this.elements.statusText.textContent = text;
            this.elements.statusText.className = `status-${type}`;
        }
    }

    displaySelectedFiles(files) {
        if (!this.elements.fileList) return;
        
        this.elements.fileList.innerHTML = '';
        let totalBytes = 0;

        files.forEach(fileInfo => {
            totalBytes += fileInfo.size;
            
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span class="file-icon">📄</span>
                <div class="file-details">
                    <div class="file-name">${fileInfo.name}</div>
                    <div class="file-size">${utils.formatBytes(fileInfo.size)}</div>
                </div>
                <button class="remove-file" data-id="${fileInfo.id}">✕</button>
            `;
            this.elements.fileList.appendChild(fileItem);
        });

        this.elements.fileCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
        this.elements.totalSize.textContent = utils.formatBytes(totalBytes);
        this.elements.passwordSection.classList.remove('hidden');
    }

    showShareLink(url, peerId) {
        this.elements.shareLinkInput.value = url;
        this.elements.senderId.textContent = peerId;
        this.elements.linkSection.classList.remove('hidden');
        
        // Generate QR code
        this.elements.qrcode.innerHTML = '';
        new QRCode(this.elements.qrcode, {
            text: url,
            width: 200,
            height: 200,
            colorDark: this.currentTheme === 'dark' ? '#ffffff' : '#000000',
            colorLight: this.currentTheme === 'dark' ? '#1a1a1a' : '#ffffff'
        });
    }

    showReceiverInfo(metadata) {
        const fileNames = metadata.files.map(f => f.name).join(', ');
        this.elements.fileName.textContent = metadata.fileCount === 1 
            ? metadata.files[0].name 
            : `${metadata.fileCount} files`;
        this.elements.fileSize.textContent = utils.formatBytes(metadata.totalSize);
        
        if (metadata.hasPassword) {
            this.elements.receiverPasswordSection.classList.remove('hidden');
            this.elements.downloadButton.disabled = true;
        } else {
            this.elements.downloadButton.disabled = false;
        }
    }

    updateProgress(stats) {
        this.elements.progressBar.style.width = stats.progress + '%';
        this.elements.progressText.textContent = stats.progress.toFixed(1) + '%';
        this.elements.speedText.textContent = utils.formatSpeed(stats.speed);
        
        // Calculate ETA
        if (stats.speed > 0) {
            const remaining = stats.totalBytes - stats.bytesTransferred;
            const eta = remaining / stats.speed;
            this.elements.etaText.textContent = 'ETA: ' + utils.formatTime(eta);
        }
    }

    showTransferSection(show = true) {
        if (show) {
            this.elements.transferSection.classList.remove('hidden');
        } else {
            this.elements.transferSection.classList.add('hidden');
        }
    }

    showError(message) {
        alert('Error: ' + message);
    }

    showSuccess(message) {
        this.updateStatus(message, 'success');
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.elements.copyButton.textContent = '✓ Copied!';
            setTimeout(() => {
                this.elements.copyButton.textContent = '📋 Copy';
            }, 2000);
        });
    }

    downloadFiles(files) {
        if (files.length === 1) {
            // Single file - direct download
            const file = files[0];
            const url = URL.createObjectURL(file.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            // Multiple files - would need JSZip library
            // For now, download individually
            files.forEach(file => {
                const url = URL.createObjectURL(file.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.click();
                URL.revokeObjectURL(url);
            });
        }
    }
}
