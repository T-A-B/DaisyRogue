// serve.js — static web server for DaisyBonk with correct MIME types
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;

const MIME = {
    ".html": "text/html; charset=UTF-8",
    ".js": "text/javascript; charset=UTF-8",
    ".mjs": "text/javascript; charset=UTF-8",
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

http
    .createServer((req, res) => {
        // default to index.html
        let reqPath = req.url.split("?")[0];
        let filePath = path.join(root, reqPath === "/" ? "index.html" : reqPath);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("404 Not Found: " + reqPath);
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            const type = MIME[ext] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": type });
            res.end(data);
        });
    })
    .listen(8080, () => console.log("✅ Server running at http://localhost:8080"));
