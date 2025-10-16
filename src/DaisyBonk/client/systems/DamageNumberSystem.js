// src/systems/DamageNumberSystem.js
// Lightweight DOM overlay for floating damage numbers
import * as THREE from 'three';

export class DamageNumberSystem {
    constructor(camera) {
        this.camera = camera;
        this._list = []; // { el, ttl, max, world:THREE.Vector3 }
        this.container = document.createElement('div');
        this.container.id = 'damageLayer';
        Object.assign(this.container.style, {
            position: 'fixed',
            left: '0', top: '0',
            width: '100%', height: '100%',
            pointerEvents: 'none',
            overflow: 'hidden',
            zIndex: 300
        });
        document.body.appendChild(this.container);
    }

    spawn(worldPos, value, color = '#ffb24d') {
        const el = document.createElement('div');
        el.className = 'damage-number';
        el.textContent = value;
        Object.assign(el.style, {
            position: 'absolute',
            fontFamily: 'monospace',
            fontWeight: '700',
            color,
            textShadow: '0 0 4px rgba(0,0,0,0.6)',
            fontSize: '18px',
            opacity: '1',
            transform: 'translate(-50%, -50%)',
            transition: 'transform 1s ease-out, opacity 1s ease-out'
        });
        this.container.appendChild(el);
        const v = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
        this._list.push({ el, world: v, ttl: 1.0, max: 1.0 });
    }

    update(dt, renderer, scene) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const proj = new THREE.Vector3();
        for (let i = this._list.length - 1; i >= 0; i--) {
            const d = this._list[i];
            d.ttl -= dt;
            if (d.ttl <= 0) {
                d.el.remove();
                this._list.splice(i, 1);
                continue;
            }
            proj.copy(d.world).project(this.camera);
            const sx = (proj.x *  0.5 + 0.5) * width;
            const sy = (-proj.y * 0.5 + 0.5) * height;
            d.el.style.left = `${sx}px`;
            d.el.style.top  = `${sy - 20 * (1 - d.ttl/d.max)}px`;
            d.el.style.opacity = (d.ttl / d.max).toFixed(2);
        }
    }
}
