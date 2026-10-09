// src/components/QRScanner.jsx
import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function QRScanner({ onScanSuccess, title, subtitle }) {
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState(null);
  const scannerRef = useRef(null);
  const isRunningRef = useRef(false);

  useEffect(() => {
    const scannerId = "qr-reader-view";
    const html5QrCode = new Html5Qrcode(scannerId);
    scannerRef.current = html5QrCode;

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 }
    };

    html5QrCode
      .start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          if (isRunningRef.current) {
            isRunningRef.current = false;
            html5QrCode
              .stop()
              .then(() => {
                onScanSuccess(decodedText);
              })
              .catch(() => {
                onScanSuccess(decodedText);
              });
          }
        },
        () => {
          // Ignore frequent frame-not-found errors
        }
      )
      .then(() => {
        isRunningRef.current = true;
      })
      .catch((err) => {
        console.warn("Camera start failed, fallback to manual code:", err);
        setCameraError("Camera unavailable or permission denied. You can paste the code manually below.");
      });

    return () => {
      if (scannerRef.current && isRunningRef.current) {
        isRunningRef.current = false;
        scannerRef.current.stop().catch((e) => console.log("Scanner cleanup stopped:", e));
      }
    };
  }, [onScanSuccess]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      if (scannerRef.current && isRunningRef.current) {
        isRunningRef.current = false;
        scannerRef.current.stop().catch(() => {});
      }
      onScanSuccess(manualCode.trim());
    }
  };

  return (
    <div className="card qr-scanner-card">
      {title && <h2 className="card-title">{title}</h2>}
      {subtitle && <p className="card-subtitle">{subtitle}</p>}

      <div className="scanner-container">
        <div id="qr-reader-view" className="scanner-viewbox"></div>
      </div>

      {cameraError && <div className="alert-warning">{cameraError}</div>}

      <form onSubmit={handleManualSubmit} className="manual-code-form">
        <label className="text-muted">Or paste connection code:</label>
        <div className="input-group">
          <input
            type="text"
            className="input-field"
            placeholder="Paste code here..."
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
