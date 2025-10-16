// server/status.js — minimal status system (stackless for now)

import {applyDamageEnemy, applyDamagePlayer} from "./combat.js";

export function addStatus(target, { type, dur, power }) {
    if (!target.statuses) target.statuses = [];
    const s = target.statuses.find(s => s.type === type);
    if (s) {
        s.dur = Math.max(s.dur, dur);
        s.power = power;
    } else {
        target.statuses.push({ type, dur, power });
    }
}
function ensureList(actor){ if (!actor.statuses) actor.statuses = []; return actor.statuses; }


export function addStatusPlayer(player, st){
    ensureList(player).push({ type: st.type, dur: st.dur ?? 1.5, power: st.power ?? 5 });
}

// Call every tick
export function tickStatuses(room, dt){
    // players
    for (const p of room.players.values()){
        updateActorStatuses(room, p, dt, "player");
    }
    // enemies
    for (const e of room.state.enemies){
        updateActorStatuses(room, e, dt, "enemy");
    }
}


function updateActorStatuses(room, actor, dt, kind){
    const list = ensureList(actor);
    // reset frame-local speed multiplier (affects movement code if used)
    actor._speedMul = 1;

    for (let i=list.length-1; i>=0; i--){
        const s = list[i];
        s.dur -= dt;

        // slow: reduce movement speed (clamped)
        if (s.type === "slow") {
            const mul = Math.max(0.2, 1 - (s.power ?? 0.3));
            actor._speedMul = Math.min(actor._speedMul, mul);
        }

        // DoTs
        if (s.type === "poison" || s.type === "bleed" || s.type === "burn"){
            const dps = s.power ?? 5;
            const dmg = dps * dt;
            if (kind === "enemy") applyDamageEnemy(room, actor, dmg, { kind:"status", type:s.type });
            else applyDamagePlayer(room, actor, dmg, { kind:"status", type:s.type });
        }

        if (s.dur <= 0) list.splice(i,1);
    }
}


export function hasStatus(target, type) {
    return (target.statuses || []).some(s => s.type === type);
}
