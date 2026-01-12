import { clearDisconnectTimer, markIntentionalClose } from './lifecycle.js';
import { clearTimer, clearDataChannel, clearRTCConnection } from '../utils/cleanup.js';
import { logger } from '../utils/logger.js';

export function resetConnection(manager) {
    markIntentionalClose(manager);
    clearDisconnectTimer(manager);
    clearTimer(manager.dataChannelOpenTimeout);
    manager.dataChannelOpenTimeout = null;

    clearDataChannel(manager.dataChannel);
    manager.dataChannel = null;

    clearRTCConnection(manager.peerConnection);
    manager.peerConnection = null;
}

export function setupPeerConnection(manager, roomId, isInitiator, fileToSend = null) {
    if (manager.peerConnection || manager.dataChannel) {
        resetConnection(manager);
    }

    // New session
    manager.lifecycle.intentionalClose = false;
    manager.lifecycle.transferComplete = false;
    manager.lifecycle.hasRemotePeer = false;
    manager.lifecycle.peerJoinedAt = null;
    manager.lifecycle.everConnected = false;
    manager.lifecycle.restartingForPeer = false;
    clearTimer(manager.lifecycle.restartTimer);
    manager.lifecycle.restartTimer = null;
    clearDisconnectTimer(manager);

    // Signaling state
    manager.remoteCandidateQueue = [];

    manager.roomId = roomId;
    manager.isInitiator = isInitiator;
    manager.pendingFile = fileToSend;
    manager.ui.updateStatus(isInitiator ? 'Waiting for peer...' : 'Connecting...');

    const iceServers = Array.isArray(manager.config?.iceServers) ? manager.config.iceServers : [];

    logger.debug('CONNECTION', `Creating peer connection (${isInitiator ? 'sender' : 'receiver'})`);
    logger.debug('CONNECTION', 'ICE servers:', { count: iceServers.length, servers: iceServers });

    manager.iceCandidates = {
        local: [],
        remote: [],
        gatheredLocal: false
    };

    manager.peerConnection = new RTCPeerConnection({ iceServers });

    manager.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            logger.debug('ICE', `Found ${event.candidate.type} candidate via ${event.candidate.protocol}`);
            manager.iceCandidates.local.push({
                type: event.candidate.type,
                foundation: event.candidate.foundation
            });
            manager.socket.emit('candidate', { candidate: event.candidate, roomId });
        } else {
            logger.info('ICE', `Gathering complete - ${manager.iceCandidates.local.length} local candidates gathered`);
            manager.iceCandidates.gatheredLocal = true;
        }
    };

    manager.peerConnection.onconnectionstatechange = () => {
        const state = manager.peerConnection.connectionState;
        logger.debug('CONNECTION', `State: ${state}`);

        if (state === 'connected') {
            logger.info('CONNECTION', 'Peer connection established successfully');
            manager.lifecycle.everConnected = true;
            manager.ui.updateStatus('Connected');
            manager.stats.startTime = Date.now();
            clearDisconnectTimer(manager);
        } else if (state === 'connecting') {
            logger.debug('CONNECTION', 'Connecting to peer...');
        } else if (state === 'failed') {
            // If we were previously connected and then the receiver closed their tab,
            // browsers often transition disconnected -> failed. That's expected and shouldn't
            // show a full "connection failed" dialog.
            if (manager.lifecycle.intentionalClose || manager.lifecycle.transferComplete) {
                return;
            }

            if (manager.lifecycle.everConnected) {
                logger.info('CONNECTION', 'Peer disconnected (connection failed after established)');
                manager.ui.updateStatus('Peer disconnected');

                // Sender: automatically re-create a fresh peer connection so the same link can accept
                // a new receiver without requiring a hard refresh.
                if (manager.isInitiator && !manager.lifecycle.restartingForPeer) {
                    manager.lifecycle.restartingForPeer = true;
                    const savedRoomId = manager.roomId;
                    const savedFile = manager.pendingFile;
                    manager.lifecycle.restartTimer = setTimeout(() => {
                        manager.lifecycle.restartTimer = null;
                        try {
                            resetConnection(manager);
                        } catch {}
                        try {
                            setupPeerConnection(manager, savedRoomId, true, savedFile);
                            manager.ui.updateStatus('Waiting for peer...');
                        } finally {
                            manager.lifecycle.restartingForPeer = false;
                        }
                    }, 250);
                }
                return;
            }

            manager.logConnectionFailure();
            manager.ui.showError('Connection failed: Unable to establish peer connection.\n\nTroubleshooting:\n• Check firewall/NAT settings\n• Try disabling VPN\n• Check if both devices are online\n• Allow pop-ups for camera/microphone (if prompted)');
        } else if (state === 'disconnected') {
            logger.warn('CONNECTION', 'Peer disconnected, waiting for reconnection...');

            if (manager.lifecycle.intentionalClose || manager.lifecycle.transferComplete || document.hidden) {
                manager.ui.updateStatus('Peer disconnected');
                return;
            }

            if (!manager.lifecycle.disconnectTimer) {
                manager.ui.updateStatus('Connection lost...');
                manager.lifecycle.disconnectTimer = setTimeout(() => {
                    manager.lifecycle.disconnectTimer = null;
                    const current = manager.peerConnection?.connectionState;
                    if (current === 'disconnected' && !manager.lifecycle.intentionalClose && !manager.lifecycle.transferComplete) {
                        manager.ui.showError('Connection disconnected - peer went offline');
                    }
                }, 4000);
            }
        } else if (state === 'closed') {
            logger.debug('CONNECTION', 'Connection closed');
        }
    };

    manager.peerConnection.oniceconnectionstatechange = () => {
        const state = manager.peerConnection.iceConnectionState;
        logger.debug('ICE', `Connection state: ${state}`);

        if (state === 'checking') {
            logger.debug('ICE', `Checking connectivity with ${manager.iceCandidates.local.length} local candidates`);
        } else if (state === 'connected') {
            logger.info('ICE', 'Connection established');
        } else if (state === 'completed') {
            logger.info('ICE', 'Connection completed successfully');
        } else if (state === 'failed') {
            if (manager.lifecycle.everConnected) {
                logger.warn('ICE', 'Connection failed (peer likely closed tab)');
                return;
            }
            logger.error('ICE', 'Connection failed - NAT/firewall issue');
            manager.logICEFailureDetails();
        } else if (state === 'disconnected') {
            logger.warn('ICE', 'Disconnected - attempting to reconnect');
        }
    };

    manager.peerConnection.onicegatheringstatechange = () => {
        const state = manager.peerConnection.iceGatheringState;
        logger.debug('ICE', `Gathering ${state}`);
    };

    manager.peerConnection.onerror = (event) => {
        logger.error('CONNECTION', 'Peer connection error:', event.error?.message || 'unknown');
        manager.ui.showError('Peer connection error: ' + (event.error?.message || 'unknown'));
    };

    if (isInitiator) {
        logger.debug('DATA-CHANNEL', 'Creating data channel as sender');
        manager.dataChannel = manager.peerConnection.createDataChannel('fileTransfer', {
            ordered: true
        });
        setupDataChannel(manager, manager.dataChannel, fileToSend);
    } else {
        logger.debug('DATA-CHANNEL', 'Waiting to receive data channel from sender');
        manager.peerConnection.ondatachannel = (event) => {
            logger.info('DATA-CHANNEL', `Received channel: ${event.channel.label}`);
            manager.dataChannel = event.channel;
            setupDataChannel(manager, manager.dataChannel);
        };
    }
}

export function setupDataChannel(manager, channel, fileToSend) {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = manager.config.bufferLowWater || 262144;

    clearTimer(manager.dataChannelOpenTimeout);

    manager.dataChannelOpenTimeout = setTimeout(() => {
        if (channel.readyState !== 'open') {
            if (manager.isInitiator && !manager.lifecycle?.hasRemotePeer) {
                manager.ui.updateStatus('Waiting for peer to join...');
                return;
            }

            logger.error('DATA-CHANNEL', 'Failed to open within 30 seconds');
            logger.logState('DATA-CHANNEL', {
                channelState: channel.readyState,
                peerState: manager.peerConnection?.connectionState,
                iceState: manager.peerConnection?.iceConnectionState,
                gatheringState: manager.peerConnection?.iceGatheringState
            });

            manager.logConnectionFailure();
            const message = manager.peerConnection?.connectionState === 'failed'
                ? 'Could not connect to peer - firewall/NAT blocked.\n\nTry:\n• Disabling VPN\n• Using different WiFi/network\n• Checking firewall settings\n• Allowing browser permissions'
                : 'Data channel opened but transfer preparation failed.\n\nCheck console for details.';
            manager.ui.showError(message);
        }
    }, 30000);

    channel.onopen = () => {
        clearTimer(manager.dataChannelOpenTimeout);
        manager.dataChannelOpenTimeout = null;
        
        logger.info('DATA-CHANNEL', 'Channel opened successfully');
        const fileToTransfer = fileToSend || manager.pendingFile;
        if (fileToTransfer) {
            logger.info('TRANSFER', `Starting transfer: ${fileToTransfer.name}`);
            manager.sendFile(fileToTransfer);
        } else {
            logger.debug('DATA-CHANNEL', 'No file queued for transfer');
        }
    };

    channel.onmessage = (event) => {
        manager.handleMessage(event);
    };

    channel.onbufferedamountlow = () => {
        const bufferedKB = (manager.dataChannel.bufferedAmount / 1024).toFixed(1);
        logger.debug('BUFFER', `Drained to ${bufferedKB}KB`);
        if (manager.sendState.paused && manager.sendState.file && manager.sendState.offset < manager.sendState.file.size) {
            logger.info('TRANSFER', `Resuming from ${manager.sendState.offset}/${manager.sendState.file.size} bytes`);
            manager.sendState.paused = false;
            manager.continueSendFile().catch(e => logger.error('TRANSFER', 'Resume error:', e.message));
        }
    };

    channel.onclose = () => {
        clearTimer(manager.dataChannelOpenTimeout);
        manager.dataChannelOpenTimeout = null;
        
        logger.warn('DATA-CHANNEL', 'Channel closed');
        logger.logState('DATA-CHANNEL', {
            channelState: channel.readyState,
            peerState: manager.peerConnection?.connectionState,
            iceState: manager.peerConnection?.iceConnectionState,
            transferProgress: `${manager.sendState.offset}/${manager.sendState.file?.size || 0}`
        });
        manager.ui.updateStatus('Connection closed');

        // If we had a working connection and the peer closed their tab, proactively reset so
        // the room link can accept a new peer.
        if (manager.isInitiator && manager.lifecycle?.everConnected && !manager.lifecycle.transferComplete && !manager.lifecycle.restartingForPeer) {
            manager.lifecycle.restartingForPeer = true;
            const savedRoomId = manager.roomId;
            const savedFile = manager.pendingFile;
            manager.lifecycle.restartTimer = setTimeout(() => {
                manager.lifecycle.restartTimer = null;
                try {
                    resetConnection(manager);
                } catch {}
                try {
                    setupPeerConnection(manager, savedRoomId, true, savedFile);
                    manager.ui.updateStatus('Waiting for peer...');
                } finally {
                    manager.lifecycle.restartingForPeer = false;
                }
            }, 250);
        }
    };

    channel.onerror = (error) => {
        clearTimer(manager.dataChannelOpenTimeout);
        manager.dataChannelOpenTimeout = null;
        
        const errorMsg = error?.message || 'Unknown error';
        logger.error('DATA-CHANNEL', `Error: ${errorMsg}`);
        logger.logState('DATA-CHANNEL', {
            readyState: channel.readyState,
            bufferedAmount: channel.bufferedAmount,
            label: channel.label,
            peerState: manager.peerConnection?.connectionState,
            iceState: manager.peerConnection?.iceConnectionState
        });
        manager.ui.showError(`Data channel error: ${errorMsg}. State: ${channel.readyState}`);
    };
}
