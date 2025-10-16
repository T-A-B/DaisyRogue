export class Weapon {
    constructor(name, type, opts){
        this.name = name; this.type = type;
        this.cooldown = opts.cooldown ?? 0.5;
        this.manaCost = opts.manaCost ?? 0;
        this.baseDamage = opts.baseDamage ?? 10;
        this.color = opts.color;
        this.icon = opts.icon ?? type;
        this.fireFn = opts.fireFn; // (game, player, dir, self) => void
        this.continuous = !!opts.continuous;
        this.tickEvery = opts.tickEvery ?? 0.1;
        this.lastFired = 0;
    }
    canFire(player){
        const as = player.stats.attackSpeed;
        return (performance.now()/1000 - this.lastFired) >= (this.cooldown / Math.max(0.1, as));
    }
    spendMana(player, shots=1){
        const cost = this.manaCost * shots;
        if (player.mana >= cost){ player.mana -= cost; return true; }
        return this.manaCost === 0;
    }
    fire(game, player, dir){
        if (!this.canFire(player)) return false;
        if (!this.spendMana(player)) return false;
        this.lastFired = performance.now()/1000;
        this.fireFn(game, player, dir, this);
        return true;
    }
}
