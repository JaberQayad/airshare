---
sidebar_position: 4
---

# Development Guide

Contribute to AirShare and extend it with custom features. This guide covers architecture, development workflow, testing, and deployment.

## 📁 Project Structure

```
airshare/
├── src/
│   ├── public/                 # Frontend files
│   │   ├── index.html         # HTML shell
│   │   ├── css/
│   │   │   └── styles.css     # Styling (light/dark themes)
│   │   └── js/
│   │       ├── app.js         # Main orchestration + event listeners
│   │       ├── ui.js          # UI state management + DOM updates
│   │       ├── webrtc.js      # Peer connection + streaming + backpressure
│   │       ├── crc32.js       # CRC32 checksum validation (v2.0+)
│   │       └── utils.js       # Helper functions (formatBytes, etc)
│   └── server/
│       ├── index.js           # Express app + Socket.IO setup
│       ├── config.js          # Environment variable parsing
│       ├── socket.js          # Signaling handlers + room management (v2.0+)
│       └── logger.js          # Logging utility
├── plans/                      # Planning & documentation (gitignored)
│   ├── TEST_PLAN.md           # 12 test scenarios
│   ├── ARCHITECTURE.md        # Design decisions
│   ├── LIMITATIONS.md         # Known issues & mitigations
│   ├── TASKS.md               # Implementation checklist
│   └── ENV_REFERENCE.md       # Tuning guide
├── docs/                       # Docusaurus documentation site
│   └── docs/
│       ├── intro.md           # Getting started
│       ├── installation.md    # Install instructions
│       ├── configuration.md   # Environment variables
│       └── development.md     # This file
├── Dockerfile                  # Container image definition
├── docker-compose.yml          # Production docker config
├── .env.example                # Template for local development
└── package.json                # Dependencies & scripts
```

---

## 🚀 Development Environment Setup

### Quick Start

```bash
# Clone repository
git clone https://github.com/jaberio/airshare.git
cd airshare

# Install dependencies
npm install

# Copy example environment
cp .env.example .env

# Start development server (auto-reload)
npm run dev

# Open browser: http://localhost:3000
```

### IDE Setup (VS Code Recommended)

**.vscode/settings.json**
```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
```

---

## 🏗️ Architecture Overview

### Frontend Data Flow

```
UI Events (File select, link click)
    ↓
app.js (Orchestration)
    ↓ delegates to
┌────────────────────┐
│  webrtc.js         │  ← Peer connection, streaming
│  ui.js             │  ← DOM updates, prompts
│  utils.js          │  ← Helpers
│  crc32.js          │  ← Integrity validation
└────────────────────┘
    ↓ communicates via
Socket.IO + WebRTC DataChannel
    ↓
Server signaling relay (socket.js)
    ↓
Remote peer (same flow in reverse)
```

### Backend Signaling Flow

```
Client connects via Socket.IO
    ↓
socket.js receives event
    ↓
Validate: Is peer in room? Is payload <64KB?
    ↓
If valid: Relay to peer | If invalid: Send error
    ↓
Peer receives offer/answer/candidate
    ↓
WebRTC connection established
    ↓
File transfer via DataChannel (P2P)
```

### Enterprise Features (v2.0+)

```
Large File (>200MB)
    ↓
initializeReceiver() checks size
    ↓
Try File System Access API (Chrome/Edge)
    ├─ Success → Stream to disk
    └─ Failure → Fallback to in-memory + warning

Backpressure
    ├─ Send loop checks bufferedAmount
    ├─ If > 1MB → Pause, wait for bufferedamountlow event
    ├─ If backpressure count > 5 → Reduce chunk size 20%
    └─ If stable → Increase chunk size 10%

Room Management
    ├─ Create room: Check duplicate, store in registry
    ├─ Join room: Check exists, enforce max 2 peers
    ├─ Every 10min: Clean rooms older than 30min TTL
    └─ All signals: Validate payload <64KB, check membership
```

---

## 🔧 Core Components

### src/public/js/webrtc.js
**Purpose**: Manage WebRTC peer connections, file transfers, and streaming

**Key Objects**:
- `WebRTCManager` - Main class
- `sendState` - Tracks sender progress (offset, chunk size, backpressure)
- `receiveState` - Tracks receiver progress (chunks, stream writer)
- `stats` - Transfer statistics (speed, ETA)

**Key Methods**:
```javascript
// Connection management
createPeerConnection()           // Initialize peer + data channel
createOffer()                    // SDP offer creation
handleAnswer(sdp)                // Process remote answer

// File transfer (event-driven)
continueSendFile()               // Async coroutine: read & send chunks
handleChunkData(buffer)          // Validate CRC32, write to disk/memory
updateProgressStats()            // Throttled progress updates

// Streaming
initializeReceiver()             // Decide: stream or in-memory
initializeStreaming()            // File System Access API setup
handleStreamWrite(chunk)         // Write to file stream
```

**Backpressure Algorithm**:
```javascript
// In continueSendFile():
if (dataChannel.bufferedAmount > config.bufferHighWater) {
  sendState.paused = true
  return  // Wait for bufferedamountlow event
}

// On bufferedamountlow event:
if (sendState.paused && sendState.file) {
  sendState.paused = false
  continueSendFile()  // Resume
}

// Adaptive sizing:
sendState.backpressureCount > 5
  → reduce: currentChunkSize *= 0.8
  → bound: [MIN_CHUNK_SIZE, MAX_CHUNK_SIZE]
```

---

### src/server/socket.js
**Purpose**: WebSocket signaling relay with room management

**Room Registry**:
```javascript
roomRegistry: Map<roomId, {
  createdAt: timestamp,
  peers: Set<socketId>
}>
```

**Key Handlers**:
```javascript
// Room lifecycle
on('create-room')    // Create + add to registry
on('join-room')      // Validate exists, enforce max 2 peers
on('leave-room')     // Remove peer from room

// Signaling
on('offer')          // Relay SDP to peer
on('answer')         // Relay SDP to peer
on('candidate')      // Relay ICE candidate

// Validation
isPayloadValid(data) // Check size <64KB
checkMembership()    // Verify sender is in room

// Cleanup
TTL cleanup interval // Every 10min: remove old rooms
```

---

### src/public/js/ui.js
**Purpose**: DOM management and user interaction

**Key Methods**:
```javascript
showConnectionPrompt(peerId, onAccept, onReject)  // Accept/reject dialog
showError(message)                                 // Error display
showDownload(file)                                 // Download success
showProgress(percent, speed, eta)                  // Progress updates
```

**State Properties**:
```javascript
fileSelectCallback         // Listener for file selection
downloadCallback           // Listener for file download
errorCallback             // Listener for errors
acceptConnectionCallback  // Listener for connection prompts
```

---

### src/public/js/crc32.js
**Purpose**: Per-chunk integrity validation

**Exports**:
```javascript
calculateCRC32(buffer)    // Uint8Array → Uint32
crc32ToHex(crc32)        // Uint32 → "xxxxxxxx"
CRC32_TABLE              // 256-entry lookup table
```

**Usage**:
```javascript
// Sender: wrap chunk
const crc32 = calculateCRC32(chunkData)
const crc32Buffer = new Uint8Array([
  crc32 & 0xFF,
  (crc32 >> 8) & 0xFF,
  (crc32 >> 16) & 0xFF,
  (crc32 >> 24) & 0xFF
])
dataChannel.send(Buffer.concat([crc32Buffer, chunkData]))

// Receiver: validate
const receivedCrc32 = buffer.readUInt32LE(0)
const calculatedCrc32 = calculateCRC32(buffer.slice(4))
if (receivedCrc32 !== calculatedCrc32) {
  console.error('CRC32 mismatch - corruption detected')
}
```

---

### src/server/config.js
**Purpose**: Parse environment variables with defaults

**Structure**:
```javascript
module.exports = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '107374182400'),
  
  // Streaming & Backpressure
  maxInMemorySize: parseInt(process.env.MAX_IN_MEMORY_SIZE || '209715200'),
  defaultChunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE || '131072'),
  minChunkSize: parseInt(process.env.MIN_CHUNK_SIZE || '32768'),
  maxChunkSize: parseInt(process.env.MAX_CHUNK_SIZE || '262144'),
  bufferHighWater: parseInt(process.env.BUFFER_HIGH_WATER || '1048576'),
  bufferLowWater: parseInt(process.env.BUFFER_LOW_WATER || '262144'),
  
  // Signaling & Room Management
  maxPeersPerRoom: parseInt(process.env.MAX_PEERS_PER_ROOM || '2'),
  roomTtlMs: parseInt(process.env.ROOM_TTL_MS || '1800000'),
  maxSignalPayloadBytes: parseInt(process.env.MAX_SIGNAL_PAYLOAD_BYTES || '65536'),
  
  // ICE servers, UI customization, etc.
}
```

---

## 🛠️ Common Development Tasks

### Adding a New Configuration Option

1. **Add to `src/server/config.js`**:
   ```javascript
   module.exports = {
     myNewOption: process.env.MY_NEW_OPTION || 'default-value'
   }
   ```

2. **Document in `docs/docs/configuration.md`**:
   - Add to appropriate category
   - Include default, type, example, tuning notes

3. **Update `.env.example`**:
   ```bash
   # Section Name
   MY_NEW_OPTION=default-value
   ```

4. **Use in code**:
   ```javascript
   const config = require('./config')
   console.log(config.myNewOption)
   ```

### Modifying the UI

1. **Styling**: Edit `src/public/css/styles.css`
   - Use CSS custom properties for colors (theme-aware)
   - Mobile-first responsive design

2. **Functionality**: Edit `src/public/js/ui.js`
   - Update DOM directly (no framework)
   - Emit events for app.js to handle

3. **Test**: Open `http://localhost:3000` with `npm run dev`
   - Changes auto-reload
   - Check browser console for errors

### Adding WebRTC Features

1. **Update `src/public/js/webrtc.js`**:
   ```javascript
   class WebRTCManager {
     myNewFeature() {
       // Implement feature
     }
   }
   ```

2. **Emit events for UI**:
   ```javascript
   this.eventTarget.dispatchEvent(
     new CustomEvent('feature-event', { detail: data })
   )
   ```

3. **Add to `src/public/js/app.js`**:
   ```javascript
   webrtcManager.eventTarget.addEventListener('feature-event', (e) => {
     // Handle event
   })
   ```

### Adding Server Routes

1. **Edit `src/server/index.js`**:
   ```javascript
   app.get('/api/status', (req, res) => {
     res.json({ status: 'ok', rooms: roomRegistry.size })
   })
   ```

2. **Add rate limiting if needed**:
   ```javascript
   app.get('/api/protected', limiter, (req, res) => { ... })
   ```

---

## ✅ Testing

### Manual Testing Checklist

- [ ] **Small file transfer** (50MB): Should complete in `<5 sec`
- [ ] **Large file transfer** (1GB): Should stream to disk on Chrome/Edge
- [ ] **Connection prompt**: Sender sees accept/reject prompt
- [ ] **Backpressure**: Throttle network (DevTools), observe adaptive chunk sizing
- [ ] **Max 2 peers**: 3rd peer gets "Room is full" error
- [ ] **Room TTL**: Wait `>30 min` or modify TTL config, old rooms cleaned up
- [ ] **CRC32 validation**: Monitor for checksum mismatches (should be none)
- [ ] **Error handling**: Network drop shows clear error message
- [ ] **Progress display**: Shows speed + ETA, updates smoothly
- [ ] **Dark mode**: Theme toggle works on both light & dark
- [ ] **Mobile**: Works on iOS/Android browsers
- [ ] **Behind proxy**: TRUST_PROXY=1 enables correct rate limiting

### Browser Compatibility

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 90+ | Full support, streaming works |
| Edge | 90+ | Full support, streaming works |
| Firefox | 88+ | Works, streaming uses fallback |
| Safari | 14+ | Works, streaming uses fallback |
| Mobile | Latest | Mobile works, streaming limited |

### Performance Testing

```bash
# Memory profiling (Chrome DevTools)
1. Open DevTools → Memory tab
2. Take heap snapshot before transfer
3. Start large file transfer
4. Take heap snapshot during transfer
5. Compare: Should not exceed 300MB

# Network throttling (Chrome DevTools)
1. DevTools → Network tab
2. Set throttle to "Slow 3G"
3. Try large file transfer
4. Watch chunk size adapt (should reduce from 256KB)

# CPU monitoring (Chrome DevTools)
1. Open DevTools → Performance tab
2. Record transfer
3. Check CPU usage: Should be <2% during transfer
4. Verify no long tasks (>50ms)
```

---

## 🐳 Building & Deployment

### Build Docker Image

```bash
docker build -t airshare:dev .
docker run -p 3000:3000 \
  -e NODE_ENV=development \
  airshare:dev
```

### Run with Docker Compose

```bash
docker-compose up -d

# View logs
docker-compose logs -f airshare

# Stop
docker-compose down
```

### Push to Container Registry

```bash
# Build & tag
docker build -t your-registry/airshare:v2.0.0 .

# Push
docker push your-registry/airshare:v2.0.0

# Deploy (your orchestration)
docker run your-registry/airshare:v2.0.0
```

---

## 📚 Documentation Development

Edit documentation in `docs/docs/`:

```bash
# Start dev server (live reload)
cd docs
npm run start

# Build production site
npm run build

# Deploy to GitHub Pages (if enabled)
npm run deploy
```

Documentation is built with [Docusaurus](https://docusaurus.io/). Edit Markdown files and changes appear instantly.

---

## 🔍 Debugging

### Server Logs

```bash
# Enable debug logging
DEBUG=* npm start

# Or selectively:
DEBUG=socket.io npm start
```

### Browser Console

1. Open DevTools (F12)
2. Look for errors/warnings in Console tab
3. Check Network tab for WebSocket/HTTP issues
4. Check Application tab for storage/cookies

### Common Issues

| Issue | Debug Steps |
|-------|------------|
| Peer connection fails | Check browser console, verify ICE_SERVERS, check firewall |
| File transfer hangs | Check Network tab (DevTools), verify backpressure logic |
| UI not updating | Check browser console, verify event listeners, try hard refresh |
| Memory leak | Heap snapshot comparison (DevTools Memory tab) |
| Rate limiting blocks | Set TRUST_PROXY=1, verify X-Forwarded-For headers |

---

## 🚢 Deployment Checklist

Before pushing to production:

- [ ] Run full test suite (manual or automated)
- [ ] Performance benchmarks acceptable (speed, memory, CPU)
- [ ] Security review (no hardcoded secrets, HTTPS enabled)
- [ ] Documentation updated
- [ ] .env vars documented & validated
- [ ] Docker image tested
- [ ] Rollback plan prepared
- [ ] Monitoring & alerting setup

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Implement** your changes
4. **Test** thoroughly (manual + automated)
5. **Commit** with clear messages: `git commit -m 'feat: add my feature'`
6. **Push**: `git push origin feature/my-feature`
7. **Create** Pull Request with description

---

## 📖 Additional Resources

- [WebRTC API Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Socket.IO Guide](https://socket.io/docs/)
- [Express.js Docs](https://expressjs.com/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Docker Docs](https://docs.docker.com/)
- [Plans & Architecture](../plans/) - Deep technical details

---

## 🗂️ Related Documentation

See the `plans/` directory for:
- **ARCHITECTURE.md** - Design decisions behind enterprise features
- **TEST_PLAN.md** - Comprehensive testing procedures
- **LIMITATIONS.md** - Known issues & workarounds
- **ENV_REFERENCE.md** - Tuning guide for different scenarios
