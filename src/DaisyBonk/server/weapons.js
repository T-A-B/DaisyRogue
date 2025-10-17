// server/weapons.js — multi-weapon system + auto-fire + item hooks + tint + UI metadata
import crypto from "crypto";
import { applyItemsOnFire } from "./items.js";

// ------------------------------------------------------------
//  WEAPON DEFINITIONS
// ------------------------------------------------------------
export const WEAPONS = {
    blaster:  {
        cooldown: 0.18, qty: 1, spreadDeg: 0,
        speed: 32, ttl: 1.2, dmg: 22,
        splashR: 1.2, splashMul: 0.35,
        pool: null,
        status: { type:"bleed", dur:1.5, power:2 },
        range: 22
    },
    shotgun:  {
        cooldown: 0.65, qty: 6, spreadDeg: 8,
        speed: 26, ttl: 0.75, dmg: 10,
        splashR: 0.9, splashMul: 0.25,
        pool: null, status: null,
        range: 15
    },
    firestaff:{
        cooldown: 0.90, qty: 1, spreadDeg: 0,
        speed: 24, ttl: 1.3, dmg: 16,
        splashR: 1.6, splashMul: 0.60,
        pool: { r:1.15, duration:2.6, dps:6, team:"player" },
        status: null,
        range: 20
    }
};

// Tint color per weapon for projectile visuals
const TINT = { blaster: 0xa8c6ff, shotgun: 0xffd166, firestaff: 0xff6b3b };

// ------------------------------------------------------------
//  PLAYER LOADOUT HELPERS
// ------------------------------------------------------------
export function initPlayerWeapons() {
    return [
        { id: "blaster",   cd: 0 }
    ];
}

/**
 * Describe weapons for UI display (used by HUD loadout)
 */
export function uiDescribeWeapons(weps){
    return (weps || []).map(w=>{
        const id = w.id || "unknown";
        const meta = {
            blaster:  { name:"Blaster",  type:"Rifle" },
            shotgun:  { name:"Shotgun",  type:"Spread" },
            firestaff:{ name:"Fire Staff",type:"Magic" }
        }[id] || { name:id, type:"Weapon" };
        return {
            id,
            name: meta.name,
            type: meta.type,
            cd: w.cd || 0,
            cooldown: WEAPONS[id]?.cooldown ?? 0
        };
    });
}

// ------------------------------------------------------------
//  MAIN UPDATE
// ------------------------------------------------------------
export function tickWeapons(room, dt) {
    for (const pl of room.players.values()) {
        if (!pl.weapons) pl.weapons = initPlayerWeapons();
        if (!pl.items) pl.items = [];

        // Tick cooldowns
        for (const w of pl.weapons) w.cd = Math.max(0, w.cd - dt);

        const st = room.state;
        const nearest = nearestEnemy(st, pl);
        const haveTarget = !!nearest;
        const wantFire = (pl.input.fire|0) === 1 || haveTarget;
        if (!wantFire) continue;

        // Determine aim direction
        let baseDirX, baseDirZ;
        if ((pl.input.fire|0) === 1) {
            const n = Math.hypot(pl.input.aimX || 0, pl.input.aimZ || 0) || 1;
            baseDirX = (pl.input.aimX || 0) / n;
            baseDirZ = (pl.input.aimZ || 1) / n;
        } else if (nearest) {
            const dx = nearest.x - pl.x, dz = nearest.z - pl.z, L = Math.hypot(dx, dz) || 1;
            baseDirX = dx / L; baseDirZ = dz / L;
        } else continue;

        // Try to fire each ready weapon
        for (const w of pl.weapons) {
            if (w.cd > 0) continue;
            const def = WEAPONS[w.id]; if (!def) continue;

            if ((pl.input.fire|0) !== 1 && nearest) {
                const d2 = (nearest.x - pl.x)**2 + (nearest.z - pl.z)**2;
                if (d2 > (def.range ?? 20)**2) continue;
            }

            // --- Item hook: once per weapon trigger
            applyItemsOnFire(room, pl, baseDirX, baseDirZ);

            // Fire the weapon
            shootWeapon(room, pl, def, baseDirX, baseDirZ, w.id);
            w.cd = def.cooldown;
        }
    }
}

// ------------------------------------------------------------
//  SHOOT HELPERS
// ------------------------------------------------------------
function shootWeapon(room, pl, def, dirX, dirZ, weaponId) {
    const spread = (def.spreadDeg || 0) * Math.PI/180;
    const half = (def.qty - 1) * 0.5;
    if(pl.dead) return;
    for (let i = 0; i < def.qty; i++) {
        const off = (i - half) * spread;
        const [ax, az] = rot2(dirX, dirZ, off);
        const sx = pl.x + ax * 0.8, sz = pl.z + az * 0.8;

        room.state.projectiles.push({
            id: crypto.randomUUID(), owner: pl.id,
            x: sx, y: 0.6, z: sz, sx, sz, ax, az,
            vx: ax * def.speed, vz: az * def.speed,
            ttl: def.ttl,
            team: "player",

            dmg: def.dmg,
            splashR: def.splashR ?? 0, splashMul: def.splashMul ?? 0,
            status: def.status ? { ...def.status } : null,
            pool: def.pool ? { ...def.pool } : null,
            kind: weaponId,
            tint: TINT[weaponId] ?? 0xa8c6ff
        });
    }
}

// ------------------------------------------------------------
//  UTILS
// ------------------------------------------------------------
function rot2(x, z, ang){ const c=Math.cos(ang), s=Math.sin(ang); return [x*c + z*s, z*c - x*s]; }
function nearestEnemy(st, pl){
    let best=null, d2=Infinity;
    for (const e of st.enemies){
        const dx=e.x-pl.x, dz=e.z-pl.z;
        const dd=dx*dx+dz*dz;
        if (dd<d2){d2=dd; best=e;}
    }
    return best;
}
