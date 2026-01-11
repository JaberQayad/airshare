export function formatETA(seconds) {
    if (seconds < 60) return Math.round(seconds) + 's';
    if (seconds < 3600) return Math.round(seconds / 60) + 'm';
    return Math.round(seconds / 3600) + 'h';
}

export function updateProgressStats(manager, transferred, total) {
    const now = Date.now();

    // Throttle: update at most 2x per second (500ms) AND if percentage changed >=1%
    // This prevents UI updates from blocking the send loop
    if (now - manager.stats.lastProgressUpdate < 500) {
        return;
    }

    const percentage = Math.round((transferred / total) * 100);
    if (percentage === manager.stats.lastProgressPercentage) {
        return;
    }

    manager.stats.lastProgressPercentage = percentage;
    manager.stats.lastProgressUpdate = now;

    const elapsedMs = now - manager.stats.startTime;
    const elapsedSec = elapsedMs / 1000;
    const speedBytesPerSec = transferred / elapsedSec;

    const remainingBytes = total - transferred;
    const etaSec = remainingBytes / speedBytesPerSec;

    const speedMbps = (speedBytesPerSec / (1024 * 1024)).toFixed(2);
    const eta = formatETA(etaSec);
    const message = `${percentage}% • ${speedMbps} MB/s • ETA ${eta}`;

    manager.ui.updateProgress(percentage, message);
}
