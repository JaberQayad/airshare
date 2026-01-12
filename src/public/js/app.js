import { UIManager } from './ui.js';
import { WebRTCManager } from './webrtc.js';

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
console.log('[APP] Socket.IO client initialized');

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
    console.log('[APP] Cleaning up resources...');
    
    // Clear all tracked timers
    appTimers.forEach(timer => {
        try {
            clearTimeout(timer);
            clearInterval(timer);
        } catch (e) {
            console.warn('[APP] Failed to clear timer:', e);
        }
    });
    appTimers.clear();
    
    // Clear specific timers
    if (senderRestoreTimer) {
        clearTimeout(senderRestoreTimer);
        senderRestoreTimer = null;
    }
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    
    // Cleanup WebRTC manager
    if (webrtcManager) {
        try {
            webrtcManager.cleanup();
        } catch (e) {
            console.warn('[APP] Failed to cleanup WebRTC manager:', e);
        }
    }
    
    // Cleanup UI
    try {
        ui.cleanup();
    } catch (e) {
        console.warn('[APP] Failed to cleanup UI:', e);
    }
    
    // Disconnect socket
    try {
        socket.disconnect();
    } catch (e) {
        console.warn('[APP] Failed to disconnect socket:', e);
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
    console.log('[APP] Connected to server, socket ID:', socket.id);
    ui.updateStatus('Connected');
    // If we were previously in a room, ensure we are back in it after reconnect.
    tryRestoreRoomMembership('connected');
});

socket.on('disconnect', (reason) => {
    console.warn('[APP] Disconnected from server:', reason);
    ui.updateStatus('Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.error('[APP] Connection error:', error);
    // Avoid spamming alerts during transient reconnect attempts.
    ui.updateStatus('Connection issue... retrying');
});

socket.on('reconnect', (attempt) => {
    console.log('[APP] Reconnected after attempts:', attempt);
    tryRestoreRoomMembership('reconnected');
});

socket.on('reconnect_attempt', (attempt) => {
    ui.updateStatus(`Reconnecting... (${attempt})`);
});

// Fetch config and initialize
fetch('/config')
    .then(response => response.json())
    .then(config => {
        console.log('[APP] Config loaded:', {
            iceServersCount: config.iceServers?.length,
            port: config.port,
            chunkSize: config.defaultChunkSize
        });
        ui.applyConfig(config);
        webrtcManager = new WebRTCManager(socket, config, ui);
        initializeApp();
    })
    .catch(err => {
        console.error('[APP] Failed to load config:', err);
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
        console.log('[APP] Room joined as receiver, roomId:', room.roomId);
        console.log('[APP] Setting up peer connection as receiver');
        currentRoomId = room.roomId;

        // If this join was part of sender restore, keep initiator behavior.
        if (pendingJoinRole === 'sender') {
            pendingJoinRole = null;
            clearTimeout(senderRestoreTimer);
            if (webrtcManager && selectedFile) {
                ui.updateStatus('Room restored. Waiting for peer...');
                webrtcManager.setupPeerConnection(room.roomId, true, selectedFile);
            } else {
                ui.updateStatus('Reconnected. Select a file again to share.');
            }
            return;
        }

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
        console.error('[APP] Room not found or expired', payload);

        // Sender restore: recreate the room so the existing link can work again.
        if (pendingJoinRole === 'sender' && currentRoomId && !isReceiverMode()) {
            clearTimeout(senderRestoreTimer);
            pendingJoinRole = null;
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

        // Receiver: redirect home.
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
            // If the peer socket id changed (refresh/reconnect), allow a fresh offer.
            // This avoids getting stuck due to the per-room offer guard.
            if (data?.peerId && data.peerId !== lastJoinedPeerId) {
                lastJoinedPeerId = data.peerId;
                offerCreatedForRoom = null;
            }

            try {
                webrtcManager.lifecycle.hasRemotePeer = true;
                webrtcManager.lifecycle.peerJoinedAt = Date.now();
            } catch {}

            // Create an offer when a peer actually joins the room.
            // Note: peers may join via the approval flow (pendingAcceptedPeerId set) or via direct join-room
            // (e.g. refresh/restore). In both cases we must negotiate, otherwise ICE stays "new" forever.
            const isExpectedApprovedPeer = pendingAcceptedPeerId && data.peerId === pendingAcceptedPeerId;
            const isDirectJoinOrRestore = !pendingAcceptedPeerId;
            const shouldCreateOffer = isExpectedApprovedPeer || isDirectJoinOrRestore;

            // Guard to avoid spamming renegotiation if multiple peer-joined events arrive.
            if (shouldCreateOffer && offerCreatedForRoom !== currentRoomId) {
                offerCreatedForRoom = currentRoomId;
                pendingAcceptedPeerId = null;
                ui.updateStatus('Peer joined! Creating offer...');
                // Small delay to allow receiver to initialize its peer connection after room-joined.
                setTimeout(() => {
                    webrtcManager.createOffer();
                }, 600);
            } else {
                ui.updateStatus('Peer joined!');
            }
        } else {
            ui.updateStatus('Connected. Receiving...');
        }
    });

    socket.on('offer', (data) => webrtcManager.handleSignal('offer', data));
    socket.on('answer', (data) => webrtcManager.handleSignal('answer', data));
    socket.on('candidate', (data) => webrtcManager.handleSignal('candidate', data));

    // Error handling from server
    socket.on('app-error', (data) => {
        const message = data?.message || 'Unknown error';

        // If sender is restoring and the room already exists, just join it.
        if (pendingJoinRole === 'sender' && /room already exists/i.test(message) && currentRoomId) {
            socket.emit('join-room', currentRoomId);
            return;
        }

        ui.showError(message);
    });

    socket.on('peer-rejected', (data) => {
        ui.showError('Peer rejected the connection');
    });

}
