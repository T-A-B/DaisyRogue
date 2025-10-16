import * as THREE from 'three';
import { clamp } from '../utils/math.js';

export class InputSystem {
    constructor(canvas){
        this.canvas = canvas;
        this.keys = {};
        this.mouseDown = false;
        this.mouse = new THREE.Vector2();
        this._handlers = {};

        addEventListener('keydown', (e)=>{
            const k = e.key.toLowerCase();
            this.keys[k] = true;
            if (k >= '1' && k <= '3') this._handlers.swapTo?.(Number(k)-1);
            if (k === 'q') this._handlers.swapNext?.();
            if (k === 'f') this._handlers.portal?.();
            if (k === 'e') this._handlers.pickup?.();
        });
        addEventListener('keyup', (e)=>{ this.keys[e.key.toLowerCase()] = false; });

        this.canvas.addEventListener('mousedown', (e)=>{
            if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
            if (e.button===0) this.mouseDown = true;
        });
        addEventListener('mouseup',(e)=>{ if (e.button===0) this.mouseDown=false; });

        addEventListener('mousemove',(e)=>{
            if (document.pointerLockElement === this.canvas){
                this.mouse.x = clamp(this.mouse.x + e.movementX / innerWidth * 2, -1, 1);
                this.mouse.y = clamp(this.mouse.y - e.movementY / innerHeight * 2, -1, 1);
            } else {
                this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
                this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
            }
        });
    }

    on({ swapNext, swapTo, portal, pickup }){
        this._handlers.swapNext = swapNext;
        this._handlers.swapTo = swapTo;
        this._handlers.portal = portal;
        this._handlers.pickup = pickup;
    }

    isDown(k){ return !!this.keys[k.toLowerCase()]; }
}
