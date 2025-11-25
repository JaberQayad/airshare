const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const config = require('./config');
const socketHandler = require('./socket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

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
