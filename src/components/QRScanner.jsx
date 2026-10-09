// src/components/QRScanner.jsx
import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function QRScanner({ onScanSuccess, title, subtitle }) {
  const [activeTab, setActiveTab] = useState("camera"); // 'camera' | 'paste'
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState(null);
  const scannerRef = useRef(null);
  const isStartedRef = useRef(false);

  useEffect(() => {
    if (activeTab !== "camera") return;

    let mounted = true;
    const elementId = "qr-reader-box";
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = ""; // Clear existing video/canvases to prevent duplicate camera views
    }

    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (mounted) {
            mounted = false;
            if (isStartedRef.current) {
              isStartedRef.current = false;
              scanner.stop().catch(() => {}).finally(() => {
                onScanSuccess(decodedText);
              });
            }
          }
        },
        () => {}
      )
      .then(() => {
        if (mounted) {
          isStartedRef.current = true;
        } else {
          // Component unmounted while camera was starting
          scanner.stop().catch(() => {});
        }
      })
      .catch((err) => {
        console.warn("Camera start failed:", err);
        if (mounted) {
          setCameraError("Camera unavailable or permission denied. Please paste the code below.");
          setActiveTab("paste");
        }
      });

    return () => {
      mounted = false;
      if (scannerRef.current && isStartedRef.current) {
        isStartedRef.current = false;
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [activeTab, onScanSuccess]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      if (scannerRef.current && isStartedRef.current) {
        isStartedRef.current = false;
        scannerRef.current.stop().catch(() => {});
      }
      onScanSuccess(manualCode.trim());
    }
  };

  return (
    <div className="card qr-scanner-card">
      {title && <h2 className="card-title">{title}</h2>}
      {subtitle && <p className="card-subtitle">{subtitle}</p>}

      {/* Mode toggle tabs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <button
          className={`btn btn-sm ${activeTab === "camera" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("camera")}
        >
          📷 Use Camera
        </button>
        <button
          className={`btn btn-sm ${activeTab === "paste" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setActiveTab("paste")}
        >
          📋 Paste Code Directly
        </button>
      </div>

      {activeTab === "camera" && (
        <>
          <div className="scanner-container">
            <div id="qr-reader-box" className="scanner-viewbox"></div>
          </div>
          {cameraError && <div className="alert-warning">{cameraError}</div>}
        </>
      )}

      {/* Manual Paste Form */}
      <form onSubmit={handleManualSubmit} style={{ marginTop: activeTab === "camera" ? "16px" : "8px" }}>
        <label className="text-muted" style={{ fontSize: "13px" }}>
          {activeTab === "paste" ? "Paste the code copied from the other device:" : "Or paste connection code:"}
        </label>
        <div className="input-group">
          <input
            type="text"
            className="input-field"
            placeholder="Paste code here (starts with c:)..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={!manualCode.trim()}>
            Connect
          </button>
        </div>
      </form>
    </div>
  );
}
