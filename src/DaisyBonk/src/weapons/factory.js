import * as THREE from 'three';
import { Weapon } from './weapon.js';
import { critApplied } from '../utils/combat.js';
import { rand } from '../utils/math.js';

const TAU = Math.PI * 2;

export const WeaponFactory = {
    sword(){
        return new Weapon('Sword','sword',{
            cooldown:0.55, baseDamage:24, color:'#f0c38a',
            fireFn:(game, player, dir, self)=>{
                const range = 2.2, arc = Math.PI * 0.9;
                const src = player.pos().clone();
                let hits = 0;
                for(const e of game.enemies){
                    if (e.dead) continue;
                    const delta = e.pos().clone().sub(src); delta.y=0;
                    if (delta.length() > range) continue;
                    const angTo = Math.atan2(delta.x, delta.z);
                    const angFacing = Math.atan2(dir.x, dir.z);
                    const d = Math.abs(((angTo-angFacing+Math.PI)%TAU)-Math.PI);
                    if (d <= arc*0.5){
                        const { dmg, crit } = critApplied(self.baseDamage * player.stats.damageMult, player.stats.critChance);
                        e.hp -= dmg; hits++;
                        game.fx.fxDamage(e.pos(), dmg, crit);
                        game.fx.fxSlash(src, dir);
                        if (e.hp <= 0) game.killEnemy(e);
                    }
                }
                if (!hits) game.fx.fxSlash(src, dir);
            }
        });
    },

    pistol(){
        return new Weapon('Pistol','pistol',{
            cooldown:0.25, baseDamage:12, color:'#a8c6ff',
            fireFn:(game, player, dir, self)=>{
                const qty = player.stats.projectileQty;
                for(let i=0;i<qty;i++){
                    const jitter = rand(-0.04,0.04);
                    const d = dir.clone().applyAxisAngle(new THREE.Vector3(0,1,0), jitter).normalize();
                    game.spawnProjectile(player, d, {
                        speed: 32, ttl:1.6, radius:1.18, color:self.color,
                        // NOTE: preserved from original (very high); feel free to tune later.
                        damage: self.baseDamage * player.stats.damageMult + 500
                    });
                }
            }
        });
    },

    shotgun(){
        return new Weapon('Shotgun','shotgun',{
            cooldown:0.85, baseDamage:8, color:'#ffd084',
            fireFn:(game, player, dir, self)=>{
                const pellets = 8 * player.stats.projectileQty;
                for(let i=0;i<pellets;i++){
                    const spread = rand(-0.22,0.22);
                    const d = dir.clone().applyAxisAngle(new THREE.Vector3(0,1,0), spread).normalize();
                    game.spawnProjectile(player, d, {
                        speed: 26, ttl:1.0, radius:0.18, color:self.color,
                        damage: self.baseDamage * player.stats.damageMult
                    });
                }
                game.fx.fxMuzzle(player.pos(), dir);
            }
        });
    },

    lightsaber(){
        return new Weapon('Lightsaber','lightsaber',{
            cooldown:0.05, baseDamage:9, color:'#7a7cff', manaCost:2, continuous:true, tickEvery:0.1,
            fireFn:(game, player, dir, self)=>{
                const range = 2.6, arc = Math.PI * 1.0;
                game.fx.fxSaber(player, dir, range);
                for(const e of game.enemies){
                    if (e.dead) continue;
                    const delta = e.pos().clone().sub(player.pos()); delta.y=0;
                    if (delta.length() > range) continue;
                    const angTo = Math.atan2(delta.x, delta.z);
                    const angFacing = Math.atan2(dir.x, dir.z);
                    const d = Math.abs(((angTo-angFacing+Math.PI)%TAU)-Math.PI);
                    if (d <= arc*0.5){
                        const { dmg, crit } = critApplied(self.baseDamage * player.stats.damageMult, player.stats.critChance);
                        e.hp -= dmg;
                        game.fx.fxDamage(e.pos(), dmg, crit);
                        if (e.hp <= 0) game.killEnemy(e);
                    }
                }
            }
        });
    },

    fireTome(){
        return new Weapon('Fire Tome','fire',{
            cooldown:0.65, baseDamage:36, color:'#ff7a4d', manaCost:14,
            fireFn:(game, player, dir, self)=>{
                game.spawnProjectile(player, dir, {
                    speed: 22, ttl:1.8, radius:0.25, color:self.color,
                    damage: self.baseDamage * player.stats.damageMult,
                    onHitExplosion:{ radius:3.0, burnDps:6, burnTime:2.5 }
                });
            }
        });
    },

    waterTome(){
        return new Weapon('Water Tome','water',{
            cooldown:0.6, baseDamage:20, color:'#58f1f9', manaCost:12,
            fireFn:(game, player, dir, self)=>{
                game.spawnProjectile(player, dir, {
                    speed: 24, ttl:1.6, radius:0.23, color:self.color,
                    damage: self.baseDamage * player.stats.damageMult,
                    onHitSlow:{ slowSecs:3.0 }
                });
            }
        });
    },

    lightningTome(){
        return new Weapon('Lightning Tome','lightning',{
            cooldown:0.55, baseDamage:28, color:'#e8e86a', manaCost:18,
            fireFn:(game, player, dir, self)=>{
                const src = player.pos().clone().add(dir.clone().multiplyScalar(0.5));
                let first = null, bestD = 999;
                for(const e of game.enemies){
                    if (e.dead) continue;
                    const d = e.pos().distanceTo(src);
                    if (d < 8.0 && d < bestD){ bestD=d; first=e; }
                }
                if (first){
                    const chain = 3, falloff = 0.7;
                    let dmg = self.baseDamage * player.stats.damageMult;
                    let current = first; let remaining=chain;
                    const hitSet = new Set();
                    while(current && remaining-- >= 0){
                        const { dmg:dc, crit } = critApplied(dmg, player.stats.critChance);
                        current.hp -= dc;
                        game.fx.fxDamage(current.pos(), dc, crit);
                        game.fx.fxLightning(src, current.pos());
                        if (current.hp <= 0) game.killEnemy(current);
                        hitSet.add(current);
                        // next
                        let next=null, b=999;
                        for(const e of game.enemies){
                            if (e.dead || hitSet.has(e)) continue;
                            const d = e.pos().distanceTo(current.pos());
                            if (d < 7.5 && d < b){ b=d; next=e; }
                        }
                        dmg *= falloff;
                        src.copy(current.pos());
                        current = next;
                    }
                } else {
                    game.spawnProjectile(player, dir, {
                        speed: 26, ttl:0.8, radius:0.2, color:self.color,
                        damage: self.baseDamage * player.stats.damageMult
                    });
                }
            }
        });
    },
};
