const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const config = require('./config');
const socketHandler = require('./socket');
const logger = require('./logger');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    transports: ['websocket', 'polling'],
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10),
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || '60000', 10)
});

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));
app.use(cors());

// Trust Proxy Configuration
// This enables correct client IP detection when running behind a reverse proxy (nginx, Apache, etc.)
app.set('trust proxy', config.trustProxy);

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Use the library's ipKeyGenerator for proper IPv6 handling
        return ipKeyGenerator(req);
    },
    skip: (req) => {
        // Skip rate limiting for local requests in development
        return req.ip === '::1' || req.ip === '127.0.0.1';
    }
});
app.use(limiter);

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check (also used by client keep-alive)
app.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).send('ok');
});

app.head('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).end();
});

// Config endpoint
app.get('/config', (req, res) => {
    res.json(config);
});

// Initialize Socket.io
socketHandler(io);

// Start server
server.listen(config.port, () => {
    logger.info(`Server is running on http://localhost:${config.port}`);
});
