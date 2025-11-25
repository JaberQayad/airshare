const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const socketHandler = require('./socket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"], // Allow cdnjs
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // Allow Google Fonts
            fontSrc: ["'self'", "https://fonts.gstatic.com"], // Allow Google Fonts
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket connections
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));
app.use(cors());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Config endpoint
app.get('/config', (req, res) => {
    res.json(config);
});

// Initialize Socket.io
socketHandler(io);

// Start server
server.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}`);
});
