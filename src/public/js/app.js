import { UIManager } from './ui.js';
import { WebRTCManager } from './webrtc.js';

const socket = io();
const ui = new UIManager();
let webrtcManager;
let currentRoomId = null;

// Fetch config and initialize
fetch('/config')
    .then(response => response.json())
    .then(config => {
        ui.applyConfig(config);
        webrtcManager = new WebRTCManager(socket, config, ui);
        initializeApp();
    })
    .catch(err => {});

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
        webrtcManager.setupPeerConnection(room.roomId, false);
    });

    socket.on('room-not-found', () => {
        ui.showError('Room not found or expired.');
        window.location.href = '/';
    });

    socket.on('peer-joined', (data) => {
        ui.updateStatus('Peer joined! Send when ready...');
        // Connection prompt for sender
        ui.showConnectionPrompt(
            data.peerId,
            () => {
                // Accept: establish connection
                webrtcManager.createOffer();
                socket.emit('peer-accepted', { roomId: currentRoomId, peerId: data.peerId });
            },
            () => {
                // Reject: disconnect
                ui.showError('Connection rejected');
                socket.emit('peer-rejected', { roomId: currentRoomId, peerId: data.peerId });
            }
        );
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
