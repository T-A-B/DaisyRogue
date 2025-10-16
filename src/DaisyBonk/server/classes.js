// server/classes.js — class registry
import { initPlayerWeapons } from "./weapons.js";

export const CLASSES = {
    soldier: {
        name: "Soldier",
        desc: "Balanced fighter with solid regen and armor.",
        stats: {
            moveSpeed: 6.0,
            maxHealth: 120,
            maxMana: 80,
            maxShield: 25,
            healthRegen: 0.02,
            manaRegen: 0.1,
            damageMult: 1.0,
            attackSpeed: 1.0,
            projectileQty: 1,
            critChance: 0.05,
            armor: 5,
            dodge: 0.02
        },
        passive: null,
        weapons: initPlayerWeapons(), // standard loadout
        items: []
    },
    assassin: {
        name: "Assassin",
        desc: "Fast and deadly — high crits, low sustain.",
        stats: {
            moveSpeed: 7.5,
            maxHealth: 80,
            maxMana: 60,
            maxShield: 15,
            healthRegen: 0.01,
            manaRegen: 0.15,
            damageMult: 1.4,
            attackSpeed: 1.2,
            projectileQty: 1,
            critChance: 0.25,
            armor: 2,
            dodge: 0.15
        },
        passive: { type: "rage", power: 1.15 }, // could increase dmg when low HP
        weapons: [{ id:"blaster", cd:0 }, { id:"shotgun", cd:0 }],
        items: []
    },
    mage: {
        name: "Mage",
        desc: "Ranged caster using fire magic and rapid mana regen.",
        stats: {
            moveSpeed: 5.2,
            maxHealth: 90,
            maxMana: 150,
            maxShield: 15,
            healthRegen: 0.01,
            manaRegen: 0.25,
            damageMult: 1.1,
            attackSpeed: 0.9,
            projectileQty: 1,
            critChance: 0.05,
            armor: 1,
            dodge: 0.05
        },
        passive: { type:"mana_shield", ratio:0.3 },
        weapons: [{ id:"firestaff", cd:0 }],
        items: [{ id:"ignite" }]
    }
};

/** Return a safe clone of a class definition. */
export function getClassDef(id){
    const c = CLASSES[id] || CLASSES.soldier;
    return JSON.parse(JSON.stringify(c)); // deep clone
}
