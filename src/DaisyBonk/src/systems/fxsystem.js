// src/systems/FXSystem.js — lightweight particle/flash helper (no deps)
import * as THREE from 'three';

export class FXSystem {
    constructor(scene){
        this.scene = scene;
        this._things = []; // {mesh, ttl, max, kind}
    }

    // quick flash at muzzle
    muzzleFlash(x, z, tint=0xffffff){
        const m = new THREE.Mesh(
            new THREE.CircleGeometry(0.35, 20),
            new THREE.MeshBasicMaterial({ color: tint, transparent:true, opacity:0.9, depthWrite:false })
        );
        m.rotation.x = -Math.PI/2; m.position.set(x, 0.66, z);
        this.scene.add(m);
        this._things.push({ mesh:m, ttl:0.12, max:0.12, kind:'flash' });
    }

    // tiny hit spark
    hitSpark(x, z, tint=0xffffff){
        const m = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 10, 10),
            new THREE.MeshBasicMaterial({ color: tint, transparent:true, opacity:0.9, depthWrite:false })
        );
        m.position.set(x, 0.65, z);
        this.scene.add(m);
        this._things.push({ mesh:m, ttl:0.16, max:0.16, kind:'spark' });
    }

    // expanding ring pulse
    ringBurst(x, z, tint=0xffffff, r0=0.3, r1=1.8){
        const g = new THREE.RingGeometry(r0*0.95, r0*1.05, 40);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color:tint, transparent:true, opacity:0.9, depthWrite:false }));
        m.rotation.x = -Math.PI/2; m.position.set(x, 0.03, z);
        m.userData.r0 = r0; m.userData.r1 = r1;
        this.scene.add(m);
        this._things.push({ mesh:m, ttl:0.35, max:0.35, kind:'ring' });
    }

    update(dt){
        for (let i=this._things.length-1;i>=0;i--){
            const t = this._things[i];
            t.ttl -= dt;
            if (t.kind === 'flash'){
                const a = t.ttl / t.max;
                t.mesh.material.opacity = a;
                t.mesh.scale.set(1 + (1-a)*0.8, 1, 1 + (1-a)*0.8);
            } else if (t.kind === 'spark'){
                const a = t.ttl / t.max;
                t.mesh.material.opacity = a;
                t.mesh.scale.setScalar(1 + (1-a)*0.6);
            } else if (t.kind === 'ring'){
                const k = 1 - (t.ttl / t.max);
                const r = t.mesh.userData.r0 + (t.mesh.userData.r1 - t.mesh.userData.r0) * k;
                t.mesh.geometry.dispose();
                t.mesh.geometry = new THREE.RingGeometry(r*0.95, r*1.05, 40);
                t.mesh.material.opacity = 0.9 * (1-k);
            }
            if (t.ttl <= 0){
                this.scene.remove(t.mesh);
                if (t.mesh.geometry) t.mesh.geometry.dispose();
                if (t.mesh.material) t.mesh.material.dispose();
                this._things.splice(i,1);
            }
        }
    }
}
