# Introduction

AirShare is a **peer-to-peer file transfer application** that lets you share files directly between browsers using WebRTC. Files transfer directly between peers—we never store your files on our servers.

## ✨ Features

- **🛡️ Peer-to-Peer** - Files transfer directly between browsers using WebRTC, no server storage
- **♾️ Multiple Files** - Transfer multiple files simultaneously with individual progress tracking
- **🔒 Secure** - End-to-end encryption with AES-256-GCM before transfer
- **🔐 Password Protection** - Optional password protection for shared links
- **⚡ Fast & Simple** - Drag and drop, share the link, and you're done
- **⏸️ Pause/Resume** - Pause and resume file transfers anytime
- **🌙 Dark Mode** - Premium UI with native dark mode support
- **🐳 Docker Ready** - Production-optimized containerized deployments

## How It Works

1. **Sender** selects files and optionally sets a password
2. **System** generates a shareable link with peer ID
3. **Receiver** opens the link and enters password (if required)
4. **Files** transfer directly peer-to-peer using WebRTC
5. **No server storage** - your files are encrypted and private

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JS (ES Modules) | Fast, lightweight UI |
| **Backend** | Node.js, Express | Static file serving |
| **Real-time** | PeerJS | WebRTC abstraction with cloud signaling |
| **Encryption** | Web Crypto API (AES-256-GCM) | Client-side file encryption |
| **Security** | Helmet, CORS | Defense-in-depth |

## Quick Start

### Docker (Recommended)
```bash
docker run -d \
  -p 3000:3000 \
  --name airshare \
  ghcr.io/jaberio/airshare:latest

# Visit: http://localhost:3000
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
         │ PeerJS (WebRTC Signaling)│
         ├──────────────────────────┤
         │  (Encrypted File Data)   │
         │                          │
         └──────────────────────────┴──────────┐
                                               │
                                    ┌──────────▼──────────┐
                                    │   PeerJS Cloud      │
                                    │  (0.peerjs.com)     │
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
