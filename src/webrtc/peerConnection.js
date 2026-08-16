// src/webrtc/peerConnection.js

// STUN server helps discover public IP when behind NAT.
// Not strictly required for same-hotspot/LAN transfers, but safe to keep.
const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

// Creates a fresh RTCPeerConnection
export function createPeerConnection() {
  const peer = new RTCPeerConnection(config);
  return peer;
}

// SENDER SIDE: creates the data channel
export function createDataChannel(peer, label = "fileTransfer") {
  const channel = peer.createDataChannel(label);

  channel.onopen = () => console.log("Data channel is open! Ready to send files.");
  channel.onclose = () => console.log("Data channel closed.");

  return channel;
}

// SENDER SIDE: creates an offer and waits for ICE gathering to finish
// (we wait so the QR code contains the FULL connection info in one shot)
export async function createOffer(peer) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  await waitForIceGatheringComplete(peer);

  return peer.localDescription; // full SDP, ready to encode into QR
}

// RECEIVER SIDE: takes the sender's offer, creates an answer
export async function createAnswer(peer, offerSdp) {
  await peer.setRemoteDescription(offerSdp);

  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  await waitForIceGatheringComplete(peer);

  return peer.localDescription; // full SDP, ready to encode into QR
}

// SENDER SIDE: takes the receiver's answer to complete the handshake
export async function acceptAnswer(peer, answerSdp) {
  await peer.setRemoteDescription(answerSdp);
}

// Helper: waits until ICE candidate gathering is done
// (needed because we're doing QR-based signaling, not live signaling —
// so we need ALL connection info bundled before generating the QR code)
function waitForIceGatheringComplete(peer) {
  return new Promise((resolve) => {
    if (peer.iceGatheringState === "complete") {
      resolve();
    } else {
      peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === "complete") {
          resolve();
        }
      };
    }
  });
}

// Sends data through an open channel
export function sendData(channel, data) {
  if (channel.readyState === "open") {
    channel.send(data);
  } else {
    console.warn("Channel not open yet, cannot send.");
  }
}

// RECEIVER SIDE: listens for incoming data channel + incoming messages
export function listenForDataChannel(peer, onMessage) {
  peer.ondatachannel = (event) => {
    const channel = event.channel;
    channel.onopen = () => console.log("Data channel is open on receiver side!");
    channel.onmessage = (msg) => onMessage(msg.data);
  };
}