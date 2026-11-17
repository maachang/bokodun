// 冒険者の保存・読み込み（サーバーの /api/character とのやりとり）。GameEngine のメソッド（this は GameEngine）。
// 保存するのは、いまのところストック（9 枠と、選択中の近接武器・杖・魔法）だけ。ほかの項目は、つながったものから足していく。
// 保存の場所は、冒険者ギルド（セーブ）。起動時に、保存済みなら読み込む（なければ player.json の初期値のまま）。
const STOCK_SIZE = 9;
const DEFAULT_NAME = '冒険者';   // 仮: 名前を決める画面（冒険者の作成）ができるまで

export const saveLoadMethods = {
    // 保存データの stock（ゲームの player.stock・selMelee・selFocus・selMagic を、保存の形にする）
    buildStockSave() {
        const p = this.player;
        return { slots: p.stock.slice(0, STOCK_SIZE), melee: p.selMelee, focus: p.selFocus, magic: p.selMagic };
    },

    // 保存データの stock を、ゲームに反映する。定義にない ID・形の合わない選択は捨てる（保存後に定義が変わっても、起動できるように）
    applyStockSave(st) {
        if (!st || !Array.isArray(st.slots)) return false;
        const p = this.player;
        p.stock = Array.from({ length: STOCK_SIZE }, (_, i) => {
            const id = st.slots[i];
            return (id && this.isStockable(this.items[id])) ? id : null;
        });
        const pick = (idx, ok) => (Number.isInteger(idx) && p.stock[idx] && ok(this.items[p.stock[idx]])) ? idx : null;
        const attackOf = (it) => this.weaponClasses[it.weaponClass]?.attack;
        p.selMelee = pick(st.melee, (it) => attackOf(it) === 'melee');
        p.selFocus = pick(st.focus, (it) => attackOf(it) === 'cast');
        p.selMagic = pick(st.magic, (it) => this.isMagicItem(it));
        return true;
    },

    // 起動時: サーバーに保存済みの冒険者がいれば、反映する。失敗（サーバーなし・未保存）は、初期値のまま進める
    async loadCharacter() {
        this.saveRev = null;
        try {
            const res = await window.jhtml.api.get('/api/character');
            if (!res.character) return false;
            this.saveRev = res.character.rev;
            this.characterName = res.character.name;
            return this.applyStockSave(res.character.data?.stock);
        } catch (e) {
            console.warn('冒険者の読み込みに失敗しました（初期値で始めます）:', e.message);
            return false;
        }
    },

    // セーブ（冒険者ギルド）。戻り値: { ok: true } / { ok: false, message }
    async saveCharacter() {
        const spells = Object.values(this.items).filter((i) => i.kind === 'spell').map((i) => i.id);   // 仮: 覚える仕組みができるまで、定義済みの呪文は全部「覚えた」扱い
        const body = {
            name: this.characterName || DEFAULT_NAME, status: 'creating', rev: this.saveRev ?? 1,
            data: { stock: this.buildStockSave(), magics: spells }
        };
        try {
            const res = await window.jhtml.api.post('/api/character', body);
            this.saveRev = res.rev;
            return { ok: true };
        } catch (e) {
            if (e.status === 409) return { ok: false, message: '別の画面で保存されています。読み込み直してください。' };
            const detail = e.data?.errors?.[0]?.message;   // 検証エラー（400）の、最初のメッセージ
            return { ok: false, message: detail || e.message || '保存に失敗しました。' };
        }
    }
};
