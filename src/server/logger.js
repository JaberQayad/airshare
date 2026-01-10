/**
 * Logger utility for logging to console
 */
class Logger {
    /**
     * Format log message with timestamp
     */
    formatMessage(level, message, data = '') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level}]`;
        return `${prefix} ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    }

    /**
     * Log info level
     */
    info(message, data) {
        const formatted = this.formatMessage('INFO', message, data);
        console.log(formatted);
    }

    /**
     * Log error level
     */
    error(message, error) {
        const errorDetails = error instanceof Error 
            ? { message: error.message, stack: error.stack }
            : error;
        const formatted = this.formatMessage('ERROR', message, errorDetails);
        console.error(formatted);
    }

    /**
     * Log warning level
     */
    warn(message, data) {
        const formatted = this.formatMessage('WARN', message, data);
        console.warn(formatted);
    }

    /**
     * Log debug level
     */
    debug(message, data) {
        const formatted = this.formatMessage('DEBUG', message, data);
        console.log(formatted);
    }
}

// Create and export logger instance
const logger = new Logger();

module.exports = logger;
