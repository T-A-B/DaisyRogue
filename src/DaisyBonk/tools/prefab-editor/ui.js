// ui.js
import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export class UIManager {
    constructor(sceneMgr, exporter, schemaMgr) {
        this.scene = sceneMgr;
        this.exporter = exporter;
        this.schema = schemaMgr;

        this.$ = (sel) => document.querySelector(sel);
        this.$$ = (sel) => Array.from(document.querySelectorAll(sel));

        this._binded = [];
    }

    init() {
        // Topbar menus
        const btnAddShape = this.$('#btnAddShape');
        const addShapeMenu = this.$('#addShapeMenu');
        const btnExport = this.$('#btnExport');
        const exportMenu = this.$('#exportMenu');

        btnAddShape.addEventListener('click', () => toggleMenu(addShapeMenu));
        btnExport.addEventListener('click', () => toggleMenu(exportMenu));
        document.addEventListener('click', (e) => {
            if (!btnAddShape.contains(e.target)) addShapeMenu.classList.add('hidden');
            if (!btnExport.contains(e.target)) exportMenu.classList.add('hidden');
        });

        // Add shape buttons
        addShapeMenu.querySelectorAll('button[data-shape]').forEach(b => {
            b.addEventListener('click', () => {
                const shape = b.dataset.shape;
                this.scene.addShape(shape);
                addShapeMenu.classList.add('hidden');
                this._autosave();
            });
        });

        // Reset view
        this.$('#btnResetView').addEventListener('click', () => this.scene.resetView());
        // Help
        this.$('#btnHelp').addEventListener('click', () => this.$('#dlgHelp').showModal());

        // New / Duplicate / Delete
        this.$('#btnNewPrefab').addEventListener('click', () => this._newPrefab());
        this.$('#btnDuplicate').addEventListener('click', () => { this.scene.duplicate(); this._autosave(); });
        this.$('#btnDelete').addEventListener('click', () => { this.scene.delete(); this._autosave(); });

        // Tabs
        this.$$('.tabs .tab').forEach(t => t.addEventListener('click', () => this._switchTab(t)));

        // Prefab import
        this.$('#btnImportPrefab').addEventListener('click', () => this.$('#fileImportPrefab').click());
        this.$('#fileImportPrefab').addEventListener('change', (ev) => this._importPrefabFile(ev.target.files?.[0]));
        this.$('#btnLoadSchema').addEventListener('click', () => this.$('#fileLoadSchema').click());
        this.$('#fileLoadSchema').addEventListener('change', (ev) => this._loadSchemaFile(ev.target.files?.[0]));

        // Export actions
        this.$('#btnExportCode').addEventListener('click', () => this._exportCode('download'));
        this.$('#btnCopyCode').addEventListener('click', () => this._exportCode('copy'));
        this.$('#btnExportGLB').addEventListener('click', () => this.exporter.exportGLB(this.scene.root, this._prefabFileName('.glb')));
        this.$('#btnExportGLTF').addEventListener('click', () => this.exporter.exportGLTF(this.scene.root, this._prefabFileName('.gltf')));
        this.$('#btnExportJSON').addEventListener('click', () => this.exporter.exportThreeJSON(this.scene.root, this._prefabFileName('.json')));
        this.$('#btnDownloadSchema').addEventListener('click', () => this.schema.download());

        // Inspector bindings
        this._bindInspector();

        // Texture library changes
        this.scene.on('texture-library-changed', () => this._refreshTexLib());

        // Selection
        this.scene.on('select', (obj) => this._populateInspector(obj));

        // Scene changes -> Outliner + Status + Autosave
        this.scene.on('scene-changed', () => {
            this._refreshOutliner();
            this._statusSelection();
            this._autosaveDebounced();
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (ev) => {
            if (ev.code === 'Delete') { this.scene.delete(); this._autosave(); }
            if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyD') { ev.preventDefault(); this.scene.duplicate(); this._autosave(); }
        });

        // Attempt to load autosaved state
        this._restoreAutosave();
        // Initial UI
        this._refreshOutliner();
        this._refreshTexLib();
        this._statusSelection();
    }

    // --- Tabs ---
    _switchTab(btn) {
        this.$$('.tabs .tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const id = btn.dataset.tab;
        this.$$('.tab-panel').forEach(p => p.classList.remove('active'));
        this.$(`#${id}`).classList.add('active');
    }

    // --- Outliner ---
    _refreshOutliner() {
        const tree = this.$('#hierarchy');
        tree.innerHTML = '';
        const data = this.scene.getHierarchy();

        const makeNode = (n) => {
            const li = document.createElement('li');
            li.draggable = n.id !== this.scene.root.userData.id;
            li.dataset.id = n.id;
            li.dataset.selected = (this.scene.selection?.userData?.id === n.id);

            const icon = document.createElement('span');
            icon.textContent = (n.kind === 'Mesh') ? '🔷' : '🗂️';

            const label = document.createElement('span');
            label.className = 'node-label';
            label.textContent = n.name || n.shapeType || n.kind;

            const actions = document.createElement('span');
            actions.className = 'node-actions';
            const btnRename = document.createElement('button');
            btnRename.textContent = 'Rename';
            btnRename.addEventListener('click', (e) => {
                e.stopPropagation();
                const newName = prompt('New name', label.textContent);
                if (newName != null) {
                    const obj = this.scene.findById(n.id);
                    this.scene.rename(obj, newName);
                    this._refreshOutliner();
                    this._autosave();
                }
            });
            actions.appendChild(btnRename);

            li.appendChild(icon);
            li.appendChild(label);
            li.appendChild(actions);

            li.addEventListener('click', () => {
                const obj = this.scene.findById(n.id);
                if (obj) this.scene.select(obj);
            });

            // Drag & drop to reparent
            li.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', n.id);
                e.dataTransfer.effectAllowed = 'move';
            });
            li.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect='move'; li.style.background='#162036'; });
            li.addEventListener('dragleave', () => li.style.background='');
            li.addEventListener('drop', (e) => {
                e.preventDefault();
                li.style.background = '';
                const childId = e.dataTransfer.getData('text/plain');
                const newParentId = n.id;
                this.scene.reparent(childId, newParentId, -1);
                this._autosave();
            });

            if (n.children?.length) {
                const ul = document.createElement('ul');
                n.children.forEach(c => ul.appendChild(makeNode(c)));
                li.appendChild(ul);
            }

            return li;
        };

        const ulRoot = document.createElement('ul');
        ulRoot.appendChild(makeNode(data));
        tree.appendChild(ulRoot);
    }

    // --- Inspector ---
    _bindInspector() {
        const asNum = (el) => parseFloat(el.value || '0') || 0;
        const set3 = (a,b,c) => [asNum(a), asNum(b), asNum(c)];

        const el = {
            empty: this.$('#inspectorEmpty'),
            box: this.$('#inspector'),
            name: this.$('#inpName'),
            pos: [this.$('#posX'), this.$('#posY'), this.$('#posZ')],
            rot: [this.$('#rotX'), this.$('#rotY'), this.$('#rotZ')],
            scl: [this.$('#sclX'), this.$('#sclY'), this.$('#sclZ')],
            visible: this.$('#chkVisible'),
            meshOnly: this.$('#meshOnly'),
            matType: this.$('#selMatType'),
            color: this.$('#inpColor'),
            metal: this.$('#inpMetal'),
            rough: this.$('#inpRough'),
            texDrop: this.$('#textureDrop'),
            texFile: this.$('#fileTexture'),
            uvScale: [this.$('#uvScaleX'), this.$('#uvScaleY')],
            uvOffset: [this.$('#uvOffsetX'), this.$('#uvOffsetY')],
            clearTex: this.$('#btnClearTexture'),
            applyChildren: this.$('#chkApplyToChildren'),
            // metadata
            metaId: this.$('#metaId'),
            metaType: this.$('#metaType'),
            metaAuthor: this.$('#metaAuthor'),
            metaImportThree: this.$('#metaImportThree'),
            // persistence
            saveNow: this.$('#btnSaveNow'),
            revert: this.$('#btnRevert'),
            clear: this.$('#btnClear'),
            pickTex: this.$('#btnPickTex'),
        };
        this._inspectorEl = el;

        const applyTransform = () => {
            const obj = this.scene.selection;
            if (!obj) return;
            this.scene.setTransform(obj, {
                position: set3(el.pos[0], el.pos[1], el.pos[2]),
                rotationDeg: set3(el.rot[0], el.rot[1], el.rot[2]),
                scale: set3(el.scl[0], el.scl[1], el.scl[2]),
                visible: el.visible.checked
            });
            this._autosaveDebounced();
        };

        // Transform bindings
        [...el.pos, ...el.rot, ...el.scl].forEach(inp => inp.addEventListener('change', applyTransform));
        el.visible.addEventListener('change', applyTransform);

        // Name
        el.name.addEventListener('change', () => {
            const obj = this.scene.selection; if (!obj) return;
            this.scene.rename(obj, el.name.value);
            this._autosaveDebounced();
        });

        // Material changes
        const applyMaterial = () => {
            const obj = this.scene.selection; if (!obj) return;
            const type = el.matType.value;
            this.scene.setMaterial(obj, {
                type,
                color: el.color.value,
                metalness: parseFloat(el.metal.value || '0') || 0,
                roughness: parseFloat(el.rough.value || '1') || 1
            }, el.applyChildren.checked);
            this._autosaveDebounced();
        };
        [el.matType, el.color, el.metal, el.rough, el.applyChildren].forEach(i => i.addEventListener('change', applyMaterial));

        // Texture D&D
        const handleTexFile = (file) => {
            const obj = this.scene.selection; if (!obj) return;
            const name = file.name.replace(/\.[a-z]+$/i,'');
            const reader = new FileReader();
            reader.onload = async () => {
                await this.scene.applyTextureFromDataURL(obj, name, reader.result, el.applyChildren.checked);
                this._populateInspector(obj);
                this._autosaveDebounced();
            };
            reader.readAsDataURL(file);
        };
        el.texDrop.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
        el.texDrop.addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleTexFile(file);
        });
        el.pickTex.addEventListener('click', () => el.texFile.click());
        el.texFile.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            if (f) handleTexFile(f);
            e.target.value = '';
        });
        el.clearTex.addEventListener('click', () => {
            const obj = this.scene.selection; if (!obj) return;
            this.scene.clearTexture(obj, el.applyChildren.checked);
            this._populateInspector(obj);
            this._autosaveDebounced();
        });

        // UV controls
        const applyUV = () => {
            const obj = this.scene.selection; if (!obj) return;
            const scale = [parseFloat(el.uvScale[0].value || '1'), parseFloat(el.uvScale[1].value || '1')];
            const offset = [parseFloat(el.uvOffset[0].value || '0'), parseFloat(el.uvOffset[1].value || '0')];
            this.scene.setUV(obj, { scale, offset });
            this._autosaveDebounced();
        };
        [...el.uvScale, ...el.uvOffset].forEach(i => i.addEventListener('change', applyUV));

        // Persistence buttons
        el.saveNow.addEventListener('click', () => this._autosave());
        el.revert.addEventListener('click', () => this._restoreAutosave());
        el.clear.addEventListener('click', () => this._clearAutosave());
    }

    _populateInspector(obj) {
        const el = this._inspectorEl;
        if (!obj) {
            el.box.classList.add('hidden');
            el.empty.classList.remove('hidden');
            return;
        }
        el.box.classList.remove('hidden');
        el.empty.classList.add('hidden');
        el.name.value = obj.name || '';

        // Transforms
        el.pos[0].value = obj.position.x.toFixed(3);
        el.pos[1].value = obj.position.y.toFixed(3);
        el.pos[2].value = obj.position.z.toFixed(3);

        el.rot[0].value = (obj.rotation.x * RAD2DEG).toFixed(1);
        el.rot[1].value = (obj.rotation.y * RAD2DEG).toFixed(1);
        el.rot[2].value = (obj.rotation.z * RAD2DEG).toFixed(1);

        el.scl[0].value = obj.scale.x.toFixed(3);
        el.scl[1].value = obj.scale.y.toFixed(3);
        el.scl[2].value = obj.scale.z.toFixed(3);

        el.visible.checked = obj.visible !== false;

        // Mesh-only section
        const isMesh = !!obj.isMesh;
        el.meshOnly.style.display = isMesh ? '' : 'none';

        // Material
        if (isMesh) {
            const mat = obj.material || {};
            el.matType.value = (obj.userData?.materialType) || mat.type || 'MeshStandardMaterial';
            el.color.value = `#${mat.color?.getHexString?.() || 'cccccc'}`;
            el.metal.value = (mat.metalness ?? 0);
            el.rough.value = (mat.roughness ?? 1);

            // UV
            const rep = mat.map?.repeat || { x: 1, y: 1 };
            const off = mat.map?.offset || { x: 0, y: 0 };
            el.uvScale[0].value = rep.x;
            el.uvScale[1].value = rep.y;
            el.uvOffset[0].value = off.x;
            el.uvOffset[1].value = off.y;
        }

        // Metadata
        const meta = this._loadMeta();
        el.metaId.value = meta.id || '';
        el.metaType.value = meta.type || '';
        el.metaAuthor.value = meta.author || '';
        el.metaImportThree.checked = !!meta.includeThreeImport;
    }

    _statusSelection() {
        const s = this.scene.selection;
        const e = this.$('#statusSelection');
        if (!s) e.textContent = 'No selection';
        else e.textContent = `${s.userData?.kind || (s.isMesh ? 'Mesh':'Group')} — ${s.name || '(unnamed)'}`;
    }

    _refreshTexLib() {
        const lib = this.scene.getTextureLibrary();
        const container = this.$('#textureLibrary');
        container.innerHTML = '';
        lib.forEach(item => {
            const div = document.createElement('div');
            div.className = 'tex';
            div.title = item.name;
            div.style.backgroundImage = `url('${item.url || ''}')`;
            div.addEventListener('click', () => {
                const obj = this.scene.selection;
                if (obj) this.scene._applyTexture(obj, item.texture, { name: item.name, url: item.url }, this.$('#chkApplyToChildren').checked);
                this._populateInspector(obj);
                this._autosaveDebounced();
            });
            container.appendChild(div);
        });
    }

    // --- Prefab import ---
    async _importPrefabFile(file) {
        if (!file) return;
        const text = await file.text();
        try {
            const mod = await this.scene.importPrefabModuleFromText(text);
            const exports = Object.entries(mod).filter(([k, v]) => typeof v === 'function');
            if (!exports.length) { alert('No exported functions found.'); return; }

            // If exactly one function, instantiate immediately
            if (exports.length === 1) {
                const [name, fn] = exports[0];
                this.scene.addPrefabFromFactory(fn, name);
                this._autosave();
                return;
            }

            // Else prompt selection
            const dlg = this.$('#dlgPickExported');
            const list = this.$('#exportedFunctionList');
            list.innerHTML = '';
            exports.forEach(([name, fn]) => {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.textContent = name;
                btn.addEventListener('click', () => {
                    this.scene.addPrefabFromFactory(fn, name);
                    dlg.close();
                    this._autosave();
                });
                li.appendChild(btn);
                list.appendChild(li);
            });
            dlg.showModal();
        } catch (e) {
            console.error(e);
            alert('Failed to import module. See console for details.');
        }
    }

    // --- Schema loader ---
    async _loadSchemaFile(file) {
        if (!file) return;
        const json = await file.text();
        try {
            const s = this.schema.loadFromJSONText(json);
            this._populatePrefabList(s.prefabs);
            alert('Schema loaded.');
        } catch (e) {
            alert('Invalid schema.json');
        }
    }

    _populatePrefabList(prefabs) {
        const ul = this.$('#prefabList');
        ul.innerHTML = '';
        for (const p of prefabs) {
            const li = document.createElement('li');
            li.textContent = `${p.id}  —  ${p.path}  [${p.type}]`;
            ul.appendChild(li);
        }
    }

    // --- Export code (.js / clipboard) ---
    _exportCode(mode='download') {
        const meta = this._loadMeta();
        // Ensure ID unique (in local schema)
        const uniqueId = this.schema.ensureUniqueId(meta.id || 'prefab');
        if (uniqueId !== meta.id) {
            meta.id = uniqueId;
            this._saveMeta(meta);
            this._populateInspector(this.scene.selection);
        }
        const { code, functionName, meta: fileMeta } = this.exporter.generateCode({
            id: meta.id,
            type: meta.type,
            author: meta.author,
            includeThreeImport: meta.includeThreeImport
        });

        const filename = `${functionName}.js`;
        if (mode === 'download') this.exporter.downloadText(filename, code);
        else if (mode === 'copy') this.exporter.copyToClipboard(code);

        // Update schema entry suggestion
        this.schema.addOrUpdateEntry({ id: meta.id, path: filename, type: meta.type || 'prop' });
        this._populatePrefabList(this.schema.getSchema().prefabs);
    }

    _prefabFileName(ext='.glb') {
        const meta = this._loadMeta();
        const id = meta.id || 'prefab';
        return `${id}${ext}`;
    }

    // --- Metadata in localStorage ---
    _loadMeta() {
        try {
            return JSON.parse(localStorage.getItem('prefab-editor:meta') || '{}');
        } catch { return {}; }
    }
    _saveMeta(meta) {
        try { localStorage.setItem('prefab-editor:meta', JSON.stringify(meta)); } catch {}
    }

    // --- Persistence ---
    _autosave() {
        try {
            const state = this.scene.toState();
            localStorage.setItem('prefab-editor:state', JSON.stringify(state));
            // Also persist meta
            const meta = {
                id: this._inspectorEl.metaId.value,
                type: this._inspectorEl.metaType.value,
                author: this._inspectorEl.metaAuthor.value,
                includeThreeImport: this._inspectorEl.metaImportThree.checked
            };
            this._saveMeta(meta);
            this.$('#statusInfo').textContent = 'Saved.';
            setTimeout(() => { this.$('#statusInfo').textContent = ''; }, 1000);
        } catch (e) { console.warn('Autosave failed', e); }
    }
    _autosaveDebounced = debounce(() => this._autosave(), 400);

    _restoreAutosave() {
        try {
            const stateText = localStorage.getItem('prefab-editor:state');
            if (stateText) {
                this.scene.fromState(JSON.parse(stateText));
                this.$('#statusInfo').textContent = 'Restored from autosave.';
                setTimeout(() => { this.$('#statusInfo').textContent = ''; }, 1200);
            }
            const meta = this._loadMeta();
            this._inspectorEl.metaId.value = meta.id || '';
            this._inspectorEl.metaType.value = meta.type || '';
            this._inspectorEl.metaAuthor.value = meta.author || '';
            this._inspectorEl.metaImportThree.checked = !!meta.includeThreeImport;
        } catch (e) {
            console.warn('Restore failed', e);
        }
        this._refreshOutliner();
    }

    _clearAutosave() {
        localStorage.removeItem('prefab-editor:state');
        localStorage.removeItem('prefab-editor:meta');
        this._newPrefab();
    }

    _newPrefab() {
        this.scene.fromState({
            id: this.scene.root.userData.id, name:'PrefabRoot', kind:'Group', shapeType:'Group', params:{},
            transform: { position:[0,0,0], rotation:[0,0,0], scale:[1,1,1], visible:true },
            children:[]
        });
        // Reset meta
        this._inspectorEl.metaId.value = '';
        this._inspectorEl.metaType.value = '';
        this._inspectorEl.metaAuthor.value = '';
        this._inspectorEl.metaImportThree.checked = false;
        this._autosave();
    }
}

// helpers
function toggleMenu(menu) { menu.classList.toggle('hidden'); }

function debounce(fn, ms) {
    let t=null; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}
