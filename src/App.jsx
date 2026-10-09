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
  const [step, setStep] = useState(null); // sender: 'pick_files' | 'show_offer' | 'scan_answer' | 'transferring'
                                          // receiver: 'scan_offer' | 'show_answer' | 'transferring'

  const [files, setFiles] = useState([]);
  const [offerCode, setOfferCode] = useState(null);
  const [answerCode, setAnswerCode] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [currentTransfer, setCurrentTransfer] = useState(null);
  const [completedFiles, setCompletedFiles] = useState([]);
  const [isFinished, setIsFinished] = useState(false);

  const peerRef = useRef(null);
  const channelRef = useRef(null);
  const cancelTransferRef = useRef(false);
  const wakeLockRef = useRef(null);

  // Request wake lock to prevent mobile screen sleep during file transfer
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch (e) {
      console.log("WakeLock unavailable or rejected:", e);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      releaseWakeLock();
      if (channelRef.current) channelRef.current.close();
      if (peerRef.current) peerRef.current.close();
    };
  }, []);

  // Reset all state back to home
  const resetAll = () => {
    releaseWakeLock();
    if (channelRef.current) channelRef.current.close();
    if (peerRef.current) peerRef.current.close();
    peerRef.current = null;
    channelRef.current = null;
    cancelTransferRef.current = false;

    setRole(null);
    setStep(null);
    setFiles([]);
    setOfferCode(null);
    setAnswerCode(null);
    setIsConnected(false);
    setStatusMessage("");
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
    setStep("show_offer");
    setStatusMessage("Generating connection offer...");

    try {
      const peer = createPeerConnection();
      peerRef.current = peer;

      const channel = setupDataChannel(peer, "p2p-transfer", {
        onOpen: () => {
          setIsConnected(true);
          setStatusMessage("Connected to receiver!");
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
      setStatusMessage("Show this QR code to the receiver");
    } catch (err) {
      console.error("Offer generation failed:", err);
      setStatusMessage("Failed to initialize connection.");
    }
  };

  const proceedToScanAnswer = () => {
    setStep("scan_answer");
  };

  const handleAnswerScanned = async (scannedCode) => {
    try {
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
    setStep("scan_offer");
    setStatusMessage("Scan the sender's QR code to begin");
  };

  const handleOfferScanned = async (scannedCode) => {
    try {
      setStatusMessage("Preparing connection answer...");
      const offer = await decompressData(scannedCode);

      const peer = createPeerConnection();
      peerRef.current = peer;

      listenForDataChannel(peer, {
        onOpen: (channel) => {
          channelRef.current = channel;
          setIsConnected(true);
          setStep("transferring");
          setStatusMessage("Connected! Waiting for incoming files...");
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

          // Auto-trigger browser download
          const a = document.createElement("a");
          a.href = completed.url;
          a.download = completed.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      });

      const answer = await createAnswer(peer, offer);
      const compressed = await compressData(answer);
      setAnswerCode(compressed);
      setStep("show_answer");
      setStatusMessage("Show this QR code to the sender");
    } catch (err) {
      console.error("Failed to process sender offer:", err);
      alert("Invalid QR Code. Please scan the sender's code again.");
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
              <p>Transfer files between phones, tablets, and laptops over local Wi-Fi or Hotspot without using the internet.</p>
            </div>

            <div className="action-cards">
              <div className="action-card" onClick={startSenderFlow}>
                <div className="card-avatar send-avatar">📤</div>
                <h3>Send Files</h3>
                <p>Select photos, videos, or documents and connect to a receiver</p>
                <button className="btn btn-primary full-width">Send</button>
              </div>

              <div className="action-card" onClick={startReceiverFlow}>
                <div className="card-avatar receive-avatar">📥</div>
                <h3>Receive Files</h3>
                <p>Scan sender's QR code to receive files directly to this device</p>
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

        {/* Sender Views */}
        {role === "send" && step === "pick_files" && (
          <FilePicker
            files={files}
            onFilesChange={setFiles}
            isConnected={true}
            onStartTransfer={proceedToGenerateOffer}
          />
        )}

        {role === "send" && step === "show_offer" && (
          <QRDisplay
            data={offerCode}
            title="Step 1: Receiver scans this code"
            subtitle="Open the receiver device, choose 'Receive Files' and scan this code."
            onNextStep={proceedToScanAnswer}
            nextStepLabel="Next: Scan Receiver's Code →"
          />
        )}

        {role === "send" && step === "scan_answer" && (
          <QRScanner
            title="Step 2: Scan Receiver's Answer Code"
            subtitle="Point camera at the receiver's screen to finalize the direct connection."
            onScanSuccess={handleAnswerScanned}
          />
        )}

        {/* Receiver Views */}
        {role === "receive" && step === "scan_offer" && (
          <QRScanner
            title="Scan Sender's Code"
            subtitle="Point camera at the sender's screen to receive connection info."
            onScanSuccess={handleOfferScanned}
          />
        )}

        {role === "receive" && step === "show_answer" && (
          <QRDisplay
            data={answerCode}
            title="Show this code to Sender"
            subtitle="The sender device will scan this code to complete the link."
          />
        )}

        {/* Common Transfer View */}
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