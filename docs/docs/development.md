---
sidebar_position: 4
---

# Development Guide

Contribute to AirShare and extend it with custom features. This guide covers architecture, development workflow, and deployment.

## 📁 Project Structure

```
airshare/
├── src/
│   ├── public/                 # Frontend files (served statically)
│   │   ├── index.html         # Main HTML file
│   │   ├── css/
│   │   │   └── styles.css     # Styling (light/dark themes)
│   │   └── js/
│   │       ├── app.js         # Main application orchestration
│   │       ├── ui-manager.js  # UI state & DOM updates
│   │       ├── peer-connection.js  # PeerJS wrapper
│   │       ├── file-transfer.js    # Transfer logic with encryption
│   │       └── utils.js       # Helper functions (logging, encryption, formatting)
│   └── server/
│       └── index.js           # Express server (static file serving)
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

# Start development server
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
User Actions (File select, link share)
    ↓
app.js (Main orchestration)
    ↓ delegates to
┌────────────────────┐
│  ui-manager.js     │  ← DOM updates, user interactions
│  peer-connection.js│  ← PeerJS wrapper for WebRTC
│  file-transfer.js  │  ← File chunking, encryption, transfer logic
│  utils.js          │  ← Logger, encryption, formatting utilities
└────────────────────┘
    ↓ communicates via
PeerJS Cloud (0.peerjs.com)
```

### Key Components

#### 1. **app.js** - Application Orchestration
- Initializes PeerJS connection
- Handles sender/receiver mode detection
- Manages file selection and transfer initiation
- Coordinates between UI and transfer logic

#### 2. **peer-connection.js** - WebRTC Abstraction
- Wraps PeerJS library
- Handles peer connection lifecycle
- Manages data channel events
- Provides simple API for sending/receiving data

#### 3. **file-transfer.js** - Transfer Logic
- Chunks files into 16KB pieces
- Encrypts each chunk with AES-256-GCM
- Tracks transfer progress and statistics
- Handles pause/resume/cancel functionality

#### 4. **ui-manager.js** - UI State Management
- Updates progress displays
- Manages file list UI
- Handles password dialogs
- Updates connection status

#### 5. **utils.js** - Shared Utilities
- Logger with log levels
- Encryption/decryption functions
- File size formatting
- Speed and ETA calculations

---

## 🔧 Development Workflow

### Running Locally

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start

# Build documentation
npm run build
```

### Making Changes

**1. Frontend Changes**
- Edit files in `src/public/`
- Refresh browser to see changes
- No build step required (vanilla JS)

**2. Server Changes**
- Edit `src/server/index.js`
- Restart server with `npm start`

**3. Documentation Changes**
- Edit files in `docs/docs/`
- Run `npm run build` to rebuild
- Preview at `docs/build/index.html`

### Testing Locally

1. **Single Machine Test:**
   - Open `http://localhost:3000` in two browser tabs
   - Select files in first tab (sender)
   - Copy link to second tab (receiver)
   - Verify transfer completes

2. **Network Test:**
   - Run server on one machine
   - Access from another device on same network
   - Test with different file sizes

3. **Password Test:**
   - Enable password protection
   - Verify receiver must enter correct password
   - Test wrong password rejection

---

## 🐳 Docker Development

### Building Custom Image

```bash
# Build image
docker build -t airshare:dev .

# Run with custom config
docker run -d \
  -p 3000:3000 \
  -e APP_TITLE="Dev AirShare" \
  --name airshare-dev \
  airshare:dev

# View logs
docker logs -f airshare-dev

# Stop and remove
docker stop airshare-dev
docker rm airshare-dev
```

### Docker Compose Development

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Restart after code changes
docker-compose restart

# Stop services
docker-compose down
```

---

## 📚 Adding Features

### Example: Add File Type Filtering

**1. Update UI (index.html)**
```html
<input type="file" id="fileInput" accept=".pdf,.doc,.docx" multiple>
```

**2. Add Validation (app.js)**
```javascript
const allowedTypes = ['.pdf', '.doc', '.docx'];
const isValidType = file => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return allowedTypes.includes(ext);
};

// In handleFileSelect:
const validFiles = files.filter(isValidType);
if (validFiles.length < files.length) {
    UIManager.showError('Some files were rejected (only PDF/DOC allowed)');
}
```

### Example: Self-Host PeerJS Server

**1. Install PeerJS Server:**
```bash
npm install -g peer
```

**2. Run PeerJS Server:**
```bash
peerjs --port 9000 --key myapp --path /peerjs
```

**3. Update Configuration:**
```env
PEERJS_HOST=localhost
PEERJS_PORT=9000
PEERJS_SECURE=false
```

**4. Test Connection:**
- Restart AirShare
- Verify console shows connection to local PeerJS server

---

## 🚢 Deployment

### Environment Variables

Set these for production:

```bash
NODE_ENV=production
PORT=3000
PEERJS_HOST=your-peerjs-server.com
PEERJS_PORT=443
PEERJS_SECURE=true
```

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (required for WebRTC)
- [ ] Self-host PeerJS server (recommended)
- [ ] Configure proper firewall rules
- [ ] Set up monitoring/logging
- [ ] Test on multiple browsers
- [ ] Test on mobile devices

---

## 🐛 Debugging

### Browser Console

Check console for errors:
```javascript
// Enable verbose logging
Logger.setLogLevel('debug');

// Monitor PeerJS events
peer.on('error', console.error);
connection.on('error', console.error);
```

### Common Issues

**Connection Fails:**
- Check PeerJS server is accessible
- Verify HTTPS is enabled (required for WebRTC)
- Check browser console for errors
- Try different browser

**Slow Transfers:**
- Check network connection quality
- Increase `CHUNK_SIZE` for faster networks
- Verify no VPN or proxy interfering

**Memory Issues:**
- Reduce number of concurrent transfers
- Use smaller chunk sizes
- Close unused browser tabs

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Code Style

- Use ES6+ features
- Follow existing formatting
- Add comments for complex logic
- Keep functions small and focused
- Write descriptive variable names

### Pull Request Guidelines

- Describe what your PR does
- Include screenshots for UI changes
- Test on multiple browsers
- Update documentation if needed

---

## 📖 Additional Resources

- [PeerJS Documentation](https://peerjs.com/docs/)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

---

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/jaberio/airshare/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jaberio/airshare/discussions)
- **Email**: support@airshare.dev

---

Happy coding! 🚀
