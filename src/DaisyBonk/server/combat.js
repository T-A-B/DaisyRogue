// server/combat.js — shared combat helpers
import crypto from "crypto";

const DAMAGE_FX_COOLDOWN = 0.5; // seconds between dmg-number events per target

// track last FX time per entity id
const lastFxTime = new Map();

export function applyDamageEnemy(room, enemy, dmg, src) {
    const st = room.state;
    enemy.hp -= dmg;

    const t = st.time;
    const last = lastFxTime.get(enemy.id) || 0;
    if (t - last > DAMAGE_FX_COOLDOWN) {
        st.events.push({ type: "fx_damage", x: enemy.x, z: enemy.z, value: Math.round(dmg) });
        lastFxTime.set(enemy.id, t);
    }

    if (enemy.hp <= 0) {
        const idx = st.enemies.findIndex(e => e.id === enemy.id);
        if (idx >= 0) st.enemies.splice(idx, 1);
        // spawn drops
        import("./drops.js").then(m => m.spawnDrops(room, enemy, src));
    }
}

export function radialDamage(room, x, z, radius, dmg, source, excludeId) {
    const st = room.state;
    const r2 = radius * radius;
    for (const e of st.enemies) {
        if (excludeId && e.id === excludeId) continue;
        const dx = e.x - x, dz = e.z - z;
        if (dx * dx + dz * dz <= r2) applyDamageEnemy(room, e, dmg, source);
    }
}

/** called when enemies hit players */
export function applyDamagePlayer(room, player, dmg, src) {
    player.hp -= dmg;
    const st = room.state;
    const t = st.time;
    const id = `p_${player.id}`;
    const last = lastFxTime.get(id) || 0;
    if (t - last > DAMAGE_FX_COOLDOWN) {
        st.events.push({ type: "fx_damage", x: player.x, z: player.z, value: Math.round(dmg) });
        lastFxTime.set(id, t);
    }
    if (player.hp <= 0) {
        st.events.push({ type:"fx_status", targetId: player.id, status:"dead", tint:0xff0000 });
        st.events.push({ type: "player_dead", id: player.id, x: player.x, z: player.z })
        player.dead = true;
    }
}
