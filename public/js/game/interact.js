// スタミナ・村人・操作で使う物（宝箱・扉など）・店のメニュー。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { Monster } from '/js/entities.js';
import { SHOP_PAGE_SIZE } from '/js/game/constants.js';

export const interactMethods = {
    // 壁（colliders）の判定範囲（プレイヤーの半径ぶん外側へ広げた矩形）の中に (x, z) があるか
    // 崖（ちょうど 2 段高い所）をよじ登る: 崖に向かって前を押し続けて CLIMB_HOLD_SEC 秒で始まり、CLIMB_SEC 秒かかる。
    //   ①ジャンプして崖の縁に手をかける ②手で体を引き上げる ③足をひっかけて、よっこいしょと上がる ④縁の上に立つ。
    //   登っている間は歩けない。敵の攻撃で、ダメージを受けると、中断して下に落ちる（落下のダメージは、なし）。3 段以上の崖は、登れない
    // ---- スタミナ（character-spec 8.2e）。能力値・重量がまだないので、重量比 0.8・持久力 14・Lv1 の仮の値で計算する ----
    staminaMul() { const r = 0.8, d = this.staminaDef; return r <= 1 ? d.loadMulUnder.base + d.loadMulUnder.slope * r : Math.min(d.loadMulOver.max, 1 + (r - 1) * d.loadMulOver.slope); },

    staminaCost(kind, weaponWeight = 0) {
        const d = this.staminaDef; if (!d) return 0;
        const base = kind === 'dash' ? d.dashCost : weaponWeight * d.attackCoef;
        return base * this.staminaMul() / (1 + 14 * d.enduranceDivisor);
    },

    // 消費する。足りないとき（切れている・0 になる）は、false（ダッシュなどを止める）
    useStamina(amount) {
        const p = this.player;
        if (!this.staminaDef || p.staminaExhausted) return !this.staminaDef;
        p.stamina = Math.max(0, p.stamina - amount);
        p.staminaPause = this.staminaDef.regenPause;
        if (p.stamina <= 0) p.staminaExhausted = true;
        return true;
    },

    updateStamina(dt) {
        const p = this.player, d = this.staminaDef; if (!d) return;
        if (p.staminaPause > 0) { p.staminaPause -= dt; return; }
        p.stamina = Math.min(p.maxStamina, p.stamina + (14 * d.regenEnd + 1 * d.regenLevel) * dt);
        if (p.staminaExhausted && p.stamina >= p.maxStamina * d.resumeRatio) p.staminaExhausted = false;
    },

    updateNpcs(dt) {
        for (const n of this.npcs ?? []) {
            n.floorY = this.getFloorHeight(n.x, n.z, this.levelOfFloorY(n.floorY));
            n.update(dt, (x, z, r) => this.isNpcBlocked(n, x, z, r));
        }
    },

    // 近くの村人のセリフ（いなければ null）
    nearbyNpcSpeech() {
        let found = null;
        for (const n of this.npcs ?? []) {
            const s = n.speechFor(this.player);   // 離れた村人のセリフも、ここでリセットされる
            if (s !== null && found === null) found = n.shopId ? `${s}\n${this.shops?.[n.shopId]?.routes ? '【Eキー】乗船の受付' : '【Eキー】取引メニューを表示'}` : s;   // 店主には、最下行に操作の案内を添える
        }
        return found;
    },

    // Player interaction with nearest Chest or Door (triggered by pressing E)
    interactNearestObject() {
        // 0. 店主に話しかける（売買のメニューを開く）
        for (const n of this.npcs ?? []) {
            if (n.shopId && Math.hypot(this.player.x - n.x, this.player.z - n.z) <= (n.speechRadius ?? 3)) {
                this.openShopMenu(n.shopId);
                return true;
            }
        }
        // 0b. 話しかけた住民が、襲撃者（ambush）だった: 正体を現して、襲いかかる
        for (const n of this.npcs ?? []) {
            if (n.ambush && Math.hypot(this.player.x - n.x, this.player.z - n.z) <= 3.0) {
                this.revealAmbusher(n);
                return true;
            }
        }
        // 1. Check Treasure Chests
        if (this.chests && this.chests.length > 0) {
            for (const ch of this.chests) {
                if (ch.isOpen || !ch.group.visible) continue;
                const dist = Math.hypot(this.player.x - ch.x, this.player.z - ch.z);
                if (dist <= ch.radius + 1.2 && this.sameFloorAs(ch.floorY)) {
                    this.openChest(ch);
                    return true;
                }
            }
        }
        return false;
    },

    // Open chest or trigger Mimic encounter
    openChest(chest) {
        if (chest.isOpen) return;
        chest.isOpen = true;
        chest.targetLidAngle = -Math.PI * 0.55; // Flip lid wide open!
        chest.respawnTimer = 0;

        if (chest.isMimic) {
            // MIMIC TRAP!
            this.sound.playMimicGrowl();
            this.sound.playHurt();
            this.flashDamageScreen();

            // Bite damage!
            const biteDamage = 28;
            this.playerTakeDamage(biteDamage, new THREE.Vector3(0, 0, 0));
            this.particles.spawnBurst(chest.x, 1.2, chest.z, 0xdc2626, 20, 5.0);
            this.addPopup(`ガブッ！ミミックの奇襲！ -${biteDamage}`, '#ef4444');

            // Hide stationary chest object & disable solid collider so mimic and player can move freely
            chest.group.visible = false;
            if (chest.collider) {
                chest.collider.disabled = true;
            }

            const mimicDef = (this.enemyDefinitions && this.enemyDefinitions.mimic) ? this.enemyDefinitions.mimic : {
                name: '人喰い箱ミミック',
                maxHp: 75,
                speed: 2.2,
                attackPower: 18,
                exp: 80,
                radius: 0.95
            };
            const m = new Monster('mimic', chest.x, chest.z, this.textures, mimicDef);
            // On mimic defeat: gives high rewards
            m.exp = mimicDef.exp || 80;
            this.monsters.push(m);
            this.scene.add(m.sprite);
            this.notifyEnemyEngaged(m);

        } else {
            // NORMAL TREASURE CHEST!
            this.sound.playChestOpen();
            this.sound.playItemGet();

            // Gold / sparkles burst out of chest
            this.particles.spawnBurst(chest.x, 0.8, chest.z, 0xfbbf24, 22, 4.0);

            // Roll loot from lootTable
            const lootItem = chest.lootTable[Math.floor(Math.random() * chest.lootTable.length)];
            if (lootItem.type === 'gold') {
                const amount = Math.floor(Math.random() * (lootItem.max - lootItem.min + 1)) + lootItem.min;
                this.player.gold = (this.player.gold || 0) + amount;
                this.addPopup(`宝箱発見！ ${amount}G 入手！`, '#facc15');
            } else if (lootItem.type === 'heal_potion') {
                const healAmt = lootItem.heal || 40;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
                this.particles.spawnBurst(this.player.x, 1.0, this.player.z, 0x22c55e, 14, 3.0);
                this.addPopup(`宝箱発見！ HP薬で+${healAmt}回復！`, '#22c55e');
            } else if (lootItem.type === 'mp_potion') {
                const healAmt = lootItem.heal || 30;
                this.player.mp = Math.min(this.player.maxMp, this.player.mp + healAmt);
                this.particles.spawnBurst(this.player.x, 1.0, this.player.z, 0x38bdf8, 14, 3.0);
                this.addPopup(`宝箱発見！ MP薬で+${healAmt}回復！`, '#38bdf8');
            }
        }
    },

    // 店のメニュー（「買う」「売る」→「販売一覧」）。品揃え・価格は shops.json のダミー。買う・売るの処理はまだ無い
    openShopMenu(shopId) {
        this.shopMenu = { shopId, screen: 'top', index: 0, note: '' };
        for (const k of Object.keys(this.keys)) this.keys[k] = false;   // 押しっぱなしの移動キーを止める
        if (!this.shopMenuEl) {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:50%;bottom:8%;transform:translateX(-50%);min-width:340px;max-width:90vw;' +
                'background:rgba(15,23,42,0.95);border:2px solid #38bdf8;border-radius:10px;color:#f8fafc;padding:14px 18px;z-index:200;font-size:16px;';
            document.body.appendChild(el);
            this.shopMenuEl = el;
        }
        this.shopMenuEl.style.display = 'block';
        this.renderShopMenu();
    },

    closeShopMenu() {
        this.shopMenu = null;
        if (this.shopMenuEl) this.shopMenuEl.style.display = 'none';
    },

    // 画面ごとの選択肢（label, 選んだときの動き）
    shopMenuChoices() {
        const m = this.shopMenu, shop = this.shops?.[m.shopId] ?? {};
        if (m.screen === 'buy') {
            // 販売一覧は 1 画面に SHOP_PAGE_SIZE 件ずつ。多いときはページ送り（←→ か「次のページ」）
            const all = shop.goods ?? [], pages = Math.max(1, Math.ceil(all.length / SHOP_PAGE_SIZE));
            m.page = Math.min(m.page ?? 0, pages - 1);
            const goods = all.slice(m.page * SHOP_PAGE_SIZE, (m.page + 1) * SHOP_PAGE_SIZE)
                .map(g => ({ label: `${g.name}　${g.price}G`, act: () => { m.note = `（ダミー）${g.name}の購入は準備中です`; } }));
            const turn = (d) => () => { m.page += d; m.index = 0; m.note = ''; };
            if (m.page > 0) goods.push({ label: '◀ 前のページ', act: turn(-1) });
            if (m.page < pages - 1) goods.push({ label: '次のページ ▶', act: turn(1) });
            return [...goods, { label: 'もどる', act: () => { m.screen = 'top'; m.index = 0; m.note = ''; } }];
        }
        if (m.screen === 'sell') {
            return [{ label: 'もどる', act: () => { m.screen = 'top'; m.index = 1; m.note = ''; } }];
        }
        if (shop.routes) {   // 渡し場: 行き先と船賃の一覧（選ぶと、船賃を払って乗船）
            const g = this.player.gold ?? 0;
            return [...shop.routes.map(r => ({ label: `${r.name}　${r.price}G`, act: () => { m.note = this.boardFerry(r) ? '' : `お金が足りません（船賃 ${r.price}G・所持 ${g}G）`; } })),
                { label: 'やめる', act: () => this.closeShopMenu() }];
        }
        return [
            { label: '買う', act: () => { m.screen = 'buy'; m.page = 0; m.index = 0; m.note = ''; } },
            { label: '売る', act: () => { m.screen = 'sell'; m.index = 0; m.note = ''; } },
            { label: 'やめる', act: () => this.closeShopMenu() }
        ];
    },

    renderShopMenu() {
        const m = this.shopMenu;
        if (!m) return;
        const shop = this.shops?.[m.shopId] ?? {};
        const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const title = { top: shop.routes ? 'どの船に乗船しますか？' : `${shop.name ?? '店'}　いらっしゃい！`, buy: `販売一覧（${(m.page ?? 0) + 1}/${Math.max(1, Math.ceil((shop.goods ?? []).length / SHOP_PAGE_SIZE))}）`, sell: '売却（持ち物）' }[m.screen];
        const choices = this.shopMenuChoices();
        const body = m.screen === 'sell' ? '<div style="margin:6px 0;color:#94a3b8">（ダミー）売れる持ち物の一覧は準備中です</div>' : '';
        this.shopMenuEl.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;color:#7dd3fc">${esc(title)}</div>${body}` +
            choices.map((c, i) => `<div data-i="${i}" style="padding:3px 10px;cursor:pointer;${i === m.index ? 'background:#1e3a5f;border-radius:4px' : ''}">${i === m.index ? '▶ ' : '　'}${esc(c.label)}</div>`).join('') +
            `<div style="margin-top:8px;color:#fbbf24;min-height:1.2em">${esc(m.note)}</div>` +
            '<div style="margin-top:4px;color:#64748b;font-size:12px">↑↓ 選ぶ　Enter/E 決定　Esc 閉じる</div>';
        this.shopMenuEl.querySelectorAll('[data-i]').forEach(d => {
            d.onclick = () => { m.index = Number(d.dataset.i); this.shopMenuChoices()[m.index].act(); this.renderShopMenu(); };
        });
    },

    shopMenuKey(e) {
        const m = this.shopMenu, n = this.shopMenuChoices().length;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') m.index = (m.index + n - 1) % n;
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') m.index = (m.index + 1) % n;
        else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && m.screen === 'buy') {
            const all = this.shops?.[m.shopId]?.goods ?? [], pages = Math.ceil(all.length / SHOP_PAGE_SIZE);
            m.page = Math.max(0, Math.min(pages - 1, (m.page ?? 0) + (e.code === 'ArrowLeft' ? -1 : 1)));
            m.index = 0; m.note = '';
        }
        else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') this.shopMenuChoices()[m.index].act();
        else if (e.code === 'Escape') { if (m.screen === 'top') this.closeShopMenu(); else { m.screen = 'top'; m.index = 0; m.note = ''; } }
        else return;
        e.preventDefault();
        this.renderShopMenu();
    },
};
