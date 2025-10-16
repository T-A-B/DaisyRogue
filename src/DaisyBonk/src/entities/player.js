import * as THREE from 'three';
import { Entity } from './entity.js';
import { BASE_STATS } from '../data/constants.js';
import { applyArmor } from '../utils/combat.js';
import { now } from '../utils/math.js';

export class Player extends Entity {
    constructor(mesh) {
        super(mesh);
        this.stats = structuredClone(BASE_STATS);
        this.health = this.stats.maxHealth;
        this.mana = this.stats.maxMana;
        this.shield = this.stats.maxShield;
        this.invulnUntil = 0;
        this.damageTakenAt = -999;
        this.weapons = [];
        this.activeIndex = 0;
        this.lastShot = 0;
        this.projectileColor = new THREE.Color('#a8c6ff');
        this.pickupRadius = 2.0;
    }
    get activeWeapon(){ return this.weapons[this.activeIndex] ?? null; }

    takeDamage(amount){
        if (now() < this.invulnUntil) return 0;
        let dmg = amount;
        if (this.shield > 0){
            const s = Math.min(this.shield, dmg);
            this.shield -= s; dmg -= s;
        }
        if (dmg > 0){
            dmg = applyArmor(dmg, this.stats.armor);
            this.health -= dmg;
            this.damageTakenAt = now();
        }
        if (this.health <= 0){ this.health = 0; }
        this.invulnUntil = now() + 0.2;
        return amount;
    }
}
