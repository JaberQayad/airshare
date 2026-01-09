---
sidebar_position: 4
---

# Development Guide

Learn how to contribute to AirShare and set up your development environment.

## Project Structure

```
airshare/
├── src/
│   ├── public/                 # Frontend files
│   │   ├── index.html         # Main HTML file
│   │   └── js/
│   │       ├── app.js         # Main application logic
│   │       ├── ui.js          # UI components
│   │       ├── utils.js       # Utility functions
│   │       └── webrtc.js      # WebRTC implementation
│   │   └── css/
│   │       └── styles.css     # Stylesheets
│   └── server/
│       ├── index.js           # Express server entry point
│       ├── socket.js          # Socket.IO handlers
│       └── config.js          # Configuration management
├── docs/                       # Docusaurus documentation
├── Dockerfile                  # Docker image definition
├── docker-compose.yml          # Multi-container setup
└── package.json                # Dependencies and scripts
```

## Development Environment Setup

### 1. Clone and Install
```bash
git clone https://github.com/jaberio/airshare.git
cd airshare
npm install
```

### 2. Install Development Dependencies
```bash
npm install --save-dev nodemon
```

### 3. Start Development Server
```bash
npm run dev
```

The application will auto-reload when you make changes.

## Key Technologies

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Modern styling with custom properties
- **Vanilla JavaScript**: No frameworks, ES Modules
- **WebRTC API**: Peer-to-peer data transfer
- **WebSocket**: Real-time signaling via Socket.IO

### Backend
- **Node.js**: JavaScript runtime
- **Express**: Web framework
- **Socket.IO**: Real-time bidirectional communication
- **Helmet**: Security headers
- **express-rate-limit**: Rate limiting middleware

## Core Features Implementation

### WebRTC Data Transfer
Located in `src/public/js/webrtc.js`:
- Establishes peer connections
- Handles data channel creation
- Manages file chunking and reassembly
- Implements progress tracking

### Real-time Signaling
Located in `src/server/socket.js`:
- Manages WebSocket connections
- Exchanges SDP offers/answers
- Shares ICE candidates
- Coordinates peer discovery

### UI Components
Located in `src/public/js/ui.js`:
- File drag-and-drop handling
- Progress visualization
- Link sharing interface
- Theme management

## Common Tasks

### Adding a New Configuration Option

1. **Update `src/server/config.js`**:
   ```javascript
   myNewOption: process.env.MY_NEW_OPTION || 'default-value'
   ```

2. **Document in `docs/docs/configuration.md`**

3. **Update Docker files** if needed

### Modifying the UI

1. Edit `src/public/css/styles.css` for styling
2. Edit `src/public/js/ui.js` for functionality
3. Test in browser: `http://localhost:3000`

### Adding Rate Limiting Rules

Edit rate limiter configuration in `src/server/index.js`:
```javascript
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Time window
    max: 100, // Max requests per window
    standardHeaders: true,
    legacyHeaders: false,
});
```

## Testing

### Manual Testing Checklist
- [ ] File upload works
- [ ] Link sharing works
- [ ] Peer connection established
- [ ] File transfer completes
- [ ] Progress shows correctly
- [ ] Dark mode toggles
- [ ] Rate limiting works
- [ ] Works behind reverse proxy (with TRUST_PROXY set)

### Browser Compatibility
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Building and Deployment

### Build Docker Image
```bash
docker build -t airshare:local .
docker run -p 3000:3000 airshare:local
```

### Run with Docker Compose
```bash
docker-compose up
```

### Push to Registry
```bash
docker tag airshare:local your-registry/airshare:v1.0.0
docker push your-registry/airshare:v1.0.0
```

## Documentation Development

Edit documentation in the `docs/docs/` directory:

```bash
cd docs
npm run start    # Start docs dev server
npm run build    # Build production docs
npm run deploy   # Deploy to GitHub Pages
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`
6. Open a Pull Request

## Performance Optimization

### Frontend Optimization
- Minimize WebRTC chunk size for slower connections
- Implement adaptive bitrate (future)
- Optimize CSS and JavaScript bundling

### Backend Optimization
- Connection pooling
- Efficient memory management
- WebSocket optimization

## Troubleshooting

### WebRTC Connection Issues
- Check ICE_SERVERS configuration
- Verify firewall settings
- Check browser console for errors

### Rate Limiting Errors
- Set TRUST_PROXY if behind reverse proxy
- Check X-Forwarded-For headers

### Docker Issues
- Rebuild image: `docker build --no-cache -t airshare .`
- Check logs: `docker logs airshare`
- Verify port binding: `docker ps`

## Additional Resources

- [WebRTC API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Express.js Guide](https://expressjs.com/)
- [Docker Documentation](https://docs.docker.com/)
