// animationExporter.js
/**
 * The AnimationExporter is a small bridge that:
 *  - fetches the current animation data from the AnimationStudio
 *  - validates target names against the current scene
 *  - returns { animations, keys } for export
 */
export class AnimationExporter {
    constructor(sceneMgr, studio) {
        this.scene = sceneMgr;
        this.studio = studio;
    }

    /**
     * @returns {{animations: Record<string, any[]>, keys: string[]}}
     */
    collect() {
        const data = this.studio.getData(); // { animations: { key: [behaviors...] } }
        const anims = data?.animations || {};
        // Basic validation: drop behaviors with missing targets (except 'all')
        const cleaned = {};
        for (const [key, list] of Object.entries(anims)) {
            cleaned[key] = (list || []).filter(b => {
                if (b.target === 'all') return true;
                const obj = this.scene.root.getObjectByName(b.target);
                return !!obj;
            });
        }
        return { animations: cleaned, keys: Object.keys(cleaned) };
    }
}
