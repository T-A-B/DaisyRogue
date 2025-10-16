// src/prefabs/enemies.js — Pawn, Wizard, Knight meshes
import * as THREE from 'three';

export function makePawnMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 1.0, 20),
        new THREE.MeshStandardMaterial({ color: 0x8d3c40, roughness: 0.6, metalness: 0.1, emissive: 0x191919 })
    );
    body.castShadow = true; body.receiveShadow = true;
    body.position.y = 0.5;
    g.add(body);
    return g;
}

export function makeWizardMesh() {
    const g = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 1.0, 24),
        new THREE.MeshStandardMaterial({ color: 0x3a78c0, roughness: 0.55, metalness: 0.12, emissive: 0x111318 })
    );
    body.castShadow = true; body.receiveShadow = true;
    body.position.y = 0.5;
    g.add(body);

    const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.6, 24),
        new THREE.MeshStandardMaterial({ color: 0x203a7a, roughness: 0.5, emissive: 0x101427 })
    );
    hat.position.y = 1.0; // sits atop the cylinder
    hat.castShadow = true;
    g.add(hat);

    return g;
}

export function makeKnightMesh() {
    const g = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.6),
        new THREE.MeshStandardMaterial({ color: 0x5f6b72, roughness: 0.35, metalness: 0.55, emissive: 0x151515 })
    );
    body.castShadow = true; body.receiveShadow = true;
    body.position.y = 0.6;
    g.add(body);

    // square pyramid head (4-sided cone)
    const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 0.5, 4),
        new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.4, metalness: 0.4, emissive: 0x090909 })
    );
    head.position.y = 1.1;
    head.rotation.y = Math.PI * 0.25; // align pyramid faces
    head.castShadow = true;
    g.add(head);

    return g;
}
