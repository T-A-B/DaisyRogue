// server/projectiles.js — players & enemies + pierce/chain/return
import { applyDamageEnemy, applyDamagePlayer } from './combat.js';
import { addStatus } from './status.js';
import { addStatusPlayer } from './status.js';
import { spawnPool } from './aoe.js';

export function tickProjectiles(room, dt) {
    const st = room.state;

    for (let i = st.projectiles.length - 1; i >= 0; i--) {
        const p = st.projectiles[i];

        // boomerang return logic
        if (p.returnAt && !p.returning && p.ttl <= p.returnAt) {
            const owner = room.players.get(p.owner);
            if (owner) {
                const dx = owner.x - p.x, dz = owner.z - p.z, L = Math.hypot(dx, dz) || 1;
                p.ax = dx/L; p.az = dz/L;
                const spd = Math.hypot(p.vx, p.vz) || 26;
                p.vx = p.ax * spd; p.vz = p.az * spd;
                p.returning = true;
            }
        }

        p.x += p.vx * dt; p.z += p.vz * dt; p.ttl -= dt;

        // if returning, end when reaches owner
        if (p.returning) {
            const owner = room.players.get(p.owner);
            if (owner) {
                const dx=owner.x-p.x, dz=owner.z-p.z;
                if (dx*dx + dz*dz < 0.7*0.7) { st.projectiles.splice(i,1); continue; }
            }
        }

        const team = p.team || "player";
        if (team === "player"){
            // collide with enemies
            let hit = null;
            for (const e of st.enemies) {
                const dx = e.x - p.x, dz = e.z - p.z;
                if (dx * dx + dz * dz <= 0.6 * 0.6) { hit = e; break; }
            }
            if (hit) {
                const base = p.dmg ?? 22;
                applyDamageEnemy(room, hit, base, { kind: 'projectile', owner: p.owner, id: p.id });

                st.events.push({ type:"fx_hit", x: p.x, z: p.z, tint: p.tint ?? 0xa8c6ff });

                // splash (enemies)
                if ((p.splashR ?? 0) > 0 && (p.splashMul ?? 0) > 0) {
                    const r = p.splashR, dmg = base * (p.splashMul ?? 0);
                    for (const e of st.enemies) {
                        if (e === hit) continue;
                        const dx=e.x-p.x, dz=e.z-p.z;
                        if (dx*dx + dz*dz <= r*r) applyDamageEnemy(room, e, dmg, { kind:"splash", from:p.id });
                    }
                }
                // status on enemy
                if (p.status && p.status.type) addStatus(hit, { ...p.status });
                // pools (player team)
                if (p.pool && p.pool.r && p.pool.duration && p.pool.dps) {
                    spawnPool(st, { x: p.x, z: p.z, radius: p.pool.r, duration: p.pool.duration, dps: p.pool.dps, team: p.pool.team || 'player' });
                }

                // chain lightning (instant extra hits)
                if (p.chain && p.chain.hops > 0) {
                    const hops = p.chain.hops;
                    const radius = p.chain.radius ?? 2.8;
                    const decay = p.chain.decay ?? 0.7;
                    let dmg = base;
                    let from = hit;
                    for (let h=0; h<hops; h++){
                        let next=null, d2=Infinity;
                        for (const e of st.enemies){
                            if (e===from) continue;
                            const dx=e.x-from.x, dz=e.z-from.z, dd=dx*dx+dz*dz;
                            if (dd<=radius*radius && dd<d2){ d2=dd; next=e; }
                        }
                        if (!next) break;
                        dmg *= decay;
                        applyDamageEnemy(room, next, dmg, { kind:"chain", from:p.id });
                        st.events.push({ type:"fx_shrapnel", x:next.x, z:next.z, r:0.8, tint:p.tint ?? 0x66ffcc });
                        from = next;
                    }
                }

                // pierce? keep going else remove
                if ((p.pierce ?? 0) > 0){
                    p.pierce--;
                    continue; // do not remove, continue flying
                } else {
                    st.projectiles.splice(i, 1);
                    continue;
                }
            }
        } else {
            // team === "enemy" — collide with players
            let phit = null;
            for (const pl of room.players.values()) {
                const dx = pl.x - p.x, dz = pl.z - p.z;
                if (dx * dx + dz * dz <= 0.6 * 0.6) { phit = pl; break; }
            }
            if (phit) {
                const base = p.dmg ?? 10;
                applyDamagePlayer(room, phit, base, { kind: 'enemy_projectile', owner: p.owner, id: p.id });

                st.events.push({ type:"fx_hit", x: p.x, z: p.z, tint: p.tint ?? 0xff6666 });

                // splash (players)
                if ((p.splashR ?? 0) > 0 && (p.splashMul ?? 0) > 0) {
                    const r = p.splashR, dmg = base * (p.splashMul ?? 0);
                    for (const pl of room.players.values()){
                        if (pl === phit) continue;
                        const dx=pl.x-p.x, dz=pl.z-p.z;
                        if (dx*dx + dz*dz <= r*r) applyDamagePlayer(room, pl, dmg, { kind:"enemy_splash", from:p.id });
                    }
                }
                // status on player
                if (p.status && p.status.type) addStatusPlayer(phit, { ...p.status });
                // pools (enemy team)
                if (p.pool && p.pool.r && p.pool.duration && p.pool.dps) {
                    spawnPool(st, { x: p.x, z: p.z, radius: p.pool.r, duration: p.pool.duration, dps: p.pool.dps, team: 'enemy' });
                }

                // enemy shots: no pierce by default (unless you add it)
                st.projectiles.splice(i, 1);
                continue;
            }
        }

        if (p.ttl <= 0 || Math.abs(p.x) > 30 || Math.abs(p.z) > 30) st.projectiles.splice(i, 1);
    }
}
