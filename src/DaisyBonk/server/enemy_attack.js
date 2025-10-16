// server/enemy_attacks.js — ranged/status/pools + pets orbit
import crypto from "crypto";
import { spawnPool } from "./aoe.js";
import { applyDamagePlayer } from "./combat.js";
import { makeEnemy } from "./spawn.js";

// --- utils ---
function nearestPlayer(room, e){
    let best=null, d2=Infinity;
    for (const p of room.players.values()){
        if (!p || p.hp <= 0) continue;
        const dx=p.x-e.x, dz=p.z-e.z, dd=dx*dx+dz*dz;
        if(dd<d2){d2=dd;best=p;}
    }
    return best;
}
function norm2(x,z){ const L=Math.hypot(x,z)||1; return [x/L,z/L]; }

// --- Shared projectile spawner for enemies ---
function spawnEnemyProjectile(room, e, dirX, dirZ, def){
    const st = room.state;
    const [ax,az] = norm2(dirX, dirZ);
    const sx = e.x + ax * 0.7, sz = e.z + az * 0.7;

    st.projectiles.push({
        id: crypto.randomUUID(),
        owner: e.id,
        team: "enemy",
        x: sx, y: 0.6, z: sz, sx, sz, ax, az,
        vx: ax * (def.speed ?? 18),
        vz: az * (def.speed ?? 18),
        ttl: def.ttl ?? 1.2,
        dmg: def.dmg ?? 8,
        splashR: def.splashR ?? 0,
        splashMul: def.splashMul ?? 0,
        status: def.status ? { ...def.status } : null,
        pool: def.pool ? { ...def.pool } : null,
        kind: def.kind ?? "enemy_shot",
        tint: def.tint ?? 0xff6b6b
    });
    st.events.push({ type:"fx_muzzle", x:sx, z:sz, tint: def.tint ?? 0xff6b6b });
}

// --- AI variants ---
function pawnRangedAI(room, e, dt){
    e.shootCd = (e.shootCd ?? (0.9 + Math.random()*0.4)) - dt;
    if (e.shootCd > 0) return;
    const t = nearestPlayer(room, e); if (!t) { e.shootCd=0.3; return; }
    const dx=t.x-e.x, dz=t.z-e.z, d=Math.hypot(dx,dz)||1;
    if (d <= 13){ // in range
        spawnEnemyProjectile(room, e, dx, dz, {
            speed: 20, ttl: 1.2, dmg: 8,
            status: Math.random() < 0.25 ? { type:"bleed", dur:1.6, power:4 } : null,
            tint: 0xff9898, kind:"pawn_ranged"
        });
        e.shootCd = 1.0 + Math.random()*0.4;
    } else {
        e.shootCd = 0.2;
    }
}

function summonerAI(room, e, dt){
    e.castCd = (e.castCd ?? (2.5 + Math.random()*0.6)) - dt;
    if (e.castCd > 0) return;
    const t = nearestPlayer(room, e);
    // summon 2–3 minions around self
    const qty = 2 + (Math.random()<0.6?1:0);
    for(let i=0;i<qty;i++){
        const ang = Math.random()*Math.PI*2;
        const r = 2.2 + Math.random()*1.2;
        const x = e.x + Math.sin(ang)*r, z = e.z + Math.cos(ang)*r;
        const type = Math.random()<0.5 ? "pawn" : "pawn_ranged";
        room.state.enemies.push(makeEnemy(type, x, z));
    }
    room.state.events.push({ type:"fx_shrapnel", x:e.x, z:e.z, r:2.0, tint:0x7a7cff });
    e.castCd = 4.0 + Math.random()*1.0;

    // sometimes drops a small enemy pool near player
    if (t && Math.random()<0.35){
        spawnPool(room.state, { x: t.x, z: t.z, radius: 1.0, duration: 2.2, dps: 6, team: "enemy" });
        room.state.events.push({ type:"fx_pool", x:t.x, z:t.z, tint:0xff7a5c });
    }
}

function beastmasterAI(room, e, dt){
    // Optional: short cone shot to push pressure while pets orbit
    e.castCd = (e.castCd ?? (1.6 + Math.random()*0.5)) - dt;
    if (e.castCd <= 0){
        const t = nearestPlayer(room, e);
        if (t){
            const dx=t.x-e.x, dz=t.z-e.z, d=Math.hypot(dx,dz)||1;
            const dirX=dx/d, dirZ=dz/d, qty=5, spread=10*Math.PI/180;
            for(let i=0;i<qty;i++){
                const off=(i-(qty-1)/2)*spread, c=Math.cos(off), s=Math.sin(off);
                spawnEnemyProjectile(room, e, dirX*c + dirZ*s, dirZ*c - dirX*s, {
                    speed: 18, ttl: 0.9, dmg: 9,
                    status: { type:"slow", dur:1.2, power:0.35 },
                    tint: 0xffc96b, kind:"beast_cone"
                });
            }
            e.castCd = 1.8 + Math.random()*0.6;
        } else {
            e.castCd = 0.5;
        }
    }
}

function tickBeastPets(room, dt){
    const st = room.state;
    // index masters
    const byId = new Map(st.enemies.map(e=>[e.id,e]));
    for (const p of st.enemies){
        if (p.type !== "beast_pet") continue;
        const m = byId.get(p.masterId);
        if (!m){ continue; } // master dead: keep last position
        // orbit
        p.orbitA = (p.orbitA ?? 0) + (p.orbitSpeed ?? 1.3)*dt;
        const targetX = m.x + Math.sin(p.orbitA)*(p.orbitR ?? 1.8);
        const targetZ = m.z + Math.cos(p.orbitA)*(p.orbitR ?? 1.8);
        // soft follow for smoothness
        p.x += (targetX - p.x) * Math.min(1, dt*6);
        p.z += (targetZ - p.z) * Math.min(1, dt*6);

        // contact poke
        p.atkCd = (p.atkCd ?? 0) - dt;
        if (p.atkCd <= 0){
            const t = nearestPlayer(room, p);
            if (t){
                const dx=t.x-p.x, dz=t.z-p.z;
                if (dx*dx+dz*dz <= 1.0*1.0){
                    applyDamagePlayer(room, t, p.dmg ?? 6, { kind:"pet_bite", from:p.id });
                    room.state.events.push({ type:"fx_hit", x:t.x, z:t.z, tint:0xff8866 });
                    p.atkCd = 1.1 + Math.random()*0.3;
                }
            }
        }
    }
}
function wizardAI(room, e, dt){
    // internal cooldowns
    e.castCd = (e.castCd ?? (1.1 + Math.random()*0.4)) - dt;

    if (e.castCd > 0) return;
    const t = nearestPlayer(room, e);
    if (!t) { e.castCd = 0.3; return; }

    const dx = t.x - e.x, dz = t.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dirX = dx / dist, dirZ = dz / dist;

    // Choose a pattern
    if (dist > 7.0) {
        // Aimed volley (2–3 shots), slight spread, poison or burn
        const qty = 2 + (Math.random() < 0.5 ? 1 : 0);
        const spread = 5 * Math.PI/180;
        for (let i=0;i<qty;i++){
            const off = (i - (qty-1)/2) * spread;
            const c = Math.cos(off), s = Math.sin(off);
            const ax = dirX*c + dirZ*s, az = dirZ*c - dirX*s;
            spawnEnemyProjectile(room, e, ax, az, {
                speed: 20, ttl: 1.6, dmg: 10,
                status: (Math.random() < 0.5) ? { type:"poison", dur:2.6, power:5 } : { type:"burn", dur:2.0, power:6 },
                tint: 0xff78d6, kind: "wizard_aim"
            });
        }
        e.castCd = 1.2 + Math.random()*0.3;
    } else if (dist > 4.0) {
        // Fan spread
        const qty = 5, spread = 8 * Math.PI/180;
        for (let i=0;i<qty;i++){
            const off = (i - (qty-1)/2) * spread;
            const c = Math.cos(off), s = Math.sin(off);
            const ax = dirX*c + dirZ*s, az = dirZ*c - dirX*s;
            spawnEnemyProjectile(room, e, ax, az, {
                speed: 18, ttl: 1.2, dmg: 8,
                status: { type:"slow", dur:1.6, power:0.35 },
                tint: 0xb97cff, kind: "wizard_fan"
            });
        }
        e.castCd = 1.0 + Math.random()*0.4;
    } else {
        // Close: nova or pool drop
        if (Math.random() < 0.5){
            const rays = 12;
            for (let k=0;k<rays;k++){
                const ang = (k/rays) * Math.PI*2;
                const ax = Math.sin(ang), az = Math.cos(ang);
                spawnEnemyProjectile(room, e, ax, az, {
                    speed: 16, ttl: 1.0, dmg: 7,
                    status: { type:"bleed", dur:1.6, power:4 },
                    tint: 0xff9b6b, kind: "wizard_nova"
                });
            }
            e.castCd = 2.2 + Math.random()*0.5;
        } else {
            // pool at target location
            spawnPool(room.state, { x: t.x, z: t.z, radius: 1.1, duration: 2.6, dps: 6, team: "enemy" });
            room.state.events.push({ type:"fx_pool", x:t.x, z:t.z, tint:0xff6b3b });
            e.castCd = 2.0 + Math.random()*0.4;
        }
    }
}

function knightAI(room, e, dt){
    e.castCd = (e.castCd ?? (1.4 + Math.random()*0.6)) - dt;
    if (e.castCd > 0) return;
    const t = nearestPlayer(room, e);
    if (!t) { e.castCd = 0.5; return; }

    const dx = t.x - e.x, dz = t.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dirX = dx / dist, dirZ = dz / dist;

    if (dist <= 5.5){
        // Cone slam: 7-shot cone with slow
        const qty=7, spread=10*Math.PI/180;
        for(let i=0;i<qty;i++){
            const off=(i-(qty-1)/2)*spread;
            const c=Math.cos(off), s=Math.sin(off);
            const ax=dirX*c + dirZ*s, az=dirZ*c - dirX*s;
            spawnEnemyProjectile(room, e, ax, az, {
                speed: 22, ttl: 0.7, dmg: 12,
                status: { type:"slow", dur:1.5, power:0.4 },
                tint: 0xffcc66, kind:"knight_cone"
            });
        }
        e.castCd = 1.6 + Math.random()*0.4;
    } else {
        // Warning ring (nova)
        const rays = 10;
        for (let k=0;k<rays;k++){
            const ang=(k/rays)*Math.PI*2;
            const ax=Math.sin(ang), az=Math.cos(ang);
            spawnEnemyProjectile(room, e, ax, az, {
                speed: 14, ttl: 0.9, dmg: 9,
                status: null, tint:0xffaa66, kind:"knight_nova"
            });
        }
        e.castCd = 2.5 + Math.random()*0.6;
    }
}
// --- main entry ---
export function tickEnemyAttacks(room, dt){
    const st = room.state;
    for (const e of st.enemies){
        const t = (e.type||"").toLowerCase();
        if (t === "pawn_ranged") pawnRangedAI(room, e, dt);
        else if (t === "summoner") summonerAI(room, e, dt);
        else if (t === "beastmaster") beastmasterAI(room, e, dt);
        else if (t === "wizard") wizardAI(room, e, dt);
        else if (t === "knight") knightAI(room, e, dt);
        // wizards/knights implemented previously (keep your existing code),
        // or replicate here if you moved them into this module.
    }
    // pets
    tickBeastPets(room, dt);
}
