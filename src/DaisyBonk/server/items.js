// server/items.js — item defs, rarity rolls, and FX hooks
import crypto from "crypto";
import { addStatus } from "./status.js";
import { spawnPool } from "./aoe.js";
import { radialDamage } from "./combat.js";

const FX = {
    arc: 0x66ffcc,
    poison: 0x4cff6b,
    bleed: 0xff4a4a,
    shrapnel: 0xffcc66,
    pool: 0xff6b3b
};

// Rarities
export const RARITIES = ["common","rare","epic","legendary"];
const WEIGHTS = { common: 6, rare: 3, epic: 1, legendary: 0.35 };

// Item pool
// Each item can define onFire(room, pl, dirX, dirZ) or onHit(room, owner, target, ctx)
const POOL = [
    {
        id: "arc_bolt",
        name: "Arc Bolt",
        rarity: "rare",
        desc: "Also fires an Arc Bolt with each attack.",
        onFire(room, pl, dx, dz) {
            const st = room.state;
            const sx = pl.x + dx * 0.8, sz = pl.z + dz * 0.8;

            // projectile (tinted + kind)
            st.projectiles.push({
                id: crypto.randomUUID(), owner: pl.id,
                x: sx, y: 0.6, z: sz, sx, sz, ax: dx, az: dz,
                vx: dx * 34, vz: dz * 34, ttl: 0.9,
                dmg: 12, splashR: 0.0, splashMul: 0.0, status: null, pool: null,
                kind: "arc_bolt", tint: FX.arc
            });

            // muzzle flash FX
            st.events.push({ type:"fx_muzzle", x:sx, z:sz, tint: FX.arc });
        }
    },
    {
        id: "poison_tip",
        name: "Poison Tip",
        rarity: "common",
        desc: "On hit: 25% chance to apply Poison (3s).",
        onHit(room, owner, target) {
            if (Math.random() < 0.25) {
                addStatus(target, { type: "poison", dur: 3.0, power: 5 });
                room.state.events.push({ type:"fx_status", targetId: target.id, status:"poison", tint: FX.poison });
            }
        }
    },
    {
        id: "bleed_edge",
        name: "Bleed Edge",
        rarity: "rare",
        desc: "On hit: 35% chance to apply Bleed (2.5s).",
        onHit(room, owner, target) {
            if (Math.random() < 0.35) {
                addStatus(target, { type: "bleed", dur: 2.5, power: 6 });
                room.state.events.push({ type:"fx_status", targetId: target.id, status:"bleed", tint: FX.bleed });
            }
        }
    },
    {
        id: "ignite",
        name: "Ignition",
        rarity: "rare",
        desc: "On hit: 20% chance to create a small fire pool.",
        onHit(room, owner, target) {
            if (Math.random() < 0.20) {
                spawnPool(room.state, { x: target.x, z: target.z, radius: 1.1, duration: 2.3, dps: 6, team: "player" });
                room.state.events.push({ type:"fx_pool", x: target.x, z: target.z, tint: FX.pool });
            }
        }
    },
    {
        id: "shrapnel",
        name: "Shrapnel",
        rarity: "epic",
        desc: "On hit: 20% chance to blast nearby enemies (50% dmg).",
        onHit(room, owner, target, { baseDmg }) {
            if (Math.random() < 0.20) {
                radialDamage(room, target.x, target.z, 1.5, (baseDmg ?? 18) * 0.5, { kind: "item_shrapnel" }, target.id);
                room.state.events.push({ type:"fx_shrapnel", x: target.x, z: target.z, r: 1.5, tint: FX.shrapnel });
            }
        }
    }
];

function pickWeighted(arr, weightFn){
    let total = 0; const w = arr.map(x => { const v = Math.max(0, weightFn(x)); total += v; return v; });
    if (total <= 0) return arr[0];
    let r = Math.random() * total;
    for (let i=0;i<arr.length;i++){ r -= w[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length-1];
}

export function rollRewardOptions(num = 3){
    const opts = [];
    while (opts.length < num){
        const it = pickWeighted(POOL, x => WEIGHTS[x.rarity] ?? 1);
        if (opts.find(o => o.id === it.id)) continue;
        opts.push({ id: it.id, name: it.name, rarity: it.rarity, desc: it.desc });
    }
    return opts;
}

export function applyItemToPlayer(player, itemId){
    if (!player.items) player.items = [];
    const def = POOL.find(x => x.id === itemId);
    if (!def) return null;
    player.items.push({ id: def.id });
    return { id: def.id, name: def.name, rarity: def.rarity, desc: def.desc };
}

// Hooks used by other systems
export function applyItemsOnFire(room, pl, dirX, dirZ){
    const list = pl.items || [];
    for (const it of list){
        const def = POOL.find(x => x.id === it.id);
        if (def?.onFire) def.onFire(room, pl, dirX, dirZ);
    }
}
export function applyItemsOnHit(room, owner, target, ctx){
    const list = owner?.items || [];
    for (const it of list){
        const def = POOL.find(x => x.id === it.id);
        if (def?.onHit) def.onHit(room, owner, target, ctx);
    }
}
