import { calculateCRC32, crc32ToHex } from '../crc32.js';
import { formatBytes } from '../utils.js';
import { updateProgressStats } from './progress.js';

export async function handleMessage(manager, event) {
    const data = event.data;

    if (typeof data === 'string') {
        try {
            const metadata = JSON.parse(data);
            if (metadata.type === 'metadata') {
                await initializeReceiver(manager, metadata);
            }
        } catch (e) {
            manager.ui.showError(`Invalid metadata: ${e.message}`);
        }
        return;
    }

    if (manager.receiveState.fileInfo) {
        await handleChunkData(manager, data);
    }
}

export async function initializeReceiver(manager, metadata) {
    manager.receiveState.fileInfo = metadata;
    manager.receiveState.totalChunks = metadata.totalChunks;
    manager.receiveState.chunks.clear();
    manager.receiveState.receivedChunks = 0;
    manager.receiveState.receivedSize = 0;

    manager.ui.showTransfer(metadata.name, metadata.size);

    const maxInMemory = manager.config.maxInMemorySize || 209715200;
    if (metadata.size > maxInMemory) {
        if (await initializeStreaming(manager, metadata)) {
            manager.receiveState.useStreaming = true;
        } else {
            manager.receiveState.useStreaming = false;
        }
    } else {
        manager.receiveState.useStreaming = false;
    }

    manager.stats.startTime = Date.now();
}

async function initializeStreaming(manager, metadata) {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: metadata.name,
                types: [{ accept: { [metadata.fileType || 'application/octet-stream']: ['.bin'] } }]
            });

            const writable = await handle.createWritable();
            manager.receiveState.streamWriter = writable;
            manager.receiveState.streamHandle = handle;
            return true;
        } catch {
            // user cancelled
        }
    }

    if (metadata.size > manager.config.maxInMemorySize) {
        manager.ui.showWarning(
            `File is ${formatBytes(metadata.size)}. ` +
            `Your browser doesn't support streaming. ` +
            `Large file transfer may consume significant memory.`
        );
    }

    return false;
}

export async function handleChunkData(manager, buffer) {
    if (!manager.receiveState.fileInfo || buffer.byteLength < 4) {
        return;
    }

    const view = new DataView(buffer);
    const receivedCrc32 = view.getUint32(0, true);
    const chunkData = buffer.slice(4);
    const computedCrc32 = calculateCRC32(chunkData);

    if (receivedCrc32 !== computedCrc32) {
        const err = `Chunk integrity check failed: expected ${crc32ToHex(computedCrc32)}, got ${crc32ToHex(receivedCrc32)}`;
        manager.receiveState.lastValidationError = err;
        manager.ui.showError(err);
        return;
    }

    const chunkIndex = manager.receiveState.receivedChunks;

    if (manager.receiveState.useStreaming && manager.receiveState.streamWriter) {
        try {
            await manager.receiveState.streamWriter.write(chunkData);
        } catch (e) {
            manager.ui.showError(`Failed to write chunk: ${e.message}`);
            return;
        }
    } else {
        manager.receiveState.chunks.set(chunkIndex, {
            data: chunkData,
            crc32: receivedCrc32
        });
    }

    manager.receiveState.receivedChunks++;
    manager.receiveState.receivedSize += chunkData.byteLength;

    updateProgressStats(manager, manager.receiveState.receivedSize, manager.receiveState.fileInfo.size);

    if (manager.receiveState.receivedChunks >= manager.receiveState.totalChunks) {
        await completeFileReceive(manager);
    }
}

export async function completeFileReceive(manager) {
    try {
        if (manager.receiveState.streamWriter) {
            await manager.receiveState.streamWriter.close();
            manager.lifecycle.transferComplete = true;
            manager.ui.showDownload(null);
            return;
        }

        const chunks = [];
        for (let i = 0; i < manager.receiveState.receivedChunks; i++) {
            const chunk = manager.receiveState.chunks.get(i);
            if (!chunk) {
                manager.ui.showError(`Missing chunk ${i}`);
                return;
            }
            chunks.push(chunk.data);
        }

        const blob = new Blob(chunks, { type: manager.receiveState.fileInfo.fileType });
        const file = new File([blob], manager.receiveState.fileInfo.name, {
            type: manager.receiveState.fileInfo.fileType,
            lastModified: manager.receiveState.fileInfo.lastModified
        });

        manager.receiveState.chunks.clear();
        manager.lifecycle.transferComplete = true;
        manager.ui.showDownload(file);
    } catch (e) {
        manager.ui.showError(`Failed to complete transfer: ${e.message}`);
    }
}

export function downloadFile(manager, file) {
    if (!file) return;

    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
}
