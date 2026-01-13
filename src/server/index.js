const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'AirShare is running' });
});

// Serve main page
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`⚡ AirShare running at http://localhost:${PORT}`);
    console.log(`📡 Using cloud PeerJS server (0.peerjs.com)`);
    console.log(`🚀 PeerJS-based peer-to-peer file sharing`);
    console.log(`✨ Features: Multiple files, Encryption, Pause/Resume`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});

module.exports = app;
