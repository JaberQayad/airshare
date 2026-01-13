// AirShare Playground - Clean Architecture
// Utilities Module
export const utils = {
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    formatSpeed(bytesPerSecond) {
        return this.formatBytes(bytesPerSecond) + '/s';
    },

    formatTime(seconds) {
        if (seconds < 60) return Math.round(seconds) + 's';
        if (seconds < 3600) return Math.round(seconds / 60) + 'm';
        return Math.round(seconds / 3600) + 'h';
    },

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    },

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    },

    async encryptData(data, password) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            data
        );

        return { encrypted, iv };
    },

    async decryptData(encrypted, iv, password) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.digest('SHA-256', encoder.encode(password));
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        return await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            encrypted
        );
    }
};

// Logger Module
export class Logger {
    constructor(prefix = '⚡') {
        this.prefix = prefix;
    }

    log(message, ...args) {
        console.log(`${this.prefix} ${message}`, ...args);
    }

    info(message, ...args) {
        console.log(`✓ ${message}`, ...args);
    }

    warn(message, ...args) {
        console.warn(`⚠️ ${message}`, ...args);
    }

    error(message, ...args) {
        console.error(`✗ ${message}`, ...args);
    }

    debug(message, ...args) {
        console.log(`🔍 ${message}`, ...args);
    }
}

export const logger = new Logger();
