// Centralized cleanup utilities to avoid repetitive try-catch blocks

/**
 * Safely clear a timeout or interval
 */
export function clearTimer(timer) {
    if (!timer) return;
    try {
        clearTimeout(timer);
        clearInterval(timer);
    } catch (e) {
        // Silently ignore - timer already cleared
    }
}

/**
 * Safely clear multiple timers
 */
export function clearTimers(timers) {
    if (!timers) return;
    
    if (timers instanceof Set || Array.isArray(timers)) {
        for (const timer of timers) {
            clearTimer(timer);
        }
        if (timers instanceof Set) {
            timers.clear();
        } else if (Array.isArray(timers)) {
            timers.length = 0;
        }
    }
}

/**
 * Safely remove event listener
 */
export function removeListener(element, event, handler) {
    if (!element || !event || !handler) return;
    try {
        element.removeEventListener(event, handler);
    } catch (e) {
        // Silently ignore
    }
}

/**
 * Safely close a resource (stream, connection, etc)
 */
export function safeClose(resource, resourceName = 'resource') {
    if (!resource) return;
    try {
        if (typeof resource.close === 'function') {
            resource.close();
        } else if (typeof resource.disconnect === 'function') {
            resource.disconnect();
        }
    } catch (e) {
        console.warn(`[CLEANUP] Failed to close ${resourceName}:`, e.message);
    }
}

/**
 * Safely nullify event handlers on an object
 */
export function clearEventHandlers(obj, handlers) {
    if (!obj) return;
    handlers.forEach(handler => {
        try {
            obj[handler] = null;
        } catch (e) {
            // Silently ignore
        }
    });
}

/**
 * Clear WebRTC connection cleanly
 */
export function clearRTCConnection(connection) {
    if (!connection) return;
    
    clearEventHandlers(connection, [
        'onicecandidate',
        'onconnectionstatechange',
        'oniceconnectionstatechange',
        'onicegatheringstatechange',
        'ondatachannel'
    ]);
    
    safeClose(connection, 'RTCPeerConnection');
}

/**
 * Clear data channel cleanly
 */
export function clearDataChannel(channel) {
    if (!channel) return;
    
    clearEventHandlers(channel, [
        'onopen',
        'onmessage',
        'onclose',
        'onerror',
        'onbufferedamountlow'
    ]);
    
    safeClose(channel, 'DataChannel');
}
