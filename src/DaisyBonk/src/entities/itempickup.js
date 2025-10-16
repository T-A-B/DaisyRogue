import { Entity } from './entity.js';
import { now } from '../utils/math.js';

export class ItemPickup extends Entity {
    constructor(mesh, item) {
        super(mesh);
        this.item = item; // { name, quality, apply(player), describe() }
        this.radius = 1.0;
        this.spawnAt = now();
    }
}
