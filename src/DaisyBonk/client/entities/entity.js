import * as THREE from 'three';

export class Entity {
    constructor(mesh) {
        this.mesh = mesh;
        this.dead = false;
        this.radius = 0.8; // quick-hit sphere (XZ)
    }
    pos(){ return this.mesh.position; }
    lookAtXZ(target){
        const tmp = new THREE.Vector3().copy(target).sub(this.pos());
        tmp.y = 0;
        const ang = Math.atan2(tmp.x, tmp.z);
        this.mesh.rotation.y = ang;
        return ang;
    }
}
