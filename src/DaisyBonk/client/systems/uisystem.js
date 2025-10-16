export class UISystem {
    constructor(){
        this.el = {
            hpFill: document.getElementById('hpFill'),
            mpFill: document.getElementById('mpFill'),
            shFill: document.getElementById('shFill'),
            hpText: document.getElementById('hpText'),
            mpText: document.getElementById('mpText'),
            shText: document.getElementById('shText'),
            stage:  document.getElementById('stageText'),
            kills:  document.getElementById('killText'),
            boss:   document.getElementById('bossText'),
            objective: document.getElementById('objectiveText'),
            weaponSlots: document.getElementById('weaponSlots'),
            startOverlay: document.getElementById('startOverlay'),
            startBtn: document.getElementById('startBtn'),
            stageOverlay: document.getElementById('stageOverlay'),
            stageTitle: document.getElementById('stageTitle'),
            stageSubtitle: document.getElementById('stageSubtitle'),
            stageBtn: document.getElementById('stageBtn'),
            endOverlay: document.getElementById('endOverlay'),
            endTitle: document.getElementById('endTitle'),
            endSubtitle: document.getElementById('endSubtitle'),
            restartBtn: document.getElementById('restartBtn'),
            toast: document.getElementById('toast'),

            // NEW: reward overlay
            rewardOverlay: document.getElementById('rewardOverlay'),
            rewardTitle: document.getElementById('rewardTitle'),
            rewardOptions: document.getElementById('rewardOptions'),
        };
        this._toastTimer = null;
        this._weaponSig = '';

        // reward state
        this._rewardOnPick = null;
        this._rewardKeyHandler = (e)=>this._onRewardKey(e);
    }

    bindButtons({ onStart, onStageContinue, onRestart }) {
        // --- Start button ---
        this.el.startBtn.onclick = () => {
            this.el.startOverlay.classList.remove('show');
            onStart?.();
        };

        // --- Stage Continue button ---
        this.el.stageBtn.onclick = () => {
            this.el.stageOverlay.classList.remove('show');
            onStageContinue?.();
        };

        // --- Click on stage overlay backdrop ---
        this.el.stageOverlay.onclick = (e) => {
            if (e.target === this.el.stageOverlay) {
                this.el.stageOverlay.classList.remove('show');
                onStageContinue?.();
                window.removeEventListener('keydown', this._onStageKey);
            }
        };

        // --- "Press any key to continue" support ---
        this._onStageKey = (e) => {
            // only act if overlay is currently visible
            if (this.el.stageOverlay.classList.contains('show')) {
                this.el.stageOverlay.classList.remove('show');
                onStageContinue?.();
                window.removeEventListener('keydown', this._onStageKey);
            }
        };

        // Whenever you show the stage overlay, enable the listener:
        this.el.stageOverlay.addEventListener('transitionend', () => {
            if (this.el.stageOverlay.classList.contains('show')) {
                window.addEventListener('keydown', this._onStageKey);
            }
        });

        // --- Restart button ---
        this.el.restartBtn.onclick = () => {
            this.el.endOverlay.classList.remove('show');
            onRestart?.();
        };
    }

    showStart(){ this.el.startOverlay.classList.add('show'); }
    showStage(stage, initial=false){
        this.el.stageTitle.textContent = `Stage ${stage}`;
        this.el.stageSubtitle.textContent = initial ? 'Find the portal, defeat the boss.' : 'Stage advanced! Enemies grow stronger.';
        this.el.stageOverlay.classList.add('show');
    }
    showEnd(victory){
        this.el.endTitle.textContent = victory ? 'You Won!' : 'You Died';
        this.el.endSubtitle.textContent = victory ? 'All 10 stages cleared. Great job.' : 'Try again for a better roll!';
        this.el.endOverlay.classList.add('show');
    }

    setObjective(text){ this.el.objective.textContent = text; }

    toast(text){
        const t = this.el.toast;
        t.textContent = text;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(()=>t.classList.remove('show'), 1500);
    }
    showClassSelect(classes, onPick){
        const ov = document.getElementById('classOverlay');
        const list = document.getElementById('classOptions');
        ov.classList.add('show');
        list.innerHTML = '';
        classes.forEach(c=>{
            const el = document.createElement('button');
            el.className = 'class-card';
            el.innerHTML = `<h3>${c.name}</h3><p>${c.desc}</p>`;
            el.onclick = ()=>{ ov.classList.remove('show'); onPick(c.id); };
            list.appendChild(el);
        });
    }
    showNamePrompt(onSubmit){
        const ov = document.getElementById('nameOverlay');
        const input = document.getElementById('nameInput');
        const btn = document.getElementById('nameBtn');
        ov.classList.add('show');
        input.value = '';
        input.focus();
        const go = ()=>{
            const val = input.value.trim() || 'Player';
            ov.classList.remove('show');
            onSubmit?.(val);
        };
        btn.onclick = go;
        input.onkeydown = (e)=>{ if(e.key==='Enter') go(); };
    }
    hideNamePrompt(){
        const ov = document.getElementById('nameOverlay');
        ov.classList.remove('show');
    }
    hideClassSelect(){
        const ov = document.getElementById('classOverlay');
        ov.classList.remove('show');
    }
    // ---- HUD ----
    updateHUD(game){
        const p = game.player;
        const hp = (p.health / p.stats.maxHealth) * 100;
        const mp = (p.mana   / p.stats.maxMana)   * 100;
        const sh = (p.shield / p.stats.maxShield) * 100;
        this.el.hpFill.style.width = hp.toFixed(1)+'%';
        this.el.mpFill.style.width = mp.toFixed(1)+'%';
        this.el.shFill.style.width = sh.toFixed(1)+'%';
        this.el.hpText.textContent = `HP ${Math.round(p.health)} / ${p.stats.maxHealth}`;
        this.el.mpText.textContent = `MP ${Math.round(p.mana)} / ${p.stats.maxMana}`;
        this.el.shText.textContent = `Shield ${Math.round(p.shield)} / ${p.stats.maxShield}`;
        this.el.stage.textContent = (game.stage ?? 1).toString();
        this.el.kills.textContent = (game.kills ?? 0).toString();
        this.el.boss.textContent = game.bossAlive ? 'Alive' : 'Defeated';

        // --- stats panel ---
        const set = (id,val)=>{
            const e=document.getElementById(id);
            if(e) e.textContent=val;
        };
        set('statMove', p.stats.moveSpeed.toFixed(2));
        set('statDmg',  p.stats.damageMult.toFixed(2)+'x');
        set('statAS',   p.stats.attackSpeed.toFixed(2)+'x');
        set('statPQ',   'x'+p.stats.projectileQty);
        set('statCrit', (p.stats.critChance*100).toFixed(0)+'%');
        set('statArmor',p.stats.armor.toString());
        set('statDodge',(p.stats.dodge*100).toFixed(0)+'%');
        set('statRegen',`${p.stats.healthRegen.toFixed(3)} / ${p.stats.manaRegen.toFixed(3)}`);

        this.refreshWeaponsUI(game.player);
    }

    refreshWeaponsUI(player){
        const cont = this.el.weaponSlots;
        if (!cont) return;

        const weps = Array.isArray(player?.weapons) ? player.weapons : [];
        const sig = JSON.stringify({
            ids: weps.map(w => w.id || w.name || 'unknown'),
            active: typeof player?.activeIndex === 'number' ? player.activeIndex : 0
        });
        if (sig === this._weaponSig) return;
        this._weaponSig = sig;

        cont.innerHTML = '';
        if (weps.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'slot empty';
            empty.textContent = 'No weapons';
            cont.appendChild(empty);
            return;
        }
        weps.forEach((w, i)=>{
            const name = w.name || titleize(w.id || 'Weapon');
            const type = w.type || 'Weapon';
            const el = document.createElement('div');
            el.className = 'slot' + (i === (player?.activeIndex ?? 0) ? ' active' : '');
            el.innerHTML = `
                <div class="num">${i+1}</div>
                <div class="name">${escapeHtml(name)}</div>
                <div class="tag">${escapeHtml(type)}</div>
            `;
            cont.appendChild(el);
        });

        function titleize(s){ return s.replace(/[_-]/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^\w/, c => c.toUpperCase()); }
        function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
    }

    // ---- Rewards UI ----
    showReward(options, onPick){
        this._rewardOnPick = onPick;
        const ov = this.el.rewardOverlay;
        const list = this.el.rewardOptions;
        ov.classList.add('show');
        list.innerHTML = '';

        options.forEach((opt, i)=>{
            const item = document.createElement('button');
            item.className = `reward-card rar-${opt.rarity} rarity-${opt.rarity}`;
            item.setAttribute('data-idx', i.toString());
            item.innerHTML = `
                <div class="key">${i+1}</div>
                <div class="name">${escapeHtml(opt.name)}</div>
                <div class="rar">${escapeHtml(opt.rarity)}</div>
                <div class="desc">${escapeHtml(opt.desc || '')}</div>
                <div class="alt">Hotkeys: ${['1','2','3'][i]} / ${['Z','X','C'][i]}</div>
            `;
            item.onclick = () => this._commitReward(i);
            list.appendChild(item);
        });

        window.addEventListener('keydown', this._rewardKeyHandler, { passive: true });

        function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
    }

    hideReward(){
        const ov = this.el.rewardOverlay;
        ov.classList.remove('show');
        window.removeEventListener('keydown', this._rewardKeyHandler);
        this._rewardOnPick = null;
    }

    _onRewardKey(e){
        const k = (e.key || '').toLowerCase();
        if (!this._rewardOnPick) return;
        if (k === '1' || k === 'z') return this._commitReward(0);
        if (k === '2' || k === 'x') return this._commitReward(1);
        if (k === '3' || k === 'c') return this._commitReward(2);
    }

    _commitReward(idx){
        if (!this._rewardOnPick) return;
        const fn = this._rewardOnPick;
        this.hideReward();
        try { fn(idx); } catch {}
    }
}
