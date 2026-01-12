import { initLifecycle, markIntentionalClose as markIntentionalCloseFn } from './webrtc/lifecycle.js';
import { resetConnection as resetConnectionFn, setupPeerConnection as setupPeerConnectionFn } from './webrtc/connection.js';
import { sendFile as sendFileFn, continueSendFile as continueSendFileFn } from './webrtc/sender.js';
import { handleMessage as handleMessageFn, downloadFile as downloadFileFn } from './webrtc/receiver.js';
import { handleSignal as handleSignalFn, createOffer as createOfferFn } from './webrtc/signaling.js';
import { logConnectionFailure as logConnectionFailureFn, logICEFailureDetails as logICEFailureDetailsFn } from './webrtc/diagnostics.js';

export class WebRTCManager {
            constructor(socket, config, ui) {
                this.socket = socket;
                this.config = config;
                this.ui = ui;

                // Connection state
                this.peerConnection = null;
                this.dataChannel = null;
                this.roomId = null;
                this.isInitiator = false;
                this.pendingFile = null;

                // Send state
                this.sendState = {
                    file: null,
                    fileId: null,
                    offset: 0,
                    chunkSize: config.defaultChunkSize || 131072,
                    currentChunkSize: config.defaultChunkSize || 131072,
                    startTime: 0,
                    backpressureCount: 0,
                    paused: false
                };

                // Receive state
                this.receiveState = {
                    fileInfo: null,
                    chunks: new Map(), // chunkIndex -> { data, crc32 }
                    totalChunks: 0,
                    receivedChunks: 0,
                    receivedSize: 0,
                    streamWriter: null,
                    streamHandle: null,
                    useStreaming: false,
                    lastValidationError: null
                };

                // Transfer stats
                this.stats = {
                    lastProgressUpdate: 0,
                    lastProgressPercentage: -1,
                    startTime: null,
                    speedSamples: []
                };

                // ICE diagnostics
                this.iceCandidates = {
                    local: [],
                    remote: [],
                    gatheredLocal: false
                };

                // Track timers for cleanup
                this.timers = new Set();

                initLifecycle(this);
            }

            // Lifecycle
            markIntentionalClose() {
                markIntentionalCloseFn(this);
            }

            cleanup() {
                // Clear all tracked timers
                this.timers.forEach(timer => {
                    try {
                        clearTimeout(timer);
                        clearInterval(timer);
                    } catch (e) {
                        console.warn('[CLEANUP] Failed to clear timer:', e);
                    }
                });
                this.timers.clear();

                // Clear data channel open timeout
                if (this.dataChannelOpenTimeout) {
                    clearTimeout(this.dataChannelOpenTimeout);
                    this.dataChannelOpenTimeout = null;
                }

                // Close stream writer if open
                if (this.receiveState.streamWriter) {
                    try {
                        this.receiveState.streamWriter.close();
                    } catch (e) {
                        console.warn('[CLEANUP] Failed to close stream writer:', e);
                    }
                }

                // Clear chunks from memory
                this.receiveState.chunks.clear();
                
                // Clear stats
                this.stats.speedSamples = [];
                
                // Reset connection
                this.resetConnection();
            }

            // Connection
            resetConnection() {
                resetConnectionFn(this);
            }

            setupPeerConnection(roomId, isInitiator, fileToSend = null) {
                setupPeerConnectionFn(this, roomId, isInitiator, fileToSend);
            }

            // Sending
            async sendFile(file) {
                return sendFileFn(this, file);
            }

            async continueSendFile() {
                return continueSendFileFn(this);
            }

            // Receiving
            async handleMessage(event) {
                return handleMessageFn(this, event);
            }

            downloadFile(file) {
                return downloadFileFn(this, file);
            }

            // Signaling
            async handleSignal(type, data) {
                return handleSignalFn(this, type, data);
            }

            createOffer() {
                return createOfferFn(this);
            }

            // Diagnostics
            logConnectionFailure() {
                return logConnectionFailureFn(this);
            }

            logICEFailureDetails() {
                return logICEFailureDetailsFn(this);
            }
        }
