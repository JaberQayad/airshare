// Simple CRC32 implementation for chunk integrity checking
// Not cryptographically secure, but good for detecting transmission errors

const CRC32_TABLE = new Uint32Array(256);

// Build CRC32 lookup table
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  CRC32_TABLE[i] = crc >>> 0;
}

export function calculateCRC32(buffer) {
  let crc = 0 ^ (-1);
  const bytes = new Uint8Array(buffer);
  
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  
  return (crc ^ (-1)) >>> 0; // Return as unsigned 32-bit int
}

export function crc32ToHex(crc32) {
  return crc32.toString(16).padStart(8, '0');
}
