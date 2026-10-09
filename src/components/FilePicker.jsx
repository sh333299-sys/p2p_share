// src/components/FilePicker.jsx
import React, { useRef, useState } from "react";

export function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function FilePicker({ files, onFilesChange, onStartTransfer, isConnected }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      onFilesChange([...files, ...newFiles]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      onFilesChange([...files, ...newFiles]);
    }
  };

  const removeFile = (index) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="card file-picker-card">
      <h2 className="card-title">Select Files to Send</h2>
      <p className="card-subtitle">Choose one or more files to share offline at maximum speed</p>

      <div
        className={`dropzone ${isDragging ? "dropzone-active" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
      >
        <div className="dropzone-icon">📁</div>
        <p className="dropzone-text">
          <strong>Click to browse</strong> or drag & drop files here
        </p>
        <span className="dropzone-sub">Any file type (Video, Music, Documents, Apps)</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden-file-input"
          onChange={handleFileInput}
        />
      </div>

      {files.length > 0 && (
        <div className="file-list-container">
          <div className="file-list-header">
            <span>Selected Files ({files.length})</span>
            <span className="text-muted">{formatBytes(totalSize)}</span>
          </div>

          <ul className="file-list">
            {files.map((file, idx) => (
              <li key={`${file.name}-${idx}`} className="file-item">
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatBytes(file.size)}</span>
                </div>
                <button
                  className="btn-icon remove-file-btn"
                  title="Remove file"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(idx);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="file-actions">
            <button
              className="btn btn-primary btn-lg full-width"
              disabled={!isConnected}
              onClick={onStartTransfer}
            >
              {isConnected ? `🚀 Send ${files.length} File(s)` : "Waiting for connection..."}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
