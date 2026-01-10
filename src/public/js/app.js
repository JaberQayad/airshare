import { UIManager } from './ui.js';
import { WebRTCManager } from './webrtc.js';

const socket = io();
const ui = new UIManager();
let webrtcManager;

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
        ui.showReceiverUI();
        socket.emit('join-room', roomId);
    }

    // UI Events
    ui.onFileSelect((file) => {
        const newRoomId = Math.random().toString(36).substring(7);
        socket.emit('create-room', newRoomId);

        const link = `${window.location.origin}/?room=${newRoomId}`;
        ui.showLinkSection(link);

        webrtcManager.setupPeerConnection(newRoomId, true, file);
    });

    ui.onDownloadClick(() => {
        webrtcManager.downloadFile();
    });

    // Socket Events
    socket.on('room-joined', (room) => {
        webrtcManager.setupPeerConnection(room, false);
    });

    socket.on('room-not-found', () => {
        alert('Room not found or expired.');
        window.location.href = '/';
    });

    socket.on('peer-joined', (peerId) => {
        ui.updateStatus('Peer joined! Sending offer...');

        // Get room ID from URL or input
        const currentRoomId = new URLSearchParams(window.location.search).get('room') ||
            document.getElementById('shareLinkInput').value.split('room=')[1];

        webrtcManager.createOffer(currentRoomId);
    });

    socket.on('offer', (data) => webrtcManager.handleSignal('offer', data));
    socket.on('answer', (data) => webrtcManager.handleSignal('answer', data));
    socket.on('candidate', (data) => webrtcManager.handleSignal('candidate', data));
}
