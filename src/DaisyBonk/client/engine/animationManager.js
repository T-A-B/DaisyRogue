// src/engine/AnimationManager.js
import * as THREE from 'three';

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

export class AnimationManager {
    constructor(rootGroup) {
        this.root = rootGroup;
        this.map = rootGroup?.userData?.animations || {};
        this.playing = [];
        this._originals = new Map();
    }

    play(name) {
        const seq = this.map[name];
        if (!seq || !seq.length) return;
        // capture originals for all involved targets
        this._originals.clear();
        for (const a of seq) {
            const obj = (a.target === 'all') ? this.root : this.root.getObjectByName(a.target);
            if (!obj) continue;
            if (a.target === 'all') obj.traverse(o => this._cacheOriginal(o));
            else this._cacheOriginal(obj);
        }
        const clip = { name, seq, t: 0, dur: maxDuration(seq), loop: hasAnyLoop(seq) };
        this.playing.push(clip);
    }

    stop(name) {
        this.playing = this.playing.filter(c => c.name !== name);
        this._restoreAll();
    }

    stopAll() {
        this.playing = [];
        this._restoreAll();
    }

    update(dt) {
        if (!this.playing.length) return;
        for (const clip of this.playing) {
            clip.t += dt;
            const p = clip.t / clip.dur;
            if (p >= 1) {
                if (clip.loop) clip.t = 0;
                else { this.stop(clip.name); continue; }
            }
            this._apply(clip.seq, clamp01(p));
        }
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

    _apply(seq, t) {
        for (const a of seq) {
            const target = (a.target === 'all') ? this.root : this.root.getObjectByName(a.target);
            if (!target) continue;
            const e = EASING[a.easing || 'linear'](t);
            switch (a.type) {
                case 'rotate': {
                    const rad = THREE.MathUtils.degToRad(a.angle || 0) * e;
                    (target.rotation[a.axis || 'y']) = rad;
                    break;
                }
                case 'scale': {
                    const f = 1 + ((a.factor || 1) - 1) * e;
                    target.scale.setScalar(f);
                    break;
                }
                case 'translate': {
                    const d = a.delta || [0,0,0];
                    const base = this._originals.get(target)?.pos || new THREE.Vector3();
                    target.position.set(base.x + d[0]*e, base.y + d[1]*e, base.z + d[2]*e);
                    break;
                }
                case 'colorShift': {
                    target.traverse(o => {
                        const mat = o.material;
                        if (!mat?.color) return;
                        const c1 = new THREE.Color(a.from || '#ffffff');
                        const c2 = new THREE.Color(a.to || '#ffffff');
                        mat.color.lerpColors(c1, c2, e);
                        mat.needsUpdate = true;
                    });
                    break;
                }
                case 'fadeIn':
                case 'fadeOut': {
                    target.traverse(o => {
                        const mat = o.material;
                        if (!mat) return;
                        mat.transparent = true;
                        mat.opacity = (a.type === 'fadeIn') ? e : (1 - e);
                        mat.needsUpdate = true;
                    });
                    break;
                }
                case 'bounce': {
                    const amp = a.amplitude || 0.2;
                    const off = Math.sin(e * Math.PI * 2) * amp;
                    const base = this._originals.get(target)?.pos || new THREE.Vector3();
                    target.position.set(base.x, base.y + off, base.z);
                    break;
                }
                case 'pulse': {
                    const factor = a.factor || 1.2;
                    const s = 1 + (factor - 1) * Math.sin(e * Math.PI * 2);
                    target.scale.setScalar(s);
                    break;
                }
                case 'orbit': {
                    const center = new THREE.Vector3(...(a.center || [0,0,0]));
                    const radius = a.radius || 1;
                    const axis = a.axis || 'y';
                    const angle = THREE.MathUtils.degToRad(a.angle || 360) * e;
                    const pos = new THREE.Vector3().copy(center);
                    if (axis === 'y') pos.add(new THREE.Vector3(Math.cos(angle)*radius, 0, Math.sin(angle)*radius));
                    if (axis === 'x') pos.add(new THREE.Vector3(0, Math.cos(angle)*radius, Math.sin(angle)*radius));
                    if (axis === 'z') pos.add(new THREE.Vector3(Math.cos(angle)*radius, Math.sin(angle)*radius, 0));
                    target.position.copy(pos);
                    break;
                }
            }
        }
    }
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function maxDuration(seq){ return Math.max(...seq.map(a => (a.duration || 1))); }
function hasAnyLoop(seq){ return !!seq.find(a => a.loop); }
