import { UIManager } from './ui.js';
import { WebRTCManager } from './webrtc.js';
import { logger, setLogLevel } from './utils/logger.js';
import { clearTimer, clearTimers } from './utils/cleanup.js';

const SESSION_KEY = 'airshare.session.v1';

function generateSecureIdHex(bytesLength = 16) {
    try {
        const bytes = new Uint8Array(bytesLength);
        crypto.getRandomValues(bytes);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        // Fallback (less secure) for very old browsers.
        return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
}

function loadSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveSession(next) {
    try {
        const prev = loadSession() || {};
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...prev, ...next }));
    } catch {
        // ignore
    }
}

const socket = io({
    transports: ['websocket', 'polling'],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 20000
});
logger.debug('APP', 'Socket.IO client initialized');

const ui = new UIManager();
let webrtcManager;
let currentRoomId = null;
let selectedFile = null;
let pendingJoinRole = null; // 'receiver' | 'sender' | null
let pendingAcceptedPeerId = null;
let offerCreatedForRoom = null;
let lastJoinedPeerId = null;
let senderRestoreTimer = null;
let healthPingDisabled = false;
let healthPingFailures = 0;
let lastHealthPingAt = 0;
let keepAliveInterval = null;

// Track all timers for cleanup
const appTimers = new Set();

function cleanupApp() {
    logger.debug('APP', 'Cleaning up resources');
    
    clearTimers(appTimers);
    clearTimer(senderRestoreTimer, () => { senderRestoreTimer = null; });
    clearTimer(keepAliveInterval, () => { keepAliveInterval = null; });
    
    if (webrtcManager) {
        try {
            webrtcManager.cleanup();
        } catch (e) {
            logger.warn('APP', 'WebRTC cleanup failed:', e.message);
        }
    }
    
    try {
        ui.cleanup();
    } catch (e) {
        logger.warn('APP', 'UI cleanup failed:', e.message);
    }
    
    try {
        socket.disconnect();
        logger.debug('APP', 'Socket disconnected');
    } catch (e) {
        logger.warn('APP', 'Socket disconnect failed:', e.message);
    }
}

async function pingHealthz() {
    if (healthPingDisabled) return;
    if (document.visibilityState !== 'visible') return;

    const now = Date.now();
    // Backoff on failures (1m, 2m, 4m, max 10m)
    const backoffMs = Math.min(600000, 60000 * Math.pow(2, Math.min(healthPingFailures, 4)));
    if (now - lastHealthPingAt < backoffMs) return;
    lastHealthPingAt = now;

    try {
        const res = await fetch('/healthz', { method: 'HEAD', cache: 'no-store' });

        if (res.status === 504) {
            // Likely proxy/CDN gateway timeout; don't spam.
            healthPingDisabled = true;
            return;
        }

        if (!res.ok) {
            healthPingFailures++;
            if (healthPingFailures >= 5) healthPingDisabled = true;
            return;
        }

        healthPingFailures = 0;
    } catch {
        healthPingFailures++;
        if (healthPingFailures >= 5) healthPingDisabled = true;
    }
}

function getReceiverRoomFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('room');
}

function isReceiverMode() {
    return !!getReceiverRoomFromUrl();
}

function tryRestoreRoomMembership(reason) {
    if (!currentRoomId) return;

    // Receiver: always re-join by URL room.
    if (isReceiverMode()) {
        pendingJoinRole = 'receiver';
        ui.updateStatus(reason ? `Reconnecting (${reason})...` : 'Reconnecting...');
        socket.emit('request-join', currentRoomId);
        return;
    }

    // Sender: prefer joining the existing room (if the receiver is still there).
    // If the room no longer exists, we'll fall back to re-creating it.
    pendingJoinRole = 'sender';
    ui.updateStatus(reason ? `Restoring room (${reason})...` : 'Restoring room...');

    // Prepare WebRTC so if the room is restored and a peer joins, we're ready.
    if (webrtcManager && selectedFile) {
        webrtcManager.setupPeerConnection(currentRoomId, true, selectedFile);
    }

    socket.emit('join-room', currentRoomId);

    // Fallback: if we don't get a response (e.g. cold start), try to recreate.
    clearTimeout(senderRestoreTimer);
    senderRestoreTimer = setTimeout(() => {
        if (pendingJoinRole === 'sender' && currentRoomId && !isReceiverMode()) {
            socket.emit('create-room', currentRoomId);
        }
    }, 3500);
}

// Socket connection events
socket.on('connect', () => {
    logger.info('APP', `Connected to server: ${socket.id}`);
    ui.updateStatus('Connected');
    tryRestoreRoomMembership('connected');
});

socket.on('disconnect', (reason) => {
    logger.warn('APP', `Disconnected: ${reason}`);
    ui.updateStatus('Disconnected from server');
});

socket.on('connect_error', (error) => {
    logger.error('APP', `Connection error: ${error.message}`);
    ui.updateStatus('Connection issue... retrying');
});

socket.on('reconnect', (attempt) => {
    logger.info('APP', `Reconnected after ${attempt} attempts`);
    tryRestoreRoomMembership('reconnected');
});

socket.on('reconnect_attempt', (attempt) => {
    ui.updateStatus(`Reconnecting... (${attempt})`);
});

// Fetch config and initialize
fetch('/config')
    .then(response => response.json())
    .then(config => {
        // Apply log level from config (defaults to INFO if not set)
        if (config.logLevel) {
            setLogLevel(config.logLevel);
        }
        
        logger.info('APP', 'Config loaded:', {
            iceServers: config.iceServers?.length,
            port: config.port,
            chunkSize: config.defaultChunkSize,
            logLevel: config.logLevel || 'INFO'
        });
        ui.applyConfig(config);
        webrtcManager = new WebRTCManager(socket, config, ui);
        initializeApp();
    })
    .catch(err => {
        logger.error('APP', `Config load failed: ${err.message}`);
        ui.showError('Failed to load configuration: ' + err.message);
    });

function initializeApp() {
    // Avoid showing noisy disconnect errors on refresh/close.
    window.addEventListener('beforeunload', () => {
        try { webrtcManager?.markIntentionalClose?.(); } catch {}
        cleanupApp();
    });

    // If page is restored from back/forward cache, sockets can be stale.
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            window.location.reload();
        }
    });

    // If tab was suspended/paused, force a reconnect when it becomes visible.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;

        // Try to wake the server/proxy path too.
        pingHealthz();

        if (!socket.connected) {
            socket.connect();
            // If the browser/network stack is in a bad state, reload after a short grace period.
            const reconnectTimer = setTimeout(() => {
                if (!socket.connected) window.location.reload();
            }, 3000);
            appTimers.add(reconnectTimer);
        }
    });

    // Optional keep-alive ping (helps avoid infra/proxy idling)
    // Kept intentionally quiet: uses HEAD + backoff + auto-disable if gateway returns 504.
    keepAliveInterval = setInterval(() => {
        pingHealthz();
    }, 30000);
    appTimers.add(keepAliveInterval);

    // Check URL for room
    const roomId = getReceiverRoomFromUrl();

    if (roomId) {
        // Receiver mode
        currentRoomId = roomId;
        saveSession({ mode: 'receiver', roomId });
        ui.showReceiverUI();
        ui.updateStatus('Waiting for sender approval...');
        socket.emit('request-join', roomId);
    } else {
        // Sender mode: after a hard reload the file is gone, so a previous sender session
        // can't be resumed safely. Start fresh.
        const prev = loadSession();
        if (prev?.mode === 'sender') {
            try { sessionStorage.removeItem(SESSION_KEY); } catch {}
        }
    }

    // UI Events
    ui.onFileSelect((file) => {
        selectedFile = file;
        const newRoomId = generateSecureIdHex(16);
        currentRoomId = newRoomId;
        offerCreatedForRoom = null;
        lastJoinedPeerId = null;
        saveSession({ mode: 'sender', roomId: newRoomId, createdAt: Date.now() });
        socket.emit('create-room', newRoomId);

        const link = `${window.location.origin}/?room=${newRoomId}`;
        ui.showLinkSection(link);

        webrtcManager.setupPeerConnection(newRoomId, true, file);
    });

    ui.onDownloadClick((file) => {
        webrtcManager.downloadFile(file);
    });

    // Socket Events
    socket.on('room-joined', (room) => {
        logger.info('APP', `Joined room as receiver: ${room.roomId}`);
        currentRoomId = room.roomId;

        if (pendingJoinRole === 'sender') {
            pendingJoinRole = null;
            clearTimeout(senderRestoreTimer);
            if (webrtcManager && selectedFile) {
                logger.debug('APP', 'Sender room restored');
                ui.updateStatus('Room restored. Waiting for peer...');
                webrtcManager.setupPeerConnection(room.roomId, true, selectedFile);
            } else {
                logger.warn('APP', 'Sender room restored but no file selected');
                ui.updateStatus('Reconnected. Select a file again to share.');
            }
            return;
        }

        logger.debug('APP', 'Setting up as receiver');
        pendingJoinRole = null;
        saveSession({ mode: 'receiver', roomId: room.roomId });
        webrtcManager.setupPeerConnection(room.roomId, false);
    });

    socket.on('join-requested', ({ roomId } = {}) => {
        if (isReceiverMode()) {
            ui.updateStatus('Waiting for sender approval...');
        }
    });

    socket.on('room-not-found', (payload) => {
        logger.error('APP', 'Room not found or expired:', payload);

        if (pendingJoinRole === 'sender' && currentRoomId && !isReceiverMode()) {
            clearTimeout(senderRestoreTimer);
            pendingJoinRole = null;
            logger.debug('APP', 'Recreating expired sender room');
            ui.updateStatus('Room expired. Recreating...');
            socket.emit('create-room', currentRoomId);
            if (webrtcManager && selectedFile) {
                webrtcManager.setupPeerConnection(currentRoomId, true, selectedFile);
                ui.updateStatus('Room recreated. Waiting for peer...');
            } else {
                ui.updateStatus('Room recreated. Select a file again to share.');
            }
            return;
        }

        logger.warn('APP', 'Receiver room not found, redirecting home');
        ui.showError('Room not found or expired.');
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
        window.location.href = '/';
    });

    socket.on('peer-join-request', (data) => {
        const isSender = webrtcManager.isInitiator;
        if (!isSender) return;

        ui.updateStatus('Peer wants to connect...');
        ui.showConnectionPrompt(
            data.peerId,
            () => {
                pendingAcceptedPeerId = data.peerId;
                ui.updateStatus('Accepted. Connecting...');
                socket.emit('peer-accepted', { roomId: currentRoomId, peerId: data.peerId });
            },
            () => {
                socket.emit('peer-rejected', { roomId: currentRoomId, peerId: data.peerId });
            }
        );
    });

    socket.on('peer-joined', (data) => {
        const isSender = webrtcManager.isInitiator;
        if (isSender) {
            if (data?.peerId && data.peerId !== lastJoinedPeerId) {
                logger.debug('APP', `New peer ${data.peerId} (previous: ${lastJoinedPeerId})`);
                lastJoinedPeerId = data.peerId;
                offerCreatedForRoom = null;
            }

            try {
                webrtcManager.lifecycle.hasRemotePeer = true;
                webrtcManager.lifecycle.peerJoinedAt = Date.now();
            } catch {}

            const isExpectedApprovedPeer = pendingAcceptedPeerId && data.peerId === pendingAcceptedPeerId;
            const isDirectJoinOrRestore = !pendingAcceptedPeerId;
            const shouldCreateOffer = isExpectedApprovedPeer || isDirectJoinOrRestore;

            if (shouldCreateOffer && offerCreatedForRoom !== currentRoomId) {
                logger.info('APP', `Creating offer for peer: ${data.peerId}`);
                offerCreatedForRoom = currentRoomId;
                pendingAcceptedPeerId = null;
                ui.updateStatus('Peer joined! Creating offer...');
                setTimeout(() => {
                    webrtcManager.createOffer();
                }, 600);
            } else {
                logger.debug('APP', 'Peer joined (offer already created)');
                ui.updateStatus('Peer joined!');
            }
        } else {
            logger.info('APP', 'Peer joined as receiver');
            ui.updateStatus('Connected. Receiving...');
        }
    });

    socket.on('offer', (data) => {
        logger.debug('APP', 'Received offer signal');
        webrtcManager.handleSignal('offer', data);
    });
    socket.on('answer', (data) => {
        logger.debug('APP', 'Received answer signal');
        webrtcManager.handleSignal('answer', data);
    });
    socket.on('candidate', (data) => {
        logger.debug('APP', 'Received ICE candidate');
        webrtcManager.handleSignal('candidate', data);
    });

    socket.on('app-error', (data) => {
        const message = data?.message || 'Unknown error';
        logger.error('APP', `Server error: ${message}`);

        if (pendingJoinRole === 'sender' && /room already exists/i.test(message) && currentRoomId) {
            logger.debug('APP', 'Room exists, joining instead');
            socket.emit('join-room', currentRoomId);
            return;
        }

        ui.showError(message);
    });

    socket.on('peer-rejected', (data) => {
        logger.warn('APP', 'Peer rejected connection');
        ui.showError('Peer rejected the connection');
    });

}
