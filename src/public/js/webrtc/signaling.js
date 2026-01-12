import { addRemoteCandidate as addRemoteCandidateFn } from './diagnostics.js';
import { logger } from '../utils/logger.js';

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
            logger.debug('SIGNAL', 'Queued ICE candidate added');
        } catch (e) {
            logger.warn('SIGNAL', 'Failed to add queued candidate:', e.message);
        }
    }
}

export async function handleSignal(manager, type, data) {
    if (!manager.peerConnection) {
        logger.error('SIGNAL', `No peer connection when handling ${type}`);
        return;
    }

    try {
        switch (type) {
            case 'offer':
                logger.info('SIGNAL', `Received offer (${data.offer?.sdp?.length} bytes)`);
                if (!data.offer) throw new Error('Missing offer data');
                
                logger.debug('SIGNAL', 'Setting remote description (offer)');
                await manager.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                await flushRemoteCandidateQueue(manager);
                
                logger.debug('SIGNAL', 'Creating answer');
                const answer = await manager.peerConnection.createAnswer();
                await manager.peerConnection.setLocalDescription(answer);
                
                logger.info('SIGNAL', 'Sending answer to sender');
                manager.socket.emit('answer', { answer: manager.peerConnection.localDescription, roomId: manager.roomId });
                break;
            case 'answer':
                logger.info('SIGNAL', `Received answer (${data.answer?.sdp?.length} bytes)`);
                if (!data.answer) throw new Error('Missing answer data');
                
                logger.debug('SIGNAL', 'Setting remote description (answer)');
                await manager.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                await flushRemoteCandidateQueue(manager);
                break;
                
            case 'candidate':
                if (data.candidate) {
                    logger.debug('SIGNAL', 'Received ICE candidate');
                    ensureRemoteCandidateQueue(manager);

                    if (!manager.peerConnection.remoteDescription) {
                        manager.remoteCandidateQueue.push(data.candidate);
                        logger.debug('SIGNAL', 'Queued candidate (remote description not ready)');
                        break;
                    }

                    try {
                        addRemoteCandidateFn(manager, data.candidate);
                        await manager.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                        logger.debug('SIGNAL', 'ICE candidate added');
                    } catch (e) {
                        logger.warn('SIGNAL', 'Failed to add candidate:', e.message);
                    }
                }
                break;
        }
    } catch (e) {
        logger.error('SIGNAL', `Error handling ${type}:`, e.message);
        manager.ui.showError(`Signal error (${type}): ${e.message}`);
    }
}

export function createOffer(manager) {
    if (!manager.peerConnection) {
        logger.error('SIGNAL', 'Cannot create offer: no peer connection');
        return;
    }

    logger.info('SIGNAL', 'Creating offer');
    logger.debug('SIGNAL', 'Connection states:', {
        peer: manager.peerConnection.connectionState,
        ice: manager.peerConnection.iceConnectionState
    });

    manager.peerConnection.createOffer()
        .then((offer) => {
            logger.debug('SIGNAL', `Offer created (${offer.sdp.length} bytes)`);
            return manager.peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            if (!manager.peerConnection.localDescription) {
                throw new Error('Local description not set');
            }
            logger.info('SIGNAL', 'Sending offer to receiver');
            manager.socket.emit('offer', {
                offer: manager.peerConnection.localDescription,
                roomId: manager.roomId
            });
        })
        .catch(e => {
            logger.error('SIGNAL', 'Failed to create/send offer:', e.message);
            manager.ui.showError(`Failed to create offer: ${e.message}`);
        });
}
