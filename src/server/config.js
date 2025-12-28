// Robust parsing for ICE_SERVERS
let iceServers;
const iceServersEnv = process.env.ICE_SERVERS;

if (iceServersEnv) {
    try {
        iceServers = JSON.parse(iceServersEnv);
    } catch (e) {
        // Fallback: treat as comma-separated URLs if not valid JSON
        iceServers = iceServersEnv.split(',').map(url => ({ urls: url.trim() }));
    }
} else {
    // Default fallback
    iceServers = JSON.parse('[{"urls":"stun:stun.l.google.com:19302"}]');
}

const config = {
    port: process.env.PORT || 3000,
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 2147483648, // Default 2GB
    iceServers: iceServers,
    chunkSize: parseInt(process.env.CHUNK_SIZE) || 16384, // 16KB
    maxBufferedAmount: parseInt(process.env.MAX_BUFFERED_AMOUNT) || 65536, // 64KB
    appTitle: process.env.APP_TITLE || 'AirShare',
    themeColor: process.env.THEME_COLOR || '#6366f1',
    donateUrl: process.env.DONATE_URL,
    termsUrl: process.env.TERMS_URL,
    umamiId: process.env.UMAMI_ID
};

module.exports = config;
