// animationStudio.js
import { AnimationPreview } from './animationPreview.js';

const DEFAULT_EASING = 'sineInOut';
const TYPE_FIELDS = {
    rotate: ['axis','angle','duration','loop','easing','target'],
    translate: ['delta','duration','loop','easing','target'],
    scale: ['factor','duration','loop','easing','target'],
    colorShift: ['from','to','duration','loop','easing','target'],
    fadeIn: ['duration','easing','target'],
    fadeOut: ['duration','easing','target'],
    bounce: ['amplitude','duration','loop','easing','target'],
    pulse: ['factor','duration','loop','easing','target'],
    orbit: ['center','radius','axis','angle','duration','loop','easing','target']
};

function uid() { return Math.random().toString(36).slice(2,9); }

export class AnimationStudio {
    constructor(sceneMgr, containerSel = '#animationTab') {
        this.scene = sceneMgr;
        this.containerSel = containerSel;
        this.container = document.querySelector(containerSel);
        this.preview = new AnimationPreview(sceneMgr);
        this.state = {animations: {}};
        this.currentKey = null;

        if (!this.container) {
            // Wait for DOM availability and retry initialization once
            console.warn(`[AnimationStudio] Container ${containerSel} not yet in DOM — waiting...`);
            const observer = new MutationObserver((_, obs) => {
                const el = document.querySelector(containerSel);
                if (el) {
                    obs.disconnect();
                    this.container = el;
                    console.info('[AnimationStudio] Container found, initializing.');
                    this._initUI();
                }
            });
            observer.observe(document.body, {childList: true, subtree: true});
            return;
        }

        this._initUI();
    }
    _initUI() {
        // everything that used to be in the old constructor after "this.currentKey = null;"
        // i.e., DOM queries, event listeners, etc.
        this.$seqName = this.container.querySelector('#animSeqName');
        this.$seqList = this.container.querySelector('#animSequenceList');
        this.$seqTitle = this.container.querySelector('#animSeqTitle');
        this.$behList = this.container.querySelector('#animBehaviorList');
        this.$scrub = this.container.querySelector('#animScrub');
        this.$loopPrev = this.container.querySelector('#animLoopPreview');

        // existing binding and setup code continues here…
        this.container.querySelector('#btnNewAnimSeq').addEventListener('click', () => this.createSequence());
        this.container.querySelector('#btnRenameAnimSeq').addEventListener('click', () => this.renameSequence());
        this.container.querySelector('#btnDeleteAnimSeq').addEventListener('click', () => this.deleteSequence());
        this.container.querySelector('#btnAddBehavior').addEventListener('click', () => this.addBehavior());
        this.container.querySelector('#btnPlayAnim').addEventListener('click', () => this.playPreview());
        this.container.querySelector('#btnStopAnim').addEventListener('click', () => this.stopPreview());
        this.$scrub.addEventListener('input', (e) =>
            this.scrubPreview(parseFloat(e.target.value || '0') || 0)
        );
        this.container
            .querySelector('#animBehaviorType')
            .addEventListener('change', () => { /* no-op */ });

        // Refresh sequence list on scene changes (target dropdowns depend on names)
        this.scene.on('scene-changed', () => this.render());

        // Initial render
        this.render();
    }

    // --- Persistence API (called by ui.js) ---
    loadFromLocal(metaId) {
        try {
            const raw = localStorage.getItem(this._key(metaId));
            if (raw) this.state = JSON.parse(raw);
        } catch {}
        if (!this.state || !this.state.animations) this.state = { animations: {} };
        this.render();
    }

    saveToLocal(metaId) {
        try {
            localStorage.setItem(this._key(metaId), JSON.stringify(this.state));
        } catch {}
    }

    clearLocal(metaId) {
        localStorage.removeItem(this._key(metaId));
        this.state = { animations: {} };
        this.currentKey = null;
        this.render();
    }

    _key(metaId) {
        return `prefab-editor:animations:${metaId || 'untitled'}`;
    }

    // --- Public export API ---
    getData() {
        return JSON.parse(JSON.stringify(this.state));
    }

    // --- Sequences ---
    createSequence() {
        const name = (this.$seqName.value || 'idle').trim();
        if (!name) return;
        if (!this.state.animations[name]) this.state.animations[name] = [];
        this.currentKey = name;
        this.render();
    }
    renameSequence() {
        const oldKey = this.currentKey;
        if (!oldKey) return;
        const name = (this.$seqName.value || '').trim();
        if (!name || name === oldKey) return;
        if (this.state.animations[name]) { alert('A sequence with that name already exists.'); return; }
        this.state.animations[name] = this.state.animations[oldKey];
        delete this.state.animations[oldKey];
        this.currentKey = name;
        this.render();
    }
    deleteSequence() {
        const key = this.currentKey;
        if (!key) return;
        delete this.state.animations[key];
        this.currentKey = Object.keys(this.state.animations)[0] || null;
        this.render();
    }

    // --- Behaviors ---
    addBehavior() {
        const key = this.currentKey || (Object.keys(this.state.animations)[0] || 'idle');
        if (!this.state.animations[key]) this.state.animations[key] = [];
        this.currentKey = key;

        const type = this.container.querySelector('#animBehaviorType').value || 'rotate';
        const def = this._defaultBehavior(type);
        this.state.animations[key].push(def);
        this.render();
    }

    _defaultBehavior(type) {
        const firstMeshName = this._allEditableObjects()[0]?.name || 'mesh';
        switch (type) {
            case 'rotate': return { id:uid(), target:firstMeshName, type, axis:'y', angle:90, duration:2, loop:true, easing:DEFAULT_EASING };
            case 'translate': return { id:uid(), target:firstMeshName, type, delta:[0,0.5,0], duration:2, loop:true, easing:DEFAULT_EASING };
            case 'scale': return { id:uid(), target:firstMeshName, type, factor:1.2, duration:1.5, loop:true, easing:DEFAULT_EASING };
            case 'colorShift': return { id:uid(), target:firstMeshName, type, from:'#66ccff', to:'#88e0ff', duration:2, loop:true, easing:DEFAULT_EASING };
            case 'fadeIn': return { id:uid(), target:firstMeshName, type, duration:0.6, easing:'linear' };
            case 'fadeOut': return { id:uid(), target:firstMeshName, type, duration:0.6, easing:'linear' };
            case 'bounce': return { id:uid(), target:firstMeshName, type, amplitude:0.2, duration:1, loop:true, easing:DEFAULT_EASING };
            case 'pulse': return { id:uid(), target:firstMeshName, type, factor:1.2, duration:1, loop:true, easing:DEFAULT_EASING };
            case 'orbit': return { id:uid(), target:firstMeshName, type, center:[0,1,0], radius:1, axis:'y', angle:360, duration:3, loop:true, easing:'linear' };
        }
        return { id:uid(), target:firstMeshName, type:'rotate', axis:'y', angle:90, duration:2, loop:true, easing:DEFAULT_EASING };
    }

    removeBehavior(key, id) {
        const list = this.state.animations[key] || [];
        this.state.animations[key] = list.filter(b => b.id !== id);
        this.render();
    }

    // --- Preview ---
    playPreview() {
        if (!this.currentKey) this.currentKey = Object.keys(this.state.animations)[0] || null;
        if (!this.currentKey) return;
        this.preview.play(this.state.animations, this.currentKey, this.$loopPrev.checked);
    }
    stopPreview() { this.preview.stop(); }
    scrubPreview(t) {
        if (!this.currentKey) return;
        this.preview.scrub(this.state.animations, this.currentKey, t);
    }

    // --- Render UI ---
    render() {
        const keys = Object.keys(this.state.animations);
        const selectedKey = (this.currentKey && keys.includes(this.currentKey)) ? this.currentKey : (keys[0] || null);
        this.currentKey = selectedKey;

        // Sequence list
        this.$seqList.innerHTML = '';
        keys.forEach(k => {
            const li = document.createElement('li');
            li.textContent = k;
            li.dataset.selected = (k === this.currentKey);
            li.addEventListener('click', () => { this.currentKey = k; this.$seqName.value = k; this.render(); });
            this.$seqList.appendChild(li);
        });

        this.$seqName.value = this.currentKey || '';
        this.$seqTitle.textContent = this.currentKey || '(none)';

        // Behaviors list
        this.$behList.innerHTML = '';
        const list = this.currentKey ? (this.state.animations[this.currentKey] || []) : [];
        list.forEach(b => this.$behList.appendChild(this._makeBehaviorRow(this.currentKey, b)));
    }

    _makeBehaviorRow(key, beh) {
        const row = document.createElement('div');
        row.className = 'beh-row';
        const targets = this._allEditableObjects().map(o => o.name).filter(Boolean);

        const addField = (label, inputs) => {
            const wrap = document.createElement('div'); wrap.className = 'field';
            const lab = document.createElement('label'); lab.textContent = label; wrap.appendChild(lab);
            if (Array.isArray(inputs)) inputs.forEach(i => wrap.appendChild(i));
            else wrap.appendChild(inputs);
            row.appendChild(wrap);
            return wrap;
        };

        // Target
        const selTarget = document.createElement('select');
        targets.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n; opt.text = n; selTarget.appendChild(opt);
        });
        const optAll = document.createElement('option'); optAll.value = 'all'; optAll.text = '(all)'; selTarget.appendChild(optAll);
        selTarget.value = beh.target || targets[0] || 'all';
        selTarget.addEventListener('change', () => { beh.target = selTarget.value; this._persistImmediate(); });
        addField('Target', selTarget);

        // Type
        const selType = document.createElement('select');
        Object.keys(TYPE_FIELDS).forEach(t => {
            const opt = document.createElement('option'); opt.value = t; opt.text = t; selType.appendChild(opt);
        });
        selType.value = beh.type;
        selType.addEventListener('change', () => { beh.type = selType.value; this.render(); this._persistImmediate(); });
        addField('Type', selType);

        // Dynamic fields
        const fields = TYPE_FIELDS[beh.type] || [];
        const controls = {};

        const num = (step='0.01') => { const i = document.createElement('input'); i.type='number'; i.step=step; return i; };

        // axis / angle / factor / delta / center / radius / duration / loop / easing / colors
        if (fields.includes('axis')) {
            const s = document.createElement('select'); ['x','y','z'].forEach(a=>{ const o=document.createElement('option'); o.value=a; o.text=a; s.appendChild(o); });
            s.value = beh.axis || 'y'; s.addEventListener('change',()=>{ beh.axis=s.value; this._persistImmediate(); });
            controls.axis = addField('Axis', s);
        }
        if (fields.includes('angle')) {
            const i = num('1'); i.value = beh.angle ?? 90; i.addEventListener('change',()=>{ beh.angle=parseFloat(i.value)||0; this._persistImmediate(); });
            controls.angle = addField('Angle°', i);
        }
        if (fields.includes('factor')) {
            const i = num('0.01'); i.value = beh.factor ?? 1.2; i.addEventListener('change',()=>{ beh.factor=parseFloat(i.value)||1; this._persistImmediate(); });
            controls.factor = addField('Factor', i);
        }
        if (fields.includes('delta')) {
            const ix=num(),iy=num(),iz=num(); const d=beh.delta||[0,0,0];
            ix.value=d[0]; iy.value=d[1]; iz.value=d[2];
            [ix,iy,iz].forEach((inp, idx)=>inp.addEventListener('change',()=>{ d[idx]=parseFloat(inp.value)||0; beh.delta=d; this._persistImmediate(); }));
            controls.delta = addField('Delta', [ix,iy,iz]);
        }
        if (fields.includes('center')) {
            const ix=num(),iy=num(),iz=num(); const c=beh.center||[0,0,0];
            ix.value=c[0]; iy.value=c[1]; iz.value=c[2];
            [ix,iy,iz].forEach((inp, idx)=>inp.addEventListener('change',()=>{ c[idx]=parseFloat(inp.value)||0; beh.center=c; this._persistImmediate(); }));
            controls.center = addField('Center', [ix,iy,iz]);
        }
        if (fields.includes('radius')) {
            const i=num(); i.value=beh.radius ?? 1; i.addEventListener('change',()=>{ beh.radius=parseFloat(i.value)||1; this._persistImmediate(); });
            controls.radius = addField('Radius', i);
        }
        if (fields.includes('from')) {
            const c = document.createElement('input'); c.type='color'; c.value = rgbToHex(beh.from || '#66ccff');
            c.addEventListener('change',()=>{ beh.from=c.value; this._persistImmediate(); });
            controls.from = addField('From', c);
        }
        if (fields.includes('to')) {
            const c = document.createElement('input'); c.type='color'; c.value = rgbToHex(beh.to || '#88e0ff');
            c.addEventListener('change',()=>{ beh.to=c.value; this._persistImmediate(); });
            controls.to = addField('To', c);
        }

        if (fields.includes('duration')) {
            const i=num('0.01'); i.value = beh.duration ?? 1; i.addEventListener('change',()=>{ beh.duration=parseFloat(i.value)||1; this._persistImmediate(); });
            controls.duration = addField('Duration (s)', i);
        }
        if (fields.includes('loop')) {
            const chk = document.createElement('input'); chk.type='checkbox'; chk.checked = !!beh.loop;
            chk.addEventListener('change',()=>{ beh.loop = chk.checked; this._persistImmediate(); });
            controls.loop = addField('Loop', chk);
        }
        if (fields.includes('easing')) {
            const s=document.createElement('select');
            ['linear','sineInOut','easeInOutCubic','elasticOut','bounceOut'].forEach(ez=>{ const o=document.createElement('option'); o.value=ez; o.text=ez; s.appendChild(o); });
            s.value = beh.easing || DEFAULT_EASING;
            s.addEventListener('change',()=>{ beh.easing = s.value; this._persistImmediate(); });
            controls.easing = addField('Easing', s);
        }

        // row actions
        const act = document.createElement('div');
        act.className = 'beh-actions';
        const btnPrev = document.createElement('button'); btnPrev.textContent='Preview'; btnPrev.addEventListener('click',()=>this._previewOne(key, beh));
        const btnDel = document.createElement('button'); btnDel.textContent='Delete'; btnDel.addEventListener('click',()=>this.removeBehavior(key, beh.id));
        act.appendChild(btnPrev); act.appendChild(btnDel);
        row.appendChild(act);

        return row;
    }

    _previewOne(key, beh) {
        // Play just this behavior as a temporary "single-sequence"
        this.preview.stop();
        const tmp = {}; tmp[key] = [beh];
        this.preview.play(tmp, key, false);
    }

    _persistImmediate() {
        // The outer UI (ui.js) will call saveToLocal() with prefab ID on autosave/export.
        // Here we only update the live state and UI.
    }

    _allEditableObjects() {
        const arr = [];
        this.scene.root.traverse(n => {
            if (n.userData?.editable) arr.push(n);
        });
        return arr;
    }
}

function rgbToHex(c) {
    if (!c || c[0] === '#') return c || '#ffffff';
    // Expect "rgb(...)" or other — keep simple
    try { return '#'+(new Option().style.color = c); } catch { return '#ffffff'; }
}
