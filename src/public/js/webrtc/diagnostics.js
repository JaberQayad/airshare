export function logConnectionFailure(manager) {
    console.error('\n=== CONNECTION FAILURE DIAGNOSTICS ===');
    console.error('[CONNECTION] Current state: ' + manager.peerConnection.connectionState);
    console.error('[ICE-CONNECTION] Current state: ' + manager.peerConnection.iceConnectionState);
    console.error('[ICE-GATHERING] Current state: ' + manager.peerConnection.iceGatheringState);
    console.error('[ICE] Local candidates gathered: ' + manager.iceCandidates.local.length);
    console.error('[ICE] Remote candidates received: ' + manager.iceCandidates.remote.length);

    if (manager.iceCandidates.local.length === 0) {
        console.error('⚠️  NO LOCAL ICE CANDIDATES - Possible causes:');
        console.error('   - STUN servers unreachable');
        console.error('   - Network interface problems');
        console.error('   - Corporate firewall blocking UDP');
    }
    if (manager.iceCandidates.remote.length === 0) {
        console.error('⚠️  NO REMOTE ICE CANDIDATES - Possible causes:');
        console.error('   - Other peer not connected');
        console.error('   - Signal relay failed');
        console.error('   - Other peer behind symmetric NAT');
    }

    console.error('\nLocal candidates by type:',
        manager.iceCandidates.local.reduce((acc, c) => {
            acc[c.type] = (acc[c.type] || 0) + 1;
            return acc;
        }, {})
    );
    console.error('=== END DIAGNOSTICS ===\n');
}

export function logICEFailureDetails(manager) {
    console.error('\n=== ICE FAILURE DIAGNOSTICS ===');
    console.error('[ICE] Local candidates: ' + manager.iceCandidates.local.length);
    console.error('[ICE] Remote candidates: ' + manager.iceCandidates.remote.length);
    console.error('[ICE] Local gathering complete: ' + manager.iceCandidates.gatheredLocal);

    console.error('Possible causes:');
    if (manager.iceCandidates.local.length > 0 && manager.iceCandidates.remote.length > 0) {
        console.error('✓ Candidates exchanged but connection failed');
        console.error('   - Try disabling VPN');
        console.error('   - Try different network (avoid corporate WiFi)');
        console.error('   - Both peers may need TURN server');
    } else if (manager.iceCandidates.local.length === 0) {
        console.error('✗ No local candidates (firewall or STUN issue)');
    } else if (manager.iceCandidates.remote.length === 0) {
        console.error('✗ No remote candidates received (other peer unreachable)');
    }
    console.error('=== END ICE DIAGNOSTICS ===\n');
}

export function addRemoteCandidate(manager, candidate) {
    if (candidate) {
        manager.iceCandidates.remote.push({
            type: candidate.type,
            foundation: candidate.foundation
        });
    }
}
