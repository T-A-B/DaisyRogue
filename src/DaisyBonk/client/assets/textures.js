import * as THREE from 'three';
import { rand } from '../utils/math.js';

export function makePatternTexture(seedHue = rand(0,1), variant = 'checker') {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');

    const base = new THREE.Color().setHSL(seedHue, 0.55, 0.55);
    const alt  = new THREE.Color().setHSL((seedHue+0.08)%1, 0.45, 0.35);
    const edge = new THREE.Color().setHSL((seedHue+0.17)%1, 0.65, 0.25);

    if (variant === 'checker'){
        const n=8;
        for(let y=0;y<n;y++){
            for(let x=0;x<n;x++){
                const t = (x+y)%2;
                ctx.fillStyle = t ? base.getStyle() : alt.getStyle();
                ctx.fillRect((x*s/n)|0,(y*s/n)|0,(s/n)|0,(s/n)|0);
            }
        }
    } else if (variant === 'stripes'){
        const n=10;
        for(let x=0;x<n;x++){
            ctx.fillStyle = (x%2?base:alt).getStyle();
            ctx.fillRect((x*s/n)|0,0,(s/n)|0,s);
        }
    } else {
        // dots
        ctx.fillStyle = alt.getStyle(); ctx.fillRect(0,0,s,s);
        ctx.fillStyle = base.getStyle();
        for(let i=0;i<120;i++){
            const r = rand(2,5);
            ctx.beginPath();
            ctx.arc(rand(0,s),rand(0,s),r,0,Math.PI*2);
            ctx.fill();
        }
    }
    ctx.strokeStyle = edge.getStyle();
    ctx.lineWidth = 4;
    ctx.strokeRect(2,2,s-4,s-4);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}
