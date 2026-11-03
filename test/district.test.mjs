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
    assert.ok(![...decor('mansion_baron')].some(id => objects[id]?.type === 'hanging'), '男爵: 天井の飾りはない');
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

test('屋内のマップ: 出現位置から、NPC のいる所へ、歩いて行ける（扉や壁の飾りで、部屋がふさがれていない）', () => {
    const fs2 = fs.readdirSync(path.join(root, 'public/data/maps')).map(f => f.replace('.json', ''));
    const bad = [];
    for (const id of fs2) {
        const m = readJson(`public/data/maps/${id}.json`);
        if (m.type !== 'indoor' || !m.npcs?.length) continue;
        const solid = (x, y) => {
            const ch = m.layout[y]?.[x]; if (ch === undefined) return true; if (ch === '0') return false;
            const d = objects[m.legend[ch]]; if (!d) return false;
            if (['door', 'stairs', 'gateway', 'portal', 'floor_tile', 'hanging'].includes(d.type)) return false;
            return d.solid === true || ['block', 'furniture', 'wall_deco', 'wall_image', 'statue'].includes(d.type);
        };
        const seen = new Set([`${m.spawn.x},${m.spawn.z}`]), q = [[m.spawn.x, m.spawn.z]];
        while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!solid(nx, ny) && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); q.push([nx, ny]); } } }
        for (const n of m.npcs) if (!seen.has(`${n.x},${n.z}`)) bad.push(`${id}: ${n.id} (${n.x},${n.z})`);
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
    assert.ok(Object.values(courtyard.legend).includes('plaza_fountain') && Object.values(courtyard.legend).includes('training_dummy_out'), '井戸と訓練の的');
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
