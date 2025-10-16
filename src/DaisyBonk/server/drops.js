// server/drops.js — handles spawning health, weapons, and loot powerups
import crypto from "crypto";

/**
 * Called whenever an enemy dies.
 * Randomly spawns a small loot orb nearby.
 */
export function spawnDrops(room, enemy, src) {
    const st = room.state;
    const r = Math.random();

    // 25% chance for a drop
    if (r > 0.25) return;

    const roll = Math.random();
    const basePos = { x: enemy.x + (Math.random()-0.5)*0.6, z: enemy.z + (Math.random()-0.5)*0.6 };

    if (roll < 0.55) {
        // Health orb
        st.drops.push({
            id: crypto.randomUUID(),
            kind: "health",
            value: 25 + Math.random()*25,
            x: basePos.x, y: 0.4, z: basePos.z
        });
        st.events.push({ type:"fx_pool", x:basePos.x, z:basePos.z, tint:0x47d16c });
    }
    else if (roll < 0.80) {
        // Weapon orb
        const pool = ["blaster","shotgun","firestaff","railgun","icewand","rocket","arc","boomerang"];
        const pick = pool[Math.floor(Math.random()*pool.length)];
        st.drops.push({
            id: crypto.randomUUID(),
            kind: "weapon",
            weapon: pick,
            x: basePos.x, y: 0.4, z: basePos.z
        });
        st.events.push({ type:"fx_pool", x:basePos.x, z:basePos.z, tint:0x7a7cff });
    }
    else {
        // Powerup / loot orb
        const types = [
            { id:"move",  name:"Speed Up", color:0x64f094 },
            { id:"dmg",   name:"Damage Up", color:0xffb24d },
            { id:"regen", name:"Regen Boost", color:0x4da3ff },
            { id:"crit",  name:"Crit Chance", color:0xff5c7a },
            { id:"shield",name:"Shield Max", color:0x66d9ff }
        ];
        const t = types[Math.floor(Math.random()*types.length)];
        st.drops.push({
            id: crypto.randomUUID(),
            kind: "powerup",
            power: t.id,
            name: t.name,
            color: t.color,
            x: basePos.x, y: 0.4, z: basePos.z
        });
        st.events.push({ type:"fx_pool", x:basePos.x, z:basePos.z, tint:t.color });
    }
}

/**
 * Applies drop effects when a player collects them.
 */
export function applyDropEffect(room, player, drop) {
    const k = drop.kind;
    const stats = player.stats ?? {};

    if (k === "health") {
        player.hp = Math.min(player.hp + drop.value, stats.maxHealth ?? 120);
        return { type:"heal", value: drop.value };
    }
    if (k === "weapon" && drop.weapon) {
        // Add weapon if not already owned
        const has = player.weapons.some(w=>w.id===drop.weapon);
        if (!has) player.weapons.push({ id: drop.weapon, cd: 0 });
        return { type:"weapon", id: drop.weapon };
    }
    if (k === "powerup" && drop.power) {
        switch (drop.power) {
            case "move":  stats.moveSpeed *= 1.1; break;
            case "dmg":   stats.damageMult *= 1.15; break;
            case "regen": stats.healthRegen *= 1.3; stats.manaRegen *= 1.3; break;
            case "crit":  stats.critChance += 0.05; break;
            case "shield":stats.maxShield += 5; break;
        }
        return { type:"powerup", name:drop.name };
    }
    return null;
}
