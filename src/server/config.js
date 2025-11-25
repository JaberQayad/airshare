require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 2147483648, // Default 2GB
    iceServers: JSON.parse(process.env.ICE_SERVERS || '[{"urls":"stun:stun.l.google.com:19302"}]'),
    appTitle: process.env.APP_TITLE || 'AirShare',
    themeColor: process.env.THEME_COLOR || '#6366f1',
    donateUrl: process.env.DONATE_URL,
    termsUrl: process.env.TERMS_URL
};

module.exports = config;
