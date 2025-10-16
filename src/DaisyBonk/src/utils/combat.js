export function critApplied(base, critChance) {
    if (Math.random() < critChance) return { dmg: base * 2.0, crit: true };
    return { dmg: base, crit: false };
}

export function applyArmor(dmg, armor) {
    // Smooth DR: dmg * (100 / (100 + armor))
    return dmg * (100 / (100 + Math.max(0, armor)));
}
