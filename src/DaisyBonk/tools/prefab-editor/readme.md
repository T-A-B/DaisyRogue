# DaisyBonk / NewRoguelike — Prefab Geometry Editor

A browser‑based prefab editor for creating **small geometry constructors** (prefabs) that return `THREE.Group()` objects compatible with `src/prefabs/*.js`.

> **No build step required** — open `tools/prefab-editor/index.html` in any modern browser.

---

## Features

- **Viewport** with OrbitControls, grid & axis helpers, ambient + directional lights
- **Shapes**: Group, Box, Sphere, Cylinder, Cone, Torus, Dodecahedron, Capsule, Plane, Octahedron, Icosahedron
- **Hierarchy / Outliner** with drag‑to‑reparent, rename, duplicate, delete
- **Inspector**:
    - Transform (position / rotation(°) / scale / visibility)
    - Material (MeshStandard / MeshPhysical, color, metalness, roughness)
    - Texture slot with drag‑and‑drop + UV scale/offset
    - Apply material/texture to children
- **Prefab import/clone**: import any `makeXYZMesh()` module and instantiate it into the scene
- **Export**:
    - ES Module code (`export function makeYourIdMesh(){ ... }`)
    - `.glb` / `.gltf` via GLTFExporter
    - `.json` via `Object3D.toJSON`
    - Auto‑update / download a merged `prefab.schema.json`
- **Persistence**: autosave to `localStorage` with revert/clear

---

## Usage

1. Open `tools/prefab-editor/index.html`.
2. Click **➕ Add Shape** to add primitives; arrange, parent, and edit transforms/materials.
3. Optionally, **📥 Import Prefab** and select an existing file from your repository (`src/prefabs/*.js`). Pick the exported function (e.g., `makeWizardMesh`) to clone it into the scene.
4. Set **Prefab Metadata** on the right (ID, type, author). If your prefab files require `import * as THREE from 'three'`, check “Add import for THREE in .js”.
5. **⬇️ Export**:
    - **Export ES Module (.js)** to generate a compatible prefab constructor file
    - **Copy Code to Clipboard** if you prefer to paste
    - **Export .glb** / **.gltf** / **JSON** for asset pipeline variants
    - **Download prefab.schema.json** to merge with your repo

---

## Integration with the Game

1. **Add the exported file** to your repository under `src/prefabs/`, e.g.:

