// HUD（体力などの表示・ミニマップ・方角・立て札の表示・ポップアップ・画面の光）。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import { compassDirection } from '/js/game/constants.js';

export const hudMethods = {
    updateUI(dt = 0) {
        // 値が変わったときだけ DOM に書く（毎フレームの書き込みは、再計算・再描画を起こすため。要素も一度だけ取得して使い回す）
        const ui = this._uiCache || (this._uiCache = { els: {}, vals: {} });
        const put = (id, prop, val) => {
            if (ui.vals[id] === val) return;
            const el = ui.els[id] || (ui.els[id] = document.getElementById(id));
            if (!el) return;
            ui.vals[id] = val;
            if (prop === 'width') el.style.width = val; else el.innerText = val;
        };
        put('hpBar', 'width', `${(this.player.hp / this.player.maxHp) * 100}%`);
        put('hpText', 'text', `${Math.ceil(this.player.hp)}/${this.player.maxHp}`);
        put('mpBar', 'width', `${(this.player.mp / this.player.maxMp) * 100}%`);
        put('mpText', 'text', `${Math.floor(this.player.mp)}/${this.player.maxMp}`);
        put('staminaBar', 'width', `${(this.player.stamina / this.player.maxStamina) * 100}%`);
        put('levelText', 'text', `Lv.${this.player.level}`);
        put('expText', 'text', `EXP: ${this.player.exp}`);
        put('goldText', 'text', `${this.player.gold || 0} G`);
        const names = { poison: '毒', burn: '火傷', slow: '鈍足', paralysis: '麻痺', silence: '沈黙', curse: '呪い' };
        put('playerStatus', 'text', Object.keys(this.player.status ?? {}).map(k => `${names[k] ?? k}${Math.ceil(this.player.status[k].t)}`).join(' '));
        put('monsterCount', 'text', `敵残数: ${this.monsters.filter(m => m.active).length}`);

        // Update active enemy status cards stacked above player HP/MP (Ys-style Target Info)
        const enemyListEl = document.getElementById('enemyHudList');
        if (enemyListEl && this.activeEnemyCards) {
            // Tick down timers and remove expired or dead enemies
            for (let i = this.activeEnemyCards.length - 1; i >= 0; i--) {
                const card = this.activeEnemyCards[i];
                card.timer -= dt;
                card.hp = Math.max(0, card.monster ? card.monster.hp : 0);

                // Expire when timer runs out (2.5s)
                if (card.timer <= 0) {
                    this.activeEnemyCards.splice(i, 1);
                }
            }

            // Render current active enemy cards with DOM reuse to prevent re-creation flicker
            if (this.activeEnemyCards.length === 0) {
                if (enemyListEl.innerHTML !== '') {
                    enemyListEl.innerHTML = '';
                }
            } else {
                // Generate a key representing the state to only re-render when contents change
                const newHtml = this.activeEnemyCards.map(c => {
                    const hpPercent = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
                    return `
                        <div class="enemy-hud-card">
                            <img class="enemy-hud-icon" src="${c.iconUrl}" alt="${c.name}" onerror="this.src='/images/enemies/slime/slime.png'">
                            <div class="enemy-hud-details">
                                <div class="enemy-hud-header">
                                    <span>${c.name}</span>
                                    <span>${c.hp}/${c.maxHp}</span>
                                </div>
                                <div class="enemy-hud-hp-bg">
                                    <div class="enemy-hud-hp-fill" style="width: ${hpPercent}%;"></div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                if (enemyListEl.innerHTML !== newHtml) {
                    enemyListEl.innerHTML = newHtml;
                }
            }
        }
    },

    renderMinimap() {
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        const mapData = this.mapData;
        if (!mapData) return;

        const rows = mapData.layout.length;
        const cols = mapData.layout[0].length;
        const tileSize = mapData.tileSize || 4;
        const scaleX = w / (cols * tileSize);
        const scaleZ = h / (rows * tileSize);

        // Draw walls: 動かない壁は、マップごとに 1 回だけ別の canvas に描いて、使い回す（大森林は、壁（木）が 700〜2000 個あり、毎フレーム描くと、重い）
        const baseKey = `${this.currentMapId}:${this.colliders.length}`;
        if (!this.minimapBase || this.minimapBase.key !== baseKey) {
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const bctx = cv.getContext('2d');
            bctx.fillStyle = '#475569';
            for (const c of this.colliders) {
                bctx.fillRect(c.minX * scaleX, c.minZ * scaleZ,
                    (c.maxX - c.minX) * scaleX, (c.maxZ - c.minZ) * scaleZ);
            }
            this.minimapBase = { key: baseKey, canvas: cv };
        }
        ctx.drawImage(this.minimapBase.canvas, 0, 0);

        // Draw Portal
        for (const portal of this.portals) {
            ctx.fillStyle = portal.link.color ?? '#38bdf8';
            ctx.beginPath();
            ctx.arc(portal.x * scaleX, portal.z * scaleZ, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Chests (Gold square on minimap)
        if (this.chests) {
            for (const ch of this.chests) {
                if (!ch.group.visible) continue;
                ctx.fillStyle = ch.isOpen ? '#94a3b8' : '#facc15';
                ctx.fillRect(ch.x * scaleX - 2, ch.z * scaleZ - 2, 4, 4);
            }
        }

        // Draw Monsters
        for (const m of this.monsters) {
            if (!m.active) continue;
            ctx.fillStyle = (m.type === 'S') ? '#10b981' : '#f97316';
            ctx.beginPath();
            ctx.arc(m.x * scaleX, m.z * scaleZ, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 村人（黄色い点）
        ctx.fillStyle = '#facc15';
        for (const n of this.npcs ?? []) {
            ctx.beginPath();
            ctx.arc(n.x * scaleX, n.z * scaleZ, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Player & View Cone
        const px = this.player.x * scaleX;
        const pz = this.player.z * scaleZ;

        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Direction line
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, pz);
        ctx.lineTo(
            px - Math.sin(this.player.angle) * 12,
            pz - Math.cos(this.player.angle) * 12
        );
        ctx.stroke();
    },

    // 方角の表示（ゲーム画面の右上）: 向きが変わって、大体の方向が変わったときだけ、書き換える
    updateCompass() {
        const name = compassDirection(this.player.angle);
        if (name === this.compassName) return;
        this.compassName = name;
        const el = document.getElementById('compassText');
        if (el) el.innerText = name;
    },

    updateSignpostBanner(message, icon = '📜') {
        const banner = document.getElementById('signpostBanner');
        if (!banner) return;
        if (message) {
            if (banner.innerText !== `${icon} ${message}`) {
                banner.innerText = `${icon} ${message}`;
            }
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    },

    addPopup(text, color, worldX = null, worldZ = null) {
        const el = document.createElement('div');
        el.className = 'damage-popup';
        el.innerText = text;
        el.style.color = color;
        el.style.left = '50%';
        el.style.top = '45%';
        document.getElementById('hudOverlay').appendChild(el);

        setTimeout(() => {
            el.remove();
        }, 800);
    },

    updatePopups(dt) {
        // Simple DOM based popups auto-remove
    },

    flashDamageScreen() {
        const overlay = document.getElementById('damageFlash');
        if (overlay) {
            overlay.style.backgroundColor = '#ef4444';
            overlay.style.opacity = '0.5';
            setTimeout(() => { overlay.style.opacity = '0'; }, 150);
        }
    },

    flashScreen(colorRgba) {
        const overlay = document.getElementById('damageFlash');
        if (overlay) {
            overlay.style.backgroundColor = colorRgba;
            overlay.style.opacity = '0.6';
            setTimeout(() => { overlay.style.opacity = '0'; }, 120);
        }
    },
};
