// scene.js
import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js';

const DEG2RAD = Math.PI / 180;

export const ShapeTypes = [
    'Group', 'Box', 'Sphere', 'Cylinder', 'Cone', 'Torus',
    'Dodecahedron', 'Capsule', 'Plane', 'Octahedron', 'Icosahedron'
];

function uid(prefix='node') {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeName(s) {
    return (s || '').replace(/[^\w\- ]+/g, '').slice(0, 64) || 'Node';
}

function cloneMeshDeep(mesh) {
    const m = mesh.clone();
    if (m.geometry) m.geometry = m.geometry.clone();
    if (m.material) m.material = m.material.clone();
    return m;
}

function ensureColorHex(c) {
    const color = new THREE.Color(c);
    return `0x${color.getHexString()}`;
}

function setRendererOutputSRGB(renderer) {
    // Compatibility across Three versions
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }
}

export class SceneManager {
    constructor(containerEl, onSelect) {
        this.container = (typeof containerEl === 'string') ? document.querySelector(containerEl) : containerEl;
        this.onSelect = onSelect;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0d12);

        const w = this.container.clientWidth || 1280;
        const h = this.container.clientHeight || 720;

        this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
        this.camera.position.set(4, 3, 5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        setRendererOutputSRGB(this.renderer);
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 1, 0);

        // Lights
        const amb = new THREE.AmbientLight(0xffffff, 0.6);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 8, 3);
        dir.castShadow = false;
        this.scene.add(amb, dir);

        // Helpers
        this.grid = new THREE.GridHelper(20, 20, 0x334466, 0x223044);
        this.grid.material.opacity = 0.6;
        this.grid.material.transparent = true;

        this.axes = new THREE.AxesHelper(2.0);
        this.axes.renderOrder = 1;

        this.scene.add(this.grid, this.axes);

        // Root group for prefab content
        this.root = new THREE.Group();
        this.root.name = 'PrefabRoot';
        this.root.userData = { id: uid('root'), kind: 'Group', editable: true, params: {} };
        this.scene.add(this.root);

        // Selection
        this.selection = null;
        this.selHelper = null;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);

        // Autosize
        window.addEventListener('resize', this.onResize);

        this._textureLibrary = new Map(); // name -> { url, texture }
        this._listeners = new Set();

        this.start();
    }

    // --- Events wiring ---
    onResize = () => {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    onPointerDown = (ev) => {
        if (ev.button !== 0) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersects = this.raycaster.intersectObjects(this.root.children, true);
        if (intersects.length) {
            // pick nearest mesh; then select its top-most editable node
            let obj = intersects[0].object;
            while (obj && obj !== this.root && !obj.userData?.editable) {
                obj = obj.parent;
            }
            if (obj) this.select(obj);
        }
    }

    start() {
        const loop = () => {
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(loop);
        };
        loop();
    }

    resetView() {
        this.controls.target.set(0, 1, 0);
        this.camera.position.set(4, 3, 5);
        this.controls.update();
    }

    // --- Selection ---
    select(obj) {
        if (this.selection === obj) return;
        this.selection = obj;
        this._updateSelHelper();
        this._emit('select', obj);
        if (this.onSelect) this.onSelect(obj);
    }

    _updateSelHelper() {
        if (this.selHelper) {
            this.scene.remove(this.selHelper);
            this.selHelper = null;
        }
        if (!this.selection) return;
        const bboxHelper = new THREE.BoxHelper(this.selection, 0x6ea8fe);
        bboxHelper.material.depthTest = false;
        bboxHelper.renderOrder = 2;
        this.selHelper = bboxHelper;
        this.scene.add(this.selHelper);
    }

    // --- Shapes ---
    addShape(shapeType = 'Box', params = null, parent = this.root) {
        let obj;
        if (shapeType === 'Group') {
            obj = new THREE.Group();
        } else {
            const { geometry, defaultParams } = this._makeGeometry(shapeType, params);
            const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.0, roughness: 0.9 });
            obj = new THREE.Mesh(geometry, mat);
        }

        obj.name = sanitizeName(params?.name || shapeType);
        obj.userData = {
            id: uid(shapeType.toLowerCase()),
            kind: (shapeType === 'Group') ? 'Group' : 'Mesh',
            shapeType,
            editable: true,
            params: params || {},
            materialType: 'MeshStandardMaterial',
            materialProps: { color: '#cccccc', metalness: 0.0, roughness: 0.9 },
            uv: { scale: [1, 1], offset: [0, 0] },
            texture: null // {name, url} if any
        };
        obj.castShadow = false; obj.receiveShadow = false;
        parent.add(obj);
        this.select(obj);
        this._emit('scene-changed');
        return obj;
    }

    duplicate(obj = this.selection) {
        if (!obj || obj === this.root) return null;
        const clone = obj.clone(true);
        clone.traverse(n => {
            if (n.isMesh) {
                n.geometry = n.geometry?.clone();
                n.material = n.material?.clone();
            }
            if (n.userData) {
                n.userData = { ...n.userData, id: uid('dup') };
                n.name = sanitizeName(`${n.name} Copy`);
            }
        });
        obj.parent.add(clone);
        this.select(clone);
        this._emit('scene-changed');
        return clone;
    }

    delete(obj = this.selection) {
        if (!obj || obj === this.root) return false;
        obj.parent.remove(obj);
        this.select(null);
        this._emit('scene-changed');
        return true;
    }

    rename(obj, name) {
        if (!obj) return;
        obj.name = sanitizeName(name);
        this._emit('scene-changed');
    }

    reparent(childId, newParentId, index = -1) {
        const child = this.findById(childId);
        const newParent = this.findById(newParentId) || this.root;
        if (!child || !newParent || child === this.root) return;
        newParent.attach(child); // preserves world transform
        if (index >= 0 && index < newParent.children.length) {
            newParent.children.splice(newParent.children.indexOf(child), 1);
            newParent.children.splice(index, 0, child);
        }
        this._emit('scene-changed');
    }

    findById(id) {
        let found = null;
        this.root.traverse(n => { if (n.userData?.id === id) found = n; });
        return found;
    }

    // --- Inspector operations ---
    setTransform(obj, { position, rotationDeg, scale, visible }) {
        if (!obj) return;
        if (position) obj.position.set(position[0], position[1], position[2]);
        if (rotationDeg) obj.rotation.set(rotationDeg[0] * DEG2RAD, rotationDeg[1] * DEG2RAD, rotationDeg[2] * DEG2RAD);
        if (scale) obj.scale.set(scale[0], scale[1], scale[2]);
        if (typeof visible === 'boolean') obj.visible = visible;
        this._updateSelHelper();
        this._emit('scene-changed');
    }

    setMaterial(obj, { type, color, metalness, roughness }, applyToChildren = false) {
        const setOne = (mesh) => {
            let mat = mesh.material;
            const construct = (type === 'MeshPhysicalMaterial') ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
            if (!(mat instanceof construct)) {
                mat = new construct();
                mesh.material = mat;
            }
            if (color) mat.color.set(color);
            if (typeof metalness === 'number') mat.metalness = metalness;
            if (typeof roughness === 'number') mat.roughness = roughness;
            mesh.userData.materialType = type;
            mesh.userData.materialProps = { color: `#${mat.color.getHexString()}`, metalness: mat.metalness ?? 0, roughness: mat.roughness ?? 1 };
        };
        const apply = (node) => {
            if (node.isMesh) setOne(node);
            if (applyToChildren) node.children.forEach(apply);
        };
        apply(obj);
        this._emit('scene-changed');
    }

    setUV(obj, { scale, offset }) {
        const apply = (node) => {
            if (node.isMesh && node.material?.map) {
                const map = node.material.map;
                map.wrapS = map.wrapT = THREE.RepeatWrapping;
                if (scale) { map.repeat.set(scale[0], scale[1]); node.userData.uv.scale = [...scale]; }
                if (offset) { map.offset.set(offset[0], offset[1]); node.userData.uv.offset = [...offset]; }
                map.needsUpdate = true;
            }
        };
        apply(obj);
        this._emit('scene-changed');
    }

    clearTexture(obj, applyToChildren=false) {
        const apply = (node) => {
            if (node.isMesh && node.material) {
                node.material.map = null;
                if (node.userData) node.userData.texture = null;
                node.material.needsUpdate = true;
            }
            if (applyToChildren) node.children.forEach(apply);
        };
        apply(obj);
        this._emit('scene-changed');
    }

    async applyTextureFromDataURL(obj, name, dataURL, applyToChildren=false) {
        const tex = await this._loadTextureFromURL(dataURL);
        this._textureLibrary.set(name, { name, url: dataURL, texture: tex });
        this._applyTexture(obj, tex, { name, url: dataURL }, applyToChildren);
        this._emit('texture-library-changed');
    }

    _applyTexture(obj, texture, texInfo, applyToChildren) {
        const apply = (node) => {
            if (node.isMesh && node.material) {
                node.material.map = texture;
                node.material.needsUpdate = true;
                node.userData.texture = texInfo;
            }
            if (applyToChildren) node.children.forEach(apply);
        };
        apply(obj);
    }

    getTextureLibrary() {
        return Array.from(this._textureLibrary.values());
    }

    // --- Prefab import ---
    /**
     * Import a prefab JS module from text (file content). We inject an import for THREE if needed.
     * Returns the imported module object.
     */
    async importPrefabModuleFromText(text) {
        // If user code does not import THREE, prepend an import.
        const hasThreeImport = /\bfrom\s+['"]three\b|import\s+\*\s+as\s+THREE/.test(text);
        const prelude = hasThreeImport ? '' : `import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';\n`;
        const blob = new Blob([prelude + '\n' + text], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        try {
            const mod = await import(url);
            return mod;
        } finally {
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        }
    }

    /**
     * Instantiate a prefab function (from imported module), clone its geometry/materials,
     * and add under the root.
     */
    addPrefabFromFactory(factoryFn, nameHint='Imported') {
        let group;
        try {
            group = factoryFn();
        } catch (e) {
            console.error('Factory execution failed', e);
            return null;
        }
        if (!group || !group.isObject3D) {
            console.warn('The prefab factory did not return a THREE.Object3D / Group.');
            return null;
        }
        const holder = new THREE.Group();
        holder.name = sanitizeName(nameHint);
        holder.userData = { id: uid('import'), kind: 'Group', shapeType: 'Group', editable: true, params: {} };
        // Deep clone under holder to make it editable with userData tags
        group.traverse((n) => {
            if (n.isMesh) {
                const mesh = cloneMeshDeep(n);
                mesh.userData = {
                    id: uid('mesh'),
                    kind: 'Mesh',
                    shapeType: n.geometry?.type?.replace('Geometry','') || 'Mesh',
                    editable: true,
                    params: {}, // unknown if not one of our primitives
                    materialType: (mesh.material?.type || 'MeshStandardMaterial'),
                    materialProps: {
                        color: `#${mesh.material?.color?.getHexString?.() || 'cccccc'}`,
                        metalness: mesh.material?.metalness ?? 0,
                        roughness: mesh.material?.roughness ?? 1
                    },
                    uv: { scale: [mesh.material?.map?.repeat?.x || 1, mesh.material?.map?.repeat?.y || 1],
                        offset: [mesh.material?.map?.offset?.x || 0, mesh.material?.map?.offset?.y || 0] },
                    texture: mesh.material?.map ? { name: 'imported', url: null } : null
                };
                holder.add(mesh);
            } else if (n !== group) {
                // replicate group nesting
                const g = new THREE.Group();
                g.name = sanitizeName(n.name);
                g.userData = { id: uid('group'), kind: 'Group', shapeType: 'Group', editable: true, params: {} };
                holder.add(g);
            }
        });
        // If source had hierarchy, we simply add source as a child for now (with a wrapper),
        // but mark our holder as editable; user can group/ungroup/duplicate meshes.
        this.root.add(holder);
        this.select(holder);
        this._emit('scene-changed');
        return holder;
    }

    // --- Serialization ---
    toState() {
        function serialize(node) {
            const t = {
                id: node.userData?.id || uid('node'),
                name: node.name || '',
                kind: node.userData?.kind || (node.isMesh ? 'Mesh' : 'Group'),
                shapeType: node.userData?.shapeType || (node.isMesh ? 'Mesh' : 'Group'),
                params: node.userData?.params || {},
                transform: {
                    position: [node.position.x, node.position.y, node.position.z],
                    rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
                    scale: [node.scale.x, node.scale.y, node.scale.z],
                    visible: node.visible
                },
                material: null,
                uv: null,
                texture: null,
                children: []
            };
            if (node.isMesh) {
                const mat = node.material;
                if (mat) {
                    t.material = {
                        type: node.userData?.materialType || mat.type,
                        color: `#${mat.color?.getHexString?.() || 'cccccc'}`,
                        metalness: mat.metalness ?? 0,
                        roughness: mat.roughness ?? 1
                    };
                }
                if (mat?.map) {
                    t.uv = {
                        scale: [mat.map.repeat.x, mat.map.repeat.y],
                        offset: [mat.map.offset.x, mat.map.offset.y]
                    };
                    if (node.userData?.texture) {
                        t.texture = { ...node.userData.texture };
                    }
                }
            }
            node.children.forEach(ch => { if (ch.userData?.editable) t.children.push(serialize(ch)); });
            return t;
        }
        return serialize(this.root);
    }

    fromState(state) {
        // Clear current
        this.root.children.slice().forEach(c => this.root.remove(c));

        const build = (data, parent) => {
            let obj;
            if (data.kind === 'Mesh') {
                const { geometry } = this._makeGeometry(data.shapeType, data.params);
                const matCtor = (data.material?.type === 'MeshPhysicalMaterial') ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
                const mat = new matCtor({
                    color: new THREE.Color(data.material?.color || '#cccccc'),
                    metalness: data.material?.metalness ?? 0,
                    roughness: data.material?.roughness ?? 1
                });
                obj = new THREE.Mesh(geometry, mat);
                if (data.texture?.url) {
                    // Best-effort restore cached textures
                    this._loadTextureFromURL(data.texture.url).then(tex => {
                        obj.material.map = tex;
                        obj.material.needsUpdate = true;
                    });
                }
            } else {
                obj = new THREE.Group();
            }

            obj.name = sanitizeName(data.name || data.shapeType || data.kind);
            obj.userData = {
                id: data.id,
                kind: data.kind,
                shapeType: data.shapeType,
                editable: true,
                params: data.params || {},
                materialType: data.material?.type || 'MeshStandardMaterial',
                materialProps: {
                    color: data.material?.color || '#cccccc',
                    metalness: data.material?.metalness ?? 0,
                    roughness: data.material?.roughness ?? 1
                },
                uv: data.uv || { scale: [1,1], offset:[0,0] },
                texture: data.texture || null
            };

            // transforms
            if (data.transform) {
                const t = data.transform;
                obj.position.fromArray(t.position || [0,0,0]);
                obj.rotation.set(...(t.rotation || [0,0,0]));
                obj.scale.fromArray(t.scale || [1,1,1]);
                obj.visible = (t.visible !== false);
            }

            parent.add(obj);

            if (data.uv && obj.isMesh && obj.material?.map) {
                obj.material.map.repeat.set(data.uv.scale[0], data.uv.scale[1]);
                obj.material.map.offset.set(data.uv.offset[0], data.uv.offset[1]);
                obj.material.map.needsUpdate = true;
            }

            (data.children || []).forEach(ch => build(ch, obj));
            return obj;
        };

        build(state, this.root);
        this.select(null);
        this._emit('scene-changed');
    }

    getHierarchy() {
        function gather(node) {
            const n = {
                id: node.userData?.id,
                name: node.name,
                kind: node.userData?.kind || (node.isMesh ? 'Mesh' : 'Group'),
                shapeType: node.userData?.shapeType,
                selected: false,
                children: []
            };
            node.children.forEach(c => { if (c.userData?.editable) n.children.push(gather(c)); });
            return n;
        }
        return gather(this.root);
    }

    // --- Internal: geometry factory ---
    _makeGeometry(shapeType, overrideParams=null) {
        const p = { // defaults
            Box: { w:1, h:1, d:1, ws:1, hs:1, ds:1 },
            Sphere: { r:0.5, w:16, h:12 },
            Cylinder: { rt:0.5, rb:0.5, h:1, rs:24, hs:1, open:false },
            Cone: { r:0.5, h:1, rs:24, hs:1, open:false },
            Torus: { r:0.5, tube:0.2, rs:16, ts:24, arc:Math.PI*2 },
            Dodecahedron: { r:0.6, detail:0 },
            Capsule: { r:0.35, len:0.8, cs:8, rs:16 },
            Plane: { w:1, h:1, ws:1, hs:1 },
            Octahedron: { r:0.6, detail:0 },
            Icosahedron: { r:0.6, detail:0 }
        };
        const params = { ...(p[shapeType] || {}), ...(overrideParams || {}) };
        let geometry;

        switch (shapeType) {
            case 'Box': geometry = new THREE.BoxGeometry(params.w, params.h, params.d, params.ws, params.hs, params.ds); break;
            case 'Sphere': geometry = new THREE.SphereGeometry(params.r, params.w, params.h); break;
            case 'Cylinder': geometry = new THREE.CylinderGeometry(params.rt, params.rb, params.h, params.rs, params.hs, params.open); break;
            case 'Cone': geometry = new THREE.ConeGeometry(params.r, params.h, params.rs, params.hs, params.open); break;
            case 'Torus': geometry = new THREE.TorusGeometry(params.r, params.tube, params.rs, params.ts, params.arc); break;
            case 'Dodecahedron': geometry = new THREE.DodecahedronGeometry(params.r, params.detail); break;
            case 'Capsule': geometry = new THREE.CapsuleGeometry(params.r, params.len, params.cs, params.rs); break;
            case 'Plane': geometry = new THREE.PlaneGeometry(params.w, params.h, params.ws, params.hs); break;
            case 'Octahedron': geometry = new THREE.OctahedronGeometry(params.r, params.detail); break;
            case 'Icosahedron': geometry = new THREE.IcosahedronGeometry(params.r, params.detail); break;
            default:
                geometry = new THREE.BoxGeometry(1,1,1,1,1,1);
                break;
        }

        return { geometry, defaultParams: params };
    }

    // --- Texture loader from URL/DataURL ---
    async _loadTextureFromURL(url) {
        return await new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.load(url, (tex) => {
                tex.flipY = false; // conventional for GLTF-style usage
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                resolve(tex);
            }, undefined, reject);
        });
    }

    // --- Event system for UI sync ---
    on(type, callback) {
        this._listeners.add({ type, callback });
        return () => this._listeners.delete({ type, callback });
    }

    _emit(type, payload) {
        for (const l of this._listeners) if (l.type === type) l.callback(payload);
    }
}
