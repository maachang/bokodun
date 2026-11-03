import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));
const objects = readJson('public/data/objects.json');
const npcs = readJson('public/data/npcs.json');
const D = Object.fromEntries(['city', 'city_noble', 'city_slum', 'castle'].map(id => [id, readJson(`public/data/maps/${id}.json`)]));
const used = (m) => new Set([...new Set(m.layout.join(''))].map(ch => m.legend?.[ch]));

test('区画: 一般街・貴族街・どや街は、今までの街（64×64）より小さい。王城は貴族街の先', () => {
    for (const id of ['city', 'city_noble', 'city_slum']) {
        const m = D[id];
        assert.ok(m.layout.length * m.layout[0].length < 64 * 64 / 2, `${id}: 小さい`);
        assert.equal(m.type, 'open');
    }
    assert.equal(D.castle.nextMap, 'city_noble');
    assert.ok(Object.values(D.city_noble.links).some(l => l.nextMap === 'castle'), '貴族街に城門');
});

test('区画: 一般街→貴族街、一般街→どや街は、門で行き来でき、出現位置が通れる', () => {
    const gate = (from, to) => Object.entries(D[from].links).filter(([, l]) => l.nextMap === to && l.spawn);
    for (const [a, b] of [['city', 'city_noble'], ['city', 'city_slum']]) {
        assert.ok(gate(a, b).length >= 1 && gate(b, a).length >= 1, `${a}⇔${b}`);
        for (const [key] of gate(a, b)) {
            const [c, r] = key.split(',').map(Number);
            assert.equal(objects[D[a].legend[D[a].layout[r][c]]].type, 'door');
        }
    }
    assert.ok(!Object.values(D.city_noble.links).some(l => l.nextMap === 'city_slum'), '貴族街とどや街は、直接つながらない');
});

test('区画: 盗賊ギルドは、どや街。一般街には、ギルド系は冒険者・魔法・商人・訓練所・鍛冶屋', () => {
    assert.ok(Object.values(D.city_slum.links).some(l => l.nextMap === 'guild_thief'));
    assert.ok(![...used(D.city)].includes('thief_door'));
    const dests = new Set(Object.values(D.city.links).map(l => l.nextMap));
    for (const g of ['guild_adv', 'guild_mage', 'guild_merchant', 'guild_training', 'guild_smith', 'temple']) assert.ok(dests.has(g), g);
});

test('区画: 貴族・司祭・枢機卿は、街（屋外）に出歩かない。屋敷・神殿の中にいる。街には使用人が、お使いで歩く', () => {
    const NOBLE = ['duke_man', 'duke_woman', 'margrave_man', 'margrave_woman', 'marquis_man', 'marquis_woman', 'viscount_man', 'baron_man', 'baron_woman', 'cardinal', 'king', 'prince'];   // 特別な存在だけ（男爵・子爵・司祭は汎用の存在なので、街にいてもよい。ただし、今は置いていない）
    for (const id of ['city', 'city_noble', 'city_slum']) for (const n of D[id].npcs) assert.ok(!NOBLE.includes(n.id), `${id}: ${n.id} は街に出歩かない`);
    const mansion = readJson('public/data/maps/mansion.json'), mansion2 = readJson('public/data/maps/mansion_2f.json');
    assert.ok(mansion.npcs.some(n => n.id === 'duke_man') && mansion2.npcs.some(n => n.id === 'duke_woman'), '公爵は、屋敷の中');
    const ids = (m) => m.npcs.map(n => n.id);
    for (const n of ['servant_man', 'maid']) { assert.ok(ids(D.city).includes(n), `${n}: 一般街（買い出し）`); assert.ok(ids(D.city_noble).includes(n), `${n}: 貴族街`); }
    for (const m of Object.values(D)) for (const n of m.npcs ?? []) assert.ok(npcs[n.id], n.id);
});

test('区画: 王や貴族の周りに、使用人（執事・メイド・使用人）がいる。画像がある', () => {
    for (const id of ['castle', 'mansion', 'mansion_2f']) {
        const ids = readJson(`public/data/maps/${id}.json`).npcs.map(n => n.id);
        assert.ok(ids.some(n => ['maid', 'maid_head', 'butler', 'servant_man'].includes(n)), `${id}: 使用人`);
    }
    for (const id of ['servant_man', 'maid_head', 'maid', 'butler', 'street_woman']) {
        assert.ok(Number.isInteger(npcs[id].sdId) && fs.existsSync(path.join(root, 'public', npcs[id].texture)), `${id}: sdId・画像`);
    }
    assert.ok(D.city_slum.npcs.some(n => n.id === 'street_woman'));
});

test('区画: 貴族街の公爵の屋敷の扉から、屋敷に入れる。入場の条件（requires）は、まだデータに書かない', () => {
    assert.ok(Object.values(D.city_noble.links).some(l => l.nextMap === 'mansion'));
    for (const m of Object.values(D)) for (const l of Object.values(m.links ?? {})) assert.equal(l.requires, undefined, '条件の動作は未実装なので、データには書かない');
});

test('貴族街: 王城（北の城門）に近いほど、高い階級の屋敷。公爵の屋敷（扉つき）が、一番北', () => {
    const lay = D.city_noble.layout, seen = new Set(), blocks = [];
    lay.forEach((row, r) => [...row].forEach((ch, c) => {
        if (!'HM'.includes(ch) || seen.has(`${c},${r}`)) return;
        const stack = [[c, r]], cells = [];
        seen.add(`${c},${r}`);
        while (stack.length) {
            const [x, y] = stack.pop(); cells.push([x, y]);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const k = `${x + dx},${y + dy}`, cc = lay[y + dy]?.[x + dx];
                if (cc && 'HM'.includes(cc) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
            }
        }
        blocks.push({ top: Math.min(...cells.map(p => p[1])), size: cells.length, door: cells.some(([x, y]) => lay[y][x] === 'M') });
    }));
    assert.equal(blocks.length, 5, '5階級の屋敷');
    blocks.sort((a, b) => a.top - b.top);
    assert.ok(blocks[0].door, '一番北が、公爵の屋敷（扉つき）');
    assert.ok(blocks[0].size >= Math.max(...blocks.map(b => b.size)), '公爵の屋敷が、一番広い');
    assert.ok(blocks[4].size <= Math.min(...blocks.map(b => b.size)), '男爵の屋敷が、一番小さい');
});

test('一般街: 市場に、日よけの屋根つきの露店（野外用）が並ぶ', () => {
    const stalls = [...D.city.layout.join('')].filter(ch => objects[D.city.legend[ch]]?.id === undefined && D.city.legend[ch]?.startsWith('market_stall'));
    assert.ok(stalls.length >= 8, `露店の数: ${stalls.length}`);
    for (const id of Object.keys(objects).filter(k => k.startsWith('market_stall'))) {
        const d = objects[id];
        assert.equal(d.type, 'furniture');
        assert.ok(d.parts.some(p => p.size[0] > 3 && p.size[1] < 0.3 && p.pos[1] > 2), `${id}: 簡易屋根`);
        assert.equal(d.ceilingTexture, undefined, `${id}: 野外なので天井は付けない`);
    }
});

test('どや街: 汚水の水路（毒沼と同じ）が橋で渡れ、怪しい酒場にアサシンとシーフがいる。ならず者がうろつく', () => {
    const slum = D.city_slum, ids = used(slum);
    assert.ok(ids.has('poison_swamp') && ids.has('wood_bridge'));
    assert.ok(objects.poison_swamp.damagePerSec > 0);
    const bar = readJson('public/data/maps/slum_bar.json');
    const barIds = bar.npcs.map(n => n.id);
    assert.ok(barIds.includes('assassin_npc') && barIds.includes('thief_npc'));
    assert.ok(slum.npcs.some(n => n.id === 'thug_npc'));
    assert.ok(Object.values(slum.links).some(l => l.nextMap === 'slum_bar'));
    for (const id of ['assassin_npc', 'thief_npc', 'thug_npc']) assert.ok(fs.existsSync(path.join(root, 'public', npcs[id].texture)), `${id}: 画像`);
});

test('公爵の屋敷: 3階建て。1階は大広間と普通の部屋（厨房・使用人の部屋）、2階以降は通路と部屋（当主・夫人・書斎／お客様用）', () => {
    const M = Object.fromEntries(['mansion', 'mansion_2f', 'mansion_3f'].map(id => [id, readJson(`public/data/maps/${id}.json`)]));
    const ids = (m) => [...new Set(m.layout.join(''))].map(ch => m.legend[ch]);
    const doors = (m) => m.layout.join('').split('').filter(ch => m.legend[ch] === 'wooden_door').length;
    assert.ok(ids(M.mansion).includes('stove') && ids(M.mansion).includes('hearth'), '厨房: 暖炉とかまど');
    assert.ok(M.mansion.layout.join('').split('').filter(ch => M.mansion.legend[ch] === 'bed').length >= 4, '使用人の部屋: ベッド');
    assert.ok(doors(M.mansion) >= 2, '1階: 厨房・使用人の部屋への扉');
    assert.ok(doors(M.mansion_2f) >= 6 && doors(M.mansion_3f) >= 6, '2階以降: 部屋ごとの扉（6部屋）');
    assert.ok(ids(M.mansion_2f).includes('hearth') && ids(M.mansion_2f).includes('bookshelf'), '2階: 書斎');
    assert.ok(M.mansion_3f.layout.join('').split('').filter(ch => M.mansion_3f.legend[ch] === 'bed').length >= 6, '3階: お客様用の部屋のベッド');
    for (const m of Object.values(M)) assert.ok(ids(m).includes('chandelier_mansion_rug') && ids(m).includes('wall_window_curtain'), '豪華な飾り');
    assert.ok(Object.values(M.mansion.links).some(l => l.nextMap === 'mansion_2f') && Object.values(M.mansion_2f.links).some(l => l.nextMap === 'mansion_3f'), '階段でつながる');
});

test('貴族の屋敷: 5階級とも中に入れ、階級が高いほど広く、階数が多く、飾りが豪華。貴族本人は、屋敷の中にいる', () => {
    const noble = D.city_noble;
    const HOUSES = [
        { rank: 'duke', maps: ['mansion', 'mansion_2f', 'mansion_3f'], who: ['duke_man', 'duke_woman'] },
        { rank: 'margrave', maps: ['mansion_margrave', 'mansion_margrave_2f'], who: ['margrave_man', 'margrave_woman'] },
        { rank: 'marquis', maps: ['mansion_marquis', 'mansion_marquis_2f'], who: ['marquis_man', 'marquis_woman'] },
        { rank: 'viscount', maps: ['mansion_viscount'], who: ['viscount_man'] },
        { rank: 'baron', maps: ['mansion_baron'], who: ['baron_man', 'baron_woman'] },
    ];
    const area = (maps) => readJson(`public/data/maps/${maps[0]}.json`).layout.flat?.() ?? 0;
    let prevFloors = Infinity, prevArea = Infinity;
    for (const h of HOUSES) {
        const ms = h.maps.map(id => readJson(`public/data/maps/${id}.json`));
        assert.ok(Object.values(noble.links).some(l => l.nextMap === h.maps[0]), `${h.rank}: 貴族街の扉`);
        const inside = new Set(ms.flatMap(m => m.npcs.map(n => n.id)));
        for (const w of h.who) assert.ok(inside.has(w), `${h.rank}: ${w} は屋敷の中`);
        assert.ok(Object.values(ms[0].legend).includes('building_exit'), `${h.rank}: 1階に出口`);
        assert.ok(ms.length <= prevFloors, `${h.rank}: 階数`);
        const a = ms[0].layout.length * ms[0].layout[0].length;
        assert.ok(a <= prevArea, `${h.rank}: 1階の広さ`);
        prevFloors = ms.length; prevArea = a;
    }
    const decor = (id) => new Set(Object.values(readJson(`public/data/maps/${id}.json`).legend));
    assert.ok(decor('mansion').has('chandelier_mansion_rug') && decor('mansion_margrave').has('chandelier_mansion_rug'), '公爵・辺境伯: シャンデリア');
    assert.ok(decor('mansion_viscount').has('chandelier_mansion_rug') || decor('mansion_viscount').has('hanging_candles_mansion_rug'), '子爵: 小さな吊り飾り');
    assert.ok(![...decor('mansion_baron')].some(id => objects[id]?.type === 'hanging' && !id.startsWith('pot_rack')), '男爵: 天井の飾りはない（台所の鍋つりは道具）');
});

test('王城: 1階に厨房・武器庫・兵の待機所・下働きの食堂があり、下働き（メイド・使用人）と兵が多い。2階は事務室・会議室、3階は貴族の執務室と図書館。地下は迷宮', () => {
    const C = Object.fromEntries(['castle', 'castle_2f', 'castle_3f', 'castle_basement'].map(id => [id, readJson(`public/data/maps/${id}.json`)]));
    const ids = (m) => new Set(Object.values(m.legend));
    const count = (m, f) => m.npcs.filter(n => f(n.id)).length;
    assert.ok(ids(C.castle).has('stove_stone') && ids(C.castle).has('weapon_rack_stone') && ids(C.castle).has('bed_stone'));
    assert.ok(count(C.castle, i => ['maid', 'servant_man', 'butler'].includes(i)) >= 12, '下働きが多い');
    assert.ok(count(C.castle, i => i.startsWith('guard_')) >= 8, '兵が多い');
    assert.ok(count(C.castle_2f, i => i.startsWith('adv_clerk')) >= 4, '事務の人');
    const doors = (m) => m.layout.join('').split('').filter(ch => objects[m.legend[ch]]?.type === 'door').length;
    assert.ok(doors(C.castle_2f) >= 8, '2階: 部屋の扉');
    assert.ok(count(C.castle_3f, i => i.startsWith('mage_clerk')) >= 2 && ids(C.castle_3f).has('bookshelf_stone'), '3階: 図書館');
    assert.ok(Object.values(C.castle.links).some(l => l.nextMap === 'castle_basement'));
    const b = C.castle_basement, flat = b.layout.join('');
    assert.ok(b.layout.length >= 25 && b.layout[0].length >= 33, '迷宮の広さ');
    assert.ok(ids(b).has('spike_trap') && ids(b).has('treasure_chest') && ids(b).has('fire_jet_trap'), '迷宮の罠・宝箱');
    assert.ok(Object.keys(b.enemies).length >= 3 && [...flat].filter(ch => b.enemies[ch]).length >= 12, '迷宮の敵');
    // 入口から、床・宝箱・敵・罠のすべてに行ける（壁以外は、つながっている）
    const [sx, sz] = [b.spawn.x, b.spawn.z], seen = new Set([`${sx},${sz}`]), q = [[sx, sz]];
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (b.layout[ny]?.[nx] && b.layout[ny][nx] !== '1' && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); q.push([nx, ny]); } } }
    assert.equal(seen.size, [...flat].filter(ch => ch !== '1').length, '迷宮は、すべてつながっている');
});

test('マップ: 出現位置から、NPC のいる所へ、歩いて行ける（扉や壁の飾りで、部屋がふさがれていない）', () => {
    const fs2 = fs.readdirSync(path.join(root, 'public/data/maps')).map(f => f.replace('.json', ''));
    const bad = [];
    for (const id of fs2) {
        const m = readJson(`public/data/maps/${id}.json`);
        if (!m.npcs?.length) continue;   // 屋内・屋外とも（城は type が open）
        const solid = (x, y) => {
            const ch = m.layout[y]?.[x]; if (ch === undefined) return true; if (ch === '0') return false;
            const d = objects[m.legend[ch]]; if (!d) return false;
            if (['door', 'stairs', 'gateway', 'portal', 'floor_tile', 'hanging'].includes(d.type)) return false;
            return d.solid === true || ['block', 'furniture', 'wall_deco', 'wall_image', 'statue'].includes(d.type);
        };
        const seen = new Set([`${m.spawn.x},${m.spawn.z}`]), q = [[m.spawn.x, m.spawn.z]];
        while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!solid(nx, ny) && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); q.push([nx, ny]); } } }
        for (const n of m.npcs) if (n.id !== '$shopkeeper' && !n.behindCounter && !seen.has(`${n.x},${n.z}`)) bad.push(`${id}: ${n.id} (${n.x},${n.z})`);   // カウンターの奥の店員（behindCounter）は、客が入れない所にいる（別のテストで確認）
    }
    assert.deepEqual(bad, [], `行けない所の NPC: ${bad.join(' / ')}`);
});

test('王城: 貴族の執務室・会議室に、働く貴族（男爵・子爵クラス）がいる。貴族の NPC は、汎用の存在（屋敷にも、城にもいてよい）', () => {
    const f2 = readJson('public/data/maps/castle_2f.json'), f3 = readJson('public/data/maps/castle_3f.json');
    const low = (m) => m.npcs.filter(n => ['baron_man', 'baron_woman', 'viscount_man'].includes(n.id)).length;
    assert.ok(low(f3) >= 3, '執務室: 3人');
    assert.ok(low(f2) >= 1, '会議室');
    for (const n of f3.npcs.filter(n => n.id.startsWith('baron') || n.id.startsWith('viscount'))) {
        assert.ok(n.z >= 1 && n.z <= 6, `${n.id}: 北側の執務室の中`);
        assert.ok(['margrave', 'marquis', 'duke'].every(r => !n.id.startsWith(r)), '公爵・辺境伯・侯爵は、特別な存在なので、執務室には置かない');
    }
});

test('司祭（priest_senior）は、複数いてよいが、神殿の中（temple〜のマップ）だけにいる', () => {
    const maps = fs.readdirSync(path.join(root, 'public/data/maps')).map(f => f.replace('.json', ''));
    const where = maps.filter(id => readJson(`public/data/maps/${id}.json`).npcs?.some(n => n.id === 'priest_senior'));
    assert.ok(where.length >= 1, '司祭は、どこかの神殿にいる');
    for (const id of where) assert.ok(id.startsWith('temple'), `${id}: 司祭は神殿の中だけ`);
});

test('村長の小間使い: 一般の人（街の男）の画像を流用した NPC が、村長の家と村にいる', () => {
    assert.equal(npcs.chief_attendant.texture, npcs.town_man.texture);
    assert.equal(npcs.chief_attendant.sdId, undefined);
    assert.ok(readJson('public/data/maps/village_chief_house.json').npcs.some(n => n.id === 'chief_attendant'));
    assert.ok(readJson('public/data/maps/village.json').npcs.some(n => n.id === 'chief_attendant'));
});

test('村長の家: 広間のほかに、厨房（暖炉・かまど・食器棚）と、書斎・客間・使用人の部屋があり、2階へ階段でつながる', () => {
    const m = readJson('public/data/maps/village_chief_house.json');
    const ids = new Set(Object.values(m.legend));
    for (const need of ['hearth', 'stove', 'cupboard', 'bookshelf', 'bed']) assert.ok(ids.has(need), need);
    const doors = m.layout.join('').split('').filter(ch => m.legend[ch] === 'wooden_door').length;
    assert.ok(doors >= 4 + 2, `部屋の扉4つ＋出口2つ: ${doors}`);
    assert.ok(Object.values(m.links).some(l => l.nextMap === 'village_chief_house_2f'));
    assert.ok(m.npcs.some(n => n.id === 'villager_woman'), '厨房の人');
});

test('貴族の屋敷（グレードアップ）: 階級が高いほど、部屋が多い（食料庫・酒蔵と地下の貯蔵庫、礼拝堂、家令の執務室、武具室）', () => {
    const rooms = (id) => new Set(Object.values(readJson(`public/data/maps/${id}.json`).links ?? {}).map(l => l.nextMap));
    const count = (id) => [...rooms(id)].filter(r => ['mansion_pantry', 'mansion_chapel', 'mansion_steward', 'mansion_armoury'].includes(r)).length;
    const order = ['mansion', 'mansion_margrave', 'mansion_marquis', 'mansion_viscount', 'mansion_baron'].map(count);
    for (let i = 1; i < order.length; i++) assert.ok(order[i] <= order[i - 1], `階級が下がるほど、部屋は減る: ${order}`);
    assert.deepEqual(order, [4, 3, 2, 1, 0]);
    for (const id of ['mansion', 'mansion_margrave', 'mansion_marquis', 'mansion_viscount']) assert.ok(rooms(id).has('mansion_pantry'), `${id}: 食料庫・酒蔵`);
    assert.ok(rooms('mansion_pantry').has('mansion_cellar'), '酒蔵の先に、地下の貯蔵庫');
    for (const id of ['mansion_pantry', 'mansion_cellar', 'mansion_chapel', 'mansion_steward', 'mansion_armoury']) {
        const m = readJson(`public/data/maps/${id}.json`);
        assert.ok(Object.values(m.legend).some(v => objects[v]?.nextMap === '$back'), `${id}: 出口`);
    }
});

test('王城（グレードアップ）: 礼拝堂・中庭・衛兵詰所・パン焼き所・食料庫（1階の扉）と、4階の王の居住区（広間→控えの間→接見の間→私室→奥の部屋）', () => {
    const castle = readJson('public/data/maps/castle.json');
    const dests = new Set(Object.values(castle.links).map(l => l.nextMap));
    for (const id of ['castle_chapel', 'castle_courtyard', 'castle_guardroom', 'castle_bakehouse', 'mansion_pantry', 'castle_2f', 'castle_basement']) assert.ok(dests.has(id), `1階から: ${id}`);
    const courtyard = readJson('public/data/maps/castle_courtyard.json');
    assert.equal(courtyard.type, 'open');
    assert.ok(Object.values(courtyard.legend).includes('well') && Object.values(courtyard.legend).includes('training_dummy_out'), '井戸と訓練の的');
    assert.ok(Object.values(courtyard.links).some(l => l.nextMap === 'castle_smithy'), '鍛冶場');
    const f3 = readJson('public/data/maps/castle_3f.json'), f4 = readJson('public/data/maps/castle_4f.json');
    assert.ok(Object.values(f3.links).some(l => l.nextMap === 'castle_4f') && Object.values(f4.links).some(l => l.nextMap === 'castle_3f'));
    const doors = f4.layout.join('').split('').filter(ch => objects[f4.legend[ch]]?.type === 'door').length;
    assert.ok(doors >= 8, `4階: 部屋の扉 ${doors}`);
    const used = new Set(Object.values(f4.legend));
    assert.ok(used.has('bed_stone') && used.has('bookshelf_stone') && used.has('cupboard_stone'), '寝室・書斎・衣装棚');
    const ids = f4.npcs.map(n => n.id);
    assert.ok(ids.includes('butler') && ids.includes('maid_head') && ids.includes('guard_heavy'), '執事・メイド長・衛兵');
    assert.ok(!ids.includes('king') && !ids.includes('prince'), '王・王子は、玉座の間にいる（4階には置かない）');
});

test('村長の家（グレードアップ）: 広間に暖炉、居間に机と椅子、厨房の先にバターリー（酒・食器）とパントリー（食料）の2部屋', () => {
    const m = readJson('public/data/maps/village_chief_house.json');
    const dests = Object.values(m.links).map(l => l.nextMap);
    assert.ok(dests.includes('village_buttery') && dests.includes('village_pantry'));
    const hall = m.layout.slice(1, 9).map(r => r.slice(6, 10)).join('');
    assert.ok([...hall].some(ch => m.legend[ch] === 'hearth'), '広間の暖炉');
    for (const id of ['village_buttery', 'village_pantry']) {
        const r = readJson(`public/data/maps/${id}.json`);
        assert.ok(Object.values(r.links).some(l => l.nextMap === '$back'), `${id}: 出口`);
        assert.ok(Object.values(r.legend).includes('cupboard'));
    }
    assert.ok(Object.values(readJson('public/data/maps/village_buttery.json').legend).includes('barrel'), 'バターリー: 樽');
    assert.ok(Object.values(readJson('public/data/maps/village_pantry.json').legend).includes('crate'), 'パントリー: 木箱');
});

test('水回り: 厨房に流し台と水樽、寝室に洗面台、上流の屋敷・城・医務室に浴槽、村と城の中庭に井戸がある。家具は、部屋の床・天井に合わせた版を使う', () => {
    const idsOf = (id) => new Set(Object.values(readJson(`public/data/maps/${id}.json`).legend));
    const has = (id, re) => [...idsOf(id)].some(n => re.test(n));
    for (const id of ['village_chief_house', 'temple_kitchen', 'temple_town_dining', 'temple_village_kitchen', 'mansion', 'mansion_margrave', 'mansion_marquis', 'mansion_viscount', 'mansion_baron', 'castle']) {
        assert.ok(has(id, /^sink/), `${id}: 流し台`);
    }
    for (const id of ['mansion', 'mansion_margrave', 'mansion_marquis', 'temple_town_dining', 'castle']) assert.ok(has(id, /^water_barrel/), `${id}: 水樽`);
    for (const id of ['mansion_2f', 'mansion_margrave_2f', 'mansion_marquis_2f', 'temple_infirmary', 'castle_4f']) assert.ok(has(id, /^bathtub/), `${id}: 浴槽`);
    for (const id of ['mansion_2f', 'mansion_3f', 'temple_2f', 'temple_town_2f', 'castle_4f', 'temple_village_bedroom']) assert.ok(has(id, /^wash_stand/), `${id}: 洗面台`);
    assert.ok(has('village', /^well$/) && has('castle_courtyard', /^well$/), '井戸');
    // 床・天井の材質が、部屋に合う
    assert.equal(objects.sink.floorTexture, 'woodFloor'); assert.equal(objects.sink_stone.floorTexture, 'floorStone'); assert.equal(objects.sink_marble.floorTexture, 'marbleFloor');
    assert.ok(has('temple_kitchen', /^sink_marble$/) && has('castle', /^sink_stone$/) && has('village_chief_house', /^sink$/));
    assert.equal(objects.well.floorTexture, undefined, '井戸は野外用');
});

test('便所: 屋敷・城・神殿の上階や個室にガーデローブ、村と町に野外便所がある。村の家（村長の家）の中には置かない', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const has = (id, pre) => Object.values(rd(id).legend).some(n => n.startsWith(pre));
    for (const id of ['mansion_2f', 'mansion_3f', 'mansion_margrave_2f', 'mansion_marquis_2f', 'castle_4f', 'castle_guardroom', 'temple_2f', 'temple_town_2f', 'temple_guesthouse', 'temple_infirmary']) assert.ok(has(id, 'garderobe'), `${id}: ガーデローブ`);
    for (const id of ['village', 'town']) assert.ok(has(id, 'outhouse'), `${id}: 野外便所`);
    assert.ok(!has('village_chief_house', 'garderobe'), '村長の家の中には便所を置かない（屋外の汲み取り式）');
});

test('牢獄: 衛兵詰所の階段から降りられ、牢番・囚人・落とし穴の牢・貴族の部屋があり、階段で戻れる', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const g = rd('castle_guardroom'), p = rd('castle_prison');
    assert.ok(Object.values(g.links).some(l => l.nextMap === 'castle_prison'), '詰所から牢獄へ');
    assert.ok(Object.values(p.links).some(l => l.nextMap === 'castle_guardroom'), '牢獄から詰所へ');
    const ids = p.npcs.map(n => n.id);
    for (const id of ['gaoler', 'prisoner_thug', 'prisoner_thief', 'prisoner_debtor', 'prisoner_noble']) assert.ok(ids.includes(id), id);
    const names = Object.values(p.legend);
    for (const n of ['cell_door', 'straw_bed', 'pit_hatch', 'bed_stone']) assert.ok(names.includes(n), n);
});

test('貴賓の居室: 王城3階の西端の扉から入り、出口で戻れる。客室3・居間・随行の部屋・浴室があり、公爵〜侯爵は置かない', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const f3 = rd('castle_3f'), w = rd('castle_guest_wing');
    assert.equal(f3.links['0,9'].nextMap, 'castle_guest_wing');
    assert.ok(f3.links['0,9'].back, '出口で戻る位置（back）');
    assert.ok(Object.values(w.legend).includes('brick_exit'), '出口');
    const flat = w.layout.join('');
    assert.equal((flat.match(/c/g) || []).length, 3, '客室3つ分のガーデローブ');
    for (const n of ['hearth_stone', 'bathtub_stone', 'bed_stone']) assert.ok(Object.values(w.legend).includes(n), n);
    for (const s of w.npcs) assert.ok(!/^(duke|margrave|marquis|cardinal)/.test(s.id), `${s.id}: 特別な貴族は城に置かない`);
});

test('台所: 水の出る流し台は北の壁に取り付け、すぐ横に、火の設備（かまど・暖炉・オーブン）が並ぶ。村長の家には窓がある', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const fire = n => /^(stove|hearth|oven|kitchen_hearth)/.test(n || '');
    for (const id of ['castle', 'mansion', 'mansion_baron', 'mansion_margrave', 'mansion_marquis', 'mansion_viscount', 'temple_kitchen', 'temple_town_dining', 'temple_village_kitchen', 'village_chief_house', 'city_inn', 'town_pub']) {
        const m = rd(id), at = (x, y) => m.legend[m.layout[y]?.[x]];
        let n = 0;
        m.layout.forEach((row, y) => [...row].forEach((ch, x) => {
            if (!(m.legend[ch] || '').startsWith('sink')) return;
            n++;
            assert.ok(['brick_wall', 'wooden_wall', 'marble_wall'].some(w => at(x, y - 1) === w) || /wall/.test(at(x, y - 1)), `${id} (${x},${y}): 流し台は北の壁に付く`);
            assert.ok(fire(at(x - 1, y)) || fire(at(x + 1, y)), `${id} (${x},${y}): 流し台の横に火の設備`);
        }));
        assert.ok(n > 0, `${id}: 流し台`);
    }
    const o = JSON.parse(fs.readFileSync('public/data/objects.json', 'utf8'));
    for (const s of ['stove', 'stove_stone', 'stove_marble']) assert.ok(o[s].parts.every(p => p.pos[2] <= 0), `${s}: 北の壁に寄せた向き（部品が壁側）`);
    const hall = rd('village_chief_house');
    for (const id of [hall, rd('village_chief_house_2f')]) assert.ok(Object.values(id.legend).includes('wall_window_wood'));
    assert.ok(Object.values(rd('village').legend).includes('wooden_house_window'), '村長の家の外の窓');
});

test('壁際の設備: かまど・オーブン・流し台・暖炉・食器棚は、マスの幅いっぱいで、背中が壁にぴったり付く（隣と離れない）。向きは隣の壁に自動で合わせる', () => {
    const o = JSON.parse(fs.readFileSync('public/data/objects.json', 'utf8'));
    for (const b of ['stove', 'oven', 'sink', 'hearth', 'cupboard']) for (const s of ['', '_stone', '_marble']) {
        const d = o[b + s];
        assert.equal(d.collider[0], 4, `${b}${s}: 当たり判定の幅がマスいっぱい`);
        const back = Math.max(...d.parts.map(p => Math.abs(p.pos[2]) + p.size[2] / 2));
        const off = Math.abs(d.colliderOffset[1]) + d.collider[1] / 2;
        assert.ok(Math.abs(off - 2) < 1e-9, `${b}${s}: 当たり判定の背中が壁（2）に付く`);
        assert.ok(Math.abs(back - 2) < 0.06 || back <= 2.0, `${b}${s}: 部品が壁を突き抜けない`);
        const body = d.parts[0];
        assert.equal(body.size[0], 4, `${b}${s}: 本体の幅がマスいっぱい`);
    }
    const game = fs.readFileSync('public/js/game.js', 'utf8');
    assert.ok(game.includes('autoTurn'), '壁に自動で向きを合わせる処理');
});

test('厨房らしさ: 全部の台所に、調理台・台所の暖炉・鍋つり・壁の棚か道具・袋（粉・野菜）が揃う', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    for (const id of ['castle', 'mansion', 'mansion_baron', 'mansion_viscount', 'mansion_margrave', 'mansion_marquis', 'temple_kitchen', 'temple_town_dining', 'temple_village_kitchen', 'village_chief_house', 'castle_bakehouse', 'city_inn', 'town_pub']) {
        const names = Object.values(rd(id).legend);
        const has = p => names.some(n => n.startsWith(p));
        assert.ok(has('prep_table'), `${id}: 調理台`);
        assert.ok(has('pot_rack'), `${id}: 鍋つり`);
        if (id !== 'castle_bakehouse' && id !== 'mansion_baron' && id !== 'mansion_viscount') assert.ok(has('kitchen_hearth'), `${id}: 台所の暖炉`);
        if (id !== 'village_chief_house') assert.ok(has('kitchen_shelf') || has('wall_utensils'), `${id}: 壁の棚か道具`);
    }
});

test('扉: 壁が高い建物（大神殿など）でも、扉は標準の高さで頭打ちにして、上をまぐさでふさぐ。壁が5以下は、壁の高さのまま', () => {
    const game = fs.readFileSync('public/js/game.js', 'utf8');
    assert.ok(game.includes('const doorH = Math.min(wallH, objDef.doorHeight ?? (wallH <= 5 ? wallH : 4.5))'), '扉の高さの頭打ち');
    assert.ok(game.includes('まぐさ'), 'まぐさ');
    assert.ok(game.includes('openY: doorH * 1.45'), '開く量は扉の高さが基準');
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const o = JSON.parse(fs.readFileSync('public/data/objects.json', 'utf8'));
    let tall = 0;
    for (const f of fs.readdirSync('public/data/maps')) {
        const m = rd(f.replace('.json', ''));
        if ((m.wallHeight ?? 4) > 5 && Object.values(m.legend).some(n => o[n]?.type === 'door')) tall++;
    }
    assert.equal(tall, 4, '壁が高く扉のあるマップ（大神殿・神殿2階・街の神殿と2階）');
});

test('窓: 普通の建物の外壁（民家・レンガの家・店・宿・神殿の建物）に、1マスおきに窓が付く。地上の部屋の外壁にも窓がある', () => {
    const o = JSON.parse(fs.readFileSync('public/data/objects.json', 'utf8'));
    for (const id of ['wooden_house', 'brick_house', 'shop_building', 'inn_building', 'temple_building']) {
        assert.ok(o[id].faceParts?.length > 0, `${id}: 外壁の窓の部品`);
        assert.equal(o[id].faceEvery, 2, `${id}: 1マスおき`);
        assert.ok(o[id].faceParts.every(p => Math.abs(p.pos[0]) + p.size[0] / 2 <= 2 && p.pos[1] + p.size[1] / 2 <= 4), `${id}: 窓がマスと壁（高さ4）からはみ出さない`);
    }
    assert.equal(o.wooden_house_window.faceEvery, undefined, '位置を決めた窓（村長の家）は、1マスおきにしない');
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const withWin = ['castle_2f', 'castle_3f', 'castle_4f', 'castle_chapel', 'castle_guest_wing', 'guild_adv', 'guild_mage', 'guild_merchant', 'guild_smith', 'guild_training', 'mansion_chapel', 'temple_library', 'temple_refectory', 'temple_kitchen', 'slum_bar'];
    for (const id of withWin) assert.ok(Object.values(rd(id).legend).some(n => n.includes('window')), `${id}: 窓`);
    for (const id of ['temple_treasury', 'guild_thief', 'temple_confession', 'castle_prison', 'castle_basement', 'mansion_cellar', 'temple_crypt']) assert.ok(!Object.values(rd(id).legend).some(n => n.includes('window')), `${id}: 窓なし（宝物庫・盗賊ギルド・懺悔室・地下）`);
});

test('カウンターの店員: ギルド・酒場・店の、カウンターや机の奥の店員は、カウンターのすぐそばに立つ（oz でマスの中心からずらす）', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const n = JSON.parse(fs.readFileSync('public/data/npcs.json', 'utf8'));
    for (const id of ['guild_adv', 'guild_mage', 'guild_merchant', 'guild_smith', 'slum_bar', 'shop']) {
        const m = rd(id);
        let found = 0;
        for (const s of m.npcs) {
            const below = m.legend[m.layout[s.z + 1]?.[s.x]] || '';
            if (!(below.startsWith('counter') || (id === 'shop' && below.startsWith('table')))) continue;
            found++;
            const half = below.startsWith('table') ? 0.8 : 0.6, r = n[s.id]?.radius ?? 0.45;
            const gap = 4 * (1 - (s.oz ?? 0)) - half - r;   // 店員の端から、カウンターの背中までの距離
            assert.ok(gap >= 0.1 && gap <= 0.3, `${id} ${s.id}: カウンターのそば（すき間 ${gap.toFixed(2)}）`);
        }
        assert.ok(found > 0, `${id}: カウンターの奥の店員`);
    }
    assert.ok(fs.readFileSync('public/js/game.js', 'utf8').includes('n.oz ?? 0'), 'oz を使う');
});

test('看板: ギルド・鍛冶屋・訓練所・盗賊ギルド・酒場の入口にも、店と同じ看板（アイコン）が出る', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const game = fs.readFileSync('public/js/game.js', 'utf8');
    const expected = { guild_adv: 'advGuildIcon', guild_mage: 'mageGuildIcon', guild_merchant: 'merchantGuildIcon', guild_smith: 'smithIcon', guild_training: 'trainingIcon', guild_thief: 'thiefGuildIcon', slum_bar: 'barIcon' };
    const links = [...Object.values(rd('city').links), ...Object.values(rd('city_slum').links)];
    for (const [dest, icon] of Object.entries(expected)) {
        const l = links.find(x => x.nextMap === dest);
        assert.ok(l, `${dest}: 入口`);
        assert.equal(l.icon, icon, `${dest}: アイコン`);
        assert.ok(l.back, `${dest}: 看板は、戻る側（back）の面に出る`);
        assert.ok(game.includes(`${icon}: RetroTextureGenerator.createShopIconTexture(`), `${icon}: テクスチャを登録`);
    }
});

test('生活水路: 街と町を水路が南北に流れ、浅瀬はなく（深い水）、橋でだけ渡れる。両岸の人にも橋を渡って行ける', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    for (const [id, col, bridges] of [['town', 9, 6], ['city', 17, 9]]) {
        const m = rd(id), names = Object.values(m.legend);
        assert.ok(names.includes('water') && names.includes('wood_bridge'), `${id}: 水路と橋`);
        assert.ok(!names.includes('water_shallow'), `${id}: 浅瀬はない（橋でだけ渡る）`);
        const at = y => m.legend[m.layout[y][col]];
        const water = m.layout.filter((_, y) => at(y) === 'water').length, bridge = m.layout.filter((_, y) => at(y) === 'wood_bridge').length;
        assert.ok(water >= 10, `${id}: 水路の長さ`);
        assert.ok(bridge >= bridges, `${id}: 橋は${bridges}マス以上`);
        // 水路の列は、水か橋だけ（橋のない所が、浅瀬や床で抜けていない）
        for (let y = 1; y < m.layout.length - 1; y++) assert.ok(['water', 'wood_bridge'].includes(at(y)), `${id} 行${y}: 水路の列は水か橋`);
    }
});

test('宿屋・酒場: 一般街の宿屋の建物に入口があり、1階（酒場・台所・階段）と2階（個室・相部屋）、店主と客がいて、看板が出る', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const city = rd('city'), f1 = rd('city_inn'), f2 = rd('city_inn_2f');
    const l = city.links['14,5'];
    assert.equal(l.nextMap, 'city_inn'); assert.equal(l.icon, 'innIcon'); assert.ok(l.back);
    assert.equal(city.legend[city.layout[5][14]], 'inn_door', '宿屋の建物の扉');
    assert.ok(Object.values(city.legend).includes('inn_sign'), '宿屋の標識');
    assert.ok(fs.readFileSync('public/js/game.js', 'utf8').includes("innIcon: RetroTextureGenerator.createShopIconTexture('inn')"));
    const names1 = Object.values(f1.legend), names2 = Object.values(f2.legend);
    for (const n of ['bar_counter', 'beer_keg', 'hearth', 'building_exit', 'stairs_wood_up']) assert.ok(names1.includes(n), `1階: ${n}`);
    for (const n of ['straw_bed_wood', 'bed', 'stairs_wood_down']) assert.ok(names2.includes(n), `2階: ${n}`);
    assert.equal(Object.values(f1.links)[0].nextMap, 'city_inn_2f'); assert.equal(Object.values(f2.links)[0].nextMap, 'city_inn');
    const ids = f1.npcs.map(s => s.id);
    for (const id of ['innkeeper', 'inn_cook', 'inn_waitress', 'traveler_man']) assert.ok(ids.includes(id), id);
    const npcs = JSON.parse(fs.readFileSync('public/data/npcs.json', 'utf8'));
    assert.ok(npcs.innkeeper.lines.length >= 2, '店主は噂話を話す');
});

test('宿屋・酒場の立て札: 扉の横の立て札にも、マーク入りの板（宿屋＝ベッド、酒場＝ジョッキ）が付く', () => {
    const o = JSON.parse(fs.readFileSync('public/data/objects.json', 'utf8'));
    const game = fs.readFileSync('public/js/game.js', 'utf8');
    assert.equal(o.inn_sign.texture, 'innSign'); assert.equal(o.bar_sign.texture, 'barSign');
    assert.ok(game.includes("innSign: RetroTextureGenerator.createShopSignTexture('inn')") && game.includes("barSign: RetroTextureGenerator.createShopSignTexture('bar')"));
});

test('冒険者らしい人: 冒険者ギルドと宿屋の酒場に、剣士・魔法使い・戦士・斥候・魔道士・槍使いが、数人いる（敵用の人間の画像を流用）', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const n = JSON.parse(fs.readFileSync('public/data/npcs.json', 'utf8'));
    const advs = ['adv_swordsman', 'adv_mage', 'adv_warrior', 'adv_scout', 'adv_wizard', 'adv_lancer'];
    for (const id of advs) {
        assert.ok(n[id].lines.length >= 2, `${id}: セリフ`);
        assert.ok(fs.existsSync(`public${n[id].texture}`), `${id}: 画像`);
    }
    const count = id => rd(id).npcs.filter(s => advs.includes(s.id)).length;
    assert.ok(count('guild_adv') >= 4 && count('guild_adv') <= 6, '冒険者ギルド: 冒険者が数人');
    assert.ok(count('city_inn') >= 3 && count('city_inn') <= 5, '宿屋の酒場: 冒険者が数人');
});

test('町のパブ: 町の東の家を宿屋の建物に替え、南の扉から入れる。カウンター・暖炉・台所・倉庫があり、店主と客がいる。看板が出る', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const t = rd('town'), p = rd('town_pub');
    const l = t.links['21,17'];
    assert.equal(l.nextMap, 'town_pub'); assert.equal(l.icon, 'barIcon'); assert.ok(l.back);
    assert.equal(t.legend[t.layout[17][21]], 'inn_door');
    assert.ok(Object.values(t.legend).includes('pub_sign') && Object.values(t.legend).includes('inn_building'));
    const names = Object.values(p.legend);
    for (const n of ['bar_counter', 'beer_keg', 'hearth', 'building_exit', 'kitchen_hearth', 'sink', 'stove']) assert.ok(names.includes(n), n);
    const ids = p.npcs.map(s => s.id);
    for (const id of ['innkeeper', 'inn_cook', 'inn_waitress']) assert.ok(ids.includes(id), id);
    assert.ok(Object.values(p.legend).some(n => n.includes('window')), '窓');
});

test('村の宿屋・酒場: 村の東の家を広げ、南の扉から入れる。1階は酒場（村の人たち）と台所、階段で、2階の簡素な寝床へ', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const v = rd('village'), f1 = rd('village_pub'), f2 = rd('village_pub_2f');
    const l = v.links['19,7'];
    assert.equal(l.nextMap, 'village_pub'); assert.equal(l.icon, 'barIcon'); assert.ok(l.back);
    assert.equal(v.legend[v.layout[7][19]], 'wooden_door');
    assert.ok(Object.values(v.legend).includes('pub_sign'));
    const names = Object.values(f1.legend);
    for (const n of ['bar_counter', 'beer_keg', 'stove', 'sink', 'kitchen_hearth', 'building_exit', 'stairs_wood_up']) assert.ok(names.includes(n), n);
    assert.ok(Object.values(f2.legend).includes('straw_bed_wood') && Object.values(f2.legend).includes('stairs_wood_down'));
    assert.equal(Object.values(f1.links)[0].nextMap, 'village_pub_2f'); assert.equal(Object.values(f2.links)[0].nextMap, 'village_pub');
    const ids = f1.npcs.map(s => s.id);
    assert.ok(ids.includes('village_innkeeper') && ids.filter(i => i === 'villager_man').length >= 2, 'おかみと村の人');
    const m = f1; const r = m.layout[1];
    const at = x => m.legend[r[x]] || '';
    const sx = [...r].findIndex(c => (m.legend[c] || '') === 'sink');
    assert.ok(/^(stove|kitchen_hearth)/.test(at(sx - 1)) || /^(stove|kitchen_hearth)/.test(at(sx + 1)), '流し台の横に火の設備');
});

test('村の宿屋の看板: 扉の左右に、宿屋（ベッド）と酒場（ジョッキ）の立て札が並び、道にも宿屋の案内の立て札がある', () => {
    const v = JSON.parse(fs.readFileSync('public/data/maps/village.json', 'utf8'));
    const at = (x, y) => v.legend[v.layout[y][x]];
    assert.equal(at(18, 8), 'inn_sign'); assert.equal(at(20, 8), 'pub_sign'); assert.equal(at(19, 7), 'wooden_door');
    assert.ok(Object.values(v.legend).includes('inn_guide_sign'), '道の案内の立て札');
    const o = JSON.parse(fs.readFileSync('public/data/objects.json', 'utf8'));
    assert.equal(o.inn_guide_sign.texture, 'innSign');
});

test('カウンター: ギルド・酒場・パブ・店のカウンターは、壁から壁までつながり、客はカウンターの奥に入れない。奥の店員は、客が入れない所にいる', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const objects = JSON.parse(fs.readFileSync('public/data/objects.json', 'utf8'));
    for (const id of ['guild_adv', 'guild_mage', 'guild_merchant', 'guild_smith', 'slum_bar', 'city_inn', 'town_pub', 'village_pub', 'shop']) {
        const m = rd(id);
        const solid = (x, y) => {
            const ch = m.layout[y]?.[x]; if (ch === undefined) return true; if (ch === '0') return false;
            const d = objects[m.legend[ch]]; if (!d) return false;
            if (['door', 'stairs', 'gateway', 'portal', 'floor_tile', 'hanging'].includes(d.type)) return false;
            return d.solid === true || ['block', 'furniture', 'wall_deco', 'wall_image', 'statue'].includes(d.type);
        };
        const seen = new Set([`${m.spawn.x},${m.spawn.z}`]), q = [[m.spawn.x, m.spawn.z]];
        while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!solid(nx, ny) && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); q.push([nx, ny]); } } }
        const staff = m.npcs.filter(s => s.id === '$shopkeeper' || s.behindCounter);
        assert.ok(staff.length > 0, `${id}: カウンターの奥の店員`);
        for (const s of staff) assert.ok(!seen.has(`${s.x},${s.z}`), `${id}: ${s.id} は、客が入れない所にいる`);
        for (const s of m.npcs.filter(s => !staff.includes(s))) assert.ok(seen.has(`${s.x},${s.z}`), `${id}: ${s.id} は、客が行ける所にいる`);
    }
});

test('ギルド長の部屋: 冒険者・魔法・商人ギルドは、東の壁の扉（列10・行4）から、盗賊ギルドは奥の隠し扉から、ギルド長の部屋に入れる。ギルド長は、受付のカウンターにはいない', () => {
    const rd = id => JSON.parse(fs.readFileSync(`public/data/maps/${id}.json`, 'utf8'));
    const MASTERS = { guild_adv: ['guild_adv_master', ['adv_guild_master']], guild_mage: ['guild_mage_master', ['mage_guild_master']], guild_merchant: ['guild_merchant_master', ['merchant_master_man', 'merchant_master_woman']], guild_thief: ['guild_thief_master', ['thief_guild_master', 'thief_guild_leader']] };
    for (const [g, [room, who]] of Object.entries(MASTERS)) {
        const m = rd(g), r = rd(room);
        const l = m.links['10,4'];
        assert.equal(l.nextMap, room, `${g}: ギルド長の部屋への扉`);
        assert.ok(l.back, `${g}: 戻る位置`);
        assert.ok(/door/.test(m.legend[m.layout[4][10]]), `${g}: 扉`);
        assert.ok(Object.values(r.legend).some(n => /exit/.test(n)), `${room}: 出口`);
        const ids = r.npcs.map(s => s.id);
        for (const w of who) { assert.ok(ids.includes(w), `${room}: ${w}`); assert.ok(!m.npcs.some(s => s.id === w), `${g}: ${w} は受付にいない`); }
        for (const s of r.npcs) assert.equal(s.speed, 0, `${room}: ${s.id} は動かない`);
    }
});
