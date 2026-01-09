---
sidebar_position: 1
---

# Welcome to AirShare

## What is AirShare?

AirShare is a modern, clean, and secure **peer-to-peer file transfer application** inspired by FilePizza. It enables users to transfer files directly between browsers without storing files on servers.

### Key Characteristics

- **Peer-to-Peer**: Files are transferred directly between devices using WebRTC
- **Secure**: End-to-end encryption in transit
- **No Size Limits**: Transfer files of any size (limited only by your browser)
- **Simple**: Drag and drop interface with link sharing
- **Docker Ready**: Optimized for containerized deployments
- **Dark Mode**: Premium UI with native dark mode support

## How It Works

1. **Sender** uploads files through the web interface
2. **Receiver** receives a unique link to share
3. **Direct Transfer** - Files transfer directly peer-to-peer using WebRTC
4. **No Server Storage** - We never store your files

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES Modules)
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.io (Signaling), WebRTC (Data Transfer)
- **Security**: Helmet, CORS, Rate Limiting
- **Deployment**: Docker, GitHub Actions, GHCR.io

## Features

- 🛡️ **Peer-to-Peer** - Direct browser-to-browser transfers
- ♾️ **No Size Limits** - Transfer files of any size
- 🔒 **Secure** - End-to-end encryption
- ⚡ **Fast & Simple** - Drag and drop interface
- 🌙 **Dark Mode** - Premium dark mode support
- 🐳 **Docker Ready** - Production-ready containers
- 📊 **Rate Limiting** - Built-in protection against abuse
- 🌐 **Reverse Proxy Support** - Works behind nginx, Apache, etc.

## Getting Started

Ready to get started? Check out the [Installation Guide](./installation) to set up AirShare on your system.
