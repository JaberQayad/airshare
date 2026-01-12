import { addRemoteCandidate as addRemoteCandidateFn } from './diagnostics.js';

function ensureRemoteCandidateQueue(manager) {
    if (!manager.remoteCandidateQueue) manager.remoteCandidateQueue = [];
}

async function flushRemoteCandidateQueue(manager) {
    ensureRemoteCandidateQueue(manager);
    if (!manager.peerConnection?.remoteDescription) return;

    while (manager.remoteCandidateQueue.length) {
        const candidate = manager.remoteCandidateQueue.shift();
        try {
            addRemoteCandidateFn(manager, candidate);
            await manager.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('✓ [SIGNAL] Queued ICE candidate added');
        } catch (e) {
            console.warn('[SIGNAL] Failed to add queued ICE candidate:', e.message);
        }
    }
}

export async function handleSignal(manager, type, data) {
    if (!manager.peerConnection) {
        console.error('No peer connection when handling signal:', type);
        return;
    }

    try {
        switch (type) {
            case 'offer':
                console.log('[SIGNAL] Received offer from sender');
                console.log('[SIGNAL] SDP offer length:', data.offer?.sdp?.length);
                if (!data.offer) {
                    throw new Error('No offer in data');
                }
                console.log('[SIGNAL] Setting remote description (offer)...');
                await manager.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                console.log('✓ [SIGNAL] Remote description (offer) set');
                await flushRemoteCandidateQueue(manager);
                console.log('[SIGNAL] Creating answer...');
                const answer = await manager.peerConnection.createAnswer();
                console.log('✓ [SIGNAL] Answer created, setting as local description');
                await manager.peerConnection.setLocalDescription(answer);
                console.log('✓ [SIGNAL] Local description set');
                console.log('[SIGNAL] Sending answer back to sender');
                manager.socket.emit('answer', { answer: manager.peerConnection.localDescription, roomId: manager.roomId });
                console.log('✓ [SIGNAL] Answer emitted');
                break;
            case 'answer':
                console.log('[SIGNAL] Received answer from receiver');
                console.log('[SIGNAL] SDP answer length:', data.answer?.sdp?.length);
                if (!data.answer) {
                    throw new Error('No answer in data');
                }
                console.log('[SIGNAL] Setting remote description (answer)...');
                await manager.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('✓ [SIGNAL] Remote description (answer) set');
                await flushRemoteCandidateQueue(manager);
                break;
            case 'candidate':
                if (data.candidate) {
                    console.log('[SIGNAL] Received ICE candidate');
                    ensureRemoteCandidateQueue(manager);

                    // If remoteDescription isn't set yet, queue candidates to avoid
                    // "Failed to add ICE candidate" race conditions.
                    if (!manager.peerConnection.remoteDescription) {
                        manager.remoteCandidateQueue.push(data.candidate);
                        console.log('[SIGNAL] Remote description not set yet; queued ICE candidate');
                        break;
                    }

                    try {
                        addRemoteCandidateFn(manager, data.candidate);
                        await manager.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                        console.log('✓ [SIGNAL] ICE candidate added');
                    } catch (e) {
                        console.warn('[SIGNAL] Failed to add ICE candidate:', e.message);
                    }
                }
                break;
        }
    } catch (e) {
        console.error(`✗ [SIGNAL] Error handling ${type}:`, e.message);
        console.error('  Stack:', e.stack);
        manager.ui.showError(`Signal error (${type}): ${e.message}`);
    }
}

export function createOffer(manager) {
    if (!manager.peerConnection) {
        console.error('Cannot create offer: no peer connection');
        return;
    }

    console.log('[SIGNAL] Creating offer...');
    console.log('[SIGNAL] Peer connection state:', manager.peerConnection.connectionState);
    console.log('[SIGNAL] ICE connection state:', manager.peerConnection.iceConnectionState);

    manager.peerConnection.createOffer()
        .then((offer) => {
            console.log('✓ [SIGNAL] Offer created');
            console.log('[SIGNAL] Offer SDP length:', offer.sdp.length);
            console.log('[SIGNAL] Setting as local description...');
            return manager.peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            console.log('✓ [SIGNAL] Local description set');
            if (!manager.peerConnection.localDescription) {
                throw new Error('Local description not set');
            }
            const localDesc = manager.peerConnection.localDescription;
            console.log('[SIGNAL] Sending offer to receiver via server');
            console.log('[SIGNAL] Offer details:', {
                type: localDesc.type,
                sdpLength: localDesc.sdp.length,
                roomId: manager.roomId
            });
            manager.socket.emit('offer', {
                offer: localDesc,
                roomId: manager.roomId
            });
            console.log('✓ [SIGNAL] Offer emitted');
        })
        .catch(e => {
            console.error('✗ [SIGNAL] Failed to create/send offer:', e.message);
            console.error('  Stack:', e.stack);
            manager.ui.showError(`Failed to create offer: ${e.message}`);
        });
}
