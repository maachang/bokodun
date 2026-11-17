// 装備・武器スロット・魔法スロットの選択と HUD（効果のテストボタンを含む）。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import { effectPower } from '/js/game/constants.js';

export const equipmentMethods = {
    // ---- ストック（9 枠）: 武器・杖・魔法・弓を、好きに入れる。切り替えは数字キー 1〜9 かクリック ----
    //   player.stock（9 枠・アイテム ID または null＝空き）。初期値は player.json
    //   選択は、種類ごとに 1 つ: 近接武器（selMelee・突進に使う）／杖・ロッド（selFocus・魔法の補正。なくてもよい）／呪文か弓（selMagic・Space / F / クリックで使う）
    //   枠の番号を選ぶと、その枠の中身の種類で、選ぶ先が決まる（selectSlot）
    getSlotItem(slot) {
        const id = (slot === null || slot === undefined) ? null : this.player.stock[slot];
        return (id && this.items[id]) || null;
    },

    // 突進攻撃に使う近接武器（未選択なら素手）
    getMeleeItem() {
        return this.getSlotItem(this.player.selMelee) || this.items.fists || null;
    },

    // 魔法を補正する杖・ロッド（未選択なら null）
    getFocusItem() {
        return this.getSlotItem(this.player.selFocus);
    },

    // 選択中の呪文・弓（なければ null）
    getMagicItem(slot = this.player.selMagic) {
        const item = this.getSlotItem(slot);
        return this.isMagicItem(item) ? item : null;
    },

    // 呪文または弓（shoot クラスの武器）は、魔法の側
    isMagicItem(item) {
        if (!item) return false;
        if (item.kind === 'spell') return true;
        return this.weaponClasses[item.weaponClass]?.attack === 'shoot';
    },

    // ストックに入れられるのは、武器・杖・ロッド・弓と、呪文（消耗品・鍵は入れられない）
    isStockable(item) {
        return !!item && (item.kind === 'spell' || item.kind === 'weapon');
    },

    // 枠の選択（数字キー 1〜9 / クリック）: 近接武器は突進用、杖・ロッドは補正（もう一度選ぶと外れる）、呪文・弓は魔法として選ぶ。空きは何も変わらない
    selectSlot(slot) {
        const item = this.getSlotItem(slot);
        if (!item) return;
        if (this.isMagicItem(item)) {
            this.player.selMagic = slot;
        } else {
            const cls = this.weaponClasses[item.weaponClass];
            if (!this.canCarry(item)) { this.addPopup('重すぎて装備できない', '#f87171'); return; }   // 筋力で持てる重さを超える（8.1）
            if (cls?.attack === 'melee' && item.twoHanded && this.player.equip?.shield) { this.addPopup('両手武器は、盾と同時に装備できない', '#f87171'); return; }
            if (cls?.attack === 'melee') this.player.selMelee = slot;
            else if (cls?.attack === 'cast') this.player.selFocus = (this.player.selFocus === slot) ? null : slot;
            else return;
        }
        this.updateEquipHud();
    },

    // 呪文・弓の枠を選ぶ（それ以外の枠・範囲外は無視）
    selectMagic(slot) {
        if (!this.getMagicItem(slot)) return;
        this.player.selMagic = slot;
        this.updateEquipHud();
    },

    // Tab: 次の、呪文・弓の枠へ順送り
    cycleMagic() {
        const n = this.player.stock.length, cur = this.player.selMagic ?? -1;
        for (let step = 1; step <= n; step++) {
            const next = (cur + step + n) % n;
            if (this.getMagicItem(next)) {
                this.selectMagic(next);
                return;
            }
        }
    },

    // ストックの枠の中身を変える（ダイアログの「追加」「✕」 / デバッグ: game.setStockSlot(2, 'magic_bolt')）。null で空きに戻す
    //   変えた枠が、いま選んでいる枠なら、選択を外す。その種類の選択が 1 つもなくなったときは、入れたものを選ぶ（近接武器・呪文・弓。杖は、自動では選ばない）
    setStockSlot(slot, itemId) {
        const p = this.player;
        if (!Number.isInteger(slot) || slot < 0 || slot >= p.stock.length) {
            console.warn(`ストックの枠の番号が範囲外です (0〜${p.stock.length - 1})`);
            return false;
        }
        if (itemId !== null && !this.items[itemId]) {
            console.warn(`未定義のアイテムです: ${itemId} （game.listItems() で一覧）`);
            return false;
        }
        if (itemId !== null && this.items[itemId].kind === 'spell' && !this.isSpellLearned(itemId)) {
            console.warn(`まだ覚えていない魔法です: ${itemId}`);
            return false;
        }
        if (itemId !== null && this.items[itemId].kind === 'weapon' && itemId !== 'fists' && !this.isOwned(itemId)) {   // 持っている武器だけ（素手は、いつでも）
            console.warn(`まだ持っていない武器です: ${itemId}`);
            return false;
        }
        if (itemId !== null && !this.isStockable(this.items[itemId])) {
            console.warn(`ストックに入れられません（武器・杖・魔法・弓のみ）: ${itemId}`);
            return false;
        }
        if (itemId !== null && p.stock.some((id, i) => i !== slot && id === itemId)) {   // 同じものは、2 枠に入れない（保存データの規則と同じ）
            console.warn(`すでにストックに入っています: ${itemId}`);
            return false;
        }
        p.stock[slot] = itemId;
        for (const k of ['selMelee', 'selFocus', 'selMagic']) if (p[k] === slot) p[k] = null;
        const item = itemId && this.items[itemId];
        if (item) {
            if (this.isMagicItem(item)) { if (p.selMagic === null) p.selMagic = slot; }
            else if (this.weaponClasses[item.weaponClass]?.attack === 'melee') { if (p.selMelee === null && this.canCarry(item)) p.selMelee = slot; }
        }
        this.updateEquipHud();
        return true;
    },

    // デバッグ用: アイテム定義の一覧と、現在のストックの中身をコンソールに表示
    listItems() {
        console.table(Object.values(this.items).map(i => ({ id: i.id, name: i.name, kind: i.kind, class: i.weaponClass ?? i.type })));
        console.log('ストック:', this.player.stock.map((id, i) => `${i + 1}:${id ?? '(空き)'}`).join('  '));
    },

    // ストックの表示（右の列の 9 枠）の更新。画面側（js/playUi.js）が onStockChange に、描き直す関数を入れる
    updateEquipHud() {
        this.recomputeStats?.(false);   // 装備の重さが変わると、積載（歩く速さ）が変わる
        if (this.onStockChange) this.onStockChange();
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
