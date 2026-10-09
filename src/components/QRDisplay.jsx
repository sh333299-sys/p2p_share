// src/components/QRDisplay.jsx
import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function QRDisplay({ data, title, subtitle, onNextStep, nextStepLabel }) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // Robust copy function that works on mobile HTTP without HTTPS
  const handleCopy = () => {
    if (!data) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(data).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {
        fallbackCopy(data);
      });
    } else {
      fallbackCopy(data);
    }
  };

  const fallbackCopy = (text) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        setShowRaw(true);
      }
    } catch (e) {
      setShowRaw(true);
    }
  };

  return (
    <div className="card qr-card">
      {title && <h2 className="card-title">{title}</h2>}
      {subtitle && <p className="card-subtitle">{subtitle}</p>}

      <div className="qr-container">
        {data ? (
          <div className="qr-box">
            <QRCodeSVG
              value={data}
              size={260}
              level="L"
              includeMargin={true}
              bgColor="#ffffff"
              fgColor="#111827"
            />
          </div>
        ) : (
          <div className="qr-skeleton">
            <div className="spinner"></div>
            <p>Generating offline connection code...</p>
          </div>
        )}
      </div>

      <div className="qr-actions">
        <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
          {copied ? "✓ Copied!" : "📋 Copy Code"}
        </button>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? "Hide Code" : "Show Text Code"}
        </button>

        {onNextStep && (
          <button className="btn btn-primary" onClick={onNextStep}>
            {nextStepLabel || "Next Step →"}
          </button>
        )}
      </div>

      {showRaw && data && (
        <div style={{ marginTop: "14px" }}>
          <p className="text-muted" style={{ fontSize: "12px", marginBottom: "6px" }}>
            Tap the box below, select all, and copy:
          </p>
          <textarea
            readOnly
            value={data}
            onClick={(e) => e.target.select()}
            style={{
              width: "100%",
              height: "75px",
              backgroundColor: "#111827",
              color: "#93c5fd",
              border: "1px solid #374151",
              borderRadius: "8px",
              padding: "8px",
              fontSize: "11px",
              fontFamily: "monospace",
              resize: "none"
            }}
          />
        </div>
      )}
    </div>
  );
}
