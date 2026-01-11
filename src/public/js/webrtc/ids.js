export function generateSecureIdHex(bytesLength = 16) {
    try {
        const bytes = new Uint8Array(bytesLength);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch {
        // Fallback (less secure) for very old browsers.
        return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
}
