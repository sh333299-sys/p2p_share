// src/utils/compression.js
// Compresses WebRTC SDP strings to fit easily inside scannable QR codes

export async function compressData(data) {
  try {
    const jsonStr = typeof data === "string" ? data : JSON.stringify(data);
    if (typeof CompressionStream !== "undefined") {
      const stream = new Blob([jsonStr])
        .stream()
        .pipeThrough(new CompressionStream("deflate-raw"));
      const response = new Response(stream);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return "c:" + btoa(binary);
    }
    return "r:" + encodeURIComponent(jsonStr);
  } catch (err) {
    console.error("Compression failed, using raw fallback:", err);
    return "r:" + encodeURIComponent(typeof data === "string" ? data : JSON.stringify(data));
  }
}

export async function decompressData(payload) {
  try {
    if (typeof payload !== "string") return payload;

    if (payload.startsWith("c:")) {
      const b64 = payload.slice(2);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      const response = new Response(stream);
      const text = await response.text();
      return JSON.parse(text);
    }

    if (payload.startsWith("r:")) {
      const text = decodeURIComponent(payload.slice(2));
      return JSON.parse(text);
    }

    return JSON.parse(payload);
  } catch (err) {
    console.error("Decompression failed:", err);
    throw new Error("Invalid or corrupted QR data");
  }
}
