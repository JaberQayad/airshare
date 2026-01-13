# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in AirShare, please report it by:

1. **Email**: Send details to the repository maintainer (create a private security advisory on GitHub)
2. **Do NOT** open a public issue for security vulnerabilities
3. Include: Description, steps to reproduce, potential impact, and suggested fix (if any)

We aim to respond within 48 hours and provide a fix within 7 days for critical issues.

---

## Security Measures

AirShare implements multiple layers of security to protect users and deployments:

### 1. **Network Security**

#### CORS (Cross-Origin Resource Sharing)
- Same-origin only by default (most secure)
- Configurable via `CORS_ORIGINS` environment variable
- Blocks unauthorized cross-origin requests

#### Content Security Policy (CSP)
- Strict CSP headers via Helmet.js
- Blocks inline scripts (except necessary ones)
- Prevents XSS and code injection attacks
- WebSocket connections only to self or wss://

### 2. **WebRTC P2P Security**

#### PeerJS Connection
- Direct peer-to-peer connections via PeerJS library
- Uses cloud signaling server (0.peerjs.com) by default
- Self-hosting PeerJS server recommended for production
- Peer ID validation and connection management

#### Data Transfer
- Peer-to-peer only (server never stores files)
- Client-side encryption with AES-256-GCM before transfer
- Password protection for shared links (optional)
- Per-chunk encryption for large files
- Chunk size: 16KB (configurable via CHUNK_SIZE)

#### Multiple File Support
- Transfer multiple files simultaneously
- Individual progress tracking per file
- Pause/resume/cancel controls
- Real-time speed and ETA display

### 3. **Input Validation & Sanitization**

#### Configuration Validation
- Port: 1-65535
- Chunk size: Configurable (default 16KB)
- Max file size: Configurable (default 100GB)

#### String Sanitization
- `APP_TITLE`: Max 100 characters, sanitized
- `THEME_COLOR`: Must match hex color regex (#RRGGBB)
- URLs: Max 500 characters, sanitized
- Peer IDs: Generated and validated by PeerJS

#### XSS Prevention
- `textContent` used instead of `innerHTML` for user-controlled values
- CSP blocks inline script execution
- All configuration values sanitized before exposure to client

### 4. **Server Hardening**

#### Docker Security
- Non-root user (nodejs:1001) in container
- Minimal base image (Alpine Linux)
- No unnecessary packages or tools
- Clean npm cache after install

#### HTTP Security Headers
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1` - Browser XSS filter enabled
- `Strict-Transport-Security` - Forces HTTPS in production
- `Referrer-Policy` - Controls referrer information

#### Configuration Endpoint Security
- Environment variables control application behavior
- Server exposes minimal configuration to client
- Sensitive values never exposed:
  - Server port
  - Internal settings
  - PeerJS credentials (if self-hosted)

### 5. **Dependency Security**

#### Production Dependencies
- `express` - Minimal, well-maintained web server
- `helmet` - Security headers middleware
- `cors` - CORS handling
- `dotenv` - Environment variable loading

#### Security Practices
- Regular dependency updates
- No unnecessary dependencies
- `npm audit` checks before releases
- Lock file (`package-lock.json`) committed

### 6. **Logging & Monitoring**

#### Structured Logging
- Server startup and configuration logged
- Request logging with standard middleware
- Client-side logging for debugging (configurable)

#### No Sensitive Data Logging
- File contents never logged
- No user tracking or analytics (Umami removed)
- Encryption keys never logged

---

## Security Best Practices for Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (required for WebRTC)
- [ ] Self-host PeerJS server (recommended for production)
- [ ] Set restrictive `CORS_ORIGINS` or leave default
- [ ] Use strong firewall rules
- [ ] Keep dependencies updated (`npm audit`, `npm update`)
- [ ] Monitor logs for errors
- [ ] Set reasonable `MAX_FILE_SIZE` limit
- [ ] Configure `CHUNK_SIZE` for your network conditions

### Reverse Proxy Configuration

When using Nginx for HTTPS termination:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

### Environment Variable Security

Never commit `.env` files with real values to version control:

```bash
# .gitignore already includes:
.env
.env.*
```

Use secrets management in production:
- Docker Secrets
- Kubernetes Secrets
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault

---

## Known Limitations

1. **Cloud PeerJS Server**: Default configuration uses free cloud PeerJS server (0.peerjs.com). For production, self-host PeerJS server for better reliability and control.

2. **Browser-based**: Security depends on browser WebRTC and Web Crypto API implementation. Keep browsers updated.

3. **No Built-in Authentication**: AirShare uses optional password protection but has no user accounts. Anyone with the peer link can attempt to connect.

4. **Client-side Encryption**: Encryption happens in the browser. While AES-256-GCM is strong, it depends on proper browser implementation.

5. **File Validation**: Server never sees file contents (P2P transfer). Receivers should scan files with antivirus before opening.

6. **NAT Traversal**: WebRTC may fail through restrictive firewalls. Consider TURN server for corporate environments.

---

## Security Updates

We take security seriously. When security issues are discovered:

1. A fix is developed and tested
2. A security advisory is published (if applicable)
3. A new version is released with the fix
4. Documentation is updated

**Stay Updated**: Watch this repository for security announcements or enable GitHub security alerts.

---

## Compliance

### GDPR Considerations
- No personal data stored on server
- P2P transfers mean files never touch server storage
- IP addresses used for rate limiting (legitimate interest)
- Users control data sharing (sender must approve receiver)

### Data Retention
- No persistent data storage (stateless server)
- PeerJS handles connection state (ephemeral)
- Logs: Standard HTTP access logs only
- No file content or metadata stored

---

## Contact

For security concerns: Create a private security advisory on GitHub or contact the repository maintainer.

For general questions: Open a public issue on GitHub.

**Last Updated**: January 13, 2026
