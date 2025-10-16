// server/aoe.js — AoE pools (DoT circles)
import crypto from 'crypto';
import { applyDamageEnemy } from './combat.js';

export function spawnPool(state, { x, z, radius, duration, dps, team = 'player' }) {
    const p = { id: crypto.randomUUID(), x, z, r: radius, ttl: duration, dps, team };
    state.pools.push(p);
    return p;
}

export function tickPools(room, dt) {
    const st = room.state;
    for (let i = st.pools.length - 1; i >= 0; i--) {
        const p = st.pools[i];
        p.ttl -= dt;
        if (p.ttl <= 0) { st.pools.splice(i, 1); continue; }

        if (p.team === 'player') {
            for (const e of st.enemies) {
                const dx = e.x - p.x, dz = e.z - p.z;
                if (dx * dx + dz * dz <= p.r * p.r) {
                    applyDamageEnemy(room, e, p.dps * dt, { kind: 'pool', id: p.id });
                }
            }
        }
        // (future) enemy pools can hurt players
    }
}
