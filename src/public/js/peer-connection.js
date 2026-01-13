// PeerJS Connection Manager
import { logger, utils } from './utils.js';

export class PeerConnection {
    constructor(onConnectionChange, onData) {
        this.peer = null;
        this.connection = null;
        this.peerId = null;
        this.remotePeerId = null;
        this.onConnectionChange = onConnectionChange;
        this.onData = onData;
        this.connectionState = 'disconnected';
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            logger.log('Initializing PeerJS connection...');
            
            this.peer = new Peer({
                debug: 2,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });

            this.peer.on('open', (id) => {
                this.peerId = id;
                logger.info('Peer ID obtained:', id);
                this.updateConnectionState('ready');
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                logger.info('Incoming connection from:', conn.peer);
                this.handleConnection(conn);
            });

            this.peer.on('error', (err) => {
                logger.error('Peer error:', err.type, err.message);
                this.updateConnectionState('error');
                reject(err);
            });

            this.peer.on('disconnected', () => {
                logger.warn('Peer disconnected');
                this.updateConnectionState('disconnected');
            });

            this.peer.on('close', () => {
                logger.warn('Peer closed');
                this.updateConnectionState('closed');
            });
        });
    }

    connectToPeer(peerId) {
        logger.log('Connecting to peer:', peerId);
        this.remotePeerId = peerId;
        this.updateConnectionState('connecting');
        
        const conn = this.peer.connect(peerId, {
            reliable: true,
            serialization: 'binary'
        });
        
        this.handleConnection(conn);
    }

    handleConnection(conn) {
        this.connection = conn;
        this.remotePeerId = conn.peer;

        conn.on('open', () => {
            logger.info('Connection established with:', conn.peer);
            this.updateConnectionState('connected');
        });

        conn.on('data', (data) => {
            if (this.onData) {
                this.onData(data);
            }
        });

        conn.on('close', () => {
            logger.warn('Connection closed');
            this.updateConnectionState('disconnected');
        });

        conn.on('error', (err) => {
            logger.error('Connection error:', err);
            this.updateConnectionState('error');
        });
    }

    send(data) {
        if (this.connection && this.connection.open) {
            this.connection.send(data);
            return true;
        }
        logger.warn('Cannot send - connection not open');
        return false;
    }

    updateConnectionState(state) {
        this.connectionState = state;
        if (this.onConnectionChange) {
            this.onConnectionChange(state);
        }
    }

    disconnect() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.updateConnectionState('closed');
    }

    isConnected() {
        return this.connection && this.connection.open;
    }
}
