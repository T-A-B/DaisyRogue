import * as THREE from 'three';
import { Entity } from './entity.js';
import { now } from '../utils/math.js';

export class Enemy extends Entity {
    constructor(mesh, opts = {}) {
        super(mesh);
        this.type = opts.type || 'cube';
        this.hp = opts.hp || 50;
        this.maxHp = this.hp;
        this.speed = opts.speed || 2.5;
        this.touchDamage = opts.touchDamage || 8;
        this.shooter = !!opts.shooter;
        this.lastShot = 0;
        this.tint = new THREE.Color().setHSL(Math.random(), 0.3, 0.55);
        this.status = { slowUntil:0, burnUntil:0, burnDps:0 };
        this.radius = opts.radius ?? 0.9;
        this.isBoss = !!opts.isBoss;
        this.dropBias = opts.dropBias || 1.0;
        this.target = null;
    }
    effectiveSpeed(){
        let m = 1.0;
        if (now() < this.status.slowUntil) m *= 0.5;
        return this.speed * m;
    }
}
