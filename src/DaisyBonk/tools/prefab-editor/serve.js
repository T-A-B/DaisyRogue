// serve.js — static web server for DaisyBonk
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname; // directory that contains index.html, main.js, etc.
const PORT = process.env.PORT || 3000;

// MIME type map
const MIME = {
    ".html": "text/html; charset=UTF-8",
    ".js": "application/javascript; charset=UTF-8",
    ".mjs": "application/javascript; charset=UTF-8",
    ".css": "text/css; charset=UTF-8",
    ".json": "application/json; charset=UTF-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
};

// log helper
const log = (msg, color = "\x1b[36m") =>
    console.log(`${color}[serve]\x1b[0m ${msg}`);

log(`Root directory: ${root}`);

http
    .createServer((req, res) => {
        const urlPath = req.url.split("?")[0];

        // Health endpoint for DO App Platform
        if (urlPath === "/health" || urlPath === "/_health") {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("OK");
            return;
        }

        // Determine file path
        const filePath = path.join(root, urlPath === "/" ? "index.html" : urlPath);

        fs.readFile(filePath, (err, data) => {
            if (err) {
                log(`❌ 404 Not Found: ${urlPath}`);
                res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
                res.end(`404 Not Found: ${urlPath}`);
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const type = MIME[ext] || "application/octet-stream";

            res.writeHead(200, { "Content-Type": type });
            res.end(data);
            log(`✅ 200 ${urlPath} (${type})`);
        });
    })
    .listen(PORT, "0.0.0.0", () => {
        log(`Server running on http://0.0.0.0:${PORT}`);
        log("Press Ctrl+C to stop");
    });
