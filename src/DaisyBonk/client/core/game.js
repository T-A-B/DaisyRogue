// src/core/Game.js — keyboard movement + enemy flavors + portal + rewards + FX events
import * as THREE from 'three';
import { clamp, now } from '../utils/math.js';
import { Player } from '../entities/player.js';
import { makeVoxelGround, makePortal, makePlayerMesh,
    makePawnMesh, makeWizardMesh, makeKnightMesh,
    makeRangedPawnMesh, makeSummonerMesh, makeBeastmasterMesh, makeBeastPetMesh
} from '../prefabs/index.js';
import { FXSystem } from '../systems/fxsystem.js';
import { UISystem } from '../systems/uisystem.js';
import { InputSystem } from '../systems/inputsystem.js';
import {DamageNumberSystem} from "../systems/DamageNumberSystem.js";

const TURN_SPEED = 3.0;
const RENDER_DELAY = 0.11;
const SEND_HZ = 30;

export class Game {
    constructor(canvas){
        this.canvas = canvas;
        this.kills = 0;
        this.stage = 1;

        // ---- Renderer / Scene / Camera ----
        this.renderer = new THREE.WebGLRenderer({ antialias:true, canvas, powerPreference:'high-performance' });
        this.renderer.setSize(innerWidth, innerHeight);
        this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
        this.renderer.shadowMap.enabled = true;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d0f13);
        this.camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 200);
        this.camera.position.set(0, 18, 18);
        addEventListener('resize', ()=>this.onResize());

        const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x0d111a, 0.35);
        const dir = new THREE.DirectionalLight(0xffffff, 0.85);
        dir.position.set(12, 18, 10);
        dir.castShadow = true;
        this.scene.add(hemi, dir);

        // ---- Ground & Player ----
        this.ground = makeVoxelGround(48, 0.6);
        this.scene.add(this.ground);

        this.player = new Player(makePlayerMesh());
        this.player.mesh.position.y = 0.6;
        this.scene.add(this.player.mesh);
        this.updateNameTag(this.player.mesh, this.player.name || 'Me');


        // Visor
        const visorGeo = new THREE.ConeGeometry(0.18, 0.5, 24);
        const visorMat = new THREE.MeshStandardMaterial({ color:0x7a7cff, emissive:0x2a2a66, emissiveIntensity:1.1 });
        this.visor = new THREE.Mesh(visorGeo, visorMat);
        this.visor.position.set(0, 1.0, 0.6);
        this.visor.rotation.x = Math.PI/2;
        this.player.mesh.add(this.visor);

        this.fx = new FXSystem(this.scene);
        this.ui = new UISystem();
        this.input = new InputSystem(this.canvas);
        this.damageNumbers = new DamageNumberSystem(this.camera);

        // ---- Portal (centered at origin) ----
        this.portal = makePortal();
        this.portal.position.set(0, 1.0, 0);
        this.scene.add(this.portal);
        // subtle unlocked indicator
        this._portalRing = this.makePortalIndicator();
        this._portalRing.visible = false;
        this.scene.add(this._portalRing);

        // ---- Net vars ----
        this.snapBuffer = [];
        this.latestSnap = null;
        this.lastSeq = -1;

        this.inputSeq = 0;
        this.pendingInputs = [];
        this.predicted = { x:0, z:0 };
        this.serverState = { x:0, z:0, ack:-1 };
        this.yaw = 0;
        this.forwardDir = new THREE.Vector3(0,0,1);

        this.remotePlayers = new Map();
        this._enemyMap = new Map();
        this._projMap  = new Map();
        this._poolMap  = new Map();
        this._statusFX = new Map(); // enemyId -> {ttl,color}

        // reward state
        this._pendingOfferId = null;

        // portal UX
        this._lastPortalAttempt = 0;
        this._portalUnlocked = false;

        // ---- WebSocket ----
        const params = new URLSearchParams(location.search);
        const room = params.get('room') || 'lobby';
        const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';

// location.host already includes port when you're on localhost
        const host = location.host;

// Choose correct path
        let path = '/api'; // your ingress prefix on DigitalOcean
        let url;

        if (location.hostname === 'localhost') {
            // Local dev uses explicit 8081 port, no prefix
            url = `${wsProto}://localhost:8081/?room=${room}`;
        } else {
            // Production uses ingress path (no port)
            url = `${wsProto}://${host}${path}?room=${room}`;
        }

        console.log('Connecting to', url);
        this.socket = new WebSocket(url);

        this.socket.onmessage = e => this.onNetMessage(e);

        this._last = now();
        this._accumSendDt = 0;
        this._sendInterval = 1 / SEND_HZ;
        this._lastInputSend = 0;

        this.state = 'menu';
        this.ui.bindButtons({
            onStart: ()=>{ this.resetRun(); this.ui.showStage(1,true); this.canvas.focus(); },
            onStageContinue: ()=>{},
            onRestart: ()=>{ this.resetRun(); this.ui.showStage(1,true); }
        });
    }
    makeNameTag(text){
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const pad = 6;
        ctx.font = '14px Segoe UI, sans-serif';
        const w = Math.ceil(ctx.measureText(text).width) + pad*2;
        const h = 22;
        canvas.width = w*2; canvas.height = h*2; // retina
        ctx.scale(2,2);
        // bg pill
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        const r = 8;
        const ww = w, hh = h;
        ctx.beginPath();
        ctx.moveTo(r,0); ctx.lineTo(ww-r,0);
        ctx.quadraticCurveTo(ww,0,ww,r);
        ctx.lineTo(ww,hh-r); ctx.quadraticCurveTo(ww,hh,ww-r,hh);
        ctx.lineTo(r,hh); ctx.quadraticCurveTo(0,hh,0,hh-r);
        ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // text
        ctx.fillStyle = '#eaf2ff';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, pad, hh/2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite:false });
        const sp = new THREE.Sprite(mat);
        sp.scale.set(ww*0.05, hh*0.05, 1); // size in world units
        sp.position.set(0, 1.6, 0);
        sp.userData._tex = tex;
        return sp;
    }
    updateNameTag(mesh, text){
        let tag = mesh.userData.nameTag;
        if (!tag){
            tag = this.makeNameTag(text||'Player');
            mesh.add(tag);
            mesh.userData.nameTag = tag;
            return;
        }
        // refresh texture
        const sprite = this.makeNameTag(text||'Player');
        tag.material.map.dispose();
        tag.material.dispose();
        tag.material = sprite.material;
        tag.scale.copy(sprite.scale);
    }

    // ---- Networking ----
    onNetMessage(e){
        const msg = JSON.parse(e.data);
        if (msg.type === 'welcome'){ this.netId = msg.id; this.resetRun(); }
        else if (msg.type === 'loadout'){
            this.player.weapons = msg.weapons || [];
            if (typeof this.player.activeIndex !== 'number') this.player.activeIndex = 0;
            this.ui.refreshWeaponsUI(this.player);
        }
        else if (msg.type === 'reward_offer'){
            this._pendingOfferId = msg.offerId;
            this.ui.showReward(msg.options, (choiceIndex)=>{
                if (this.socket.readyState === WebSocket.OPEN && this._pendingOfferId){
                    this.socket.send(JSON.stringify({ type:'reward_pick', offerId:this._pendingOfferId, index: choiceIndex }));
                }
                this._pendingOfferId = null;
            });
        }
        else if (msg.type === 'reward_applied'){
            this.ui.hideReward();
            if (msg.item) this.ui.toast(`${msg.item.name} (${msg.item.rarity})`);
        }
        else if (msg.type === 'snapshot'){
            if (typeof msg.seq === 'number' && msg.seq <= this.lastSeq) return;
            if (typeof msg.seq === 'number') this.lastSeq = msg.seq;
            this.snapBuffer.push({ t: msg.time, data: msg });
            while (this.snapBuffer.length > 3) this.snapBuffer.shift();
            this.latestSnap = msg;

            const me = msg.players.find(p => p.id === this.netId);
            if (me){
                this.serverState.x = me.x;
                this.serverState.z = me.z;
                this.serverState.ack = me.ack;
                // 👇 keep HUD in sync with server authority
                this.player.health = me.hp;
                this.player.mana   = me.mana;
                this.player.shield = me.shield;
            }
            this._portalUnlocked = !!msg.portalUnlocked;
            if (typeof msg.stage === 'number') this.stage = msg.stage;
        }
        else if (msg.type === 'portal_unlocked'){
            this._portalUnlocked = true;
        }
        else if (msg.type === 'stage_advanced'){
            this.stage = msg.stage || this.stage;
            this.ui.showStage(this.stage, true);
        }
        else if (msg.type === 'class_select'){
                 this.ui.showClassSelect(msg.classes, (classId)=>{
                      if (this.socket.readyState === WebSocket.OPEN){
                            this.socket.send(JSON.stringify({ type:'class_pick', id: classId }));
                         }
                    });
              }
        else if (msg.type === 'drop_applied') {
            const e = msg.effect;
            if (e.type === 'heal') this.ui.toast(`+${Math.round(e.value)} HP`);
            else if (e.type === 'weapon') this.ui.toast(`Picked up ${e.id}`);
            else if (e.type === 'powerup') this.ui.toast(`Powerup: ${e.name}`);
            // remove drop mesh immediately for responsiveness
            if (this._dropMap?.has(msg.dropId)) {
                this.scene.remove(this._dropMap.get(msg.dropId));
                this._dropMap.delete(msg.dropId);
            }
            this.fx.ringBurst(this.player.mesh.position.x, this.player.mesh.position.z, 0x76ffb0, 0.4, 1.2);
        }
        else if (msg.type === 'player_update') {
            if (msg.stats) this.player.stats = msg.stats;
            if (msg.weapons) this.player.weapons = msg.weapons;
            if (typeof msg.hp === 'number') this.player.health = msg.hp;
            if (typeof msg.mana === 'number') this.player.mana = msg.mana;
            if (typeof msg.shield === 'number') this.player.shield = msg.shield;
            this.ui.refreshWeaponsUI(this.player);
            this.ui.updateHUD(this);   // re-render bars and stats
        }
        else if (msg.type === 'name_required'){
            this.ui.showNamePrompt((name)=>{
                if (this.socket.readyState === WebSocket.OPEN){
                    this.socket.send(JSON.stringify({ type:'set_name', name }));
                }
            });
        }
        else if (msg.type === 'name_updated'){
            // update local cache + name tags immediately
            if (msg.id === this.netId) this.player.name = msg.name;
            const m = this.remotePlayers.get(msg.id);
            if (m) this.updateNameTag(m, msg.name);
        }

    }

    // ---- Lifecycle ----
    resetRun(){
        this.player.stats = {
            moveSpeed: 6.0, maxHealth:120, maxMana:100,
            healthRegen:0.01, manaRegen:0.1, maxShield:25,
            damageMult:1, attackSpeed:1, projectileQty:1,
            critChance:0.05, armor:0, dodge:0
        };
        this.player.mesh.position.set(0,0.6,0);
        this.yaw = 0; this.forwardDir.set(0,0,1);
        this.player.mesh.rotation.y = this.yaw;
        this.predicted = { x:0, z:0 };
        this.serverState = { x:0, z:0, ack:-1 };
        this.pendingInputs.length = 0;
        this.snapBuffer.length = 0;

        this.remotePlayers.forEach(m=>this.scene.remove(m)); this.remotePlayers.clear();
        this._enemyMap.forEach(m=>this.scene.remove(m)); this._enemyMap.clear();
        this._projMap.forEach(m=>this.scene.remove(m));  this._projMap.clear();
        this._poolMap.forEach(m=>this.scene.remove(m));  this._poolMap.clear();
        this._statusFX.clear();

        this._last = now(); this._accumSendDt = 0; this._lastInputSend = 0;
        this._portalUnlocked = false; this._portalRing.visible = false;

        if (!this.player.weapons) this.player.weapons = [];
        if (typeof this.player.activeIndex !== 'number') this.player.activeIndex = 0;

        this.state = 'playing';
        this.update();
    }

    onResize(){ this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); }

    // ---- Main Loop ----
    update(){
        const t = now(), dt = Math.min(0.033, t - this._last); this._last = t;
        if (this.state !== 'playing'){ requestAnimationFrame(()=>this.update()); return; }

        const camT = new THREE.Vector3(this.predicted.x, 0, this.predicted.z).add(new THREE.Vector3(0,18,18));
        this.camera.position.lerp(camT, 1 - Math.pow(0.001, dt));
        this.camera.lookAt(this.predicted.x, 0.5, this.predicted.z);

        this.reconcile(dt);
        this.predict(dt);
        this.interpolate();

        this.updatePortal(dt);
        this.checkPickup();

        this.sendInputs(dt);
        this.fx.update(dt);
        this.damageNumbers.update(dt, this.renderer, this.scene);
        this.updateStatusFx(dt);
        this.updatePoolsVisual(dt);
        this.ui.updateHUD(this);
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(()=>this.update());
    }
    checkPickup(){
        if (!this._dropMap || this.socket.readyState !== WebSocket.OPEN) return;
        for (const [id, m] of this._dropMap) {
            const dist = Math.hypot(this.player.mesh.position.x - m.position.x, this.player.mesh.position.z - m.position.z);
            if (dist < 1.5) {
                this.socket.send(JSON.stringify({ type: 'pickup' }));
                break; // only send once per frame
            }
        }
    }
    // ---- Keyboard movement (W/S forward/back, A/D rotate) ----
    predict(dt){
        const s = this.player.stats.moveSpeed;
        const W = this.input.isDown('w')?1:0;
        const S = this.input.isDown('s')?1:0;
        const A = this.input.isDown('a')?1:0;
        const D = this.input.isDown('d')?1:0;

        this.yaw -= (D - A) * TURN_SPEED * dt;
        this.forwardDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.player.mesh.rotation.y = this.yaw;

        // server uses (down - up) along aim; we send swapped booleans, so replicate here
        const upSend = S, downSend = W;
        const moveZ = (downSend - upSend);
        const vx = moveZ * this.forwardDir.x * s;
        const vz = moveZ * this.forwardDir.z * s;

        this.predicted.x = clamp(this.predicted.x + vx * dt, -23, 23);
        this.predicted.z = clamp(this.predicted.z + vz * dt, -23, 23);
        this.player.mesh.position.set(this.predicted.x, 0.6, this.predicted.z);
    }

    // ---- Reconciliation ----
    reconcile(dt){
        const ack = this.serverState.ack;
        if (ack == null || ack < 0) return;
        let i=0; while(i<this.pendingInputs.length && this.pendingInputs[i].seq<=ack) i++;
        if(i>0) this.pendingInputs.splice(0,i);

        let px=this.serverState.x, pz=this.serverState.z;
        for(const inp of this.pendingInputs){
            const s=this.player.stats.moveSpeed;
            const yaw=Math.atan2(inp.aimX, inp.aimZ);
            const moveZ=(inp.down - inp.up);
            const vx=moveZ*Math.sin(yaw)*s;
            const vz=moveZ*Math.cos(yaw)*s;
            px = clamp(px + vx*inp.dt, -23, 23);
            pz = clamp(pz + vz*inp.dt, -23, 23);
        }

        const dx=px-this.predicted.x, dz=pz-this.predicted.z, err=Math.hypot(dx,dz);
        if (err>1.25){ this.predicted.x=px; this.predicted.z=pz; }
        else{ const blend=Math.min(1, dt*12); this.predicted.x+=dx*blend; this.predicted.z+=dz*blend; }
        this.player.mesh.position.set(this.predicted.x,0.6,this.predicted.z);
    }

    // ---- Interpolation (remotes + enemies + projectiles + pools + events) ----
    interpolate(){
        if (this.snapBuffer.length < 2) return;
        const [a,b] = this.snapBuffer.slice(-2);
        const renderTime = performance.now()/1000 - RENDER_DELAY;
        const denom = (b.t - a.t); if (denom <= 1e-6) return;
        const t = (renderTime - a.t) / denom;
        const alpha = Math.min(Math.max(t, 0), 1);
        this.applySnapshot(a.data, b.data, alpha);
    }

    applySnapshot(a, b, t) {
        const L = (ax, bx) => ax + (bx - ax) * t;

        // ---------------- Remote Players ----------------
        const aP = new Map(a.players.map(p => [p.id, p]));
        const bP = new Map(b.players.map(p => [p.id, p]));
        for (const [id, pa] of aP) {
            if (id === this.netId) continue;
            const pb = bP.get(id) || pa;
            const m = this.ensurePlayerMesh(id, 0x64a7f0);
            const name = (pb.name ?? pa.name ?? 'Player');
            this.updateNameTag(m, name);
            m.position.set(L(pa.x, pb.x), 0.6, L(pa.z, pb.z));
            const mvx = pb.x - pa.x, mvz = pb.z - pa.z;
            if (Math.abs(mvx) + Math.abs(mvz) > 1e-4) m.rotation.y = Math.atan2(mvx, mvz);
        }
        for (const id of this.remotePlayers.keys()) {
            if (id !== this.netId && !bP.has(id)) {
                this.scene.remove(this.remotePlayers.get(id));
                this.remotePlayers.delete(id);
            }
        }

        // ---------------- Projectiles (tinted) ----------------
        const aPr = new Map(a.projectiles.map(p => [p.id, p]));
        const bPr = new Map(b.projectiles.map(p => [p.id, p]));
        for (const [id, pa] of aPr) {
            const pb = bPr.get(id) || pa;
            let m = this._projMap.get(id);
            if (!m) {
                const tint = pb.tint ?? pa.tint ?? 0xa8c6ff;
                m = new THREE.Mesh(
                    new THREE.SphereGeometry(0.18, 10, 10),
                    new THREE.MeshStandardMaterial({ color: tint })
                );
                m.position.set(pb.sx ?? pb.x, 0.6, pb.sz ?? pb.z);
                this.scene.add(m);
                this._projMap.set(id, m);
            }
            m.position.set(L(pa.x, pb.x), 0.6, L(pa.z, pb.z));
        }
        for (const [id, m] of this._projMap)
            if (!bPr.has(id)) { this.scene.remove(m); this._projMap.delete(id); }

        // ---------------- Enemies (flavors + dynamic scale) ----------------
        const aE = new Map((a.enemies || []).map(e => [e.id, e]));
        const bE = new Map((b.enemies || []).map(e => [e.id, e]));
        for (const [id, ea] of aE) {
            const eb = bE.get(id) || ea;
            let m = this._enemyMap.get(id);
            if (!m) {
                m = this.makeEnemyPrefab(eb.type || ea.type || 'pawn');
                m.position.y = 0.5;
                this.scene.add(m);
                this._enemyMap.set(id, m);
            }
            const scale = eb.s ?? ea.s ?? 1;
            m.scale.set(scale, scale, scale);
            m.position.set(L(ea.x, eb.x), 0.5, L(ea.z, eb.z));
        }
        for (const [id, m] of this._enemyMap)
            if (!bE.has(id)) { this.scene.remove(m); this._enemyMap.delete(id); }

        // ---------------- AoE Pools ----------------
        const aPl = new Map((a.pools || []).map(p => [p.id, p]));
        const bPl = new Map((b.pools || []).map(p => [p.id, p]));
        for (const [id, pa] of aPl) {
            const pb = bPl.get(id) || pa;
            let g = this._poolMap.get(id);
            if (!g) {
                g = this.makePoolMesh(pa.r, pa.team);
                this.scene.add(g);
                this._poolMap.set(id, g);
            }
            g.scale.set((pb.r || pa.r) / 1.0, 1, (pb.r || pa.r) / 1.0);
            g.position.set(L(pa.x, pb.x), 0.02, L(pa.z, pb.z));
        }
        for (const [id, g] of this._poolMap)
            if (!bPl.has(id)) { this.scene.remove(g); this._poolMap.delete(id); }

        // ---------------- Drops (health / weapon) ----------------
        if (!this._dropMap) this._dropMap = new Map();
        const aD = new Map((a.drops || []).map(d => [d.id, d]));
        const bD = new Map((b.drops || []).map(d => [d.id, d]));
        for (const [id, da] of aD) {
            const db = bD.get(id) || da;
            let m = this._dropMap.get(id);
            if (!m) {
                const col = da.kind === "health" ? 0x47d16c : 0x7a7cff;
                m = new THREE.Mesh(
                    new THREE.SphereGeometry(0.25, 10, 10),
                    new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7 })
                );
                m.position.y = 0.4;
                this.scene.add(m);
                this._dropMap.set(id, m);
            }
            m.position.set(L(da.x, db.x), 0.4, L(da.z, db.z));
        }
        for (const [id, m] of this._dropMap)
            if (!bD.has(id)) { this.scene.remove(m); this._dropMap.delete(id); }

        // ---------------- One-shot FX events ----------------
        if (b.events && Array.isArray(b.events)) {
            for (const ev of b.events) this.handleFxEvent(ev);
        }
    }


    // ---- FX events & status flash ----
    handleFxEvent(ev){
        const tint = ev.tint ?? 0xffffff;
        if (ev.type === 'fx_muzzle') this.fx.muzzleFlash(ev.x, ev.z, tint);
        else if (ev.type === 'fx_hit') this.fx.hitSpark(ev.x, ev.z, tint);
        else if (ev.type === 'fx_shrapnel') this.fx.ringBurst(ev.x, ev.z, tint, 0.4, ev.r ?? 1.6);
        else if (ev.type === 'fx_pool') this.fx.ringBurst(ev.x, ev.z, tint, 0.4, 1.4);
        else if (ev.type === 'fx_status' && ev.targetId) {
            this._statusFX.set(ev.targetId, { ttl: 0.45, color: tint });
        }
           else if (ev.type === 'fx_damage') {
                 const c = new THREE.Color(0xffb24d);
                 const color = `#${c.getHexString()}`;
                 this.damageNumbers.spawn({x:ev.x, y:0.9, z:ev.z}, ev.value, color);
               }
    }

    updateStatusFx(dt){
        for (const [id, fx] of this._statusFX) {
            fx.ttl -= dt;
            const m = this._enemyMap.get(id);
            if (!m || fx.ttl <= 0){
                this._statusFX.delete(id);
                if (m) {
                    m.traverse(o => {
                        if (o.isMesh && o.material && o.material.emissive) {
                            o.material.emissive.setHex(0x151515); // restore subtle base
                        }
                    });
                }
                continue;
            }
            const a = Math.max(0, fx.ttl / 0.45);
            const c = new THREE.Color(fx.color);
            c.lerp(new THREE.Color(0x111111), 1 - a);
            m.traverse(o => {
                if (o.isMesh && o.material && o.material.emissive) {
                    o.material.emissive.copy(c);
                }
            });
        }
    }

    // ---- Portal helpers ----
    makePortalIndicator(){
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(1.9, 2.2, 48),
            new THREE.MeshBasicMaterial({ color:0x76ffb0, transparent:true, opacity:0.65, depthWrite:false })
        );
        ring.rotation.x = -Math.PI/2;
        ring.position.set(0, 0.03, 0);
        return ring;
    }
    updatePortal(dt){
        // visual pulse
        this._portalRing.visible = this._portalUnlocked;
        if (this._portalRing.visible) {
            this._portalRing.rotation.z += dt * 1.1;
            const base = 0.48 + 0.1 * Math.sin(performance.now()*0.006);
            this._portalRing.material.opacity = base;
        }
        // auto-enter when close and unlocked
        if (this._portalUnlocked) {
            const d = Math.hypot(this.player.mesh.position.x, this.player.mesh.position.z);
            const t = performance.now()/1000;
            if (d < 2.2 && (t - this._lastPortalAttempt) > 0.4) {
                this._lastPortalAttempt = t;
                if (this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({ type:'portal_enter' }));
                }
            }
        }
    }

    // ---- Visuals: Pools ----
    makePoolMesh(radius, team){
        const group = new THREE.Group();
        const col = (team==='player') ? 0xff6b3b : 0x6b9bff;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40),
            new THREE.MeshBasicMaterial({ color: col, transparent:true, opacity:0.25, depthWrite:false }));
        disc.rotation.x = -Math.PI/2; group.add(disc);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.05, 48),
            new THREE.MeshBasicMaterial({ color: col, transparent:true, opacity:0.6, depthWrite:false }));
        ring.rotation.x = -Math.PI/2; group.add(ring);
        // points
        const count = 60; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(count*3);
        for(let i=0;i<count;i++){ const a=Math.random()*Math.PI*2, r=Math.random()*1.0;
            pos[i*3+0]=Math.cos(a)*r; pos[i*3+1]=0.03+Math.random()*0.05; pos[i*3+2]=Math.sin(a)*r; }
        geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size:0.08, color:col, transparent:true, opacity:0.8, depthWrite:false }));
        pts.rotation.x = -Math.PI/2; group.add(pts);
        group.userData.rot = ring; group.scale.set(radius,1,radius);
        return group;
    }
    updatePoolsVisual(dt){
        for(const g of this._poolMap.values()){
            const r = g.userData.rot;
            if (r) r.rotation.z += dt*1.2;
            g.children[0].material.opacity = 0.22 + Math.sin(performance.now()*0.004)*0.04;
        }
    }

    // ---- Input shipping ----
    sendInputs(dt){
        this._accumSendDt += dt;
        const nowSec = performance.now()/1000;
        if (nowSec - this._lastInputSend < this._sendInterval) return;
        this._lastInputSend = nowSec;

        const msg = {
            type:'input', seq: ++this.inputSeq,
            up:   this.input.isDown('s')?1:0, // swapped so server (down-up) => W forward
            down: this.input.isDown('w')?1:0,
            left: 0, right: 0,
            fire: this.input.mouseDown?1:0,
            aimX: Math.sin(this.yaw), aimZ: Math.cos(this.yaw),
            dt:   this._accumSendDt
        };
        this.pendingInputs.push({...msg});
        if(this.socket.readyState===WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
        this._accumSendDt = 0;
    }

    // ---- Prefabs by type ----
    makeEnemyPrefab(type){
        switch ((type||'pawn').toLowerCase()) {
            case 'wizard':      return makeWizardMesh();
            case 'knight':      return makeKnightMesh();
            case 'pawn_ranged': return makeRangedPawnMesh();
            case 'summoner':    return makeSummonerMesh();
            case 'beastmaster': return makeBeastmasterMesh();
            case 'beast_pet':   return makeBeastPetMesh();
            case 'pawn':
            default:            return makePawnMesh();
        }
    }

    ensurePlayerMesh(id,color){
        if(id===this.netId) return this.player.mesh;
        let m=this.remotePlayers.get(id);
        if(!m){
            const geo=new THREE.CapsuleGeometry(0.35,0.9,8,16);
            const mat=new THREE.MeshStandardMaterial({color,emissive:0x222244});
            m=new THREE.Mesh(geo,mat); m.position.y=0.6; this.scene.add(m);
            this.remotePlayers.set(id,m);
        }
        return m;
    }
}
