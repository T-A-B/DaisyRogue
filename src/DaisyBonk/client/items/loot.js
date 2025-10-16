import * as THREE from 'three';
import { QUALITY, QUALITY_LIST } from '../data/constants.js';

export const ITEM_ROLLS = [
    { key:'Max Health',  apply:(p,q)=>{ const v=Math.round(10*q.mult); p.stats.maxHealth+=v; p.health+=v; return `+${v} Max Health`; } },
    { key:'Health Regen',apply:(p,q)=>{ const v=+(0.005*q.mult).toFixed(3); p.stats.healthRegen+=v; return `+${v}/s Health Regen`; } },
    { key:'Max Mana',    apply:(p,q)=>{ const v=Math.round(12*q.mult); p.stats.maxMana+=v; p.mana+=v; return `+${v} Max Mana`; } },
    { key:'Mana Regen',  apply:(p,q)=>{ const v=+(0.03*q.mult).toFixed(3); p.stats.manaRegen+=v; return `+${v}/s Mana Regen`; } },
    { key:'Max Shield',  apply:(p,q)=>{ const v=Math.round(8*q.mult); p.stats.maxShield+=v; p.shield+=v; return `+${v} Max Shield`; } },
    { key:'Move Speed',  apply:(p,q)=>{ const v=+(0.15*q.mult).toFixed(2); p.stats.moveSpeed+=v; return `+${v} Move Speed`; } },
    { key:'Damage Mult', apply:(p,q)=>{ const v=+(0.08*q.mult).toFixed(2); p.stats.damageMult+=v; return `+${v} Damage Mult`; } },
    { key:'Attack Speed',apply:(p,q)=>{ const v=+(0.12*q.mult).toFixed(2); p.stats.attackSpeed+=v; return `+${v} Attack Speed`; } },
    { key:'Proj. Quantity',apply:(p,q)=>{ const v=Math.random() < Math.min(.6, .2*q.mult) ? 2 : 1; p.stats.projectileQty += v; return `+${v} Projectile`; } },
    { key:'Crit Chance', apply:(p,q)=>{ const v=+(0.03*q.mult).toFixed(2); p.stats.critChance+=v; return `+${(v*100).toFixed(0)}% Crit`; } },
    { key:'Armor',       apply:(p,q)=>{ const v=Math.round(8*q.mult); p.stats.armor+=v; return `+${v} Armor`; } },
    { key:'Dodge',       apply:(p,q)=>{ const v=+(0.02*q.mult).toFixed(2); p.stats.dodge+=v; return `+${(v*100).toFixed(0)}% Dodge`; } },
];

export function weightedQuality(){
    const total = QUALITY_LIST.reduce((a,q)=>a+q.weight,0);
    let r = Math.random() * total;
    for(const q of QUALITY_LIST){
        if (r < q.weight) return q;
        r -= q.weight;
    }
    return QUALITY.WHITE;
}

export function randomItem(){
    const q = weightedQuality();
    const roll = ITEM_ROLLS[Math.floor(Math.random()*ITEM_ROLLS.length)];
    return {
        name: roll.key,
        quality: q,
        apply(player){
            const text = roll.apply(player, q);
            return { text, q };
        },
        describe(){ return this.name; }
    };
}
