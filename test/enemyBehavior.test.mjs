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
const KNOWN_AI = new Set(['stationary', 'ranged_maintain', 'bounce_leap', 'hop_pounce', 'stalker_spider', 'flying_chase', 'flying_ranged', 'worm_burrow', 'walk_chase', 'flying_dive', 'charge_dash', 'big_hop', 'pack_chase', 'cat_ambush', 'bear_rush']);

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

// 兎・猫の跳躍を、シミュレーションして計る（跳躍ごとの、距離・高さ・回数）
function measureHops(m, player, sec) {
    const projs = [];
    const hops = [];
    let cur = null;
    for (let t = 0; t < sec; t += 0.05) {
        m.update(0.05, player, [], projs, null, null, 1.0);
        if (m.isLeaping && !cur) cur = { x0: m.x, z0: m.z, h: 0 };
        if (cur) { cur.h = Math.max(cur.h, m.baseY); cur.x1 = m.x; cur.z1 = m.z; }
        if (!m.isLeaping && cur) { hops.push({ dist: Math.hypot(cur.x1 - cur.x0, cur.z1 - cur.z0), h: cur.h }); cur = null; }
    }
    return hops;
}

test('兎: 低く、速いリズムで、ぴょんぴょん跳んで近づく。上位種（アルミラージ）は、1 回の跳躍が少し長い', async () => {
    const { Monster, deriveProfile } = await load();
    const hr = new Monster('horn_rabbit', 0, 0, tex, { ...defs.horn_rabbit, id: 'horn_rabbit' });
    const al = new Monster('almiraj', 0, 0, tex, { ...defs.almiraj, id: 'almiraj' });
    for (const m of [hr, al]) { m.state = 'chase'; m.hopRest = 0; }
    const hh = measureHops(hr, P(22, 0), 5), ah = measureHops(al, P(22, 0), 5);
    const avg = (a, k) => a.reduce((t, x) => t + x[k], 0) / a.length;
    assert.ok(hh.length >= 4, `速いリズム（5 秒で ${hh.length} 回）`);
    assert.ok(avg(hh, 'h') > 0.5 && avg(hh, 'h') < 1.3, `低く跳ぶ: ${avg(hh, 'h')}`);
    assert.ok(avg(hh, 'dist') > 3 && avg(hh, 'dist') < 6, `1 回の距離: ${avg(hh, 'dist')}`);
    assert.ok(avg(ah, 'dist') > avg(hh, 'dist') * 1.2, `上位種は、跳ぶ距離が長い: ${avg(ah, 'dist')} / ${avg(hh, 'dist')}`);
    assert.ok(deriveProfile({ ...defs.almiraj, id: 'almiraj' }).hop.range > deriveProfile({ ...defs.horn_rabbit, id: 'horn_rabbit' }).hop.range);
});

test('猫系（ユキヒョウ）: 攻撃体制で姿を消し、低く長く跳んで近づき、近くで連続攻撃（1 回は小さい）、跳んで離れる（ヒットアンドアウェイ）', async () => {
    const { Monster, deriveProfile } = await load();
    assert.equal(deriveProfile({ ...defs.snow_leopard, id: 'snow_leopard' }).aiType, 'cat_ambush');
    const c = new Monster('snow_leopard', 0, 0, tex, { ...defs.snow_leopard, id: 'snow_leopard' });
    const rabbit = new Monster('horn_rabbit', 0, 0, tex, { ...defs.horn_rabbit, id: 'horn_rabbit' });
    // 攻撃体制に入るまでは、姿を現している。入ると、隠密で消える
    c.state = 'chase'; c.hopRest = 0;
    const player = P(24, 0);
    const projs = [];
    let cloakedSeen = false, minAlpha = 1, flurry = false, flurryScale = 1, away = false, revealedInFlurry = false, maxH = 0;
    let hops = [];
    const states = [];
    for (let t = 0; t < 40; t += 0.05) {
        // プレイヤーに近づいたら（跳躍で、近くへ来たら）、その場に留まる（歩かない）
        c.update(0.05, player, [], projs, null, null, 1.0);
        if (c.cloaked) { cloakedSeen = true; minAlpha = Math.min(minAlpha, c.appearAlpha); }
        if (c.catState === 'flurry') { flurry = true; flurryScale = c.hitScale; if (c.appearAlpha > 0.8) revealedInFlurry = true; }
        if (c.catState === 'away') away = true;
        maxH = Math.max(maxH, c.baseY);
        if (states[states.length - 1] !== c.catState) states.push(c.catState);
    }
    assert.ok(cloakedSeen && minAlpha < 0.15, `隠密で消える（最小の透明度 ${minAlpha}）`);
    assert.ok(flurry && flurryScale < 1, `近くで連続攻撃（1 回の威力の倍率 ${flurryScale}）`);
    assert.ok(revealedInFlurry, '連続攻撃の間は、姿を現す');
    assert.ok(away, '攻撃のあと、跳んで離れる');
    assert.ok(maxH < 1.2, `低く跳ぶ: ${maxH}`);
    for (const st of ['stalk', 'flurry', 'away']) assert.ok(states.includes(st), `状態 ${st}: ${states}`);
    assert.ok(states.filter(x => x === 'flurry').length >= 2, `ヒットアンドアウェイを繰り返す: ${states}`);
    // 跳ぶ距離は、兎より長い
    const c2 = new Monster('snow_leopard', 0, 0, tex, { ...defs.snow_leopard, id: 'snow_leopard' });
    c2.state = 'chase'; c2.hopRest = 0; rabbit.state = 'chase'; rabbit.hopRest = 0;
    const ch = measureHops(c2, P(22, 0), 3), rh = measureHops(rabbit, P(22, 0), 3);
    const avg = (a, k) => a.reduce((t, x) => t + x[k], 0) / a.length;
    assert.ok(ch.length >= 1 && avg(ch, 'dist') > avg(rh, 'dist') * 1.8, `猫系の跳ぶ距離は、兎より、ずっと長い: ${avg(ch, 'dist')} / ${avg(rh, 'dist')}`);
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

test('イノシシ: ブルブル震えて溜め → ロケットスタートで、かなり速く突き抜ける。よけられると、息切れして、長く動けず、被ダメージが増える（弱い）', async () => {
    const { Monster, deriveProfile } = await load();
    const p = deriveProfile({ ...defs.giant_boar, id: 'giant_boar' });
    assert.equal(p.aiType, 'charge_dash');
    assert.ok(p.charge.speed >= 5 && p.charge.rest >= 2 && p.charge.vulnerable > 1.3, JSON.stringify(p.charge));
    const b = new Monster('giant_boar', 0, 0, tex, { ...defs.giant_boar, id: 'giant_boar' });
    b.state = 'chase'; b.chargeCooldown = 0;
    // プレイヤーを突き抜ける（壁なし）: 当たらない（dashHit のまま false）= よけられた
    const projs = [];
    let windupShake = false, maxV = 0, lastX = 0, restState = null, restDur = 0, vulnerable = 1, dashed = false;
    for (let t = 0; t < 14; t += 0.05) {
        lastX = b.x;
        b.update(0.05, P(8, 0), [], projs, null, null, 1.0);
        if (b.chargeState === 'windup' && Math.abs(b.sprite.position.x - b.x) > 0.01) windupShake = true;
        if (b.chargeState === 'dash') { dashed = true; maxV = Math.max(maxV, (b.x - lastX) / 0.05); }
        if (b.chargeState === 'rest') { restDur += 0.05; vulnerable = Math.max(vulnerable, b.damageTakenScale); }
    }
    assert.ok(windupShake, '溜めの間、ブルブル震える');
    assert.ok(dashed && maxV > b.baseSpeed * 6, `ロケットスタートで、かなり速い: ${maxV}（通常 ${b.baseSpeed}）`);
    assert.ok(restDur >= 2.0, `よけられると、長く息切れする: ${restDur} 秒`);
    assert.ok(vulnerable >= 1.5, `息切れの間は、被ダメージが増える: ${vulnerable}`);
    // 息切れの間に、魔法を当てると、ダメージが大きい。立て直したあとは、ふつう
    const c = new Monster('giant_boar', 0, 0, tex, { ...defs.giant_boar, id: 'giant_boar' });
    c.damageTakenScale = 1.6; const hp0 = c.hp; c.takeDamage(10, { x: 1, z: 0 }, 1);
    assert.ok(hp0 - c.hp >= 15.9, `被ダメージ 1.6 倍: ${hp0 - c.hp}`);
    // 当てたとき（dashHit）は、すぐ立て直す
    const d = new Monster('giant_boar', 0, 0, tex, { ...defs.giant_boar, id: 'giant_boar' });
    d.state = 'chase'; d.chargeCooldown = 0;
    let hitRest = 0, rests = 0, prevState = '';
    for (let t = 0; t < 14; t += 0.05) {
        d.update(0.05, P(8, 0), [], projs, null, null, 1.0);
        if (d.chargeState === 'dash') d.dashHit = true;   // game.js が当たったときに立てる
        if (d.chargeState === 'rest') { hitRest += 0.05; if (prevState !== 'rest') rests++; }
        prevState = d.chargeState;
    }
    assert.ok(rests >= 1 && hitRest / rests < 1.1, `当てたときは、すぐ立て直す: 1 回 ${hitRest / rests} 秒`);
});

test('狼: 索敵範囲が、ふつうの敵の倍。仲間を呼ぶ距離も長い（相当しつこい）', async () => {
    const { Monster, deriveProfile } = await load();
    const w = new Monster('great_wolf', 0, 0, tex, { ...defs.great_wolf, id: 'great_wolf', senseRange: 10 });
    const g = new Monster('goblin_soldier', 0, 0, tex, { ...defs.goblin_soldier, id: 'goblin_soldier', senseRange: 10 });
    assert.equal(w.senseRange, 20, `狼の索敵範囲 ${w.senseRange}`);
    assert.equal(g.senseRange, 10);
    assert.ok(deriveProfile({ ...defs.fenrir, id: 'fenrir' }).relentless.joinRadius >= 30);
    // 距離 15（ふつうの敵が気づかない）でも、狼は気づく
    w.facing = 0; g.facing = 0; w.speed = 0; g.speed = 0;
    for (let i = 0; i < 30; i++) { w.update(0.05, P(0, 15), [], [], null, null, 1.0); g.update(0.05, P(0, 15), [], [], null, null, 1.0); }
    assert.equal(w.state, 'chase', '距離 15 でも、狼は気づく');
    assert.equal(g.state, 'unaware');
});

test('クマ: 縄張りの中でウロウロし、攻撃を始めると、近くで連打（ラッシュ）。1 回は小さいが、回数が多い。連打のあと、間を置いて、また連打', async () => {
    const { Monster, deriveProfile } = await load();
    for (const id of ['brown_bear', 'grizzly']) {
        const p = deriveProfile({ ...defs[id], id });
        assert.equal(p.aiType, 'bear_rush', id);
        assert.ok(p.rush.flurry >= 2 && p.rush.flurryScale < 0.7, JSON.stringify(p.rush));
        assert.equal(p.territory.mode, 'guard', id);
    }
    const b = new Monster('brown_bear', 0, 0, tex, { ...defs.brown_bear, id: 'brown_bear' });
    // 縄張りの外では、ウロウロ（攻撃しない）
    const projs = [];
    for (let t = 0; t < 4; t += 0.05) b.update(0.05, P(30, 0), [], projs, null, null, 1.0);
    assert.equal(b.state, 'unaware');
    assert.ok(Math.hypot(b.x, b.z) < 11, 'ウロウロ（縄張りの中）');
    // 縄張りに入ると、攻撃。ラッシュ → 間 → ラッシュ
    const states = [], scales = new Set();
    const pl = P(5, 0);
    for (let t = 0; t < 14; t += 0.05) {
        b.update(0.05, pl, [], projs, null, null, 1.0);
        if (states[states.length - 1] !== b.rushState) states.push(b.rushState);
        if (b.rushState === 'rush') scales.add(b.hitScale);
    }
    assert.equal(b.state, 'chase');
    assert.ok(states.filter(x => x === 'rush').length >= 2 && states.includes('recover'), `ラッシュを繰り返す: ${states}`);
    assert.ok([...scales].every(x => x < 0.7), `1 回の威力は小さい: ${[...scales]}`);
});
