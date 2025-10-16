// schema.js

export class SchemaManager {
    constructor() {
        this.schema = { version: 1, prefabs: [] };
        // If autosaved schema exists, load it
        try {
            const s = window.localStorage.getItem('prefab-editor:schema');
            if (s) this.schema = JSON.parse(s);
        } catch {}
    }

    loadFromJSONText(text) {
        try {
            const obj = JSON.parse(text);
            if (!obj || typeof obj !== 'object' || !Array.isArray(obj.prefabs)) {
                throw new Error('Invalid schema format.');
            }
            this.schema = obj;
            this._persist();
            return this.schema;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    getSchema() {
        return this.schema;
    }

    listPrefabIds() {
        return this.schema.prefabs.map(p => p.id);
    }

    ensureUniqueId(id) {
        let candidate = id;
        let i = 2;
        const exists = (x) => this.schema.prefabs.some(p => p.id === x);
        while (exists(candidate)) {
            candidate = `${id}-${i++}`;
        }
        return candidate;
    }

    addOrUpdateEntry({ id, path, type }) {
        const idx = this.schema.prefabs.findIndex(p => p.id === id);
        const entry = { id, path, type };
        if (idx >= 0) this.schema.prefabs[idx] = entry;
        else this.schema.prefabs.push(entry);
        this._persist();
    }

    download(filename='prefab.schema.json') {
        const blob = new Blob([JSON.stringify(this.schema, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }

    _persist() {
        try {
            window.localStorage.setItem('prefab-editor:schema', JSON.stringify(this.schema));
        } catch {}
    }
}
