# 🚀 AirShare

Peer-to-peer file transfers in your browser. A modern, clean implementation inspired by FilePizza.




## ✨ Features

- **Peer-to-Peer**: Files are transferred directly between devices using WebRTC. We never store your files.
- **No Size Limits**: Transfer files of any size (dependent on browser capabilities).
- **Secure**: Data is encrypted in transit.
- **Easy to Use**: Just drag and drop, share the link, and download.
- **Dark Mode**: Built-in dark mode support.

## 🛠️ Installation & Usage

### Local Development

1. Navigate to the project directory:
   ```bash
   cd airshare
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and visit `http://localhost:3000`.

### 🐳 Docker

You can also run AirShare using Docker.

#### Run with Docker Compose

1. Build and start the container:
   ```bash
  sudo docker run -d -p 4111:3000 --name airshare ghcr.io/jaberqayad/airshare:latest
   ```


2. Open your browser and visit `http://localhost:4111`.

## 🏗️ Technologies

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES Modules)
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.io (Signaling), WebRTC (Data Transfer)

## 📝 License

[MIT](LICENSE)
