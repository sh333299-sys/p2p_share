// src/components/QRDisplay.jsx
import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function QRDisplay({ data, title, subtitle, onNextStep, nextStepLabel }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          {copied ? "✓ Copied to Clipboard" : "📋 Copy Code"}
        </button>

        {onNextStep && (
          <button className="btn btn-primary" onClick={onNextStep}>
            {nextStepLabel || "Next Step →"}
          </button>
        )}
      </div>
    </div>
  );
}
