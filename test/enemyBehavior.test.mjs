import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const defs = JSON.parse(fs.readFileSync(path.join(root, 'public/data/enemies.json'), 'utf-8'));
const tex = new Proxy({}, { get: () => ({}) });

// entities.js / enemyBehavior.js は、ブラウザ向けの絶対パス import なので、一時コピーを実パスに読み替えてロードする
async function load() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enemybeh-'));
    const eb = path.join(dir, 'enemyBehavior.mjs');
    fs.copyFileSync(path.join(root, 'public/js/enemyBehavior.js'), eb);
    const src = fs.readFileSync(path.join(root, 'public/js/entities.js'), 'utf-8')
        .replace("'/js/three.module.js'", JSON.stringify(path.join(root, 'public/js/three.module.js')))
        .replace("'/js/enemyBehavior.js'", JSON.stringify(eb));
    const ent = path.join(dir, 'entities.mjs');
    fs.writeFileSync(ent, src);
    return { Monster: (await import(ent)).Monster, deriveProfile: (await import(eb)).deriveProfile };
}
const KNOWN_AI = new Set(['stationary', 'ranged_maintain', 'bounce_leap', 'hop_pounce', 'stalker_spider', 'flying_chase', 'flying_ranged', 'worm_burrow', 'walk_chase', 'flying_dive', 'charge_dash', 'big_hop', 'pack_chase']);

test('敵の特徴: 全 enemies.json の敵に、動き方（aiType）が決まる。飛ぶ・突進・大ジャンプ・遠距離攻撃が、能力から決まる', async () => {
    const { deriveProfile } = await load();
    let fly = 0, charge = 0, hop = 0, shoot = 0;
    for (const [id, d] of Object.entries(defs)) {
        const p = deriveProfile({ ...d, id });
        assert.ok(KNOWN_AI.has(p.aiType), `${id}: aiType ${p.aiType}`);
        if ((d.abilities || []).includes('fly')) { assert.ok(p.flying, `${id}: 飛ぶ`); assert.ok(p.flightHeight > 0, `${id}: 飛ぶ高さ`); assert.ok(/^flying/.test(p.aiType), `${id}: 飛ぶ動き ${p.aiType}`); fly++; }
        if (p.charge) charge++;
        if (p.hop) hop++;
        if (p.shoot) { assert.ok(p.shoot.range > 0 && p.shoot.cooldown > 0, `${id}: 遠距離攻撃の定義`); shoot++; }
        for (const a of d.abilities || []) if (a === 'ranged' || a === 'breath') assert.ok(p.shoot, `${id}: ${a} の敵は撃つ`);
    }
    assert.ok(fly >= 20 && charge >= 10 && hop >= 2 && shoot >= 15, `fly ${fly} charge ${charge} hop ${hop} shoot ${shoot}`);
    // 個別の例
    assert.equal(deriveProfile({ ...defs.giant_boar, id: 'giant_boar' }).aiType, 'charge_dash', '大イノシシは突進');
    assert.equal(deriveProfile({ ...defs.horn_rabbit, id: 'horn_rabbit' }).aiType, 'big_hop', '兎は大ジャンプ');
    assert.equal(deriveProfile({ ...defs.griffon, id: 'griffon' }).aiType, 'flying_dive', 'グリフォンは飛んで急降下');
    assert.equal(deriveProfile({ ...defs.red_dragon, id: 'red_dragon' }).aiType, 'flying_ranged', 'ドラゴンは飛んで、ブレスを吐く');
    assert.equal(deriveProfile({ ...defs.red_dragon, id: 'red_dragon' }).shoot.type, 'breath_fire');
});

const P = (x, z, floorY = 0) => ({ x, z, radius: 0.4, floorY });
function sim(m, player, sec, hook) {
    const projs = [];
    const scene = { add() {} };
    const dt = 0.05;
    for (let t = 0; t < sec; t += dt) { m.update(dt, player, [], projs, null, scene, 1.0); if (hook) hook(m, t); }
    return projs;
}

test('飛ぶ敵: 地形（崖・毒沼）に関係なく動ける。地上の敵は、地形に止められる', async () => {
    const { Monster } = await load();
    const flyer = new Monster('giant_hawk', 0, 0, tex, { ...defs.giant_hawk, id: 'giant_hawk' });
    const walker = new Monster('giant_boar', 0, 0, tex, { ...defs.giant_boar, id: 'giant_boar' });
    const block = () => true;   // どこへ進んでも、崖・毒沼
    flyer.terrainBlock = block; walker.terrainBlock = block;
    flyer.state = 'chase'; walker.state = 'chase';
    sim(flyer, P(12, 0), 3); sim(walker, P(12, 0), 3);
    assert.ok(Math.hypot(flyer.x, flyer.z) > 2, '飛ぶ敵は、地形に関係なく、進む');
    assert.ok(Math.hypot(walker.x, walker.z) < 0.01, '地上の敵は、崖・毒沼へ進まない');
});

test('飛ぶ敵: 壁や視野角に関係なく、感知距離に入れば気づく（地上の敵は、背後だと気づかない）', async () => {
    const { Monster } = await load();
    const flyer = new Monster('giant_hawk', 0, 0, tex, { ...defs.giant_hawk, id: 'giant_hawk', senseRange: 10 });
    const ground = new Monster('giant_boar', 0, 0, tex, { ...defs.giant_boar, id: 'giant_boar', senseRange: 10 });
    flyer.facing = 0; ground.facing = 0; flyer.speed = 0; ground.speed = 0;
    const wall = [{ minX: -1, maxX: 1, minZ: 3, maxZ: 4 }];   // プレイヤー（背後 -z 側 6 離れる）との間の壁
    const projs = [];
    for (const m of [flyer, ground]) for (let i = 0; i < 20; i++) m.update(0.05, P(0, -6), wall, projs, null, null, 1.0);
    assert.equal(flyer.state, 'chase', '飛ぶ敵は、背後でも、壁越しでも気づく');
    assert.equal(ground.state, 'unaware', '地上の敵は、背後だと気づかない');
});

test('飛ぶ敵（近接）: 高い所を飛び、プレイヤーへ急降下して、また上昇する', async () => {
    const { Monster } = await load();
    const m = new Monster('giant_hawk', 0, 0, tex, { ...defs.giant_hawk, id: 'giant_hawk' });
    m.state = 'chase';
    let maxY = 0, minAfter = 99, dived = false;
    sim(m, P(8, 0), 14, (mm) => {
        maxY = Math.max(maxY, mm.baseY);
        if (mm.diveState === 'dive') dived = true;
        if (dived) minAfter = Math.min(minAfter, mm.baseY);
    });
    assert.ok(maxY >= 1.4, `高く飛ぶ: ${maxY}`);
    assert.ok(dived && minAfter < 0.9, `急降下して、プレイヤーの高さまで降りる: ${minAfter}`);
});

test('突進: 近づく → 立ち止まって溜める → 一直線に突進（威力は、突進中だけ）→ 壁にぶつかるとスタン', async () => {
    const { Monster } = await load();
    const boar = new Monster('giant_boar', 0, 0, tex, { ...defs.giant_boar, id: 'giant_boar' });
    boar.state = 'chase';
    boar.chargeCooldown = 0;
    const seen = new Set(); let dashSpeed = 0, lastX = 0;
    // プレイヤー（8 離れた +x）の手前から、壁（x=14）までの、一直線
    const wall = [{ minX: 14, maxX: 16, minZ: -5, maxZ: 5 }];
    const projs = [];
    for (let t = 0; t < 12; t += 0.05) {
        lastX = boar.x;
        boar.update(0.05, P(9, 0), wall, projs, null, null, 1.0);
        seen.add(boar.chargeState);
        if (boar.chargeState === 'dash') { assert.ok(boar.isDashing); dashSpeed = Math.max(dashSpeed, (boar.x - lastX) / 0.05); }
    }
    for (const s of ['windup', 'dash', 'stun']) assert.ok(seen.has(s), `状態 ${s}: ${[...seen]}`);
    assert.ok(dashSpeed > boar.baseSpeed * 2.5, `突進は速い: ${dashSpeed} 通常 ${boar.baseSpeed}`);
    assert.ok(boar.x < 14, '壁を突き抜けない');
});

test('大ジャンプ（兎）: 1 回の跳躍で、遠くまで飛ぶ。滞空中は、地面より上にいる', async () => {
    const { Monster } = await load();
    const r = new Monster('horn_rabbit', 0, 0, tex, { ...defs.horn_rabbit, id: 'horn_rabbit' });
    r.state = 'chase'; r.hopRest = 0;
    let maxJump = 0, startX = null, maxH = 0;
    sim(r, P(20, 0), 6, (m) => {
        if (m.isLeaping && startX === null) startX = m.x;
        if (m.isLeaping) { maxJump = Math.max(maxJump, m.x - startX); maxH = Math.max(maxH, m.baseY); }
        if (!m.isLeaping) startX = null;
    });
    assert.ok(maxJump >= 6, `1 回の跳躍の距離: ${maxJump}`);
    assert.ok(maxH >= 1.5, `跳ぶ高さ: ${maxH}`);
});

test('遠距離攻撃: 高い所から、低い所のプレイヤーへ、下向きに撃つ。弾の高さは、撃った敵の高さから', async () => {
    const { Monster } = await load();
    const m = new Monster('mage', 0, 0, tex, { ...defs.mage, id: 'mage' });
    m.state = 'chase'; m.floorY = 4; m.speed = 0; m.shootTimer = 0;
    const projs = sim(m, P(10, 0, 0), 1);
    assert.ok(projs.length >= 1, '撃つ');
    assert.ok(projs[0].y > 4, `弾は、敵の高さ（4 より上）から: ${projs[0].y}`);
    assert.ok(projs[0].vy < -0.3, `下向き: ${projs[0].vy}`);
});

test('特徴: 怒り（体力が半分を切ると速くなる）・逃走（体力が 3 割を切ると逃げる）・回避・再生', async () => {
    const { Monster } = await load();
    const enr = new Monster('orc_warrior', 0, 0, tex, { ...defs.orc_warrior, id: 'orc_warrior' });
    const base = enr.speed; enr.state = 'chase';
    enr.hp = enr.maxHp * 0.4; sim(enr, P(10, 0), 0.2);
    assert.ok(enr.enraged && enr.speed > base * 1.3, `怒り: ${enr.speed} 通常 ${base}`);
    const fl = new Monster('thief', 0, 0, tex, { ...defs.thief, id: 'thief' });
    fl.state = 'chase'; fl.hp = fl.maxHp * 0.2; sim(fl, P(5, 0), 2);
    assert.ok(fl.x < -1, `逃げる（プレイヤーと反対へ）: ${fl.x}`);
    const rg = new Monster('troll_dummy', 0, 0, tex, { ...defs.zombie, id: 'zombie' });
    rg.hp = rg.maxHp * 0.5; rg.hitTimer = 0; rg.speed = 0; sim(rg, P(40, 0), 5);
    assert.ok(rg.hp > rg.maxHp * 0.5, `再生: ${rg.hp}`);
});

test('狼: 一定のそこそこ速い速さで、見失っても追跡をやめない。仲間は、突進せず、同じ追跡をする', async () => {
    const { Monster, deriveProfile } = await load();
    for (const id of ['great_wolf', 'fenrir']) {
        const p = deriveProfile({ ...defs[id], id });
        assert.equal(p.aiType, 'pack_chase', id);
        assert.ok(p.relentless && p.relentless.speed >= 4 && p.relentless.joinRadius >= 20, id);
        assert.equal(p.charge, null, `${id}: 突進の代わりに、追跡`);
    }
    const w = new Monster('great_wolf', 0, 0, tex, { ...defs.great_wolf, id: 'great_wolf' });
    assert.ok(w.speed >= 4.5, `速さ: ${w.speed}`);
    w.state = 'chase';
    // プレイヤーが遠くへ逃げて、壁で視線が切れても、追跡し続ける（通常の敵は、4 秒で見失う）
    const wall = [{ minX: 2, maxX: 3, minZ: -50, maxZ: 50 }];
    const projs = [];
    let x0 = w.x;
    for (let t = 0; t < 10; t += 0.05) w.update(0.05, P(40, 0), wall, projs, null, null, 1.0);
    assert.equal(w.state, 'chase', '10 秒間、視線が切れても、追跡をやめない');
    const w2 = new Monster('great_wolf', 0, 0, tex, { ...defs.great_wolf, id: 'great_wolf' });
    w2.state = 'chase'; const t0 = performance.now();
    for (let t = 0; t < 3; t += 0.05) w2.update(0.05, P(50, 0), [], projs, null, null, 1.0);
    assert.ok(Math.abs(w2.x - 3 * w2.speed) < 1.0, `一定の速さ: 3 秒で ${w2.x}（速さ ${w2.speed}）`);
});

test('クマ: 縄張りに入られると攻撃を始め、縄張りの外へ出ると、追うのをやめて戻る。縄張りの外では、攻撃してこない', async () => {
    const { Monster, deriveProfile } = await load();
    assert.equal(deriveProfile({ ...defs.brown_bear, id: 'brown_bear' }).territory.mode, 'guard');
    assert.equal(deriveProfile({ ...defs.grizzly, id: 'grizzly' }).territory.mode, 'guard');
    const b = new Monster('brown_bear', 0, 0, tex, { ...defs.brown_bear, id: 'brown_bear', senseRange: 40 });   // 感知距離が長くても、縄張りの外では、動かない
    const projs = [];
    for (let t = 0; t < 3; t += 0.05) b.update(0.05, P(25, 0), [], projs, null, null, 1.0);   // 縄張り（半径 11）の外
    assert.equal(b.state, 'unaware', '縄張りの外のプレイヤーには、攻撃しない');
    for (let t = 0; t < 2; t += 0.05) b.update(0.05, P(8, 0), [], projs, null, null, 1.0);   // 縄張りの中
    assert.equal(b.state, 'chase', '縄張りに入ると、攻撃開始');
    const xChase = b.x;
    assert.ok(xChase > 1, `プレイヤーへ向かう: ${xChase}`);
    for (let t = 0; t < 12; t += 0.05) b.update(0.05, P(60, 0), [], projs, null, null, 1.0);   // 縄張りから遠く離れた
    assert.equal(b.state, 'unaware', '縄張りから離れると、追うのをやめる');
    for (let t = 0; t < 20; t += 0.05) b.update(0.05, P(60, 0), [], projs, null, null, 1.0);
    assert.ok(Math.hypot(b.x - b.homeX, b.z - b.homeZ) < 11 * 0.7, `縄張りの中へ戻る: ${b.x}`);
});

test('鳥: 一定の範囲を巡回していて、その範囲に入られると攻撃（急降下）してくる', async () => {
    const { Monster, deriveProfile } = await load();
    for (const id of ['giant_hawk', 'griffon']) assert.equal(deriveProfile({ ...defs[id], id }).territory.mode, 'patrol', id);
    const h = new Monster('giant_hawk', 50, 50, tex, { ...defs.giant_hawk, id: 'giant_hawk' });
    const projs = [];
    let far = 0, minX = 1e9, maxX = -1e9, maxBase = 0;
    for (let t = 0; t < 10; t += 0.05) {
        h.update(0.05, P(200, 50), [], projs, null, null, 1.0);   // 範囲の外
        minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x); maxBase = Math.max(maxBase, h.baseY);
        far = Math.max(far, Math.hypot(h.x - 50, h.z - 50));
    }
    assert.equal(h.state, 'unaware', '範囲の外では、攻撃しない');
    assert.ok(maxX - minX > 4, `巡回している（x の幅 ${maxX - minX}）`);
    assert.ok(far < 15, `巡回の範囲を出ない: ${far}`);
    assert.ok(maxBase > 1.2, `飛んでいる: ${maxBase}`);
    let dived = false;
    for (let t = 0; t < 8; t += 0.05) { h.update(0.05, P(54, 50), [], projs, null, null, 1.0); if (h.diveState === 'dive') dived = true; }
    assert.equal(h.state, 'chase', '範囲に入ると攻撃開始');
    assert.ok(dived, '急降下する');
});
