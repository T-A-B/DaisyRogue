// server/spawn.js — smarter waves, adaptive AI, elite modifiers
import crypto from "crypto";
import { applyDamagePlayer } from "./combat.js";

// ------------------------------------------------------------------
//  ENEMY FACTORY
// ------------------------------------------------------------------
export function makeEnemy(type, x, z) {
    const id = crypto.randomUUID();
    const base = {
        id, type, x, z,
        y: 0.5, s: 1,
        hp: 60,
        speed: 2.2,
        dmg: 8,
        atkRange: 1.4,
        atkCd: 0,
        aggroRange: 14,
        awareness: 10,
        state: "idle"
    };

    switch ((type || "pawn").toLowerCase()) {
        case "pawn":
            return { ...base, hp: 55, speed: 2.3, dmg: 8, atkRange: 1.4 };
        case "pawn_ranged":
            return { ...base, hp: 45, speed: 2.2, dmg: 7, atkRange: 1.2, ranged: true };
        case "wizard":
            return { ...base, hp: 75, speed: 2.0, dmg: 10, atkRange: 1.4, magic: true };
        case "knight":
            return { ...base, hp: 140, speed: 1.8, dmg: 13, atkRange: 1.5, armor: 0.25 };
        case "summoner":
            return { ...base, hp: 100, speed: 1.9, dmg: 9, atkRange: 1.4, s: 1.12, summonCd: 2.0 };
        case "beastmaster":
            return { ...base, hp: 180, speed: 2.0, dmg: 11, atkRange: 1.5, s: 1.25, petCount: 3, aura: true };
        case "beast_pet":
            return { ...base, hp: 36, speed: 0, dmg: 6, atkRange: 1.0, s: 0.8, pet: true };
        default:
            return base;
    }
}

// ------------------------------------------------------------------
//  WAVE SPAWNING
// ------------------------------------------------------------------
export function spawnWave(room, count = 8) {
    const st = room.state;
    const stage = st.stage ?? 1;

    const picks = weightedBag(stage, count);
    const eliteChance = Math.min(0.15 + stage * 0.1, 0.45);

    for (const t of picks) {
        const pos = ringSpawn(8 + Math.random() * 10);
        const e = makeEnemy(t, pos.x, pos.z);

        // Elite modifiers
        if (Math.random() < eliteChance) promoteToElite(e, stage);

        st.enemies.push(e);

        // Beastmaster pets
        if (t === "beastmaster") spawnPets(st, e);
    }

    st.waveNum = (st.waveNum ?? 0) + 1;
    st.events.push({ type: "wave_start", wave: st.waveNum, enemies: st.enemies.length });
}

function promoteToElite(e, stage) {
    e.elite = true;
    e.hp *= 1.5 + 0.1 * stage;
    e.dmg *= 1.2 + 0.05 * stage;
    e.speed *= 1.15;
    e.colorShift = 0xffcc66;
    e.title = "Elite";
    e.aggroRange += 4;
}

function spawnPets(st, master) {
    const pets = master.petCount ?? 3;
    for (let i = 0; i < pets; i++) {
        const ang = (i / pets) * Math.PI * 2;
        const r = 1.8 + Math.random() * 0.4;
        const p = makeEnemy("beast_pet", master.x + Math.sin(ang) * r, master.z + Math.cos(ang) * r);
        p.masterId = master.id;
        p.orbitR = r;
        p.orbitA = ang + Math.random() * 0.5;
        p.orbitSpeed = 1.3 + Math.random() * 0.5;
        p.atkCd = 0;
        st.enemies.push(p);
    }
}

// ------------------------------------------------------------------
//  AI LOGIC
// ------------------------------------------------------------------
export function tickEnemies(room, dt) {
    const st = room.state;
    const players = [...room.players.values()];
    if (players.length === 0) return;

    const now = performance.now() / 1000;
    const player = players[0]; // single-player targeting baseline

    for (const e of st.enemies) {
        if (e.hp <= 0) continue;

        // Pet orbit logic
        if (e.pet) {
            tickPet(e, st, dt);
            continue;
        }

        e.atkCd = (e.atkCd ?? 0) - dt;
        const dx = player.x - e.x, dz = player.z - e.z;
        const dist = Math.hypot(dx, dz) || 1;

        // AI states
        if (dist > e.aggroRange) {
            e.state = "idle";
            continue;
        }

        if (dist > e.atkRange * 1.5) {
            e.state = "chasing";
            const spd = e.speed * (e._speedMul ?? 1);
            e.x += (dx / dist) * spd * dt;
            e.z += (dz / dist) * spd * dt;
        } else if (dist <= e.atkRange && e.atkCd <= 0) {
            e.state = "attacking";
            applyDamagePlayer(room, player, e.dmg, { kind: "enemy_melee", from: e.id });
            e.atkCd = 1.1 + Math.random() * 0.5;
            st.events.push({ type: "fx_hit", x: player.x, z: player.z, tint: 0xff4444 });
        }

        // Elite aura slow-down effect
        if (e.elite && e.aura && dist < 6) {
            player.speed = Math.max(player.speed * 0.97, 0.4);
        }
    }
}

// Pet orbit + attack
function tickPet(e, st, dt) {
    const master = st.enemies.find(x => x.id === e.masterId);
    if (!master) return;
    e.orbitA += e.orbitSpeed * dt;
    e.x = master.x + Math.sin(e.orbitA) * e.orbitR;
    e.z = master.z + Math.cos(e.orbitA) * e.orbitR;
    e.y = 0.5;
}

// ------------------------------------------------------------------
//  SPAWN DISTRIBUTION
// ------------------------------------------------------------------
function weightedBag(stage, count) {
    const w = [
        ["pawn",        Math.max(2, 10 - stage * 0.5)],
        ["pawn_ranged", 3 + stage * 0.3],
        ["wizard",      1 + stage * 0.2],
        ["knight",      0.6 + stage * 0.15],
        ["summoner",    stage >= 2 ? 0.6 + stage * 0.1 : 0],
        ["beastmaster", stage >= 3 ? 0.35 + stage * 0.1 : 0],
    ].filter(([, x]) => x > 0);

    const total = w.reduce((a, [, x]) => a + x, 0);
    const bag = [];
    for (let i = 0; i < count; i++) {
        let r = Math.random() * total;
        for (const [type, weight] of w) {
            r -= weight;
            if (r <= 0) {
                bag.push(type);
                break;
            }
        }
    }
    return bag;
}

function ringSpawn(r) {
    const a = Math.random() * Math.PI * 2;
    return { x: Math.sin(a) * r, z: Math.cos(a) * r };
}
