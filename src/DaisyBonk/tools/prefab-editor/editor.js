// editor.js
import { SceneManager } from './scene.js';
import { Exporter } from './exporter.js';
import { UIManager } from './ui.js';
import { SchemaManager } from './schema.js';



const sceneMgr = new SceneManager('#viewport', (obj) => {});
const exporter = new Exporter(sceneMgr);
const schemaMgr = new SchemaManager();
const ui = new UIManager(sceneMgr, exporter, schemaMgr);

// ✅ Wait until DOM is fully parsed before running ui.init()
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ui.init());
} else {
    ui.init();
}

// Expose for debugging
window.Editor = { sceneMgr, exporter, schemaMgr };
