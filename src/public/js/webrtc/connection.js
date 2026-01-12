import { clearDisconnectTimer, markIntentionalClose } from './lifecycle.js';

export function resetConnection(manager) {
    // Suppress noisy disconnect errors during manual teardown/reconnect.
    markIntentionalClose(manager);
    clearDisconnectTimer(manager);

    try {
        if (manager.dataChannel) {
            try { manager.dataChannel.onopen = null; } catch {}
            try { manager.dataChannel.onmessage = null; } catch {}
            try { manager.dataChannel.onclose = null; } catch {}
            try { manager.dataChannel.onerror = null; } catch {}
            try { manager.dataChannel.close(); } catch {}
        }
    } finally {
        manager.dataChannel = null;
    }

    try {
        if (manager.peerConnection) {
            try { manager.peerConnection.onicecandidate = null; } catch {}
            try { manager.peerConnection.onconnectionstatechange = null; } catch {}
            try { manager.peerConnection.oniceconnectionstatechange = null; } catch {}
            try { manager.peerConnection.onicegatheringstatechange = null; } catch {}
            try { manager.peerConnection.ondatachannel = null; } catch {}
            try { manager.peerConnection.close(); } catch {}
        }
    } finally {
        manager.peerConnection = null;
    }
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
    if (manager.lifecycle.restartTimer) {
        clearTimeout(manager.lifecycle.restartTimer);
        manager.lifecycle.restartTimer = null;
    }
    clearDisconnectTimer(manager);

    manager.roomId = roomId;
    manager.isInitiator = isInitiator;
    manager.pendingFile = fileToSend;
    manager.ui.updateStatus(isInitiator ? 'Waiting for peer...' : 'Connecting...');

    console.log(`=== Creating peer connection (${isInitiator ? 'sender' : 'receiver'}) ===`);
    console.log('Ice servers count:', manager.config.iceServers.length);
    console.log('Ice servers:', JSON.stringify(manager.config.iceServers));

    manager.iceCandidates = {
        local: [],
        remote: [],
        gatheredLocal: false
    };

    manager.peerConnection = new RTCPeerConnection({ iceServers: manager.config.iceServers });

    manager.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('[ICE] Candidate:', {
                type: event.candidate.type,
                protocol: event.candidate.protocol,
                priority: event.candidate.priority,
                candidate: event.candidate.candidate.substring(0, 60)
            });
            manager.iceCandidates.local.push({
                type: event.candidate.type,
                foundation: event.candidate.foundation
            });
            manager.socket.emit('candidate', { candidate: event.candidate, roomId });
        } else {
            console.log('[ICE] ✓ Gathering complete - ' + manager.iceCandidates.local.length + ' local candidates gathered');
            manager.iceCandidates.gatheredLocal = true;
        }
    };

    manager.peerConnection.onconnectionstatechange = () => {
        const state = manager.peerConnection.connectionState;
        console.log(`[CONNECTION] State changed to: ${state}`);

        if (state === 'connected') {
            console.log('✓ Peer connection established');
            manager.lifecycle.everConnected = true;
            manager.ui.updateStatus('Connected');
            manager.stats.startTime = Date.now();
            clearDisconnectTimer(manager);
        } else if (state === 'connecting') {
            console.log('⏳ Peer connection connecting...');
        } else if (state === 'failed') {
            // If we were previously connected and then the receiver closed their tab,
            // browsers often transition disconnected -> failed. That's expected and shouldn't
            // show a full "connection failed" dialog.
            if (manager.lifecycle.intentionalClose || manager.lifecycle.transferComplete) {
                return;
            }

            if (manager.lifecycle.everConnected) {
                console.log('[CONNECTION] Peer left (failed after connected)');
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
            console.warn('⚠️  Connection disconnected');

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
            console.log('Connection closed');
        }
    };

    manager.peerConnection.oniceconnectionstatechange = () => {
        const state = manager.peerConnection.iceConnectionState;
        console.log(`[ICE-CONNECTION] State: ${state}`);

        if (state === 'checking') {
            console.log('⏳ ICE checking ' + manager.iceCandidates.local.length + ' local candidates...');
        } else if (state === 'connected') {
            console.log('✓ ICE connection established');
        } else if (state === 'completed') {
            console.log('✓ ICE connection completed');
        } else if (state === 'failed') {
            // If we were previously connected, an ICE "failed" after disconnect is commonly
            // the remote tab closing. Don't spam full diagnostics in that case.
            if (manager.lifecycle.everConnected) {
                console.warn('⚠️  ICE failed after being connected (peer likely left)');
                return;
            }
            console.error('✗ ICE connection failed');
            manager.logICEFailureDetails();
        } else if (state === 'disconnected') {
            console.warn('⚠️  ICE disconnected - may reconnect');
        }
    };

    manager.peerConnection.onicegatheringstatechange = () => {
        const state = manager.peerConnection.iceGatheringState;
        console.log(`[ICE-GATHERING] State: ${state}`);
    };

    manager.peerConnection.onerror = (event) => {
        console.error('[PEER-CONNECTION] Error:', event);
        manager.ui.showError('Peer connection error: ' + (event.error?.message || 'unknown'));
    };

    if (isInitiator) {
        console.log('[DATA-CHANNEL] Creating data channel (sender)...');
        manager.dataChannel = manager.peerConnection.createDataChannel('fileTransfer', {
            ordered: true
        });
        setupDataChannel(manager, manager.dataChannel, fileToSend);
    } else {
        console.log('[DATA-CHANNEL] Waiting for data channel from sender...');
        manager.peerConnection.ondatachannel = (event) => {
            console.log('[DATA-CHANNEL] Received from sender:', event.channel.label);
            manager.dataChannel = event.channel;
            setupDataChannel(manager, manager.dataChannel);
        };
    }
}

export function setupDataChannel(manager, channel, fileToSend) {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = manager.config.bufferLowWater || 262144;

    const openTimeout = setTimeout(() => {
        if (channel.readyState !== 'open') {
            console.error('[DATA-CHANNEL] ✗ Channel did not open within 30 seconds');
            console.error('[DATA-CHANNEL] Current state:', channel.readyState);
            console.error('[DATA-CHANNEL] Peer connection state:', manager.peerConnection?.connectionState);
            console.error('[DATA-CHANNEL] ICE connection state:', manager.peerConnection?.iceConnectionState);
            console.error('[DATA-CHANNEL] ICE gathering state:', manager.peerConnection?.iceGatheringState);

            // If the sender is simply waiting for a receiver to open/accept the link,
            // the channel will stay "connecting" and the PC will stay "new". That's not a failure.
            if (manager.isInitiator && !manager.lifecycle?.hasRemotePeer) {
                console.warn('[DATA-CHANNEL] Still waiting for peer to join; suppressing failure dialog');
                manager.ui.updateStatus('Waiting for peer to join...');
                return;
            }

            manager.logConnectionFailure();
            const message = manager.peerConnection?.connectionState === 'failed'
                ? 'Could not connect to peer - firewall/NAT blocked.\n\nTry:\n• Disabling VPN\n• Using different WiFi/network\n• Checking firewall settings\n• Allowing browser permissions'
                : 'Data channel opened but transfer preparation failed.\n\nCheck console for details.';
            manager.ui.showError(message);
        }
    }, 30000);

    channel.onopen = () => {
        clearTimeout(openTimeout);
        console.log('✓ Data channel opened successfully');
        console.log('Channel ready state:', channel.readyState);
        console.log('Peer connection state:', manager.peerConnection?.connectionState);
        console.log('fileToSend:', fileToSend ? fileToSend.name : 'none', 'pendingFile:', manager.pendingFile ? manager.pendingFile.name : 'none');
        const fileToTransfer = fileToSend || manager.pendingFile;
        if (fileToTransfer) {
            console.log('Starting file transfer:', fileToTransfer.name);
            manager.sendFile(fileToTransfer);
        } else {
            console.log('No file to send');
        }
    };

    channel.onmessage = (event) => {
        manager.handleMessage(event);
    };

    channel.onbufferedamountlow = () => {
        const bufferedKB = (manager.dataChannel.bufferedAmount / 1024).toFixed(1);
        console.log(`[DRAIN] Buffer drained to ${bufferedKB}KB, resuming if paused...`);
        if (manager.sendState.paused && manager.sendState.file && manager.sendState.offset < manager.sendState.file.size) {
            console.log(`[DRAIN] ✓ Resuming from offset ${manager.sendState.offset}/${manager.sendState.file.size}`);
            manager.sendState.paused = false;
            manager.continueSendFile().catch(e => console.error('[DRAIN] Error resuming:', e));
        }
    };

    channel.onclose = () => {
        clearTimeout(openTimeout);
        console.warn('✗ Data channel closed');
        console.log('Final states:');
        console.log('  - Channel readyState:', channel.readyState);
        console.log('  - Peer connection state:', manager.peerConnection?.connectionState);
        console.log('  - ICE connection state:', manager.peerConnection?.iceConnectionState);
        console.log('  - Transfer offset:', manager.sendState.offset, 'of', manager.sendState.file?.size || 'unknown');
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
        clearTimeout(openTimeout);
        console.error('✗ Data channel error event:', error);
        console.error('Channel details:');
        console.error('  - readyState:', channel.readyState);
        console.error('  - bufferedAmount:', channel.bufferedAmount);
        console.error('  - label:', channel.label);
        console.error('Peer connection details:');
        console.error('  - connectionState:', manager.peerConnection?.connectionState);
        console.error('  - iceConnectionState:', manager.peerConnection?.iceConnectionState);
        console.error('  - iceGatheringState:', manager.peerConnection?.iceGatheringState);
        const errorMsg = error && error.message ? error.message : 'Unknown error';
        manager.ui.showError(`Data channel error: ${errorMsg}. State: ${channel.readyState}`);
    };
}
