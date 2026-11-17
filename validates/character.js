/**
 * 冒険者の保存データの検証 (validates/character.js)
 *
 * 仕様: docs/character-spec.md 9 章（保存方式）。テーブル: schema/rpg.sql（characters.data）。
 * 保存 API（予定）の、リクエストボディ { name, status, rev, data } を検証する。
 *   const validate = $loadLib('validate.js');
 *   const schema = $loadLib('validates/character.js');
 *   const result = validate.check($request.body, schema);
 *   if (!result.valid) return $response.json({ errors: result.errors }, 400);
 *
 * 方針:
 *   - data の形（キーの種類・型・範囲）と、ID が定義（public/data/*.json）に存在することを見る。
 *   - 未知のキーは断る（保存データに、想定外のものを入れさせない）。
 *   - 名前ではなく ID で持つ。HP・MP の上限や、装備の重さの上限などの「計算で決まる値」は、ここでは見ない（保存時の計算は別）。
 *   - 仕様が未決の上限（所持金・経験値・名前の長さ・データの大きさ）は、極端な値を弾くための「仮」の値。決まったら直す。
 *   - ゲームの計算がブラウザ側にあるため、極端な値は防げても、書き換えを完全には防げない（character-spec.md 9-3）。
 */
const fs = (typeof $require === 'function') ? $require('fs') : require('fs');
const path = (typeof $require === 'function') ? $require('path') : require('path');

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const MAX_DATA_BYTES = 262144;   // 仮: data の JSON の大きさの上限（256KB）
const MAX_NAME_LEN = 50;         // 仮: 名前の長さ
const MAX_ENTRIES = 5000;        // 仮: 宝箱・ボスなどの辞書の件数

// 定義の ID（初回に、public/data/ から読む）
let defs = null;
function loadDefs() {
    if (defs) return defs;
    const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    const items = readJson('items.json');
    const equipment = readJson('equipment.json');
    const ids = (list) => new Set((list || []).map(x => x.id));
    defs = {
        races: new Set(Object.keys(readJson('races.json').races)),
        jobs: new Set(Object.keys(readJson('jobs.json').jobs)),
        maxLevel: readJson('jobs.json').maxLevel || 99,
        items: new Set(Object.keys(items)),
        itemDefs: items,
        classes: readJson('weaponClasses.json'),
        spells: new Set(Object.keys(readJson('magic.json').spells)),
        equip: {
            weapon: new Set([...ids(equipment.weapons), ...Object.keys(items).filter(k => items[k].kind === 'weapon')]),
            armor: ids(equipment.armors),
            helm: ids(equipment.helms),
            shield: ids(equipment.shields)
        }
    };
    return defs;
}

const ABILITY_KEYS = ['dex', 'agi', 'str', 'vit', 'intel', 'mnd', 'end'];   // 能力値（範囲 1〜50。character-spec.md 2 章）
const EQUIP_SLOTS = ['weapon', 'armor', 'helm', 'shield', 'accessory'];     // 装備スロット（item-spec.md 2 章）
const STOCK_SIZE = 9;
const COUNT_MAX = 99;     // 所持品の種類・個数の上限（item-spec.md 1 章）
const KEY_PATTERN = /^[A-Za-z0-9_:.\-]{1,80}$/;
const ID_PATTERN = /^[a-z0-9_]{1,64}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const only = (obj, keys, where) => Object.keys(obj).every(k => keys.includes(k)) ? null : `${where}: 未知のキーがあります`;
const idCountMap = (obj, exists, where, min, max) => {
    if (!isObj(obj)) return `${where}: オブジェクトで指定してください`;
    const keys = Object.keys(obj);
    if (keys.length > COUNT_MAX) return `${where}: 種類が多すぎます`;
    for (const k of keys) {
        if (!exists.has(k)) return `${where}: 定義にない ID です（${k}）`;
        if (!isInt(obj[k], min, max)) return `${where}: 個数が範囲外です（${k}）`;
    }
    return null;
};
const timeMap = (obj, where) => {
    if (!isObj(obj)) return `${where}: オブジェクトで指定してください`;
    const keys = Object.keys(obj);
    if (keys.length > MAX_ENTRIES) return `${where}: 件数が多すぎます`;
    for (const k of keys) {
        if (!KEY_PATTERN.test(k)) return `${where}: キーの形式が不正です`;
        if (!isInt(obj[k], 0, Number.MAX_SAFE_INTEGER)) return `${where}: 日時が不正です（${k}）`;
    }
    return null;
};

// ストックに入れる ID の種類。呪文・弓（shoot）は magic、杖・ロッド（cast）は focus、近接武器は melee。入れられないものは null
function stockKind(id, d) {
    if (d.spells.has(id)) return 'magic';
    const it = d.itemDefs[id];
    if (!it || it.kind !== 'weapon') return null;
    const attack = d.classes[it.weaponClass] && d.classes[it.weaponClass].attack;
    return attack === 'shoot' ? 'magic' : attack === 'cast' ? 'focus' : attack === 'melee' ? 'melee' : null;
}

const sections = {
    profile(v, all) {
        if (!isObj(v)) return 'profile: オブジェクトで指定してください';
        const e = only(v, ['name', 'race', 'createdAt'], 'profile'); if (e) return e;
        if (typeof v.name !== 'string' || v.name.length < 1 || v.name.length > MAX_NAME_LEN) return 'profile.name: 名前が不正です';
        if (!loadDefs().races.has(v.race)) return 'profile.race: 種族が不正です';
        if (typeof v.createdAt !== 'string' || v.createdAt.length > 40) return 'profile.createdAt: 日時が不正です';
        return null;
    },
    creation(v) {
        if (!isObj(v)) return 'creation: オブジェクトで指定してください';
        const e = only(v, ['a', 'b', 'c', 'd', 'bonus'], 'creation'); if (e) return e;
        for (const k of ['a', 'b', 'c', 'd']) if (v[k] !== undefined && !(typeof v[k] === 'number' && v[k] >= 1 && v[k] <= 12.5)) return `creation.${k}: 計測値は 1〜12.5 です`;
        if (v.bonus !== undefined && !isInt(v.bonus, 0, 9)) return 'creation.bonus: ボーナス値は 0〜9 です';
        return null;
    },
    abilities(v) {
        if (!isObj(v)) return 'abilities: オブジェクトで指定してください';
        const e = only(v, ABILITY_KEYS, 'abilities'); if (e) return e;
        for (const k of ABILITY_KEYS) if (v[k] !== undefined && !isInt(v[k], 1, 50)) return `abilities.${k}: 能力値は 1〜50 です`;
        return null;
    },
    jobs(v) {
        if (!isObj(v)) return 'jobs: オブジェクトで指定してください';
        const e = only(v, ['primary', 'sub', 'levels', 'expStock'], 'jobs'); if (e) return e;
        const d = loadDefs();
        if (!isObj(v.levels)) return 'jobs.levels: オブジェクトで指定してください';
        for (const [id, lv] of Object.entries(v.levels)) {
            if (!d.jobs.has(id)) return `jobs.levels: 定義にない職業です（${id}）`;
            if (!isInt(lv, 1, d.maxLevel)) return `jobs.levels: レベルが範囲外です（${id}）`;
        }
        if (!d.jobs.has(v.primary) || !(v.primary in v.levels)) return 'jobs.primary: 第一職業が不正です';
        if (v.sub !== null && v.sub !== undefined && (!d.jobs.has(v.sub) || !(v.sub in v.levels) || v.sub === v.primary)) return 'jobs.sub: サブ職業が不正です';
        if (v.expStock !== undefined && !isInt(v.expStock, 0, Number.MAX_SAFE_INTEGER)) return 'jobs.expStock: 未割り振りの経験値が不正です';
        return null;
    },
    vitals(v) {
        if (!isObj(v)) return 'vitals: オブジェクトで指定してください';
        const e = only(v, ['hp', 'mp'], 'vitals'); if (e) return e;
        if (!isInt(v.hp, 0, Number.MAX_SAFE_INTEGER) || !isInt(v.mp, 0, Number.MAX_SAFE_INTEGER)) return 'vitals: HP・MP が不正です';
        return null;
    },
    gold: (v) => isInt(v, 0, Number.MAX_SAFE_INTEGER) ? null : 'gold: 所持金が不正です',
    exp: (v) => isInt(v, 0, Number.MAX_SAFE_INTEGER) ? null : 'exp: 経験値が不正です',
    inventory: (v) => idCountMap(v, loadDefs().items, 'inventory', 1, COUNT_MAX),
    equipment(v) {
        if (!isObj(v)) return 'equipment: オブジェクトで指定してください';
        const e = only(v, EQUIP_SLOTS, 'equipment'); if (e) return e;
        const d = loadDefs();
        for (const [slot, val] of Object.entries(v)) {
            if (val === null) continue;
            const id = typeof val === 'string' ? val : (isObj(val) ? val.id : null);
            if (typeof id !== 'string' || !ID_PATTERN.test(id)) return `equipment.${slot}: ID が不正です`;
            if (isObj(val)) {   // 個別の情報（購入時に決める重さ）。そのほかの個別情報は未決
                if (only(val, ['id', 'weight'], `equipment.${slot}`)) return `equipment.${slot}: 未知のキーがあります`;
                if (val.weight !== undefined && !isInt(val.weight, 1, 50)) return `equipment.${slot}.weight: 重さは 1〜50 です`;
            }
            if (slot !== 'accessory' && !d.equip[slot].has(id)) return `equipment.${slot}: 定義にない ID です（${id}）`;   // アクセサリの一覧は未定義（item-spec.md 8 章）
        }
        return null;
    },
    stock(v, all) {
        // ゲームの形: slots（アイテム ID または null の 9 枠）と、選択中の枠番号 melee（近接武器）・focus（杖）・magic（呪文・弓）
        if (!isObj(v)) return 'stock: オブジェクトで指定してください';
        const e = only(v, ['slots', 'melee', 'focus', 'magic'], 'stock'); if (e) return e;
        if (!Array.isArray(v.slots) || v.slots.length !== STOCK_SIZE) return `stock.slots: ${STOCK_SIZE} 枠の配列で指定してください`;
        const d = loadDefs(), seen = new Set(), owned = new Set((all.magics) || []);
        const kinds = [];   // 枠ごとの種類（melee / focus / magic）
        for (let i = 0; i < v.slots.length; i++) {
            const id = v.slots[i];
            if (id === null) { kinds.push(null); continue; }
            if (typeof id !== 'string' || !ID_PATTERN.test(id)) return `stock.slots[${i}]: ID が不正です`;
            const kind = stockKind(id, d);
            if (!kind) return `stock.slots[${i}]: 定義にない、またはストックに入れられない ID です（${id}）`;
            if (kind === 'magic' && d.spells.has(id) && !owned.has(id)) return `stock.slots[${i}]: 覚えていない魔法です（${id}）`;
            if (seen.has(id)) return `stock.slots[${i}]: 同じものが重複しています`;
            seen.add(id);
            kinds.push(kind);
        }
        for (const k of ['melee', 'focus', 'magic']) {
            const idx = v[k];
            if (idx === null || idx === undefined) continue;
            if (!isInt(idx, 0, STOCK_SIZE - 1) || kinds[idx] !== k) return `stock.${k}: 選択中の枠が不正です`;
        }
        return null;
    },
    magics(v) {
        if (!Array.isArray(v) || v.length > 200) return 'magics: 配列で指定してください';
        const d = loadDefs();
        return v.every(id => d.spells.has(id)) && new Set(v).size === v.length ? null : 'magics: 定義にない、または重複した魔法があります';
    },
    autoUse(v) {
        if (!isObj(v)) return 'autoUse: オブジェクトで指定してください';
        const d = loadDefs();
        return Object.entries(v).every(([k, b]) => d.items.has(k) && typeof b === 'boolean') ? null : 'autoUse: 不正な項目があります';
    },
    quest(v) {
        if (!isObj(v)) return 'quest: オブジェクトで指定してください';
        const e = only(v, ['current', 'done'], 'quest'); if (e) return e;
        const c = v.current;
        if (c !== null && c !== undefined) {   // 受注中は、同時に 1 つだけ
            if (!isObj(c) || only(c, ['id', 'acceptedAt', 'place', 'progress'], 'quest.current')) return 'quest.current: 形式が不正です';
            if (typeof c.id !== 'string' || !KEY_PATTERN.test(c.id)) return 'quest.current.id: ID が不正です';
            if (!isInt(c.acceptedAt, 0, Number.MAX_SAFE_INTEGER)) return 'quest.current.acceptedAt: 日時が不正です';
            if (c.place !== undefined && (typeof c.place !== 'string' || c.place.length > 100)) return 'quest.current.place: 場所が不正です';
        }
        if (v.done !== undefined && (!Array.isArray(v.done) || v.done.length > MAX_ENTRIES || !v.done.every(x => typeof x === 'string' && KEY_PATTERN.test(x)))) return 'quest.done: 達成済みの ID が不正です';
        return null;
    },
    world(v) {
        if (!isObj(v)) return 'world: オブジェクトで指定してください';
        const e = only(v, ['gameTime', 'chests', 'bosses'], 'world'); if (e) return e;
        if (!isInt(v.gameTime, 0, Number.MAX_SAFE_INTEGER)) return 'world.gameTime: ゲーム内時間（分）が不正です';
        return (v.chests !== undefined && timeMap(v.chests, 'world.chests')) || (v.bosses !== undefined && timeMap(v.bosses, 'world.bosses')) || null;
    },
    guild(v) {
        if (!isObj(v)) return 'guild: オブジェクトで指定してください';
        const e = only(v, ['lastId', 'storage'], 'guild'); if (e) return e;
        if (v.lastId !== null && v.lastId !== undefined && (typeof v.lastId !== 'string' || !KEY_PATTERN.test(v.lastId))) return 'guild.lastId: ギルドの ID が不正です';
        return v.storage === undefined ? null : idCountMap(v.storage, loadDefs().items, 'guild.storage', 1, Number.MAX_SAFE_INTEGER);   // 預かりの上限・手数料は未決
    },
    playTime: (v) => isInt(v, 0, Number.MAX_SAFE_INTEGER) ? null : 'playTime: プレイ時間が不正です'
};

/** data（冒険者の中身）の検証。エラーなら、メッセージ（文字列）を返す */
function checkData(data, all) {
    if (!isObj(data)) return 'data: オブジェクトで指定してください';
    if (JSON.stringify(data).length > MAX_DATA_BYTES) return 'data: 大きすぎます';
    const unknown = Object.keys(data).find(k => !(k in sections));
    if (unknown) return `data.${unknown}: 未知のキーです`;
    // 確定済みの冒険者は、中身が一通りそろっている
    if (all.status === 'confirmed') {
        const need = ['profile', 'abilities', 'jobs', 'vitals', 'gold', 'exp', 'inventory', 'equipment', 'stock', 'magics', 'world', 'guild'];
        const missing = need.find(k => data[k] === undefined);
        if (missing) return `data.${missing}: 確定済みの冒険者には必要です`;
    }
    for (const [k, fn] of Object.entries(sections)) {
        if (data[k] === undefined) continue;
        const msg = fn(data[k], data);
        if (msg) return msg;
    }
    return null;
}

module.exports = {
    name: { type: 'string', required: true, minLen: 1, maxLen: MAX_NAME_LEN, messages: { required: '名前は必須です', maxLen: `名前は${MAX_NAME_LEN}文字以内です` } },
    status: { type: 'string', required: true, enum: ['creating', 'confirmed'], messages: { required: '状態は必須です', enum: '状態は creating か confirmed です' } },
    rev: { type: 'int', required: true, min: 1, messages: { required: 'rev は必須です', type: 'rev は整数です', min: 'rev は 1 以上です' } },   // 読み込んだときの rev（別のタブでの上書きを防ぐ）
    data: { required: true, custom: (v, all) => checkData(v, all) || true, messages: { required: 'data は必須です' } }
};
