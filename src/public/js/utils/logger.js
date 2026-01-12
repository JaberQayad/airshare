// Centralized logging utility with prefixes and conditional output
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

class Logger {
    constructor(level = LOG_LEVELS.INFO) {
        this.level = level;
        this.isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }

    setLevel(level) {
        if (typeof level === 'string') {
            this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
        } else {
            this.level = level;
        }
        console.log(`✓ [LOGGER] Log level set to: ${this.getLevelName()}`);
    }

    getLevel() {
        return this.level;
    }

    getLevelName() {
        return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === this.level) || 'UNKNOWN';
    }

    debug(category, message, ...args) {
        if (this.level <= LOG_LEVELS.DEBUG) {
            console.log(`[${category}]`, message, ...args);
        }
    }

    info(category, message, ...args) {
        if (this.level <= LOG_LEVELS.INFO) {
            console.log(`✓ [${category}]`, message, ...args);
        }
    }

    warn(category, message, ...args) {
        if (this.level <= LOG_LEVELS.WARN) {
            console.warn(`⚠️  [${category}]`, message, ...args);
        }
    }

    error(category, message, ...args) {
        if (this.level <= LOG_LEVELS.ERROR) {
            console.error(`✗ [${category}]`, message, ...args);
        }
    }

    // State logging helper
    logState(category, states) {
        if (this.level <= LOG_LEVELS.DEBUG) {
            console.log(`[${category}] State:`, states);
        }
    }

    // Group logging for diagnostics
    group(title, fn) {
        if (this.level <= LOG_LEVELS.DEBUG) {
            console.group(title);
            fn();
            console.groupEnd();
        }
    }
}

// Export singleton instance
export const logger = new Logger();
export { LOG_LEVELS };
