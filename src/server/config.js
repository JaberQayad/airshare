/**
 * Server configuration module
 * Loads and validates environment variables for the AirShare application
 */

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
    // Default: multiple public STUN servers for better NAT traversal
    // Plus public TURN servers as fallback for restrictive networks
    iceServers = [
        // Primary STUN servers (Google)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        
        // Alternative STUN servers (Mozilla and others)
        { urls: 'stun:stun.stunprotocol.org:3478' },
        { urls: 'stun:stun.disroot.org:3478' },
        
        // Public TURN servers for restrictive networks (only if necessary)
        // Note: Public TURN servers may have limitations, but help with NAT/firewall
        { 
            urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
            username: 'openrelay',
            credential: 'openrelay'
        },
        { 
            urls: ['turn:relay.metered.ca:80', 'turn:relay.metered.ca:443'],
            username: 'relay',
            credential: 'relay'
        }
    ];
}

// Parse TRUST_PROXY environment variable
// Default to true if running in Docker or behind a proxy
let trustProxy = true;
if (process.env.TRUST_PROXY) {
    const trustProxyValue = process.env.TRUST_PROXY.toLowerCase();
    if (trustProxyValue === 'false') {
        trustProxy = false;
    } else if (trustProxyValue === 'true') {
        trustProxy = true;
    } else {
        const num = parseInt(process.env.TRUST_PROXY, 10);
        if (!isNaN(num) && (num === 1 || num === 2)) {
            trustProxy = num;
        }
    }
}

// CORS origins (comma-separated). Use '*' to allow any origin.
// Default: disabled (same-origin usage does not require CORS headers).
let corsOrigins = false;
const corsOriginsEnv = process.env.CORS_ORIGINS;
if (corsOriginsEnv) {
    const trimmed = corsOriginsEnv.trim();
    if (trimmed === '*') {
        corsOrigins = '*';
    } else {
        const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
        corsOrigins = parts.length ? parts : false;
    }
}

const config = {
    port: process.env.PORT || 3000,
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 2147483648, // Default 2GB
    iceServers: iceServers,
    
    // Chunk and buffer settings
    defaultChunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE) || 131072, // 128KB
    minChunkSize: parseInt(process.env.MIN_CHUNK_SIZE) || 32768, // 32KB
    maxChunkSize: parseInt(process.env.MAX_CHUNK_SIZE) || 262144, // 256KB
    bufferHighWater: parseInt(process.env.BUFFER_HIGH_WATER) || 1048576, // 1MB
    bufferLowWater: parseInt(process.env.BUFFER_LOW_WATER) || 262144, // 256KB
    
    // Receiver streaming
    maxInMemorySize: parseInt(process.env.MAX_IN_MEMORY_SIZE) || 209715200, // 200MB - files larger use streaming
    
    // Signaling
    maxSignalPayloadBytes: parseInt(process.env.MAX_SIGNAL_PAYLOAD_BYTES) || 65536, // 64KB
    maxPeersPerRoom: parseInt(process.env.MAX_PEERS_PER_ROOM) || 2,
    roomTtlMs: parseInt(process.env.ROOM_TTL_MS) || 1800000, // 30 minutes
    
    // UI/branding
    appTitle: process.env.APP_TITLE || 'AirShare',
    themeColor: process.env.THEME_COLOR || '#6366f1',
    donateUrl: process.env.DONATE_URL,
    termsUrl: process.env.TERMS_URL,
    umamiId: process.env.UMAMI_ID,
    trustProxy: trustProxy,

    // Security
    corsOrigins: corsOrigins
};

module.exports = config;
