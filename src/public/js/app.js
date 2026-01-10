import { UIManager } from './ui.js';
import { WebRTCManager } from './webrtc.js';

const socket = io();
console.log('[APP] Socket.IO client initialized');

const ui = new UIManager();
let webrtcManager;
let currentRoomId = null;

// Socket connection events
socket.on('connect', () => {
    console.log('[APP] Connected to server, socket ID:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.warn('[APP] Disconnected from server:', reason);
    ui.updateStatus('Disconnected from server');
});

socket.on('connect_error', (error) => {
    console.error('[APP] Connection error:', error);
    ui.showError('Connection error: ' + error.message);
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
    // Check URL for room
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    if (roomId) {
        // Receiver mode
        currentRoomId = roomId;
        ui.showReceiverUI();
        socket.emit('join-room', roomId);
    }

    // UI Events
    ui.onFileSelect((file) => {
        const newRoomId = Math.random().toString(36).substring(7);
        currentRoomId = newRoomId;
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
        webrtcManager.setupPeerConnection(room.roomId, false);
    });

    socket.on('room-not-found', () => {
        console.error('[APP] Room not found or expired');
        ui.showError('Room not found or expired.');
        window.location.href = '/';
    });

    socket.on('peer-joined', (data) => {
        const isSender = webrtcManager.isInitiator;
        if (isSender) {
            ui.updateStatus('Peer joined! Send when ready...');
            // Connection prompt only for sender
            ui.showConnectionPrompt(
                data.peerId,
                () => {
                    // Accept: establish connection
                    console.log('[APP] Sender: User accepted, creating offer in 500ms...');
                    // Delay to ensure receiver has set up peer connection
                    setTimeout(() => {
                        console.log('[APP] Sender: Creating offer now');
                        webrtcManager.createOffer();
                    }, 500);
                    socket.emit('peer-accepted', { roomId: currentRoomId, peerId: data.peerId });
                },
                () => {
                    // Reject: disconnect
                    ui.showError('Connection rejected');
                    socket.emit('peer-rejected', { roomId: currentRoomId, peerId: data.peerId });
                }
            );
        } else {
            ui.updateStatus('Peer joined! Receiving...');
            // Receiver auto-accepts - no prompt needed
        }
    });

    socket.on('offer', (data) => webrtcManager.handleSignal('offer', data));
    socket.on('answer', (data) => webrtcManager.handleSignal('answer', data));
    socket.on('candidate', (data) => webrtcManager.handleSignal('candidate', data));

    // Error handling from server
    socket.on('app-error', (data) => {
        ui.showError(data.message || 'Unknown error');
    });

    socket.on('peer-rejected', (data) => {
        ui.showError('Peer rejected the connection');
    });

    socket.on('disconnect', () => {
        ui.updateStatus('Disconnected from server');
    });
}
