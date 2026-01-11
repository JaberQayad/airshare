export function initLifecycle(manager) {
    manager.lifecycle = {
        intentionalClose: false,
        transferComplete: false,
        disconnectTimer: null
    };
}

export function markIntentionalClose(manager) {
    manager.lifecycle.intentionalClose = true;
}

export function clearDisconnectTimer(manager) {
    if (manager.lifecycle.disconnectTimer) {
        clearTimeout(manager.lifecycle.disconnectTimer);
        manager.lifecycle.disconnectTimer = null;
    }
}
