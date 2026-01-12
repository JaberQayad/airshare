/**
 * Server configuration module
 * Loads and validates environment variables for the AirShare application
 */

const dnsSync = require('dns-sync');

// Validation helper functions
function validatePositiveInt(value, defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min || parsed > max) {
        return defaultValue;
    }
    return parsed;
}

function sanitizeString(value, maxLength = 1000) {
    if (typeof value !== 'string') return '';
    return value.substring(0, maxLength).trim();
}

// Check if string is IP address or CIDR
function isIPOrCIDR(str) {
    return /^(?:(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:\/[0-9]{1,2})?|[a-fA-F0-9:]+(?:\/[0-9]{1,3})?)$/.test(str);
}

// Resolve domain to IP using dns-sync package
function resolveDomain(domain) {
    try {
        const ip = dnsSync.resolve(domain);
        if (ip) {
            console.log(`[CONFIG] Resolved "${domain}" -> ${ip}`);
            return ip;
        }
    } catch (err) {
        console.warn(`[CONFIG] Failed to resolve "${domain}": ${err.message}`);
    }
    return null;
}

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

// Parse TRUSTED_DOMAINS environment variable
// Support numbers (hop count), booleans (all/none), IP addresses/CIDR, AND domain names (resolved to IPs)
let trustProxy = true; // Default to true for Docker-friendly behavior
if (process.env.TRUSTED_DOMAINS) {
    const val = process.env.TRUSTED_DOMAINS.trim();
    const lowerVal = val.toLowerCase();
    
    if (lowerVal === 'false') {
        trustProxy = false;
    } else if (lowerVal === 'true') {
        trustProxy = true;
    } else {
        const num = parseInt(val, 10);
        if (!isNaN(num)) {
            trustProxy = num;
        } else {
            // Handle comma-separated values (domains, IPs, CIDR)
            const items = val.split(',').map(s => s.trim()).filter(Boolean);
            const resolved = [];
            
            for (const item of items) {
                if (isIPOrCIDR(item)) {
                    // Already an IP or CIDR - use as-is
                    resolved.push(item);
                } else {
                    // Try to resolve as domain name
                    const ip = resolveDomain(item);
                    if (ip) {
                        resolved.push(ip);
                    }
                }
            }
            
            if (resolved.length === 0) {
                console.warn(`[CONFIG] No valid IPs/domains in TRUSTED_DOMAINS. Falling back to default (true).`);
                trustProxy = true;
            } else if (resolved.length === 1) {
                trustProxy = resolved[0];
            } else {
                trustProxy = resolved;
            }
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
    port: validatePositiveInt(process.env.PORT, 3000, 1, 65535),
    maxFileSize: validatePositiveInt(process.env.MAX_FILE_SIZE, 2147483648, 0, Number.MAX_SAFE_INTEGER), // Default 2GB
    iceServers: iceServers,
    
    // Chunk and buffer settings
    defaultChunkSize: validatePositiveInt(process.env.DEFAULT_CHUNK_SIZE, 131072, 1024, 10485760), // 128KB (1KB-10MB range)
    minChunkSize: validatePositiveInt(process.env.MIN_CHUNK_SIZE, 32768, 1024, 1048576), // 32KB (1KB-1MB range)
    maxChunkSize: validatePositiveInt(process.env.MAX_CHUNK_SIZE, 262144, 1024, 10485760), // 256KB (1KB-10MB range)
    bufferHighWater: validatePositiveInt(process.env.BUFFER_HIGH_WATER, 1048576, 1024, 104857600), // 1MB (1KB-100MB range)
    bufferLowWater: validatePositiveInt(process.env.BUFFER_LOW_WATER, 262144, 1024, 104857600), // 256KB (1KB-100MB range)
    
    // Receiver streaming
    maxInMemorySize: validatePositiveInt(process.env.MAX_IN_MEMORY_SIZE, 209715200, 0, Number.MAX_SAFE_INTEGER), // 200MB - files larger use streaming
    
    // Signaling
    maxSignalPayloadBytes: validatePositiveInt(process.env.MAX_SIGNAL_PAYLOAD_BYTES, 65536, 1024, 1048576), // 64KB (1KB-1MB range)
    maxPeersPerRoom: validatePositiveInt(process.env.MAX_PEERS_PER_ROOM, 2, 2, 10),
    roomTtlMs: validatePositiveInt(process.env.ROOM_TTL_MS, 1800000, 60000, 86400000), // 30 minutes (1min-24hr range)
    
    // UI/branding (sanitized for security)
    appTitle: sanitizeString(process.env.APP_TITLE || 'AirShare', 100), // Max 100 chars
    themeColor: /^#[0-9A-Fa-f]{6}$/.test(process.env.THEME_COLOR) ? process.env.THEME_COLOR : '#6366f1',
    donateUrl: sanitizeString(process.env.DONATE_URL, 500),
    termsUrl: sanitizeString(process.env.TERMS_URL, 500),
    umamiId: sanitizeString(process.env.UMAMI_ID, 100),
    trustProxy: trustProxy,

    // Security
    corsOrigins: corsOrigins
};

module.exports = config;
