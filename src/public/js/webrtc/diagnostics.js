import { logger } from '../utils/logger.js';

export function logConnectionFailure(manager) {
    logger.group('=== CONNECTION FAILURE DIAGNOSTICS ===', () => {
        logger.error('DIAGNOSTIC', 'Connection state:', manager.peerConnection.connectionState);
        logger.error('DIAGNOSTIC', 'ICE connection:', manager.peerConnection.iceConnectionState);
        logger.error('DIAGNOSTIC', 'ICE gathering:', manager.peerConnection.iceGatheringState);
        logger.error('DIAGNOSTIC', `Local candidates: ${manager.iceCandidates.local.length}`);
        logger.error('DIAGNOSTIC', `Remote candidates: ${manager.iceCandidates.remote.length}`);

        if (manager.iceCandidates.local.length === 0) {
            logger.error('DIAGNOSTIC', 'NO LOCAL CANDIDATES - Possible causes:');
            logger.error('DIAGNOSTIC', '  • STUN servers unreachable');
            logger.error('DIAGNOSTIC', '  • Network interface problems');
            logger.error('DIAGNOSTIC', '  • Corporate firewall blocking UDP');
        }

        if (manager.iceCandidates.remote.length === 0) {
            logger.error('DIAGNOSTIC', 'NO REMOTE CANDIDATES - Possible causes:');
            logger.error('DIAGNOSTIC', '  • Peer not connected');
            logger.error('DIAGNOSTIC', '  • Signal relay failed');
            logger.error('DIAGNOSTIC', '  • Peer behind symmetric NAT');
        }

        const candidateTypes = manager.iceCandidates.local.reduce((acc, c) => {
            acc[c.type] = (acc[c.type] || 0) + 1;
            return acc;
        }, {});
        logger.error('DIAGNOSTIC', 'Local candidate types:', candidateTypes);
    });
}

export function logICEFailureDetails(manager) {
    logger.group('=== ICE FAILURE DIAGNOSTICS ===', () => {
        logger.error('ICE', `Local candidates: ${manager.iceCandidates.local.length}`);
        logger.error('ICE', `Remote candidates: ${manager.iceCandidates.remote.length}`);
        logger.error('ICE', `Gathering complete: ${manager.iceCandidates.gatheredLocal}`);

        if (manager.iceCandidates.local.length > 0 && manager.iceCandidates.remote.length > 0) {
            logger.error('ICE', 'Candidates exchanged but connection failed');
            logger.error('ICE', '  • Try disabling VPN');
            logger.error('ICE', '  • Try different network');
            logger.error('ICE', '  • May need TURN server');
        } else if (manager.iceCandidates.local.length === 0) {
            logger.error('ICE', 'No local candidates (firewall/STUN issue)');
        } else {
            logger.error('ICE', 'No remote candidates (peer unreachable)');
        }
    });
}

export function addRemoteCandidate(manager, candidate) {
    manager.iceCandidates.remote.push({
        type: candidate.type || 'unknown',
        foundation: candidate.foundation || 'unknown'
    });
}
