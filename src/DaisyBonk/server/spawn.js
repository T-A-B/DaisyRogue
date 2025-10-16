// server/spawn.js — waves + melee AI + enemy factory
import crypto from "crypto";
import { applyDamagePlayer } from "./combat.js";

export function makeEnemy(type, x, z) {
    const id = crypto.randomUUID();
    const base = { id, type, x, z, y:0.5, s:1, hp:60, speed:2.2, dmg:8, atkRange:1.4 };
    switch ((type||"pawn").toLowerCase()){
        case "pawn":
            return { ...base, hp: 55, speed:2.3, dmg:8,  atkRange:1.4, s:1.0 };
        case "pawn_ranged":
            return { ...base, hp: 45, speed:2.2, dmg:7,  atkRange:1.2, s:1.0 }; // ranged handled in enemy_attacks
        case "wizard":
            return { ...base, hp: 75, speed:2.0, dmg:10, atkRange:1.4, s:1.1 };
        case "knight":
            return { ...base, hp: 140, speed:1.9, dmg:13, atkRange:1.5, s:1.25 };
        case "summoner":
            return { ...base, hp: 100, speed:1.9, dmg:9, atkRange:1.4, s:1.12, summonCd: 2.0 };
        case "beastmaster":
            return { ...base, hp: 160, speed:2.0, dmg:12, atkRange:1.5, s:1.25, petCount:3 };
        case "beast_pet":
            // orbiters (spawned with beastmaster)
            return { ...base, hp: 36, speed:0, dmg:6, atkRange:1.0, s:0.8, pet:true };
        default:
            return { ...base };
    }
}

export function spawnWave(room, count = 8){
    const st = room.state;
    const stage = st.stage ?? 1;
    const picks = weightedBag(stage, count);
    for (const t of picks){
        const pos = ringSpawn(8 + Math.random()*10);
        const e = makeEnemy(t, pos.x, pos.z);
        st.enemies.push(e);
        // Beastmaster pets
        if (t === "beastmaster"){
            const pets = e.petCount ?? 3;
            for (let i=0;i<pets;i++){
                const ang = (i/pets) * Math.PI*2;
                const r = 1.8 + Math.random()*0.4;
                const p = makeEnemy("beast_pet", e.x + Math.sin(ang)*r, e.z + Math.cos(ang)*r);
                p.masterId = e.id;
                p.orbitR = r;
                p.orbitA = ang + Math.random()*0.5;
                p.orbitSpeed = 1.3 + Math.random()*0.5;
                p.atkCd = 0;
                st.enemies.push(p);
            }
        }
    }
}

// simple weighted type bag per stage
function weightedBag(stage, count){
    const bag = [];
    const w = [
        ["pawn",        Math.max(2, 10 - stage*0.5)],
        ["pawn_ranged", 3 + stage*0.3],
        ["wizard",      1 + stage*0.2],
        ["knight",      0.6 + stage*0.15],
        ["summoner",    stage>=2 ? (0.6 + stage*0.1) : 0],
        ["beastmaster", stage>=3 ? (0.35 + stage*0.1) : 0],
    ].filter(([,x])=>x>0);
    const total = w.reduce((a, [,x])=>a+x,0);
    for(let i=0;i<count;i++){
        let r=Math.random()*total;
        for(const [type,weight] of w){ r-=weight; if(r<=0){ bag.push(type); break; } }
    }
    return bag;
}

function ringSpawn(r){
    const a=Math.random()*Math.PI*2;
    return { x: Math.sin(a)*r, z: Math.cos(a)*r };
}

// ------------------ Melee AI (non-pets) ------------------
export function tickEnemies(room, dt) {
    const st = room.state;
    const players = [...room.players.values()];
    if (players.length === 0) return;

    for (const e of st.enemies) {
        if (e.type === "beast_pet") continue; // orbit logic handled elsewhere

        e.atkCd = (e.atkCd ?? 0) - dt;
        e.dmg   = e.dmg   ?? 8;
        e.atkRange = e.atkRange ?? 1.4;
        e.speed = e.speed ?? 2.2;

        const t = nearest(players, e);
        if (!t) continue;

        const dx = t.x - e.x, dz = t.z - e.z;
        const dist = Math.hypot(dx, dz) || 1;

        // move if not yet in melee
        if (dist > e.atkRange) {
            const spd = e.speed * (e._speedMul ?? 1);
            e.x += (dx / dist) * spd * dt;
            e.z += (dz / dist) * spd * dt;
        }

        // melee attempt (for pawns/knights/summoners/beastmaster body)
        if (dist <= e.atkRange && e.atkCd <= 0) {
            applyDamagePlayer(room, t, e.dmg, { kind:"enemy_melee", from:e.id });
            e.atkCd = 1.1 + Math.random() * 0.5;
            st.events.push({ type:"fx_hit", x:t.x, z:t.z, tint:0xff4444 });
        }
    }
}

function nearest(players, e){
    let best=null, d2=Infinity;
    for(const p of players){
        if (!p || p.hp <= 0) continue;
        const dx=p.x-e.x, dz=p.z-e.z, dd=dx*dx+dz*dz;
        if(dd<d2){d2=dd;best=p;}
    }
    return best;
}
