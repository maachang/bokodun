// 冒険者の保存・読み込み（サーバーの /api/character とのやりとり）。GameEngine のメソッド（this は GameEngine）。
// 保存するのは、冒険者の名前・種族、能力値、職業（第一・サブ・レベル・経験値のストック）、HP・MP、所持金、所持品（道具）、持っている武器・防具（重さつき）、着けている防具、ストック（9 枠と選択）、覚えた魔法（買う・取得で増える）。
//   データの形は、保存データの仕様（docs/character-spec.md 9-3。検証は validates/character.js）。位置は保存しない（再開はギルド）。
//   まだ保存しない項目: 宝箱・ボス・ゲーム内時間・クエスト・ギルドの預かり・プレイ時間（つながっていない仕組み）。
// 保存の場所は、冒険者ギルド（セーブ）。起動時に、保存済みなら読み込む（なければ player.json の初期値のまま）。
const STOCK_SIZE = 9;
const DEFAULT_NAME = '冒険者';   // 名前は、作成の画面（create.html）で決める。保存データに名前がないときの、念のための既定値

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
            return (id && this.isStockable(this.items[id]) && (this.items[id].kind === 'spell' ? this.isSpellLearned(id) : (id === 'fists' || this.isOwned(id)))) ? id : null;   // 呪文は覚えたもの、武器は持っているものだけ
        });
        const pick = (idx, ok) => (Number.isInteger(idx) && p.stock[idx] && ok(this.items[p.stock[idx]])) ? idx : null;
        const attackOf = (it) => this.weaponClasses[it.weaponClass]?.attack;
        p.selMelee = pick(st.melee, (it) => attackOf(it) === 'melee' && this.canCarry(it));   // 筋力で持てない武器は、選べない
        p.selFocus = pick(st.focus, (it) => attackOf(it) === 'cast' && this.canCarry(it));
        p.selMagic = pick(st.magic, (it) => this.isMagicItem(it));
        return true;
    },

    // 保存データ（data）をつくる。HP・MP は、整数にして保存する（MP には端数がありうる）
    buildSaveData() {
        const p = this.player;
        this.characterCreatedAt ??= new Date().toISOString();
        return {
            profile: { name: this.characterName || DEFAULT_NAME, race: p.race, createdAt: this.characterCreatedAt },
            abilities: { ...p.abilities },
            jobs: { primary: p.jobs.primary, sub: p.jobs.sub, levels: { ...p.jobs.levels }, expStock: p.jobs.expStock },
            vitals: { hp: Math.floor(p.hp), mp: Math.floor(p.mp) },
            gold: Math.floor(p.gold ?? 0),
            inventory: { ...p.inventory },
            owned: { ...p.owned },
            equipment: { armor: p.equip?.armor ?? null, helm: p.equip?.helm ?? null, shield: p.equip?.shield ?? null, accessory: p.equip?.accessory ?? null },
            accessories: [...(p.accessories ?? [])],
            plus: { ...(p.plus ?? {}) },
            stock: this.buildStockSave(),
            magics: [...p.magics]
        };
    },

    // 保存データを、ゲームに反映する。形の合わない項目・定義にない ID は、捨てて初期値のままにする（保存後に定義が変わっても、起動できるように）
    applySaveData(data) {
        if (!data) return false;
        const p = this.player, d = this.rules;
        const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
        if (d.races[data.profile?.race]) p.race = data.profile.race;
        if (data.profile?.name) this.characterName = data.profile.name;
        if (data.profile?.createdAt) this.characterCreatedAt = data.profile.createdAt;
        for (const k of Object.keys(p.abilities)) if (isInt(data.abilities?.[k], 1, 50)) p.abilities[k] = data.abilities[k];
        const j = data.jobs;
        if (j && d.jobs[j.primary] && d.jobs[j.primary].type === 'combat' && j.levels && Object.entries(j.levels).every(([id, lv]) => d.jobs[id] && isInt(lv, 1, d.maxLevel ?? 99)) && j.primary in j.levels) {
            p.jobs = { primary: j.primary, sub: (j.sub in j.levels && j.sub !== j.primary) ? j.sub : null, levels: { ...j.levels }, expStock: isInt(j.expStock, 0, Number.MAX_SAFE_INTEGER) ? j.expStock : 0 };
            this.syncJob();
        }
        if (isInt(data.gold, 0, Number.MAX_SAFE_INTEGER)) p.gold = data.gold;
        if (data.inventory && typeof data.inventory === 'object') {   // 所持品（定義にある道具だけ。個数は 1〜99）
            p.inventory = {};
            for (const [id, n] of Object.entries(data.inventory)) if (['consumable', 'key'].includes(this.items[id]?.kind) && isInt(n, 1, 99) && Object.keys(p.inventory).length < 99) p.inventory[id] = n;
        }
        if (Array.isArray(data.magics)) p.magics = [...new Set(data.magics)].filter((id) => this.items[id]?.kind === 'spell');   // 覚えた魔法（定義にあるものだけ）
        if (data.owned && typeof data.owned === 'object') {   // 持っている武器・防具（定義にあり、重さが購入で選べる範囲内のもの）
            p.owned = {};
            for (const [id, w] of Object.entries(data.owned)) { const e = this.equipDefOf(id); if (e && id !== 'fists' && isInt(w, e.range[0], e.range[1])) p.owned[id] = w; }
        }
        p.plus = {};   // 武器の +値（持っている武器だけ。0〜plusMax）
        if (data.plus && typeof data.plus === 'object') for (const [id, n] of Object.entries(data.plus)) if (p.owned[id] !== undefined && isInt(n, 1, this.rules.combat.plusMax ?? 3)) p.plus[id] = n;
        p.accessories = Array.isArray(data.accessories) ? [...new Set(data.accessories)].filter((id) => this.accessoryDef(id)) : [];   // 持っているアクセサリ（定義にあるものだけ）
        this.applyStockSave(data.stock);
        const eq = data.equipment ?? {};
        p.equip = Object.fromEntries(['armor', 'helm', 'shield'].map((k) => [k, (eq[k] && this.gearDef(k, eq[k]) && this.isOwned(eq[k]) && this.canWear(this.gearDef(k, eq[k]))) ? eq[k] : null]));
        p.equip.accessory = (eq.accessory && this.hasAccessory(eq.accessory)) ? eq.accessory : null;
        if (p.equip.shield && this.getMeleeItem()?.twoHanded) p.equip.shield = null;   // 両手武器と盾は、同時に装備できない
        this.recomputeStats(true);   // 能力値・職業・装備から、最大値を決め直す
        const v = data.vitals;
        if (v && isInt(v.hp, 0, Number.MAX_SAFE_INTEGER) && isInt(v.mp, 0, Number.MAX_SAFE_INTEGER)) {   // つづきから: セーブ時点の HP・MP から始める
            p.hp = Math.max(1, Math.min(v.hp, p.maxHp));
            p.mp = Math.min(v.mp, p.maxMp);
        }
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
            return this.applySaveData(res.character.data);
        } catch (e) {
            if (e.status === 401) { location.replace('/login.html'); return false; }   // ログインが切れている
            console.warn('冒険者の読み込みに失敗しました（初期値で始めます）:', e.message);
            return false;
        }
    },

    // ログイン中のユーザーへの、状態を変える API（POST）。CSRF トークンを付ける。トークンが合わなければ（別のタブでログインし直したなど）、取り直して 1 回だけやり直す
    async postAuthed(url, body) {
        const send = () => window.jhtml.api.post(url, body, { headers: { 'X-CSRF-Token': this.account?.csrfToken ?? '' } });
        try {
            return await send();
        } catch (e) {
            if (e.status !== 403 || !e.data?.csrf) throw e;   // CSRF の失敗だけ、取り直す（パスワード違いなどは、そのまま）
            const me = await window.jhtml.api.get('/api/me');
            if (!me.authenticated) { const err = new Error('ログインが切れています'); err.status = 401; throw err; }
            this.account = { email: me.email, csrfToken: me.csrfToken };
            return send();
        }
    },

    // セーブ（冒険者ギルド）。戻り値: { ok: true } / { ok: false, message }
    async saveCharacter() {
        const body = { name: this.characterName || DEFAULT_NAME, status: 'confirmed', rev: this.saveRev ?? 1, data: this.buildSaveData() };
        try {
            const res = await this.postAuthed('/api/character', body);
            this.saveRev = res.rev;
            return { ok: true };
        } catch (e) {
            if (e.status === 409) return { ok: false, message: '別の画面で保存されています。読み込み直してください。' };
            if (e.status === 401) return { ok: false, message: 'ログインの有効期限が切れました。別のタブでログインし直してから、もう一度セーブしてください（この画面のまま、続けられます）。' };
            const detail = e.data?.errors?.[0]?.message;   // 検証エラー（400）の、最初のメッセージ
            return { ok: false, message: detail || e.message || '保存に失敗しました。' };
        }
    }
};
