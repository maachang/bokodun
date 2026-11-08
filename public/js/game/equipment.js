// 装備・武器スロット・魔法スロットの選択と HUD（効果のテストボタンを含む）。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import { effectPower } from '/js/game/constants.js';

export const equipmentMethods = {
    // ---- 武器スロットと魔法スロット（アイテム定義は items.json、初期値は player.json）----
    //   武器スロット（player.equipSlots・8 枠）: 近接武器は「突進攻撃」に、杖・ロッドは魔法の補正に使う。HUD のクリックで選ぶ
    //   魔法スロット（player.magicSlots・4 枠）: 呪文または弓。数字キー 1〜4 で切り替え、中身は HUD のセレクトボックスで自由に選ぶ。Space / F / クリックで使う
    getSlotItem(slot) {
        const id = (slot === null || slot === undefined) ? null : this.player.equipSlots[slot];
        return (id && this.items[id]) || null;
    },

    // 突進攻撃に使う近接武器（未装備なら素手）
    getMeleeItem() {
        return this.getSlotItem(this.player.meleeSlot) || this.items.fists || null;
    },

    // 魔法を補正する杖・ロッド（未装備なら null）
    getFocusItem() {
        return this.getSlotItem(this.player.focusSlot);
    },

    // 選択中の魔法スロットのアイテム（空きなら null）
    getMagicItem(slot = this.player.selectedMagic) {
        const id = this.player.magicSlots[slot];
        return (id && this.items[id]) || null;
    },

    // 武器スロットのクリック選択: 近接武器は突進用に装備、杖・ロッドは補正として装備（もう一度選ぶと外れる）。空きは何も変わらない
    selectSlot(slot) {
        const item = this.getSlotItem(slot);
        const cls = item && this.weaponClasses[item.weaponClass];
        if (!cls) return;
        if (cls.attack === 'melee') {
            this.player.meleeSlot = slot;
        } else if (cls.attack === 'cast') {
            this.player.focusSlot = (this.player.focusSlot === slot) ? null : slot;
        }
        this.updateEquipHud();
    },

    // 数字キー 1〜4: 魔法スロットを選ぶ（範囲外は無視。空きスロットも選べる）
    selectMagic(slot) {
        if (slot < 0 || slot >= this.player.magicSlots.length) return;
        this.player.selectedMagic = slot;
        this.updateEquipHud();
    },

    // Tab: 次の「空きでない」魔法スロットへ順送り
    cycleMagic() {
        const slots = this.player.magicSlots;
        for (let step = 1; step <= slots.length; step++) {
            const next = (this.player.selectedMagic + step) % slots.length;
            if (this.getMagicItem(next)) {
                this.selectMagic(next);
                return;
            }
        }
    },

    // 魔法スロットに入れられるのは、呪文または弓（shoot クラスの武器）
    isMagicItem(item) {
        if (!item) return false;
        if (item.kind === 'spell') return true;
        return this.weaponClasses[item.weaponClass]?.attack === 'shoot';
    },

    // 魔法スロットの中身を変える（HUD のセレクトボックス / デバッグ: game.setMagicSlot(2, 'magic_bolt')）
    setMagicSlot(slot, itemId) {
        if (slot < 0 || slot >= this.player.magicSlots.length) {
            console.warn(`魔法スロット番号が範囲外です (0〜${this.player.magicSlots.length - 1})`);
            return false;
        }
        if (itemId !== null && !this.isMagicItem(this.items[itemId])) {
            console.warn(`魔法スロットに入れられません（呪文または弓のみ）: ${itemId}`);
            return false;
        }
        this.player.magicSlots[slot] = itemId;
        this.updateEquipHud();
        return true;
    },

    // デバッグ用: 武器スロットの中身を差し替える（コンソールから game.equipItem(6, 'iron_mace') / game.equipItem(6, null)）
    //   入れられるのは近接武器と杖・ロッド。呪文と弓は魔法スロットへ（setMagicSlot）
    equipItem(slot, itemId) {
        if (slot < 0 || slot >= this.player.equipSlots.length) {
            console.warn(`スロット番号が範囲外です (0〜${this.player.equipSlots.length - 1})`);
            return false;
        }
        if (itemId !== null && !this.items[itemId]) {
            console.warn(`未定義のアイテムです: ${itemId} （game.listItems() で一覧）`);
            return false;
        }
        if (itemId !== null && this.isMagicItem(this.items[itemId])) {
            console.warn(`武器スロットには入れられません（呪文・弓は魔法スロットへ: game.setMagicSlot）: ${itemId}`);
            return false;
        }
        this.player.equipSlots[slot] = itemId;
        // 装備中だったスロットを差し替えた場合は、装備を外す
        if (this.player.meleeSlot === slot) this.player.meleeSlot = null;
        if (this.player.focusSlot === slot) this.player.focusSlot = null;
        this.updateEquipHud();
        return true;
    },

    // デバッグ用: アイテム定義の一覧と、現在の武器・魔法スロットの中身をコンソールに表示
    listItems() {
        console.table(Object.values(this.items).map(i => ({ id: i.id, name: i.name, kind: i.kind, class: i.weaponClass ?? i.type })));
        console.log('武器スロット:', this.player.equipSlots.map((id, i) => `${i + 1}:${id ?? '(空き)'}`).join('  '));
        console.log('魔法スロット:', this.player.magicSlots.map((id, i) => `${i + 1}:${id ?? '(空き)'}`).join('  '));
    },

    // 武器・魔法スロット HUD
    //   武器: クリックで選択（突進用=金、補正の杖・ロッド=緑。空きは破線）
    //   魔法: 数字キー 1〜4 で切り替え（選択中=青）、中身はセレクトボックスで自由に選ぶ
    updateEquipHud() {
        const weaponEl = jhtml.$('weaponHud');
        if (weaponEl) {
            weaponEl.innerHTML = this.player.equipSlots.map((id, i) => {
                const item = (id && this.items[id]) || null;
                const cls = (i === this.player.meleeSlot ? 'active-melee ' : '') + (i === this.player.focusSlot ? 'active-focus ' : '') + (item ? '' : 'empty');
                return jhtml.html`<span class="weapon-slot ${cls}" data-slot="${i}">${item ? item.name : '―'}</span>`;
            }).join('');
        }

        const magicEl = jhtml.$('magicHud');
        if (magicEl) {
            const options = Object.values(this.items).filter(it => this.isMagicItem(it));
            magicEl.innerHTML = this.player.magicSlots.map((id, i) => jhtml.html`<label class="magic-slot ${i === this.player.selectedMagic ? 'active-magic' : ''}">${i + 1}<select data-slot="${i}"><option value="">（なし）</option>${options.map(o => jhtml.html`<option value="${o.id}" ${o.id === id ? 'selected' : ''}>${o.name}</option>`)}</select></label>`).join('');
        }
    },

    // HUD の操作（武器スロットのクリック、魔法スロットのセレクトボックス）。コンストラクタから一度だけ呼ぶ
    initEquipHudEvents() {
        jhtml.on('weaponHud', 'click', '.weapon-slot', (e, el) => {
            this.selectSlot(Number(el.dataset.slot));
        });
        jhtml.on('magicHud', 'change', 'select', (e, el) => {
            this.setMagicSlot(Number(el.dataset.slot), el.value || null);
            el.blur(); // ゲームのキー操作（数字キーなど）をセレクトボックスが奪わないようにする
        });
        jhtml.on('magicHud', 'click', '.magic-slot', (e, el) => {
            // 枠のラベルをクリックしたとき（セレクトボックス以外）はその枠を選ぶ
            if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') {
                this.selectMagic(Number(el.querySelector('select').dataset.slot));
            }
        });
    },

    // 武器エフェクトのテスト表示（HUD の「エフェクトテスト」パネル）。突進を当てなくても、各武器クラスの斬撃エフェクトを確認できる
    //   strength: 'normal'=通常のヒット / 'crit'=半ずらし会心 / 'kill'=会心で撃破（最も強い）
    testWeaponEffect(classId, strength = 'normal') {
        const cls = this.weaponClasses[classId];
        if (!cls || cls.attack !== 'melee') return false;
        this.slashEffects.spawn(cls.range, cls.arcDeg, cls.effect, effectPower(strength !== 'normal', strength === 'kill'));
        return true;
    },

    updateEffectTestHud() {
        const el = jhtml.$('effectTestHud');
        if (!el) return;
        const classes = Object.entries(this.weaponClasses).filter(([, c]) => c.attack === 'melee');
        el.innerHTML = jhtml.html`<select id="effectTestStrength"><option value="normal">通常</option><option value="crit">会心</option><option value="kill">会心＋撃破</option></select>`
            + classes.map(([id, c]) => jhtml.html`<button class="test-btn" data-class="${id}">${c.name}</button>`).join('');
    },

    // エフェクトテストの操作（コンストラクタから一度だけ呼ぶ）
    initEffectTestEvents() {
        jhtml.on('effectTestHud', 'click', '.test-btn', (e, el) => {
            const strength = jhtml.$('effectTestStrength')?.value || 'normal';
            this.testWeaponEffect(el.dataset.class, strength);
            el.blur(); // ゲームのキー操作をボタンが奪わないようにする
        });
        jhtml.on('effectTestHud', 'change', 'select', (e, el) => el.blur());
    },
};
