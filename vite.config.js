import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function localSignalingPlugin() {
  const rooms = new Map();

  const handleMiddleware = (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    const sendJson = (data, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end(JSON.stringify(data));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.end();
      return;
    }

    if (url.pathname === "/api/room/create" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { offer } = JSON.parse(body);
          // Generate simple 4-digit classroom code (1000 - 9999)
          let code;
          do {
            code = Math.floor(1000 + Math.random() * 9000).toString();
          } while (rooms.has(code));

          rooms.set(code, { offer, answer: null, createdAt: Date.now() });
          sendJson({ code });
        } catch (e) {
          sendJson({ error: "Invalid payload" }, 400);
        }
      });
      return;
    }

    if (url.pathname.startsWith("/api/room/") && !url.pathname.endsWith("/answer") && req.method === "GET") {
      const code = url.pathname.replace("/api/room/", "").trim();
      const room = rooms.get(code);
      if (!room) {
        return sendJson({ error: "Room not found" }, 404);
      }
      return sendJson(room);
    }

    if (url.pathname.startsWith("/api/room/") && url.pathname.endsWith("/answer") && req.method === "POST") {
      const code = url.pathname.replace("/api/room/", "").replace("/answer", "").trim();
      const room = rooms.get(code);
      if (!room) {
        return sendJson({ error: "Room not found" }, 404);
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { answer } = JSON.parse(body);
          room.answer = answer;
          sendJson({ success: true });
        } catch (e) {
          sendJson({ error: "Invalid payload" }, 400);
        }
      });
      return;
    }

    next();
  };

  return {
    name: "local-signaling",
    configureServer(server) {
      server.middlewares.use(handleMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleMiddleware);
    }
  };
}

export default defineConfig({
  plugins: [react(), localSignalingPlugin()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 5173,
  }
});