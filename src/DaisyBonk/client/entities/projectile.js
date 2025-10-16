import { Entity } from './entity.js';

export class Projectile extends Entity {
    constructor(mesh, opts) {
        super(mesh);
        this.vel = opts.vel.clone();
        this.ttl = opts.ttl ?? 3.0;
        this.damage = opts.damage ?? 10;
        this.from = opts.from || 'player';
        this.radius = opts.radius ?? 0.2;
        this.hitFn = opts.hitFn || null;
        this.pierce = opts.pierce ?? 0;
        this.alive = true;
    }
}
