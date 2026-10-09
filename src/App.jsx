// src/App.jsx
import React, { useState, useRef, useEffect } from "react";
import QRDisplay from "./components/QRDisplay";
import QRScanner from "./components/QRScanner";
import FilePicker from "./components/FilePicker";
import TransferProgress from "./components/TransferProgress";
import {
  createPeerConnection,
  setupDataChannel,
  listenForDataChannel,
  createOffer,
  createAnswer,
  acceptAnswer,
  sendFile
} from "./webrtc/peerConnection";
import { compressData, decompressData } from "./utils/compression";

export default function App() {
  const [role, setRole] = useState(null); // 'send' | 'receive' | null
  const [step, setStep] = useState(null); // sender: 'pick_files' | 'show_code' | 'transferring'
                                          // receiver: 'enter_code' | 'transferring'

  const [files, setFiles] = useState([]);
  const [roomCode, setRoomCode] = useState(null);
  const [inputCode, setInputCode] = useState("");
  const [offerCode, setOfferCode] = useState(null);
  const [answerCode, setAnswerCode] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [useScanner, setUseScanner] = useState(false);

  const [currentTransfer, setCurrentTransfer] = useState(null);
  const [completedFiles, setCompletedFiles] = useState([]);
  const [isFinished, setIsFinished] = useState(false);

  const peerRef = useRef(null);
  const channelRef = useRef(null);
  const pollTimerRef = useRef(null);
  const cancelTransferRef = useRef(false);
  const wakeLockRef = useRef(null);

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch (e) {
      console.log("WakeLock unavailable:", e);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  const clearPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      releaseWakeLock();
      clearPolling();
      if (channelRef.current) channelRef.current.close();
      if (peerRef.current) peerRef.current.close();
    };
  }, []);

  const resetAll = () => {
    releaseWakeLock();
    clearPolling();
    if (channelRef.current) channelRef.current.close();
    if (peerRef.current) peerRef.current.close();
    peerRef.current = null;
    channelRef.current = null;
    cancelTransferRef.current = false;

    setRole(null);
    setStep(null);
    setFiles([]);
    setRoomCode(null);
    setInputCode("");
    setOfferCode(null);
    setAnswerCode(null);
    setIsConnected(false);
    setStatusMessage("");
    setUseScanner(false);
    setCurrentTransfer(null);
    setCompletedFiles([]);
    setIsFinished(false);
  };

  // ==================== SENDER FLOW ====================
  const startSenderFlow = () => {
    setRole("send");
    setStep("pick_files");
  };

  const proceedToGenerateOffer = async () => {
    if (files.length === 0) return;
    setStep("show_code");
    setStatusMessage("Generating 4-digit code...");

    try {
      const peer = createPeerConnection();
      peerRef.current = peer;

      const channel = setupDataChannel(peer, "p2p-transfer", {
        onOpen: () => {
          clearPolling();
          setIsConnected(true);
          setStatusMessage("Connected! Sending files...");
          requestWakeLock();
          startSendingFiles(channel);
        },
        onClose: () => {
          setIsConnected(false);
          setStatusMessage("Connection closed.");
        },
        onError: (err) => {
          console.error("Sender channel error:", err);
          setStatusMessage("Transfer error occurred.");
        }
      });
      channelRef.current = channel;

      const offer = await createOffer(peer);
      const compressed = await compressData(offer);
      setOfferCode(compressed);

      // Create classroom room via local signaling endpoint
      try {
        const res = await fetch("/api/room/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offer })
        });
        if (res.ok) {
          const data = await res.json();
          setRoomCode(data.code);
          setStatusMessage(`Pairing Code: ${data.code}`);
          startPollingForAnswer(data.code);
        }
      } catch (err) {
        console.warn("Signaling API error, fallback to QR", err);
      }
    } catch (err) {
      console.error("Offer generation failed:", err);
      setStatusMessage("Failed to initialize connection.");
    }
  };

  const startPollingForAnswer = (code) => {
    clearPolling();
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/room/${code}`);
        if (res.ok) {
          const room = await res.json();
          if (room.answer) {
            clearPolling();
            setStatusMessage("Receiver connected! Establishing link...");
            await acceptAnswer(peerRef.current, room.answer);
            setStep("transferring");
          }
        }
      } catch (e) {}
    }, 600);
  };

  const handleAnswerScanned = async (scannedCode) => {
    try {
      clearPolling();
      setStatusMessage("Connecting to receiver...");
      const answer = await decompressData(scannedCode);
      await acceptAnswer(peerRef.current, answer);
      setStep("transferring");
    } catch (err) {
      console.error("Failed to process receiver answer:", err);
      alert("Invalid QR Code. Please scan the receiver's code again.");
    }
  };

  const startSendingFiles = async (channel) => {
    setStep("transferring");
    cancelTransferRef.current = false;

    for (let i = 0; i < files.length; i++) {
      if (cancelTransferRef.current) break;
      const file = files[i];

      try {
        await sendFile(
          channel,
          file,
          (progress) => {
            setCurrentTransfer(progress);
          },
          () => cancelTransferRef.current
        );

        setCompletedFiles((prev) => [
          ...prev,
          { name: file.name, size: file.size, id: `${Date.now()}-${i}` }
        ]);
      } catch (e) {
        console.error("Error sending file:", file.name, e);
        break;
      }
    }

    setIsFinished(true);
    setStatusMessage("All files sent successfully!");
  };

  // ==================== RECEIVER FLOW ====================
  const startReceiverFlow = () => {
    setRole("receive");
    setStep("enter_code");
    setStatusMessage("Enter the 4-digit code shown on the sender's screen");
  };

  const handleConnectWithCode = async (e) => {
    e.preventDefault();
    const code = inputCode.trim();
    if (!code) return;

    try {
      setStatusMessage(`Connecting to room ${code}...`);
      const res = await fetch(`/api/room/${code}`);
      if (!res.ok) {
        throw new Error("Room code not found");
      }
      const room = await res.json();

      setupReceiverPeer(room.offer, async (answer) => {
        // Send answer back to local signaling server
        await fetch(`/api/room/${code}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer })
        });
        setStatusMessage("Connected! Waiting for sender to transfer...");
      });
    } catch (err) {
      console.error("Join room failed:", err);
      alert("Invalid or expired 4-digit code. Please verify the code on the sender screen.");
      setStatusMessage("Connection failed. Check code and retry.");
    }
  };

  const setupReceiverPeer = async (offerSdp, onAnswerReady) => {
    const peer = createPeerConnection();
    peerRef.current = peer;

    listenForDataChannel(peer, {
      onOpen: (channel) => {
        channelRef.current = channel;
        setIsConnected(true);
        setStep("transferring");
        setStatusMessage("Connected! Receiving files...");
        requestWakeLock();
      },
      onClose: () => {
        setIsConnected(false);
        setStatusMessage("Connection closed.");
      },
      onFileStart: (fileMeta) => {
        setCurrentTransfer({
          name: fileMeta.name,
          totalBytes: fileMeta.size,
          percent: 0,
          speedMBps: "0.0",
          eta: 0
        });
      },
      onProgress: (progress) => {
        setCurrentTransfer(progress);
      },
      onFileComplete: (completed) => {
        setCompletedFiles((prev) => [...prev, completed]);
        setCurrentTransfer(null);

        // Auto-download file
        const a = document.createElement("a");
        a.href = completed.url;
        a.download = completed.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });

    const answer = await createAnswer(peer, offerSdp);
    if (onAnswerReady) {
      await onAnswerReady(answer);
    }
    const compressed = await compressData(answer);
    setAnswerCode(compressed);
  };

  const handleOfferScanned = async (scannedCode) => {
    try {
      setStatusMessage("Preparing connection answer...");
      const offer = await decompressData(scannedCode);
      await setupReceiverPeer(offer);
      setStep("show_answer");
    } catch (err) {
      console.error("Failed to process sender offer:", err);
      alert("Invalid QR Code.");
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="navbar">
        <div className="brand" onClick={resetAll} role="button">
          <span className="logo-icon">⚡</span>
          <div>
            <h1 className="logo-text">P2P Share</h1>
            <p className="logo-tagline">High-speed offline file sharing</p>
          </div>
        </div>

        {role && (
          <button className="btn btn-ghost" onClick={resetAll}>
            ✕ Cancel
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="content">
        {/* Step 0: Pick Role */}
        {!role && (
          <div className="role-selector">
            <div className="welcome-banner">
              <h2>Direct Device-to-Device Sharing</h2>
              <p>Transfer files between phones, tablets, and laptops over local Wi-Fi or Hotspot without internet.</p>
            </div>

            <div className="action-cards">
              <div className="action-card" onClick={startSenderFlow}>
                <div className="card-avatar send-avatar">📤</div>
                <h3>Send Files</h3>
                <p>Select files and generate an instant 4-digit code to connect</p>
                <button className="btn btn-primary full-width">Send</button>
              </div>

              <div className="action-card" onClick={startReceiverFlow}>
                <div className="card-avatar receive-avatar">📥</div>
                <h3>Receive Files</h3>
                <p>Enter the 4-digit code from the sender to start receiving</p>
                <button className="btn btn-secondary full-width">Receive</button>
              </div>
            </div>
          </div>
        )}

        {/* Status notice */}
        {statusMessage && role && (
          <div className="status-banner">
            <span className="status-indicator"></span>
            <span>{statusMessage}</span>
          </div>
        )}

        {/* ================= SENDER VIEWS ================= */}
        {role === "send" && step === "pick_files" && (
          <FilePicker
            files={files}
            onFilesChange={setFiles}
            isConnected={true}
            onStartTransfer={proceedToGenerateOffer}
          />
        )}

        {role === "send" && step === "show_code" && (
          <div className="card text-center">
            <h2 className="card-title">Pair with Receiver</h2>
            <p className="card-subtitle">
              On the other device, click <strong>"Receive Files"</strong> and enter this code:
            </p>

            {roomCode ? (
              <div className="classroom-code-box">
                <span className="code-digit">{roomCode[0]}</span>
                <span className="code-digit">{roomCode[1]}</span>
                <span className="code-digit">{roomCode[2]}</span>
                <span className="code-digit">{roomCode[3]}</span>
              </div>
            ) : (
              <div className="spinner" style={{ margin: "20px auto" }}></div>
            )}

            <p className="text-muted" style={{ fontSize: "13px", marginTop: "12px" }}>
              Waiting for receiver to connect...
            </p>

            <div style={{ marginTop: "24px", borderTop: "1px solid #374151", paddingTop: "16px" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setUseScanner(!useScanner)}
              >
                {useScanner ? "Hide QR Code" : "Or use QR Code instead"}
              </button>

              {useScanner && (
                <div style={{ marginTop: "16px" }}>
                  <QRDisplay
                    data={offerCode}
                    title="Scan QR Code"
                    subtitle="Scan with receiver camera if supported"
                  />
                  <div style={{ marginTop: "12px" }}>
                    <QRScanner
                      title="Scan Receiver's Answer"
                      subtitle="Point camera at receiver screen"
                      onScanSuccess={handleAnswerScanned}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= RECEIVER VIEWS ================= */}
        {role === "receive" && step === "enter_code" && (
          <div className="card text-center">
            <h2 className="card-title">Enter 4-Digit Code</h2>
            <p className="card-subtitle">
              Look at the sender's screen and enter the 4-digit code:
            </p>

            <form onSubmit={handleConnectWithCode} style={{ maxWidth: "320px", margin: "20px auto 0" }}>
              <input
                type="text"
                pattern="[0-9]*"
                maxLength="4"
                className="input-field code-input"
                placeholder="• • • •"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />

              <button
                type="submit"
                className="btn btn-primary btn-lg full-width"
                style={{ marginTop: "16px" }}
                disabled={inputCode.length !== 4}
              >
                Connect & Receive 🚀
              </button>
            </form>

            <div style={{ marginTop: "24px", borderTop: "1px solid #374151", paddingTop: "16px" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setUseScanner(!useScanner)}
              >
                {useScanner ? "Hide QR Scanner" : "Or scan QR code with camera"}
              </button>

              {useScanner && (
                <div style={{ marginTop: "16px" }}>
                  <QRScanner
                    title="Scan Sender's QR Code"
                    subtitle="Point camera at sender screen"
                    onScanSuccess={handleOfferScanned}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {role === "receive" && step === "show_answer" && (
          <QRDisplay
            data={answerCode}
            title="Show this code to Sender"
            subtitle="The sender device will scan this code to complete the link."
          />
        )}

        {/* ================= TRANSFER PROGRESS ================= */}
        {step === "transferring" && (
          <TransferProgress
            mode={role === "send" ? "sender" : "receiver"}
            currentTransfer={currentTransfer}
            completedFiles={completedFiles}
            isFinished={isFinished}
            onCancel={() => {
              cancelTransferRef.current = true;
              resetAll();
            }}
          />
        )}
      </main>
    </div>
  );
}