import { useState } from "react";

export default function App() {
  const [role, setRole] = useState(null); // 'send' | 'receive' | null

  return (
    <div className="app">
      <header>
        <h1>P2P Share</h1>
        <p className="muted">Direct device-to-device file transfer. No internet required.</p>
      </header>
    
      {!role && (
        <div className="role-picker">
          <button onClick={() => setRole("send")}>Send a file</button>
          <button onClick={() => setRole("receive")}>Receive a file</button>
        </div>
      )}

      {role === "send" && <p>Send panel goes here (we'll build this soon).</p>}
      {role === "receive" && <p>Receive panel goes here (we'll build this soon).</p>}

      {role && (
        <button className="back-link" onClick={() => setRole(null)}>
          ← Back
        </button>
      )}
    </div>
  );
}