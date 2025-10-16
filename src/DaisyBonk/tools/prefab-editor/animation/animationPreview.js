// animationPreview.js
import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

const EASING = {
    linear: t => t,
    sineInOut: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
    easeInOutCubic: t => t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2,
    elasticOut: t => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    bounceOut: t => {
        const n1=7.5625, d1=2.75;
        if (t < 1/d1) return n1*t*t;
        else if (t < 2/d1) return n1*(t-=1.5/d1)*t + .75;
        else if (t < 2.5/d1) return n1*(t-=2.25/d1)*t + .9375;
        else return n1*(t-=2.625/d1)*t + .984375;
    },
};

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

export class AnimationPreview {
    constructor(sceneMgr) {
        this.sceneMgr = sceneMgr;
        this._active = null; // { name, start, duration, loop, raf, handles[] }
        this._originals = new Map(); // object -> {pos, rot, scl, color, opacity}
    }

    stop() {
        if (this._active?.raf) cancelAnimationFrame(this._active.raf);
        this._restoreAll();
        this._active = null;
    }

    play(animationsMap, key, loop = true) {
        this.stop();
        const seq = animationsMap?.[key];
        if (!seq || !seq.length) return;

        // Cache originals
        this._originals.clear();
        const objects = new Set();
        for (const a of seq) {
            const obj = (a.target === 'all')
                ? this.sceneMgr.root
                : this.sceneMgr.root.getObjectByName(a.target);
            if (obj) {
                if (a.target === 'all') obj.traverse(o => this._cacheOriginal(o));
                else this._cacheOriginal(obj);
                objects.add(obj);
            }
        }

        const start = performance.now();
        const duration = Math.max(...seq.map(a => (a.duration || 1))) * 1000;
        const state = { name:key, start, duration, loop, seq, last: start };
        const loopFn = (ts) => {
            const tms = ts - state.start;
            let t = tms / state.duration;
            if (t >= 1) {
                if (state.loop) {
                    state.start = ts;
                    t = 0;
                    this._restoreAll();
                } else {
                    this.stop();
                    return;
                }
            }
            this._apply(seq, t);
            state.raf = requestAnimationFrame(loopFn);
        };
        state.raf = requestAnimationFrame(loopFn);
        this._active = state;
    }

    scrub(animationsMap, key, normalizedT) {
        this.stop();
        const seq = animationsMap?.[key];
        if (!seq || !seq.length) return;
        this._originals.clear();
        seq.forEach(a => {
            const obj = (a.target === 'all') ? this.sceneMgr.root : this.sceneMgr.root.getObjectByName(a.target);
            if (obj) {
                if (a.target === 'all') obj.traverse(o => this._cacheOriginal(o));
                else this._cacheOriginal(obj);
            }
        });
        this._apply(seq, clamp01(normalizedT));
    }

    _cacheOriginal(obj) {
        if (this._originals.has(obj)) return;
        const base = {
            pos: obj.position.clone(),
            rot: obj.rotation.clone(),
            scl: obj.scale.clone(),
        };
        if (obj.material?.color) {
            base.color = obj.material.color.clone();
            base.opacity = ('opacity' in obj.material) ? obj.material.opacity : 1;
            base.transparent = !!obj.material.transparent;
        }
        this._originals.set(obj, base);
    }

    _restoreAll() {
        for (const [obj, base] of this._originals) {
            obj.position.copy(base.pos);
            obj.rotation.copy(base.rot);
            obj.scale.copy(base.scl);
            if (obj.material?.color) {
                obj.material.color.copy(base.color || new THREE.Color(1,1,1));
                if ('opacity' in obj.material) obj.material.opacity = (base.opacity ?? 1);
                if ('transparent' in obj.material) obj.material.transparent = !!base.transparent;
                obj.material.needsUpdate = true;
            }
        }
        this._originals.clear();
    }

    _apply(seq, tNorm) {
        for (const a of seq) {
            const target = (a.target === 'all') ? this.sceneMgr.root : this.sceneMgr.root.getObjectByName(a.target);
            if (!target) continue;
            const p = EASING[a.easing || 'linear'](clamp01(tNorm));
            switch (a.type) {
                case 'rotate':
                    this._applyRotate(target, a, p); break;
                case 'scale':
                    this._applyScale(target, a, p); break;
                case 'translate':
                    this._applyTranslate(target, a, p); break;
                case 'colorShift':
                    this._applyColorShift(target, a, p); break;
                case 'fadeIn':
                case 'fadeOut':
                    this._applyFade(target, a, p); break;
                case 'bounce':
                    this._applyBounce(target, a, p); break;
                case 'pulse':
                    this._applyPulse(target, a, p); break;
                case 'orbit':
                    this._applyOrbit(target, a, p); break;
            }
        }
    }

    _applyRotate(target, a, p) {
        const rad = THREE.MathUtils.degToRad(a.angle || 0) * p;
        (target.rotation[a.axis || 'y']) = rad;
    }

    _applyScale(target, a, p) {
        const f = 1 + ((a.factor || 1) - 1) * p;
        target.scale.setScalar(f);
    }

    _applyTranslate(target, a, p) {
        const d = a.delta || [0,0,0];
        target.position.set(
            (this._originals.get(target)?.pos.x || 0) + d[0]*p,
            (this._originals.get(target)?.pos.y || 0) + d[1]*p,
            (this._originals.get(target)?.pos.z || 0) + d[2]*p,
        );
    }

    _applyColorShift(target, a, p) {
        target.traverse(o => {
            const mat = o.material;
            if (!mat?.color) return;
            const c1 = new THREE.Color(a.from || '#ffffff');
            const c2 = new THREE.Color(a.to || '#ffffff');
            mat.color.lerpColors(c1, c2, p);
            mat.needsUpdate = true;
        });
    }

    _applyFade(target, a, p) {
        target.traverse(o => {
            const mat = o.material;
            if (!mat) return;
            mat.transparent = true;
            mat.opacity = (a.type === 'fadeIn') ? p : (1 - p);
            mat.needsUpdate = true;
        });
    }

    _applyBounce(target, a, p) {
        const amp = a.amplitude || 0.2;
        const off = Math.sin(p * Math.PI * 2) * amp;
        const base = this._originals.get(target)?.pos || new THREE.Vector3();
        target.position.set(base.x, base.y + off, base.z);
    }

    _applyPulse(target, a, p) {
        const factor = a.factor || 1.2;
        const s = 1 + (factor - 1) * Math.sin(p * Math.PI * 2);
        target.scale.setScalar(s);
    }

    _applyOrbit(target, a, p) {
        const center = new THREE.Vector3(...(a.center || [0,0,0]));
        const radius = a.radius || 1;
        const axis = a.axis || 'y';
        const angle = THREE.MathUtils.degToRad(a.angle || 360) * p;
        const pos = new THREE.Vector3().copy(center);
        if (axis === 'y') pos.add(new THREE.Vector3(Math.cos(angle)*radius, 0, Math.sin(angle)*radius));
        if (axis === 'x') pos.add(new THREE.Vector3(0, Math.cos(angle)*radius, Math.sin(angle)*radius));
        if (axis === 'z') pos.add(new THREE.Vector3(Math.cos(angle)*radius, Math.sin(angle)*radius, 0));
        target.position.copy(pos);
    }
}
