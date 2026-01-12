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

#### Rate Limiting
- **HTTP endpoints**: 100 requests per 15 minutes per IP
- **WebSocket events**: 10 events per second per connection
- Automatic IP detection with proper proxy support via `TRUSTED_DOMAINS`
- Development environments (localhost) skip rate limiting

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

#### Room Management
- Maximum 2 peers per room (1 sender + 1 receiver)
- Room ID validation (alphanumeric, 1-64 characters)
- Room TTL of 30 minutes (auto-cleanup)
- Pending join request system with sender approval

#### Signaling Validation
- Payload size limits (64KB default, configurable)
- Room membership verification before relaying signals
- Input validation for all WebSocket events
- Rate limiting on signaling events

#### Data Transfer
- Peer-to-peer only (server never stores files)
- End-to-end encryption in transit (WebRTC native)
- CRC32 integrity validation
- Chunk size bounds enforcement (1KB - 10MB)

### 3. **Input Validation & Sanitization**

#### Configuration Validation
- All numeric config values validated with min/max bounds
- Port: 1-65535
- Chunk sizes: 1KB - 10MB
- Buffer sizes: 1KB - 100MB
- Room TTL: 1 minute - 24 hours
- Max peers: 2-10

#### String Sanitization
- `APP_TITLE`: Max 100 characters, sanitized
- `THEME_COLOR`: Must match hex color regex (#RRGGBB)
- URLs: Max 500 characters, sanitized
- Room IDs: Alphanumeric with dashes/underscores only

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
- `/config` endpoint filters sensitive server-side config
- Only exposes client-safe values:
  - ICE servers
  - Chunk/buffer sizes
  - UI branding (sanitized)
- Hides internal settings:
  - `trustProxy`
  - `corsOrigins`
  - `port`
  - Internal thresholds

### 5. **Dependency Security**

#### Production Dependencies
- `express` - Minimal, well-maintained
- `socket.io` - Latest stable version
- `helmet` - Security headers middleware
- `cors` - CORS handling
- `express-rate-limit` - Rate limiting
- `dotenv` - Environment variable loading

#### Security Practices
- Regular dependency updates
- No unnecessary dependencies
- `npm audit` checks before releases
- Lock file (`package-lock.json`) committed

### 6. **Logging & Monitoring**

#### Structured Logging
- All security events logged (rate limits, invalid inputs)
- Socket connection/disconnection tracking
- Room lifecycle tracking
- Signal relay logging with payload size

#### No Sensitive Data Logging
- File contents never logged
- User IP addresses truncated/hashed in production
- Authentication tokens (if added) never logged

---

## Security Best Practices for Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (reverse proxy with SSL certificate)
- [ ] Configure `TRUSTED_DOMAINS` if behind reverse proxy
- [ ] Set restrictive `CORS_ORIGINS` or leave unset
- [ ] Use strong firewall rules
- [ ] Keep dependencies updated (`npm audit`, `npm update`)
- [ ] Monitor logs for suspicious activity
- [ ] Set reasonable `MAX_FILE_SIZE` limit
- [ ] Configure rate limiting thresholds for your use case

### Reverse Proxy Configuration

When using Nginx/Apache/Cloudflare:

```env
TRUSTED_DOMAINS=1  # Trust first proxy
# or
TRUSTED_DOMAINS=example.com  # Trust specific domain
```

#### Nginx Example
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

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

1. **Public TURN Servers**: Default configuration uses public TURN servers which have limited reliability. For production, use your own TURN server.

2. **Browser-based**: Security depends on browser WebRTC implementation. Keep browsers updated.

3. **No Authentication**: AirShare has no built-in user authentication. Anyone with a room link can connect (by design for simplicity).

4. **Rate Limiting Bypass**: Determined attackers can bypass IP-based rate limiting with proxies/VPNs. For high-security deployments, add additional authentication layers.

5. **File Validation**: Server never sees file contents (P2P transfer). Receivers should scan files with antivirus before opening.

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
- Room data: Auto-deleted after TTL (default 30 minutes)
- Logs: Configure retention based on your policies
- No file content or metadata stored

---

## Contact

For security concerns: Create a private security advisory on GitHub or contact the repository maintainer.

For general questions: Open a public issue on GitHub.

**Last Updated**: January 12, 2026
