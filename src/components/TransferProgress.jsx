// src/components/TransferProgress.jsx
import React from "react";
import { formatBytes } from "./FilePicker";

export default function TransferProgress({
  mode, // 'sender' | 'receiver'
  currentTransfer,
  completedFiles,
  onCancel,
  isFinished
}) {
  return (
    <div className="card transfer-card">
      <div className="transfer-header">
        <h2 className="card-title">
          {isFinished ? "🎉 Transfer Complete!" : mode === "sender" ? "📤 Sending Files" : "📥 Receiving Files"}
        </h2>
        <span className={`status-badge ${isFinished ? "status-done" : "status-active"}`}>
          {isFinished ? "Done" : "In Progress"}
        </span>
      </div>

      {currentTransfer && !isFinished && (
        <div className="active-transfer-section">
          <div className="transfer-file-title">
            <span className="file-name">{currentTransfer.name}</span>
            <span className="file-percent">{currentTransfer.percent}%</span>
          </div>

          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${currentTransfer.percent}%` }}
            ></div>
          </div>

          <div className="metrics-row">
            <div className="metric">
              <span className="metric-label">Transferred</span>
              <span className="metric-value">
                {formatBytes(currentTransfer.sentBytes || currentTransfer.receivedBytes || 0)} /{" "}
                {formatBytes(currentTransfer.totalBytes || 0)}
              </span>
            </div>

            <div className="metric">
              <span className="metric-label">Speed</span>
              <span className="metric-value highlight">
                {currentTransfer.speedMBps || "0.0"} MB/s
              </span>
            </div>

            <div className="metric">
              <span className="metric-label">Time Left</span>
              <span className="metric-value">
                {currentTransfer.eta > 0 ? `${currentTransfer.eta}s` : "--"}
              </span>
            </div>
          </div>
        </div>
      )}

      {completedFiles && completedFiles.length > 0 && (
        <div className="completed-section">
          <h3 className="section-title">Completed Files ({completedFiles.length})</h3>
          <ul className="completed-list">
            {completedFiles.map((file, idx) => (
              <li key={`${file.id || file.name}-${idx}`} className="completed-item">
                <div className="completed-info">
                  <span className="file-icon">✓</span>
                  <div>
                    <div className="file-name">{file.name}</div>
                    <div className="file-size text-muted">{formatBytes(file.size)}</div>
                  </div>
                </div>

                {file.url && (
                  <a
                    href={file.url}
                    download={file.name}
                    className="btn btn-secondary btn-sm"
                  >
                    💾 Save File
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isFinished && onCancel && (
        <div className="transfer-actions">
          <button className="btn btn-danger btn-sm" onClick={onCancel}>
            Cancel Transfer
          </button>
        </div>
      )}
    </div>
  );
}
