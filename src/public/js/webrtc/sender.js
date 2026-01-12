import { calculateCRC32 } from '../crc32.js';
import { generateSecureIdHex } from './ids.js';
import { updateProgressStats } from './progress.js';
import { logger } from '../utils/logger.js';
import { clearTimer } from '../utils/cleanup.js';

export async function sendFile(manager, file) {
    manager.sendState.file = file;
    manager.sendState.fileId = generateSecureIdHex(16);
    manager.sendState.startTime = Date.now();
    manager.sendState.offset = 0;
    manager.sendState.chunkSize = manager.config.defaultChunkSize || 131072;
    manager.sendState.currentChunkSize = manager.sendState.chunkSize;
    manager.sendState.paused = false;
    manager.sendState.backpressureCount = 0;

    manager.ui.showTransfer(file.name, file.size);

    if (manager.dataChannel.readyState !== 'open') {
        logger.warn('SEND', `Channel not open (state: ${manager.dataChannel.readyState}), waiting...`);

        const channelOpenPromise = new Promise((resolve, reject) => {
            let resolved = false;
            const checkInterval = setInterval(() => {
                if (manager.dataChannel.readyState === 'open') {
                    resolved = true;
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);

            const timeout = setTimeout(() => {
                if (!resolved) {
                    clearInterval(checkInterval);
                    reject(new Error(`Channel open timeout (state: ${manager.dataChannel.readyState})`));
                }
            }, 30000);
        });

        try {
            await channelOpenPromise;
            logger.info('SEND', 'Channel opened, proceeding with transfer');
        } catch (e) {
            logger.error('SEND', 'Channel open timeout:', e.message);
            throw e;
        }
    }

    const totalChunks = Math.ceil(file.size / manager.sendState.chunkSize);
    const metadata = {
        type: 'metadata',
        fileId: manager.sendState.fileId,
        name: file.name,
        size: file.size,
        fileType: file.type,
        lastModified: file.lastModified,
        totalChunks: totalChunks,
        chunkSize: manager.sendState.chunkSize
    };

    try {
        if (manager.dataChannel.readyState === 'open') {
            manager.dataChannel.send(JSON.stringify(metadata));
            logger.info('SEND', `Metadata sent: ${file.name} (${totalChunks} chunks)`);
            await continueSendFile(manager);
        } else {
            throw new Error(`Cannot send - channel state: ${manager.dataChannel.readyState}`);
        }
    } catch (e) {
        logger.error('SEND', 'Transfer error:', e.message);
        manager.ui.showError(`Transfer failed: ${e.message}`);
    }
}

export async function continueSendFile(manager) {
    if (!manager.sendState.file || !manager.dataChannel || manager.dataChannel.readyState !== 'open') {
        logger.warn('SEND', 'Cannot continue transfer', {
            hasFile: !!manager.sendState.file,
            hasChannel: !!manager.dataChannel,
            channelOpen: manager.dataChannel?.readyState === 'open'
        });
        return;
    }

    const file = manager.sendState.file;
    const highWater = manager.config.bufferHighWater || 1048576;
    const targetBuffer = Math.max(131072, Math.floor(highWater / 2));

    let currentBatchSize = manager.sendState.batchSize || 1;
    let yieldTimeMs = manager.sendState.yieldTimeMs || 50;
    let chunksSentThisBatch = 0;

    while (manager.sendState.offset < file.size) {
        const bufferedKB = manager.dataChannel.bufferedAmount / 1024;

        if (manager.dataChannel.bufferedAmount > highWater) {
            logger.warn('BACKPRESSURE', `Buffer critical: ${bufferedKB.toFixed(1)}KB > ${(highWater / 1024).toFixed(0)}KB, pausing`);
            manager.sendState.paused = true;
            return;
        }

        const end = Math.min(manager.sendState.offset + manager.sendState.currentChunkSize, file.size);

        let buffer;
        try {
            const slice = file.slice(manager.sendState.offset, end);
            buffer = await readFileSliceAsBuffer(slice);
        } catch (e) {
            logger.error('READ', 'Failed to read chunk:', e.message);
            manager.ui.showError(`Read error: ${e.message}`);
            break;
        }

        const crc32 = calculateCRC32(buffer);
        const chunkWithCrc = new Uint8Array(buffer.byteLength + 4);
        new DataView(chunkWithCrc.buffer).setUint32(0, crc32, true);
        chunkWithCrc.set(new Uint8Array(buffer), 4);

        try {
            if (manager.dataChannel.readyState !== 'open') {
                logger.warn('SEND', `Channel closed at offset ${manager.sendState.offset}`);
                break;
            }
            manager.dataChannel.send(chunkWithCrc.buffer);
        } catch (e) {
            logger.error('SEND', 'Send failed:', e.message);
            manager.ui.showError(`Send failed: ${e.message}`);
            break;
        }

        manager.sendState.offset += buffer.byteLength;
        updateProgressStats(manager, manager.sendState.offset, file.size);

        chunksSentThisBatch++;

        if (chunksSentThisBatch >= currentBatchSize) {
            chunksSentThisBatch = 0;

            if (manager.dataChannel.bufferedAmount < Math.floor(targetBuffer * 0.25)) {
                if (currentBatchSize < 20) {
                    currentBatchSize = Math.min(20, currentBatchSize + 2);
                    yieldTimeMs = Math.max(10, yieldTimeMs - 5);
                    logger.debug('ADAPT', `Speeding up: batch=${currentBatchSize}, yield=${yieldTimeMs}ms`);
                }
            } else if (manager.dataChannel.bufferedAmount > targetBuffer) {
                if (currentBatchSize > 1) {
                    currentBatchSize = Math.max(1, Math.floor(currentBatchSize * 0.7));
                    yieldTimeMs = Math.min(200, yieldTimeMs + 20);
                    logger.debug('ADAPT', `Slowing down: buffer=${bufferedKB.toFixed(1)}KB, batch=${currentBatchSize}, yield=${yieldTimeMs}ms`);
                }
            }

            await new Promise(resolve => setTimeout(resolve, yieldTimeMs));
        }
    }

    if (manager.sendState.offset >= file.size) {
        logger.info('SEND', `Transfer complete: ${manager.sendState.offset} bytes sent`);
        manager.lifecycle.transferComplete = true;
        manager.sendState.batchSize = currentBatchSize;
        manager.sendState.yieldTimeMs = yieldTimeMs;
        manager.ui.updateProgress(100, 'Transfer Complete!');
    }
}

function readFileSliceAsBuffer(slice) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsArrayBuffer(slice);
    });
}
