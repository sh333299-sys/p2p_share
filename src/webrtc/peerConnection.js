// src/webrtc/peerConnection.js
// Handles WebRTC PeerConnection, DataChannel, backpressure streaming, and file reconstruction

const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk (optimal for RTCDataChannel)
const BUFFER_THRESHOLD = 1024 * 1024; // 1 MB backpressure threshold

const rtcConfig = {
  // Empty iceServers prevents hanging on Google STUN when offline on a mobile hotspot
  iceServers: []
};

export function createPeerConnection() {
  const peer = new RTCPeerConnection(rtcConfig);
  return peer;
}

// SENDER: Creates data channel with binaryType 'arraybuffer'
export function setupDataChannel(peer, label = "p2p-transfer", callbacks = {}) {
  const channel = peer.createDataChannel(label, {
    ordered: true
  });
  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    console.log("DataChannel open on sender");
    if (callbacks.onOpen) callbacks.onOpen(channel);
  };

  channel.onclose = () => {
    console.log("DataChannel closed on sender");
    if (callbacks.onClose) callbacks.onClose();
  };

  channel.onerror = (err) => {
    console.error("DataChannel error:", err);
    if (callbacks.onError) callbacks.onError(err);
  };

  return channel;
}

// RECEIVER: Listens for incoming data channel
export function listenForDataChannel(peer, callbacks = {}) {
  peer.ondatachannel = (event) => {
    const channel = event.channel;
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      console.log("DataChannel open on receiver");
      if (callbacks.onOpen) callbacks.onOpen(channel);
    };

    channel.onclose = () => {
      console.log("DataChannel closed on receiver");
      if (callbacks.onClose) callbacks.onClose();
    };

    channel.onerror = (err) => {
      console.error("DataChannel error on receiver:", err);
      if (callbacks.onError) callbacks.onError(err);
    };

    let activeFile = null;
    let lastTime = Date.now();
    let lastBytes = 0;

    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "FILE_START") {
            activeFile = {
              id: msg.id,
              name: msg.name,
              size: msg.size,
              mimeType: msg.mimeType || "application/octet-stream",
              totalChunks: msg.totalChunks,
              chunks: [],
              receivedBytes: 0,
              startTime: Date.now()
            };
            lastTime = Date.now();
            lastBytes = 0;
            if (callbacks.onFileStart) callbacks.onFileStart(activeFile);
          } else if (msg.type === "FILE_END" && activeFile) {
            // File completed
            const blob = new Blob(activeFile.chunks, { type: activeFile.mimeType });
            const fileResult = {
              id: activeFile.id,
              name: activeFile.name,
              size: activeFile.size,
              blob: blob,
              url: URL.createObjectURL(blob)
            };
            if (callbacks.onFileComplete) callbacks.onFileComplete(fileResult);
            activeFile = null;
          }
        } catch (e) {
          console.error("Error parsing control message:", e);
        }
      } else if (event.data instanceof ArrayBuffer && activeFile) {
        // Binary chunk received
        activeFile.chunks.push(event.data);
        activeFile.receivedBytes += event.data.byteLength;

        const now = Date.now();
        const deltaSec = (now - lastTime) / 1000;
        let speedMBps = 0;
        if (deltaSec >= 0.5) {
          speedMBps = ((activeFile.receivedBytes - lastBytes) / (1024 * 1024)) / deltaSec;
          lastTime = now;
          lastBytes = activeFile.receivedBytes;
        }

        const percent = Math.min(100, Math.round((activeFile.receivedBytes / activeFile.size) * 100));
        const remainingBytes = Math.max(0, activeFile.size - activeFile.receivedBytes);
        const eta = speedMBps > 0 ? Math.round(remainingBytes / (speedMBps * 1024 * 1024)) : 0;

        if (callbacks.onProgress) {
          callbacks.onProgress({
            id: activeFile.id,
            name: activeFile.name,
            receivedBytes: activeFile.receivedBytes,
            totalBytes: activeFile.size,
            percent,
            speedMBps: speedMBps.toFixed(1),
            eta
          });
        }
      }
    };
  };
}

// SENDER: Creates offer & waits for ICE candidates (fast local gathering)
export async function createOffer(peer) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGathering(peer, 600);
  return peer.localDescription;
}

// RECEIVER: Sets offer, creates answer & waits for ICE candidates
export async function createAnswer(peer, offerSdp) {
  await peer.setRemoteDescription(offerSdp);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await waitForIceGathering(peer, 600);
  return peer.localDescription;
}

// SENDER: Accepts answer from receiver
export async function acceptAnswer(peer, answerSdp) {
  await peer.setRemoteDescription(answerSdp);
}

// Helper: Waits for ICE gathering with timeout so offline Wi-Fi doesn't hang
function waitForIceGathering(peer, timeoutMs = 600) {
  return new Promise((resolve) => {
    if (peer.iceGatheringState === "complete") {
      return resolve();
    }

    let timer = null;
    const checkState = () => {
      if (peer.iceGatheringState === "complete") {
        if (timer) clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", checkState);
        resolve();
      }
    };

    peer.addEventListener("icegatheringstatechange", checkState);

    timer = setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", checkState);
      resolve();
    }, timeoutMs);
  });
}

// SENDER: High-speed file streamer with backpressure management
export async function sendFile(channel, file, onProgress, isCancelled = () => false) {
  if (channel.readyState !== "open") {
    throw new Error("Data channel is not open");
  }

  const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // 1. Send metadata header
  const meta = {
    type: "FILE_START",
    id: fileId,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    totalChunks,
    chunkSize: CHUNK_SIZE
  };
  channel.send(JSON.stringify(meta));

  channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD;

  let offset = 0;
  let sentBytes = 0;
  let lastTime = Date.now();
  let lastBytes = 0;

  // 2. Stream chunks with backpressure
  while (offset < file.size) {
    if (isCancelled()) {
      throw new Error("Transfer cancelled by user");
    }

    // Wait if internal buffer is too full to avoid browser crash
    if (channel.bufferedAmount > BUFFER_THRESHOLD) {
      await new Promise((resolve) => {
        const handler = () => {
          channel.removeEventListener("bufferedamountlow", handler);
          resolve();
        };
        channel.addEventListener("bufferedamountlow", handler);
      });
    }

    const chunkBlob = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await chunkBlob.arrayBuffer();
    channel.send(buffer);

    offset += CHUNK_SIZE;
    sentBytes = Math.min(file.size, offset);

    const now = Date.now();
    const deltaSec = (now - lastTime) / 1000;
    let speedMBps = 0;
    if (deltaSec >= 0.5) {
      speedMBps = ((sentBytes - lastBytes) / (1024 * 1024)) / deltaSec;
      lastTime = now;
      lastBytes = sentBytes;
    }

    const percent = Math.min(100, Math.round((sentBytes / file.size) * 100));
    const remainingBytes = Math.max(0, file.size - sentBytes);
    const eta = speedMBps > 0 ? Math.round(remainingBytes / (speedMBps * 1024 * 1024)) : 0;

    if (onProgress) {
      onProgress({
        id: fileId,
        name: file.name,
        sentBytes,
        totalBytes: file.size,
        percent,
        speedMBps: speedMBps.toFixed(1),
        eta
      });
    }
  }

  // 3. Send finish packet
  channel.send(JSON.stringify({ type: "FILE_END", id: fileId }));
}