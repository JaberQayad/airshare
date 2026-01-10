const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Generate log filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
const timeString = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
const logFileName = `${timestamp}_${timeString}.log`;
const logFilePath = path.join(logsDir, logFileName);

/**
 * Logger utility for logging to both console and file
 */
class Logger {
    constructor(filePath) {
        this.filePath = filePath;
        this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
        
        // Handle stream errors
        this.writeStream.on('error', (err) => {
            console.error('Error writing to log file:', err);
        });
    }

    /**
     * Format log message with timestamp
     */
    formatMessage(level, message, data = '') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level}]`;
        return `${prefix} ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    }

    /**
     * Write to file
     */
    writeToFile(message) {
        this.writeStream.write(message + '\n');
    }

    /**
     * Log info level
     */
    info(message, data) {
        const formatted = this.formatMessage('INFO', message, data);
        console.log(formatted);
        this.writeToFile(formatted);
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
        this.writeToFile(formatted);
    }

    /**
     * Log warning level
     */
    warn(message, data) {
        const formatted = this.formatMessage('WARN', message, data);
        console.warn(formatted);
        this.writeToFile(formatted);
    }

    /**
     * Log debug level
     */
    debug(message, data) {
        const formatted = this.formatMessage('DEBUG', message, data);
        console.log(formatted);
        this.writeToFile(formatted);
    }

    /**
     * Get current log file path
     */
    getLogPath() {
        return this.filePath;
    }

    /**
     * Close the stream
     */
    close() {
        this.writeStream.end();
    }
}

// Create and export logger instance
const logger = new Logger(logFilePath);

// Handle process exit to close stream gracefully
process.on('exit', () => {
    logger.close();
});

module.exports = logger;
