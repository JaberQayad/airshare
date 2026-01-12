export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function isMobileDevice() {
    // Check multiple indicators for mobile devices
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Check user agent
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const isMobileUA = mobileRegex.test(userAgent.toLowerCase());
    
    // Check screen size (mobile typically < 768px)
    const isSmallScreen = window.innerWidth <= 768;
    
    // Check for touch support
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // Check device memory (mobile typically has less memory)
    const hasLowMemory = navigator.deviceMemory ? navigator.deviceMemory <= 4 : false;
    
    // Consider it mobile if it matches multiple criteria
    return isMobileUA || (isSmallScreen && isTouchDevice) || hasLowMemory;
}

export function getAvailableMemory() {
    // Return approximate available memory in MB
    if (navigator.deviceMemory) {
        // deviceMemory returns approximate GB of RAM
        return navigator.deviceMemory * 1024; // Convert to MB
    }
    // Default assumption for unknown devices
    return 4096; // 4GB default
}

export function shouldUseStreaming(fileSize) {
    const isMobile = isMobileDevice();
    const availableMemoryMB = getAvailableMemory();
    
    // Conservative thresholds based on device type
    if (isMobile || availableMemoryMB <= 2048) {
        // Mobile or low-memory devices: 50MB threshold
        return fileSize > 52428800; // 50MB
    } else if (availableMemoryMB <= 4096) {
        // Medium-memory devices: 100MB threshold
        return fileSize > 104857600; // 100MB
    } else {
        // High-memory devices: 200MB threshold
        return fileSize > 209715200; // 200MB
    }
}
