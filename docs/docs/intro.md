---
sidebar_position: 1
---

# Introduction

AirShare is a **production-ready peer-to-peer file transfer application** that lets you share files directly between browsers using WebRTC. Files transfer directly between peers—we never store your files on our servers.

## ✨ Features

- **🛡️ Peer-to-Peer** - Files transfer directly between browsers using WebRTC, no server storage
- **♾️ No Size Limits** - Transfer files of any size (for desktop/laptops) with smart streaming
- **🔒 Secure** - End-to-end encryption in transit (WebRTC TLS 1.3) + per-chunk integrity verification
- **⚡ Fast & Simple** - Drag and drop, share the link, and you're done
- **🌙 Dark Mode** - Premium UI with native dark mode support
- **🐳 Docker Ready** - Production-optimized containerized deployments
- **📊 Enterprise Ready** - Room management, backpressure control, signaling hardening (v2.0+)

## How It Works

1. **Sender** uploads files through the web interface
2. **System** generates a shareable link containing the room ID
3. **Receiver** opens the link in their browser
4. **Sender** approves the incoming connection via prompt
5. **Files** transfer directly peer-to-peer using WebRTC DataChannel
6. **No server storage** - your files are private and never stored

## 🎯 Enterprise Features (v2.0+)

### 📁 Large File Streaming
- Files >200MB automatically stream to disk (File System Access API)
- Eliminates RAM exhaustion on large transfers
- Graceful fallback to in-memory for unsupported browsers

### 🚀 Smart Backpressure
- Event-driven flow control (no CPU-wasting sleep loops)
- Adaptive chunk sizing (32KB-256KB) based on network conditions
- Automatic pause/resume when DataChannel buffers fill

### 🔐 Signaling Hardening
- Room time-to-live (TTL) cleanup prevents memory leaks
- Max 2 peers per room (1 sender + 1 receiver) for security & scalability
- Payload size validation (64KB limit) prevents DoS attacks
- CRC32 per-chunk validation for transfer integrity

### 💬 Better UX
- Connection prompts (approve/reject incoming transfers)
- Real-time speed & ETA display
- Clear error messages for all failure scenarios
- Progress throttling prevents UI thrashing

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JS (ES Modules) | Fast, lightweight UI |
| **Backend** | Node.js, Express | Scalable signaling server |
| **Real-time** | Socket.IO (signaling), WebRTC (data) | Peer discovery & transfer |
| **Security** | Helmet, CORS, Rate Limiting | Defense-in-depth |
| **Enterprise** | CRC32, Config validation, Room registry | Reliability & operations |

## Quick Start

### Docker (Recommended)
```bash
docker run -d \
  -p 4111:3000 \
  --name airshare \
  ghcr.io/jaberio/airshare:latest

# Visit: http://localhost:4111
```

### Local Development
```bash
git clone https://github.com/jaberio/airshare.git
cd airshare
npm install
npm start
# Visit: http://localhost:3000
```

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│   Browser 1     │         │   Browser 2     │
│   (Sender)      │         │   (Receiver)    │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ Socket.IO (Signaling)     │
         ├──────────────────────────┤
         │ (SDP, ICE candidates)    │
         │                          │
         └──────────────────────────┴──────────┐
                                               │
                                    ┌──────────▼──────────┐
                                    │   Node.js Server    │
                                    │  (Relay, Config)    │
                                    └─────────────────────┘
         
         WebRTC DataChannel (P2P)
         ├──────────────────────────┐
         │  Chunked file transfer   │
         │  CRC32 validation        │
         │  Backpressure control    │
         │  Large file streaming    │
         │  (TLS 1.3 encrypted)     │
         └──────────────────────────┘
```

## Browser Support

| Browser | Version | Large Files | Notes |
|---------|---------|-------------|-------|
| Chrome | 86+ | ✅ Streaming | Best experience |
| Edge | 79+ | ✅ Streaming | Full support |
| Firefox | Latest | ⚠️ In-memory | Falls back gracefully |
| Safari | Latest | ⚠️ In-memory | Mobile works |

## Why AirShare?

- **Privacy**: No server storage, no tracking
- **Speed**: Direct peer connection, minimal latency
- **Simplicity**: No registration, passwords, or complexity
- **Reliability**: Enterprise-grade error handling & monitoring
- **Flexibility**: Self-hosted or cloud deployment

## Next Steps

- 📖 [Installation Guide](./installation.md) - Get it running
- ⚙️ [Configuration](./configuration.md) - Customize for your needs
- 🛠️ [Development](./development.md) - Contribute to the project
