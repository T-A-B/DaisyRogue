// server-auth.js — authoritative WebSocket game server (no npm)
// Features:
// - Keyboard movement (client sends aimX/Z; server moves using (down - up))
// - Auto-fire multi-weapon system (+ items) with server authority
// - Stage waves, portal unlock/enter, per-player reward offers
// - AoE pools, statuses, splash damage
// - One-shot FX events in snapshots (client-side visuals), tinted projectiles
// - REQUIRED: Class selection on connect (stats + passive + weapons + items)

import http from "http";
import crypto from "crypto";
import os from "os";
import { applyDropEffect } from "./server/drops.js";
import { tickEnemyAttacks } from "./server/enemy_attack.js";
import { tickStatuses } from "./server/status.js";
import { tickProjectiles } from "./server/projectiles.js";
import { tickEnemies, spawnWave } from "./server/spawn.js";
import { tickPools } from "./server/aoe.js";
import { tickWeapons, uiDescribeWeapons } from "./server/weapons.js";
import { rollRewardOptions, applyItemToPlayer } from "./server/items.js";
import { getClassDef, CLASSES } from "./server/classes.js";

const TICK_HZ = 30;
const SNAP_HZ = 20;
const DT = 1 / TICK_HZ;
const rooms = new Map();
function sanitizeName(s){
    s = String(s||"").trim().slice(0, 24);
    s = s.replace(/[\u0000-\u001F]/g, "");
    return s || "Player";
}
function ensureRoom(roomId){
    if (!rooms.has(roomId)){
        const r = {
            clients: new Map(),   // id -> { socket, buffer }
            players: new Map(),
            createdAt: Date.now(),
// id -> Player (only after class_pick)
            pendingRewards: new Map(), // playerId -> { offerId, options }
            state: {
                seq:0, time:0, stage:1,
                bossAlive:true, portalUnlocked:false,
                enemies:[], projectiles:[], drops:[],
                pools:[],
                events:[]  // one-shot FX events, cleared after each broadcast
            },
            loop:null, snapCounter:0
        };

        spawnWave(r, 6);
        r.state.runActive = true;        // 👈 run now live

        r.loop = setInterval(()=>tickRoom(r), 1000/TICK_HZ);
        rooms.set(roomId,r);
    }
    return rooms.get(roomId);
}
function roomSpawn(room){
    const n=room.players.size, ang=(n%8)*(Math.PI/4), rad=3+(n>>3)*2;
    return { x:Math.cos(ang)*rad, z:Math.sin(ang)*rad };
}

const server=http.createServer();
server.on("request", (req, res) => {
    // Respond 200 OK to any normal HTTP request so health checks pass
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
});


server.on("upgrade",(req,socket)=>{
    if((req.headers.upgrade||"").toLowerCase()!=="websocket"){socket.destroy();return;}
    const key=req.headers["sec-websocket-key"];if(!key){socket.destroy();return;}
    const url=new URL(req.url,"http://localhost");
    const roomId=(url.searchParams.get("room")||"lobby").slice(0,64);
    const GUID="258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const accept=crypto.createHash("sha1").update(key+GUID).digest("base64");

    // complete the WS handshake
    socket.write([
        "HTTP/1.1 101 Switching Protocols","Upgrade: websocket","Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,"\r\n"
    ].join("\r\n"));

    const id=crypto.randomUUID();
    const room=ensureRoom(roomId);
    room.clients.set(id,{socket,buffer:Buffer.alloc(0)});

    // Do NOT add to room.players yet — force class selection first
    wsSend(socket,{type:"welcome",id,room:roomId});
    wsSend(socket,{type:"name_required"});

    // Send the class list for the selection overlay
    const classList = Object.entries(CLASSES).map(([cid,c])=>({
        id: cid, name: c.name, desc: c.desc
    }));
    wsSend(socket,{type:"class_select", classes: classList});

    socket.on("data",c=>handleData(roomId,id,c));
    socket.on("end",()=>closeClient(roomId,id));
    socket.on("close",()=>closeClient(roomId,id));
    socket.on("error",()=>closeClient(roomId,id));
});

// --- Data handling (manual WS frames, text-only, masked from client) ---
function handleData(roomId,id,chunk){
    const room=rooms.get(roomId);if(!room)return;
    const c=room.clients.get(id);if(!c)return;
    c.buffer=Buffer.concat([c.buffer,chunk]);
    while(true){
        const buf=c.buffer;if(buf.length<2)return;
        const fin=(buf[0]&0x80)!==0,opcode=buf[0]&0x0f,masked=(buf[1]&0x80)!==0;
        let len=buf[1]&0x7f,off=2;
        if(!fin||!masked){closeClient(roomId,id);return;}
        if(len===126){if(buf.length<off+2)return;len=buf.readUInt16BE(off);off+=2;}
        else if(len===127){if(buf.length<off+8)return;const hi=buf.readUInt32BE(off),lo=buf.readUInt32BE(off+4);len=hi*2**32+lo;off+=8;}
        if(buf.length<off+4+len)return;
        const mask=buf.slice(off,off+4);off+=4;
        const payload=buf.slice(off,off+len);
        c.buffer=buf.slice(off+len);
        if(opcode===0x8){closeClient(roomId,id);return;}
        if(opcode!==0x1)continue;
        for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
        let msg;try{msg=JSON.parse(payload.toString("utf8"));}catch{continue;}
        onMessage(room,id,msg);
    }
}

function onMessage(room,id,msg){
    const c = room.clients.get(id);
    const pl = room.players.get(id); // undefined until class picked
    if (msg.type === "set_name"){
        const c = room.clients.get(id); if (!c) return;
        const name = sanitizeName(msg.name);
        c.name = name;
        const pl = room.players.get(id);
        if (pl) pl.name = name;
        // tell everyone (so name tags refresh quickly)
        broadcast(room, { type:"name_updated", id, name });
        return;
    }
    // --- Join class (required before anything else) ---
    if (msg.type === "class_pick"){
        const def = getClassDef(msg.id); // safe clone, validated
        const spawn=roomSpawn(room);
        const clientMeta = room.clients.get(id);
        const playerName = clientMeta?.name || "Player";
        const newPl = {
            id,
            name: playerName,
            x:spawn.x, z:spawn.z, y:0.6,
            // Resources/Stats (server-side authoritative baseline)
            hp: def.stats.maxHealth,
            mana: def.stats.maxMana ?? 100,
            shield: def.stats.maxShield ?? 0,
            stats: def.stats,
            passive: def.passive || null,
            items: Array.isArray(def.items) ? def.items.slice() : [],
            weapons: Array.isArray(def.weapons) ? def.weapons.slice() : [],
            // Net input
            input:{up:0,down:0,left:0,right:0,fire:0,aimX:0,aimZ:1},
            lastProcessedInputSeq:-1,
            classId: msg.id
        };
        room.players.set(id, newPl);

        // Initial HUD loadout for this player only
        if (c) wsSend(c.socket,{type:"loadout", weapons: uiDescribeWeapons(newPl.weapons)});
        // Full snapshot so they see the world
        if (c) wsSend(c.socket, snapshot(room));

        // Inform others someone joined (optional)
        broadcastExcept(room,id,{type:"join",playerId:id,cls:def.name});
        return;
    }

    // Before class pick, ignore all other messages
    if (!pl) return;

    // --- Input update ---
    if(msg.type==="input"){
        pl.input.up=msg.up|0;pl.input.down=msg.down|0;
        pl.input.left=msg.left|0;pl.input.right=msg.right|0;
        pl.input.fire=msg.fire|0;
        const n=Math.hypot(msg.aimX||0,msg.aimZ||0)||1;
        pl.input.aimX=(msg.aimX||0)/n;
        pl.input.aimZ=(msg.aimZ||1)/n;
        if(typeof msg.seq==="number")pl.lastProcessedInputSeq=msg.seq;
    }

    if (msg.type === "pickup") {
        const st = room.state;
        const drops = st.drops;
        let picked = null;
        for (let i = 0; i < drops.length; i++) {
            const d = drops[i];
            const dx = pl.x - d.x, dz = pl.z - d.z;
            if (dx*dx + dz*dz <= 1.5*1.5) {  // within 1.5m
                picked = drops.splice(i, 1)[0];
                break;
            }
        }
        if (picked) {
            const result = applyDropEffect(room, pl, picked);
            if (result) {
                // notify everyone
                broadcast(room, {
                    type: "drop_applied",
                    playerId: id,
                    dropId: picked.id,
                    effect: result
                });
                // 👇  send new player data to just this player
                const c = room.clients.get(id);
                if (c) {
                    wsSend(c.socket, {
                        type: "player_update",
                        stats: pl.stats,
                        weapons: pl.weapons
                    });
                }
            }
        }
    }

    // --- Portal enter -> stage advance + rewards ---
    if(msg.type==="portal_enter"){
        const st=room.state;
        const near = Math.hypot(pl.x, pl.z) < 2.6; // portal at (0,0)
        if (st.portalUnlocked && near){
            st.stage += 1;
            st.portalUnlocked = false;
            spawnWave(room, 6);
            broadcast(room, { type:"stage_advanced", stage: st.stage });

            // Offer rewards to each active player
            for (const pid of room.players.keys()) sendRewardOffer(room, pid);
            return;
        }
    }

    // --- Reward chosen ---
    if (msg.type === "reward_pick") {
        const entry = room.pendingRewards.get(id);
        if (!entry || entry.offerId !== msg.offerId) return;
        const choice = Math.max(0, Math.min(2, (msg.index|0)));
        const picked = entry.options[choice];
        if (!picked) return;

        const applied = applyItemToPlayer(pl, picked.id);
        room.pendingRewards.delete(id);

        if (c) wsSend(c.socket, { type:"reward_applied", item: applied });
        return;
    }
    if (msg.type === "request_restart" && room.state.allDead) {
        restartRoom(room); // the same restartRoom() you already have
    }
}

// --- Rewards helper ---
function sendRewardOffer(room, playerId){
    const c = room.clients.get(playerId); if (!c) return;
    // Only offer to players who have actually joined (picked a class)
    if (!room.players.has(playerId)) return;
    const offerId = crypto.randomUUID();
    const options = rollRewardOptions(3);
    room.pendingRewards.set(playerId, { offerId, options });
    wsSend(c.socket, { type:"reward_offer", offerId, options });
}

// --- Server tick ---
function tickRoom(room) {
    const st = room.state;
    st.seq++;
    st.time += DT;

    // ------------------------------------------------------------
    // 1. Update persistent effects (DoTs, slows, buffs)
    // ------------------------------------------------------------
    tickStatuses(room, DT);

    // ------------------------------------------------------------
    // 2. Player logic
    // ------------------------------------------------------------
    for (const pl of room.players.values()) {
        // --- Handle death / respawn ---
        if (pl.dead) {
            // pl.respawnTimer = (pl.respawnTimer ?? 0) - DT;
            // // if (pl.respawnTimer <= 0) {
            // //     // Respawn player
            // //     pl.dead = false;
            // //     pl.hp = pl.stats?.maxHealth ?? 120;
            // //     pl.mana = pl.stats?.maxMana ?? 100;
            // //     pl.shield = 0;
            // //     pl.x = 0;
            // //     pl.z = 0;
            // //     st.events.push({ type: "player_respawn", id: pl.id });
            // // }
            continue; // skip updates for dead players
        }

        // --- Movement (same math client uses) ---
        const baseSpeed = 6.0;
        const s = (pl.stats?.moveSpeed ?? baseSpeed) * (pl._speedMul ?? 1);
        const yaw = Math.atan2(pl.input.aimX, pl.input.aimZ);
        const moveX = pl.input.right - pl.input.left;
        const moveZ = pl.input.down - pl.input.up;

        const vx = moveX * Math.cos(yaw) + moveZ * Math.sin(yaw);
        const vz = moveZ * Math.cos(yaw) - moveX * Math.sin(yaw);
        pl.x = clamp(pl.x + vx * s * DT, -23, 23);
        pl.z = clamp(pl.z + vz * s * DT, -23, 23);

        // --- Basic regen ---
        if (pl.stats) {
            const maxH = pl.stats.maxHealth ?? 120;
            const maxM = pl.stats.maxMana ?? 100;
            const maxS = pl.stats.maxShield ?? 0;
            const hR = pl.stats.healthRegen ?? 0;
            const mR = pl.stats.manaRegen ?? 0;

            // Health regen only if alive and below max
            if (maxH > 0 && pl.hp < maxH) {
                pl.hp = clamp(pl.hp + hR * DT * 100, 0, maxH);
            }

            // Mana regen
            if (maxM > 0 && (pl.mana ?? 0) < maxM) {
                pl.mana = clamp((pl.mana ?? 0) + mR * DT * 100, 0, maxM);
            }

            // Shield trickle
            if (maxS > 0 && (pl.shield ?? 0) < maxS) {
                pl.shield = clamp((pl.shield ?? 0) + 2 * DT, 0, maxS);
            }
        }

        // --- Passives ---
        pl.passiveSignal = undefined;
        if (pl.passive?.type === "rage") {
            const hpPct = pl.hp / (pl.stats?.maxHealth || 1);
            if (hpPct <= 0.5)
                pl.passiveSignal = { type: "rage", power: pl.passive.power ?? 1.15 };
        } else if (pl.passive?.type === "mana_shield") {
            pl.passiveSignal = {
                type: "mana_shield",
                ratio: pl.passive.ratio ?? 0.3,
            };
        }
    }

    // ------------------------------------------------------------
    // 3. Game object updates
    // ------------------------------------------------------------
    tickEnemyAttacks(room, DT);
    tickWeapons(room, DT);
    tickProjectiles(room, DT);
    tickEnemies(room, DT);
    tickPools(room, DT);

    // ------------------------------------------------------------
    // 4. Portal unlock when room is clear
    // ------------------------------------------------------------
    if (!st.portalUnlocked && st.enemies.length === 0) {
        st.portalUnlocked = true;
        broadcast(room, { type: "portal_unlocked" });
    }

    // ------------------------------------------------------------
    // 5. Periodic snapshots
    // ------------------------------------------------------------
    room.snapCounter = (room.snapCounter + 1) % Math.round(TICK_HZ / SNAP_HZ);
    if (room.snapCounter === 0) {
        broadcast(room, snapshot(room));
        st.events.length = 0; // clear one-shot events after sending
    }
    if (st.runActive) {
        const aliveCount = [...room.players.values()].filter(p => !p.dead && p.hp > 0).length;

        if (aliveCount === 0 && !st.allDead) {
            st.allDead = true;
            st.wipeTimer = 3.0;
            broadcast(room, { type: "all_players_dead" });
            console.log(`[room ${room.id}] ⚰️ All players dead — restarting soon`);
        }

        if (st.allDead) {
            st.wipeTimer -= DT;
            if (st.wipeTimer <= 0) {
                restartRoom(room);
            }
        }
    }
}

function restartRoom(room) {
    const st = room.state;
    st.allDead = false;
    st.wipeTimer = 0;
    st.portalUnlocked = false;
    st.enemies.length = 0;
    st.events.length = 0;
    st.stage = 1;
    st.time = 0;
    st.runActive = false;       // 👈 not active yet

    // Respawn players
    for (const pl of room.players.values()) {
        pl.dead = false;
        pl.hp = pl.stats?.maxHealth ?? 120;
        pl.mana = pl.stats?.maxMana ?? 100;
        pl.shield = 0;
        pl.x = 0;
        pl.z = 0;
        pl.respawnTimer = 0;
    }

    // spawn first wave *after a small delay or onStart event*
    spawnWave(room, 6);
    st.runActive = true;        // 👈 run now live
    broadcast(room, { type: "run_reset" });
}

function snapshot(room){
    const st=room.state;
    return {
        type:"snapshot",seq:st.seq,time:st.time,
        stage: st.stage,
        players:[...room.players.values()].map(p=>({
            id:p.id, name:p.name || "",
            x:p.x, z:p.z,
            ack:p.lastProcessedInputSeq,
            hp: p.hp ?? 0,
            mana: p.mana ?? 0,
            shield: p.shield ?? 0
        })),
        enemies: st.enemies.map(e=>({id:e.id,x:e.x,z:e.z,y:e.y,hp:e.hp,type:e.type,s:e.s})),
        projectiles:st.projectiles.map(p=>({
            id:p.id,owner:p.owner,x:p.x,y:p.y,z:p.z,
            sx:p.sx,sz:p.sz,ax:p.ax,az:p.az,
            kind:p.kind, tint:p.tint, team:p.team || "player"
        })),
        pools: st.pools.map(p=>({id:p.id,x:p.x,z:p.z,r:p.r,team:p.team,ttl:p.ttl})),
        events: st.events,
        portalUnlocked: st.portalUnlocked,
        drops: st.drops
    };
}


// --- Network helpers ---
function wsSend(sock,obj){
    if (!sock || sock.destroyed) return;
    const data=Buffer.from(JSON.stringify(obj));
    let h;
    if(data.length<126){h=Buffer.alloc(2);h[0]=0x81;h[1]=data.length;}
    else if(data.length<65536){h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(data.length,2);}
    else{h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeBigUInt64BE(BigInt(data.length),2);}
    try{ sock.write(Buffer.concat([h,data])); }catch{}
}
function broadcast(room,obj){for(const {socket} of room.clients.values())wsSend(socket,obj);}
function broadcastExcept(room,except,obj){for(const [id,{socket}]of room.clients)if(id!==except)wsSend(socket,obj);}

function closeClient(roomId,id){
    const room=rooms.get(roomId);if(!room)return;
    const c=room.clients.get(id);
    try{c?.socket?.destroy();}catch{}

    room.clients.delete(id);
    room.players.delete(id);          // ensure they are removed from active play
    room.pendingRewards.delete(id);   // drop any pending reward offers

    broadcast(room,{type:"leave",id});

    if(room.clients.size===0){
        clearInterval(room.loop);
        rooms.delete(roomId);
    }
}

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

// --- Boot ---
const PORT = process.env.PORT || 8081;
server.listen(PORT,"0.0.0.0",()=>{
    console.log(`✅ Server on ws://0.0.0.0:${PORT}`);
    const ip=Object.values(os.networkInterfaces()).flat()
        .find(n=>n&&n.family==="IPv4"&&!n.internal)?.address||"localhost";
    console.log(`   Open http://${ip}:8080/?room=alpha`);
});


server.on("request",(req,res)=>{
    try{
        const url = new URL(req.url, "http://localhost");
        if (req.method==="GET" && url.pathname==="/api/rooms"){
            const list = [...rooms.entries()].map(([id,r])=>{
                const st = r.state;
                return {
                    id,
                    players: r.players.size,
                    stage: st.stage,
                    enemies: st.enemies.length,
                    portalUnlocked: !!st.portalUnlocked,
                    createdAt: r.createdAt || null
                };
            });
            res.statusCode = 200;
            res.setHeader("Content-Type","application/json");
            res.setHeader("Access-Control-Allow-Origin","*");        // allow 8080 -> 8081
            res.end(JSON.stringify({ rooms:list }));
            return;
        }
    }catch{}
    res.statusCode = 404; res.end("Not found");
});
