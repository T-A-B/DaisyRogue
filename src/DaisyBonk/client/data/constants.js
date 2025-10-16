export const QUALITY = {
    WHITE:   { key: 'white',   color: '#e5ebff', mult: 1.00, weight: 36 },
    GREEN:   { key: 'green',   color: '#64f094', mult: 1.10, weight: 28 },
    BLUE:    { key: 'blue',    color: '#64a7f0', mult: 1.20, weight: 18 },
    PURPLE:  { key: 'purple',  color: '#b07cff', mult: 1.35, weight: 10 },
    YELLOW:  { key: 'yellow',  color: '#ffd84d', mult: 1.55, weight: 5 },
    CYAN:    { key: 'cyan',    color: '#58f1f9', mult: 1.75, weight: 2.5 },
    RAINBOW: { key: 'rainbow', color: '#ffffff', mult: 2.10, weight: 0.9 },
};
export const QUALITY_LIST = Object.values(QUALITY);

export const BASE_STATS = {
    maxHealth: 120,
    healthRegen: 0.01,  // /s
    maxMana: 100,
    manaRegen: 0.10,    // /s
    maxShield: 25,
    moveSpeed: 6.0,
    damageMult: 1.00,
    attackSpeed: 1.00,
    projectileQty: 1,
    critChance: 0.05,
    armor: 0,
    dodge: 0.00,
};
