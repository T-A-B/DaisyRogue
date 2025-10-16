// server.js — zero-dependency WebSocket server with rooms (no npm)
import http from "http";
import crypto from "crypto";
import os from "os";

const server = http.createServer();

// rooms: roomId -> { clients: Map<id,{socket,buffer}>, players: Map<id,{id,x,z,color}> }
const rooms = new Map();

server.on("upgrade", (req, socket) => {
    if (req.headers.upgrade?.toLowerCase() !== "websocket") {
        socket.destroy();
        return;
    }
    const key = req.headers["sec-websocket-key"];
    if (!key) return socket.destroy();

    // Parse room from query (?room=alpha) or default to "lobby"
    const url = new URL(req.url, "http://localhost");
    const roomId = (url.searchParams.get("room") || "lobby").slice(0, 64);

    // Handshake
    const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    socket.write([
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "\r\n",
    ].join("\r\n"));

    const id = crypto.randomUUID();
    const room = ensureRoom(roomId);
    const player = { id, x: 0, z: 0, color: `hsl(${Math.random()*360},70%,60%)` };

    room.players.set(id, player);
    room.clients.set(id, { socket, buffer: Buffer.alloc(0) });

    // Welcome with current room players
    wsSend(socket, { type: "welcome", id, players: Array.from(room.players.values()), room: roomId });

    // Notify room peers
    broadcastExcept(room, id, { type: "join", player });

    socket.on("data", (chunk) => handleData(roomId, id, chunk));
    socket.on("end",  () => closeClient(roomId, id));
    socket.on("close",() => closeClient(roomId, id));
    socket.on("error",() => closeClient(roomId, id));

    logRooms(`join ${id} -> ${roomId}`);
});

function ensureRoom(roomId){
    if (!rooms.has(roomId)) rooms.set(roomId, { clients: new Map(), players: new Map() });
    return rooms.get(roomId);
}

function handleData(roomId, id, chunk) {
    const room = rooms.get(roomId); if (!room) return;
    const c = room.clients.get(id); if (!c) return;
    c.buffer = Buffer.concat([c.buffer, chunk]);

    while (true) {
        const buf = c.buffer;
        if (buf.length < 2) return;

        const fin = (buf[0] & 0x80) !== 0;
        const opcode = buf[0] & 0x0f; // 1=text, 8=close
        const masked = (buf[1] & 0x80) !== 0;
        let payloadLen = buf[1] & 0x7f;
        let offset = 2;

        if (!fin || !masked) { closeClient(roomId, id); return; }

        if (payloadLen === 126) {
            if (buf.length < offset + 2) return;
            payloadLen = buf.readUInt16BE(offset); offset += 2;
        } else if (payloadLen === 127) {
            if (buf.length < offset + 8) return;
            const high = Number(buf.readUInt32BE(offset));
            const low  = Number(buf.readUInt32BE(offset + 4));
            payloadLen = high * 2 ** 32 + low; offset += 8;
        }

        if (buf.length < offset + 4 + payloadLen) return;
        const mask = buf.slice(offset, offset + 4); offset += 4;
        const payload = buf.slice(offset, offset + payloadLen);
        c.buffer = buf.slice(offset + payloadLen);

        if (opcode === 0x8) { closeClient(roomId, id); return; } // close
        if (opcode !== 0x1) continue; // ignore non-text

        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        const text = payload.toString("utf8");
        try {
            onMessage(roomId, id, JSON.parse(text));
        } catch { /* ignore */ }
    }
}

function onMessage(roomId, id, msg){
    const room = rooms.get(roomId); if (!room) return;

    if (msg.type === "move") {
        const p = room.players.get(id);
        if (!p) return;
        p.x = Number(msg.x) || 0;
        p.z = Number(msg.z) || 0;
        broadcastExcept(room, id, { type: "move", id, x: p.x, z: p.z });
    }
}

function wsSend(socket, obj){
    const data = Buffer.from(JSON.stringify(obj));
    let header;
    if (data.length < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; header[1] = data.length;
    } else if (data.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81; header[1] = 126; header.writeUInt16BE(data.length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    socket.write(Buffer.concat([header, data]));
}

function broadcastExcept(room, exceptId, obj){
    for (const [id, { socket }] of room.clients) {
        if (id === exceptId) continue;
        wsSend(socket, obj);
    }
}

function closeClient(roomId, id){
    const room = rooms.get(roomId); if (!room) return;
    const c = room.clients.get(id);
    try { c?.socket?.destroy(); } catch {}
    room.clients.delete(id);
    room.players.delete(id);
    broadcastExcept(room, id, { type: "leave", id });

    // cleanup empty rooms to be tidy
    if (room.clients.size === 0) rooms.delete(roomId);
    logRooms(`leave ${id} <- ${roomId}`);
}

function logRooms(prefix=''){
    const summary = [...rooms.entries()].map(([rid, r]) => `${rid}(${r.clients.size})`).join(", ");
    console.log(`[rooms] ${prefix} :: ${summary || '∅'}`);
}

const PORT = 8081;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ WS server on ws://0.0.0.0:${PORT}`);
    const ip = Object.values(os.networkInterfaces())
        .flat().find(n=>n && n.family==='IPv4' && !n.internal)?.address || 'localhost';
    console.log(`   Open http://${ip}:8080/?room=alpha  (and beta, etc.)`);
});
