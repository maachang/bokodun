import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data', f), 'utf-8'));
const items = readJson('items.json');
const weaponClasses = readJson('weaponClasses.json');
const playerDef = readJson('player.json');
const enemyDefs = readJson('enemies.json');

// ブラウザ向けの絶対パス import ('/js/xxx.js') を相対パスに読み替えた一時コピーを作ってロードする
async function loadModules() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'equipment-'));
    for (const f of ['game', 'textures', 'entities', 'audio', 'particles', 'slashEffect', 'strikeEffect', 'npc', 'mapNavigator', 'sdAssetManager', 'three.module']) {
        const src = fs.readFileSync(path.join(projectRoot, `public/js/${f}.js`), 'utf-8').replaceAll("'/js/", "'./");
        fs.writeFileSync(path.join(dir, `${f}.js`), src);
    }
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const { Monster, Projectile } = await import(path.join(dir, 'entities.js'));
    const { SlashEffectSystem } = await import(path.join(dir, 'slashEffect.js'));
    const { StrikeEffectSystem } = await import(path.join(dir, 'strikeEffect.js'));
    const { SoundFX } = await import(path.join(dir, 'audio.js'));
    return { GameEngine, Monster, Projectile, SlashEffectSystem, StrikeEffectSystem, SoundFX };
}

const tex = new Proxy({}, { get: () => ({}) });
// 初期装備でアイテム ID が入っているスロット番号
const bySlot = (id) => playerDef.equipSlots.indexOf(id);

// DOM・描画に依存しない、戦闘ロジックだけを検証するための模擬ゲーム
function makeGame({ GameEngine }, { mp = 60 } = {}) {
    const g = Object.create(GameEngine.prototype);
    const calls = { popups: [], exp: 0, sounds: [], slashes: [], strikes: [], playerDamage: [] };
    Object.assign(g, {
        player: {
            x: 0, z: 0, angle: 0, radius: 0.6, attackPower: 15, mp, magicCooldown: 0, attackCooldown: 0,
            equipSlots: [...playerDef.equipSlots], meleeSlot: playerDef.meleeSlot, focusSlot: playerDef.focusSlot,
            magicSlots: [...playerDef.magicSlots], selectedMagic: playerDef.selectedMagic,
            isFalling: false
        },
        keys: { forward: true },
        hitStop: 0,
        cameraShake: { time: 0, duration: 0.15, amp: 0 },
        colliders: [],
        monsters: [], projectiles: [], items, weaponClasses,
        sound: new Proxy({}, { get: (_, name) => (...args) => calls.sounds.push([name, ...args]) }),
        particles: { spawnBurst() {} },
        slashEffects: { spawn: (...args) => calls.slashes.push(args) },
        strikeEffects: { schedule: (...args) => calls.strikes.push(args) },
        scene: { add() {} },
        addPopup: (msg) => calls.popups.push(msg),
        playerTakeDamage: (amount) => calls.playerDamage.push(amount),
        notifyEnemyEngaged() {},
        gainExp: (n) => { calls.exp += n; },
        updateEquipHud() {},
    });
    return { g, calls };
}

// angle = 0 のプレイヤーは -z 方向（z が負の側）を向く
const spawn = (M, type, x, z) => new M.Monster(type, x, z, tex, enemyDefs[type]);
// 武器スロット（空きの 7・8 番）に入れてクリック選択する（近接=突進用、杖・ロッド=魔法の補正）
const equip = (g, id) => {
    const slot = weaponClasses[items[id].weaponClass].attack === 'melee' ? 6 : 7;
    g.equipItem(slot, id);
    g.selectSlot(slot);
};
// 魔法スロットの中身を差し替えて選択する
const magic = (g, id, slot = 0) => { g.setMagicSlot(slot, id); g.selectMagic(slot); };
// 前進入力で敵に突進した 1 回分の判定を実行する
const bump = (g, m) => {
    const dx = m.x - g.player.x, dz = m.z - g.player.z;
    g.resolveYsBump(m, dx, dz, Math.hypot(dx, dz));
};

// 音の生成を記録する、最小限の AudioContext の代用品
function fakeAudio(M) {
    const log = { oscillators: [], noises: 0, started: 0 };
    const param = () => ({ ramps: [], setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(v, tm) { this.ramps.push([v, tm]); } });
    const ctx = {
        currentTime: 0, sampleRate: 8000, destination: {},
        createOscillator() { const o = { type: '', frequency: param(), connect() {}, start() { log.started++; }, stop() {} }; log.oscillators.push(o); return o; },
        createGain() { return { gain: param(), connect() {} }; },
        createBiquadFilter() { return { type: '', frequency: param(), connect() {} }; },
        createBuffer(ch, size) { return { getChannelData: () => new Float32Array(size) }; },
        createBufferSource() { log.noises++; return { connect() {}, start() { log.started++; } }; },
    };
    const fx = new M.SoundFX();
    fx.ctx = ctx;
    return { fx, log };
}

test('定義ファイル（items.json / weaponClasses.json / player.json）', async (t) => {
    await t.test('武器クラス 8 種が定義され、attack ごとの必須項目がある', () => {
        assert.deepEqual(Object.keys(weaponClasses), ['bare_hands', 'dagger', 'sword', 'greatsword', 'mace', 'staff', 'magic_rod', 'bow']);
        for (const [id, c] of Object.entries(weaponClasses)) {
            assert.ok(c.name && ['melee', 'shoot', 'cast'].includes(c.attack), `${id}: attack`);
            if (c.attack === 'melee') {
                // range / arcDeg は突進の判定範囲ではなく、斬撃エフェクトの大きさ・広がりの目安
                assert.ok(c.range > 0 && c.arcDeg > 0 && c.cooldown > 0 && c.damageScale > 0 && c.knockback > 0 && c.stun >= 0, `${id}: 近接の項目`);
                assert.ok(['light', 'heavy'].includes(c.sound), `${id}: sound`);
                assert.ok(['slash', 'thrust', 'smash', 'punch'].includes(c.effect?.shape) && /^#[0-9a-f]{6}$/i.test(c.effect.color) && c.effect.duration > 0, `${id}: effect`);
            } else if (c.attack === 'shoot') {
                assert.ok(c.range > 0 && c.cooldown > 0 && c.damageScale > 0 && c.projectileSpeed > 0, `${id}: 弓の項目`);
            } else {
                // 杖・ロッド: 魔法の補正（威力・消費MP・間隔の倍率）
                assert.ok(c.spellPowerScale > 0 && c.mpScale > 0 && c.cooldownScale > 0, `${id}: 魔法の補正`);
            }
        }
    });

    await t.test('アイテム: 武器は定義済みの weaponClass を持つ。呪文は発射の項目を持つ', () => {
        for (const [id, it] of Object.entries(items)) {
            assert.equal(it.id, id, `${id}: id がキーと一致`);
            assert.ok(it.name && ['weapon', 'spell'].includes(it.kind), `${id}: kind`);
            if (it.kind === 'weapon') {
                assert.ok(weaponClasses[it.weaponClass], `${id}: 未定義の weaponClass ${it.weaponClass}`);
            } else {
                assert.ok(['fireball', 'strike', 'spread'].includes(it.type), `${id}: type`);
                assert.ok(it.mp >= 0 && it.cooldown > 0 && it.damage > 0, `${id}: 呪文の項目`);
                if (it.type !== 'strike') {
                    const v = it.visual;
                    assert.ok(['orb', 'crystal', 'bolt'].includes(v?.shape) && v.size > 0, `${id}: visual`);
                    for (const k of ['core', 'aura', 'trail', 'muzzle', 'hit']) assert.match(v[k] ?? '', /^#[0-9a-f]{6}$/i, `${id}: visual.${k}`);
                    assert.ok(['fire', 'ice', 'bolt'].includes(it.sound), `${id}: sound`);
                }
                if (it.status) {
                    assert.ok(it.status.duration > 0, `${id}: status.duration`);
                    if (it.status.type === 'burn') assert.ok(it.status.dps > 0);
                    else if (it.status.type === 'slow') assert.ok(it.status.speedScale > 0 && it.status.speedScale < 1);
                    else assert.fail(`${id}: 未知の状態異常 ${it.status.type}`);
                }
                if (it.pierce !== undefined) assert.ok(Number.isInteger(it.pierce) && it.pierce >= 1, `${id}: pierce`);
                if (it.type === 'strike') assert.ok(it.blastRadius > 0 && it.targetDistance > 0 && it.warnTime >= 0 && it.pillarTime > 0, `${id}: 落下系の項目`);
                else assert.ok(it.speed > 0, `${id}: speed`);
                if (it.type === 'spread') assert.ok(it.count >= 2 && it.spreadDeg > 0);
            }
        }
    });

    await t.test('初期装備: 武器スロット 8 枠（近接武器・杖・ロッド・空き）と、魔法スロット 4 枠（呪文または弓）', () => {
        assert.equal(playerDef.equipSlots.length, 8);
        for (const id of playerDef.equipSlots) {
            assert.ok(id === null || (items[id]?.kind === 'weapon' && weaponClasses[items[id].weaponClass].attack !== 'shoot'), `武器スロットに入れられない: ${id}`);
        }
        assert.equal(weaponClasses[items[playerDef.equipSlots[playerDef.meleeSlot]].weaponClass].attack, 'melee');
        assert.ok(playerDef.focusSlot === null || weaponClasses[items[playerDef.equipSlots[playerDef.focusSlot]].weaponClass].attack === 'cast');

        assert.equal(playerDef.magicSlots.length, 4);
        for (const id of playerDef.magicSlots) {
            assert.ok(id === null || items[id]?.kind === 'spell' || weaponClasses[items[id].weaponClass]?.attack === 'shoot', `魔法スロットに入れられない: ${id}`);
        }
        assert.ok(playerDef.selectedMagic >= 0 && playerDef.selectedMagic < playerDef.magicSlots.length);
    });
});

test('武器スロット（クリック）と魔法スロット（数字キー・セレクトボックス）', async (t) => {
    const M = await loadModules();

    await t.test('武器スロットのクリック: 近接は突進用、杖・ロッドは魔法の補正に装備され、両方が同時に有効。補正はもう一度選ぶと外れる', () => {
        const { g } = makeGame(M);
        assert.equal(g.getMeleeItem().id, 'dagger');
        assert.equal(g.getFocusItem(), null);
        g.selectSlot(bySlot('iron_sword'));
        assert.equal(g.getMeleeItem().id, 'iron_sword');
        g.selectSlot(bySlot('apprentice_staff'));
        assert.equal(g.getFocusItem().id, 'apprentice_staff');
        assert.equal(g.getMeleeItem().id, 'iron_sword', '補正を付けても突進用は変わらない');
        g.selectSlot(bySlot('magic_rod'));
        assert.equal(g.getFocusItem().id, 'magic_rod', '補正は 1 つだけ');
        g.selectSlot(bySlot('magic_rod'));
        assert.equal(g.getFocusItem(), null, 'もう一度選ぶと外れる');
    });

    await t.test('空きスロットや範囲外のクリックは何も変わらない', () => {
        const { g } = makeGame(M);
        g.selectSlot(6);
        g.selectSlot(99);
        assert.equal(g.player.meleeSlot, playerDef.meleeSlot);
        assert.equal(g.player.focusSlot, null);
    });

    await t.test('数字キー: 魔法スロットを選ぶ（範囲外は無視）。Tab は空きを飛ばして順送り', () => {
        const { g } = makeGame(M);
        g.selectMagic(2);
        assert.equal(g.player.selectedMagic, 2);
        g.selectMagic(9);
        assert.equal(g.player.selectedMagic, 2);
        g.cycleMagic();
        assert.equal(g.player.selectedMagic, 3);
        g.setMagicSlot(0, null); // 先頭を空きにする
        g.cycleMagic();          // 4 の次は空きの 1 を飛ばして 2
        assert.equal(g.player.selectedMagic, 1);
    });

    await t.test('セレクトボックス: 魔法スロットに呪文・弓を自由に入れられる。近接武器や未定義は入れられない', () => {
        const { g } = makeGame(M);
        const warn = console.warn; console.warn = () => {};
        try {
            assert.equal(g.setMagicSlot(0, 'magic_bolt'), true);
            assert.equal(g.getMagicItem(0).id, 'magic_bolt');
            assert.equal(g.setMagicSlot(3, 'short_bow'), true);
            assert.equal(g.getMagicItem(3).id, 'short_bow');
            assert.equal(g.setMagicSlot(1, null), true);
            assert.equal(g.getMagicItem(1), null);
            assert.equal(g.setMagicSlot(0, 'iron_sword'), false, '近接武器は入れられない');
            assert.equal(g.setMagicSlot(0, 'no_such_item'), false);
            assert.equal(g.setMagicSlot(9, 'fire'), false);
            assert.equal(g.getMagicItem(0).id, 'magic_bolt', '失敗した指定で中身は変わらない');
        } finally { console.warn = warn; }
    });

    await t.test('デバッグ用の装備変更: equipItem は近接武器・杖・ロッドのみ。呪文・弓は入れられず、装備中のスロットを差し替えると外れる', () => {
        const { g } = makeGame(M);
        const warn = console.warn; console.warn = () => {};
        try {
            assert.equal(g.equipItem(6, 'iron_mace'), true);
            assert.equal(g.getSlotItem(6).id, 'iron_mace');
            assert.equal(g.equipItem(6, null), true);
            assert.equal(g.equipItem(99, 'iron_mace'), false);
            assert.equal(g.equipItem(0, 'no_such_item'), false);
            assert.equal(g.equipItem(0, 'fire'), false, '呪文は武器スロットに入れられない');
            assert.equal(g.equipItem(0, 'short_bow'), false, '弓は魔法スロットへ');
            assert.equal(g.getSlotItem(0).id, 'dagger', '失敗した指定でスロットは変わらない');

            assert.equal(g.equipItem(0, null), true); // 突進用に装備中のスロットを空にする
            assert.equal(g.player.meleeSlot, null);
            assert.equal(g.getMeleeItem().id, 'fists', '未装備は素手');
        } finally { console.warn = warn; }
    });
});

test('近接武器は突進攻撃に効く', async (t) => {
    const M = await loadModules();
    // 突進で敵（スケルトン HP60・半径 0.8）に当てて、与えたダメージを返す
    const charge = (weaponId, { x = 0, z = -1.2 } = {}) => {
        const { g, calls } = makeGame(M);
        if (weaponId) equip(g, weaponId);
        const m = spawn(M, 'skeleton', x, z);
        g.monsters.push(m);
        bump(g, m);
        return { g, calls, m, damage: m.maxHp - m.hp };
    };
    const samples = (id) => Array.from({ length: 30 }, () => charge(id).damage);

    await t.test('クラスごとのダメージ倍率: 素手 < ダガー < 剣 < メイス < 大剣', () => {
        const [fists, dagger, sword, mace, great] = ['fists', 'dagger', 'iron_sword', 'iron_mace', 'iron_greatsword'].map(samples);
        assert.ok(Math.max(...fists) < Math.min(...dagger));
        assert.ok(Math.max(...dagger) < Math.min(...sword));
        assert.ok(Math.max(...sword) < Math.min(...mace));
        assert.ok(Math.max(...mace) < Math.min(...great));
    });

    await t.test('突進の連続ヒット間隔は、クラスの cooldown になる（大剣は遅く、ダガーは速い）', () => {
        assert.equal(charge('dagger').g.player.attackCooldown, weaponClasses.dagger.cooldown);
        assert.equal(charge('iron_greatsword').g.player.attackCooldown, weaponClasses.greatsword.cooldown);
        assert.ok(weaponClasses.greatsword.cooldown > weaponClasses.dagger.cooldown);
    });

    await t.test('突進が当たるとクラスの斬撃エフェクトが出る（ダガー=突き、剣=弧、メイス=衝撃波、素手=閃光）', () => {
        for (const [id, shape] of [['dagger', 'thrust'], ['iron_sword', 'slash'], ['iron_mace', 'smash'], ['fists', 'punch']]) {
            const { calls } = charge(id);
            assert.equal(calls.slashes.length, 1, `${id}: エフェクトが 1 回出る`);
            assert.equal(calls.slashes[0][2].shape, shape);
        }
    });

    await t.test('メイスは強いノックバックと一定時間のスタン、剣はスタンしない', () => {
        const mace = charge('iron_mace').m;
        const sword = charge('iron_sword').m;
        assert.ok(mace.stunTimer > 0 && mace.stunTimer <= weaponClasses.mace.stun);
        assert.equal(sword.stunTimer, 0);
        assert.ok(mace.knockback.length() > sword.knockback.length());
    });

    await t.test('半ずらし会心にも武器が効く（プレイヤーは無傷・ダメージは倍率つき）', () => {
        const { calls, damage } = charge('iron_greatsword', { x: 0.5, z: -1.2 });
        assert.equal(calls.playerDamage.length, 0, '会心ではプレイヤーは被弾しない');
        assert.ok(calls.popups.some(p => p.includes('半ずらし会心')));
        assert.ok(damage >= Math.floor(15 * 1.5 * weaponClasses.greatsword.damageScale));
        assert.equal(calls.slashes.length, 1);
    });

    await t.test('立ち止まっている間は攻撃せず、被弾する（エフェクトも出ない）', () => {
        const { g, calls } = makeGame(M);
        g.keys.forward = false;
        const m = spawn(M, 'skeleton', 0, -1.2);
        g.monsters.push(m);
        bump(g, m);
        assert.equal(m.hp, m.maxHp);
        assert.equal(calls.slashes.length, 0);
        assert.equal(calls.playerDamage.length, 1);
    });

    await t.test('被弾リアクション: 突進が当たると打撃音とヒットストップが入り、会心・撃破・重い武器では画面が揺れる', () => {
        // 通常の突進（ダガー）: 短いヒットストップ、揺れなし
        const normal = charge('dagger');
        assert.equal(normal.g.hitStop, 0.05);
        assert.equal(normal.g.cameraShake.time, 0, '通常の突進では揺れない');
        assert.deepEqual(normal.calls.sounds.find(([n]) => n === 'playEnemyHit'), ['playEnemyHit', false]);

        // 半ずらし会心: 長めのヒットストップ・揺れ・重い打撃音
        const crit = charge('dagger', { x: 0.5, z: -1.2 });
        assert.equal(crit.g.hitStop, 0.08);
        assert.ok(crit.g.cameraShake.time > 0 && crit.g.cameraShake.amp > 0);
        assert.deepEqual(crit.calls.sounds.find(([n]) => n === 'playEnemyHit'), ['playEnemyHit', true]);

        // 重い武器（大剣）: ヒットストップが 0.03 長く、揺れる
        const heavy = charge('iron_greatsword');
        assert.ok(Math.abs(heavy.g.hitStop - 0.08) < 1e-9, `0.05 + 0.03 (${heavy.g.hitStop})`);
        assert.ok(heavy.g.cameraShake.time > 0);

        // 撃破: 最も長いヒットストップ・揺れ
        const { g } = makeGame(M);
        const weak = spawn(M, 'slime', 0, -1.2);
        weak.hp = 1;
        g.monsters.push(weak);
        bump(g, weak);
        assert.equal(weak.active, false);
        assert.equal(g.hitStop, 0.1);
        assert.ok(g.cameraShake.time > 0);
    });

    await t.test('立ち止まっている間（被弾するだけ）は、ヒットストップも打撃音も入らない', () => {
        const { g, calls } = makeGame(M);
        g.keys.forward = false;
        const m = spawn(M, 'skeleton', 0, -1.2);
        g.monsters.push(m);
        bump(g, m);
        assert.equal(g.hitStop, 0);
        assert.equal(calls.sounds.some(([n]) => n === 'playEnemyHit'), false);
    });

    await t.test('ヒットストップ中はゲームの時間が止まり（update が何も進めない）、時間が経つと解ける', () => {
        const { g } = makeGame(M);
        g.requestHitStop(0.1);
        g.requestHitStop(0.05); // 長い方が残る
        assert.equal(g.hitStop, 0.1);
        g.update(0.04); // 止まっている間は、他の状態に触れずに残り時間だけ減る
        assert.ok(Math.abs(g.hitStop - 0.06) < 1e-9);
        assert.equal(g.player.magicCooldown, 0, 'クールダウンなども進まない');
    });

    await t.test('敵の被弾の色: 最初は白く光り、その後は赤みがかり、元に戻る', () => {
        const m = spawn(M, 'skeleton', 0, -10);
        const player = { x: 0, z: 0, radius: 0.4 };
        const color = () => { m.update(0.02, player, [], [], null, null, 1.0); return m.spriteMat.color; };
        m.takeDamage(1, null);
        const white = color();
        assert.ok(white.r > 1 && white.g > 1 && white.b > 1, '白く光る（1 を超える）');
        for (let i = 0; i < 5; i++) color(); // 約 0.1 秒経過
        const red = color();
        assert.ok(red.r > red.g && red.r > red.b, '赤みがかる');
        for (let i = 0; i < 15; i++) color(); // 0.2 秒を超える
        const normal = color();
        assert.deepEqual([normal.r, normal.g, normal.b], [1, 1, 1]);
    });

    await t.test('スタン中の敵は AI が止まり、解けたら動く', () => {
        const s = spawn(M, 'skeleton', 0, -10);
        s.stun(1.0);
        const z0 = s.z;
        for (let i = 0; i < 10; i++) s.update(0.05, { x: 0, z: 0, radius: 0.4 }, [], [], null, null, 1.0);
        assert.equal(s.z, z0);
        for (let i = 0; i < 30; i++) s.update(0.05, { x: 0, z: 0, radius: 0.4 }, [], [], null, null, 1.0);
        assert.ok(s.z > z0, 'スタンが解けたら動く');
    });
});

test('Space / F / クリックは選択中の魔法スロットを使う', async (t) => {
    const M = await loadModules();

    await t.test('空きの魔法スロットでは何も起きない', () => {
        const { g } = makeGame(M);
        g.setMagicSlot(0, null);
        g.useMagic();
        assert.equal(g.projectiles.length, 0);
        assert.equal(g.player.mp, 60);
        assert.equal(g.player.magicCooldown, 0);
    });

    await t.test('ファイア: 単発・MP10・ダメージ25・間隔0.35秒。クールダウン中は撃てない', () => {
        const { g } = makeGame(M);
        g.useMagic();
        assert.equal(g.projectiles.length, 1);
        assert.equal(g.projectiles[0].damage, 25);
        assert.equal(g.player.mp, 50);
        assert.equal(g.player.magicCooldown, 0.35);
        g.useMagic();
        assert.equal(g.projectiles.length, 1);
    });

    await t.test('魔法の切り替え: スロットごとに別の呪文を撃てる（拡散弾・マジックボルト）', () => {
        const spread = makeGame(M);
        spread.g.selectMagic(2);
        spread.g.useMagic();
        assert.equal(spread.g.projectiles.length, 3);
        assert.equal(spread.g.player.mp, 40);
        const angles = spread.g.projectiles.map(p => Math.atan2(-p.dirX, -p.dirZ) * 180 / Math.PI).sort((a, b) => a - b);
        assert.ok(Math.abs(angles[0] + 12) < 1e-6 && Math.abs(angles[1]) < 1e-6 && Math.abs(angles[2] - 12) < 1e-6, angles.join(','));
        assert.ok(spread.g.projectiles.every(p => p.damage === 15 && !p.explosive));

        const bolt = makeGame(M);
        bolt.g.selectMagic(3);
        bolt.g.useMagic();
        assert.equal(bolt.g.projectiles[0].damage, 8);
        assert.equal(bolt.g.player.mp, 56);
        assert.equal(bolt.g.player.magicCooldown, 0.2);
    });

    await t.test('杖は魔法の威力を上げ、ロッドは消費MPと間隔を半分にする（補正なしはそのまま）', () => {
        const staff = makeGame(M);
        equip(staff.g, 'apprentice_staff');
        staff.g.useMagic();
        assert.equal(staff.g.projectiles[0].damage, 30, '25 × 1.2');
        assert.equal(staff.g.player.mp, 50);

        const rod = makeGame(M);
        equip(rod.g, 'magic_rod');
        rod.g.useMagic();
        assert.equal(rod.g.projectiles[0].damage, 25);
        assert.equal(rod.g.player.mp, 55, '消費 10 → 5');
        assert.equal(rod.g.player.magicCooldown, 0.175, '間隔 0.35 → 0.175');
    });

    await t.test('MP不足なら撃てない（消費MPは補正後の値で判定する）', () => {
        const { g, calls } = makeGame(M, { mp: 5 });
        g.useMagic();
        assert.equal(g.projectiles.length, 0);
        assert.equal(g.player.mp, 5);
        assert.ok(calls.popups.includes('MP不足!'));

        equip(g, 'magic_rod'); // ロッドなら消費 5 で撃てる
        g.useMagic();
        assert.equal(g.projectiles.length, 1);
        assert.equal(g.player.mp, 0);
    });

    await t.test('爆発火球: 弾を飛ばさず、前方 6m の地面に予告→着弾する（MP20・間隔0.9秒）', () => {
        const { g, calls } = makeGame(M);
        g.selectMagic(1);
        g.useMagic();
        assert.equal(g.projectiles.length, 0, '弾は飛ばない');
        assert.equal(g.player.mp, 40);
        assert.equal(g.player.magicCooldown, 0.9);
        assert.equal(calls.strikes.length, 1);
        const [x, z, opts] = calls.strikes[0];
        assert.ok(Math.abs(x) < 1e-9 && Math.abs(z + 6) < 1e-9, `プレイヤー前方 6m (${x}, ${z})`);
        assert.deepEqual([opts.radius, opts.warnTime, opts.pillarTime, opts.smokeTime], [3.0, 0.3, 0.8, 2.6]);
        assert.deepEqual(calls.sounds.find(([n]) => n === 'playStrikeWhistle'), ['playStrikeWhistle', 0.3], '予告の長さに合わせて「ぴゅーーーん」');
    });

    await t.test('爆発火球: 手前に壁があれば、その直前に着弾する。杖の補正で威力が上がる', () => {
        const { g, calls } = makeGame(M);
        g.colliders = [{ minX: -2, maxX: 2, minZ: -4.5, maxZ: -3.5 }]; // z=-3.5 に壁
        equip(g, 'apprentice_staff');
        g.selectMagic(1);
        g.useMagic();
        const [, z, opts] = calls.strikes[0];
        assert.ok(z > -3.5 && z < -2.5, `壁の手前 (z=${z})`);

        const near = spawn(M, 'slime', 0, z - 0.5);
        g.monsters.push(near);
        opts.onImpact(); // 着弾
        assert.equal(near.maxHp - near.hp, 42, '35 × 1.2');
    });

    await t.test('着弾の範囲ダメージ: 半径内の敵すべてに当たり（外向きにノックバック）、範囲外は無傷。倒すと経験値', () => {
        const { g, calls } = makeGame(M);
        const near = spawn(M, 'slime', 0, -9.4);
        const edge = spawn(M, 'slime', 2.5, -9.4);
        const outside = spawn(M, 'slime', 8, -9.4);
        near.hp = 1; // 倒せる
        g.monsters.push(near, edge, outside);

        g.blastAt(0, -10, 3.0, 35);
        assert.equal(near.active, false, '範囲内で倒れる');
        assert.ok(calls.exp > 0, '経験値が入る');
        assert.equal(edge.hp, edge.maxHp - 35);
        assert.equal(outside.hp, outside.maxHp);
        assert.ok(edge.knockback.x > 0, '中心から外向きに飛ぶ');
        assert.ok(calls.sounds.some(([n]) => n === 'playBigExplosion'), '着弾で「ばーーん」');
    });

    await t.test('弓: 魔法スロットに入れると Space で矢を放つ（MP不要・重力で落ちる矢・射程はクラスの range）', () => {
        const { g, calls } = makeGame(M, { mp: 0 });
        magic(g, 'short_bow');
        g.useMagic();
        assert.equal(g.projectiles.length, 1);
        const a = g.projectiles[0];
        assert.equal(a.type, 'arrow');
        assert.equal(a.maxDistance, weaponClasses.bow.range);
        assert.ok(a.damage >= 21 && a.damage <= 23, `攻撃力15×1.4＋乱数0〜2 (${a.damage})`);
        assert.equal(g.player.mp, 0);
        assert.equal(g.player.magicCooldown, weaponClasses.bow.cooldown);
        assert.ok(calls.sounds.some(([n]) => n === 'playBowShoot'));
    });

});

test('生きている敵は障害物（プレイヤーは突き抜けられない）', async (t) => {
    const M = await loadModules();
    // プレイヤー半径 0.6・スケルトン半径 0.8 → 縁は (0.6+0.8)*0.8 = 1.12
    const EDGE = (0.6 + 0.8) * 0.8;

    await t.test('敵に向かって進み続けても、敵の縁より中へは入れない（突進の判定距離 1.4 は満たす）', () => {
        const { g } = makeGame(M);
        const m = spawn(M, 'skeleton', 0, -3);
        g.monsters.push(m);
        for (let i = 0; i < 60; i++) g.movePlayer(0, -0.2);
        const d = Math.hypot(g.player.x - m.x, g.player.z - m.z);
        assert.ok(d >= EDGE - 1e-6, `縁の内側に入っていない (d=${d})`);
        assert.ok(d < 0.6 + 0.8, '突進の判定距離（半径の和）より近く、攻撃が成立する');
    });

    await t.test('敵に斜めにぶつかると、縁に沿って横へ滑る', () => {
        const { g } = makeGame(M);
        const m = spawn(M, 'skeleton', 0, -3);
        g.monsters.push(m);
        for (let i = 0; i < 60; i++) g.movePlayer(0.05, -0.2);
        assert.ok(g.player.x > 0.5, `横へ滑って進む (x=${g.player.x})`);
        const d = Math.hypot(g.player.x - m.x, g.player.z - m.z);
        assert.ok(d >= EDGE - 1e-6);
    });

    await t.test('倒れている最中（active=false）の敵は障害物にならず、通り抜けられる', () => {
        const { g } = makeGame(M);
        const m = spawn(M, 'skeleton', 0, -3);
        m.active = false;
        g.monsters.push(m);
        for (let i = 0; i < 30; i++) g.movePlayer(0, -0.2);
        assert.ok(g.player.z < -4, `通過した (z=${g.player.z})`);
    });

    await t.test('壁際で敵に近づく移動をしても、壁にめり込まない（押し戻しが壁に重なる場合は動く前の位置に留まる）', () => {
        const { g } = makeGame(M);
        g.colliders = [{ minX: 1.0, maxX: 2.0, minZ: -5, maxZ: 5 }]; // プレイヤーの中心が入れない範囲は x 0.4〜2.6
        g.player.x = 0.3;
        const m = spawn(M, 'skeleton', -0.3, -1.0);
        g.monsters.push(m);
        g.movePlayer(0, -0.3);
        assert.equal(g.isInsideWall(g.player.x, g.player.z), false, `壁の外にいる (${g.player.x}, ${g.player.z})`);
        // めり込まないので、その後も壁から離れる方向へ自由に動ける
        const x0 = g.player.x;
        g.movePlayer(-0.2, 0);
        assert.ok(g.player.x < x0);
    });

    await t.test('壁・敵・移動をランダムに組み合わせても、壁の外から始めれば、壁の中に入り込まない', () => {
        let seed = 12345;
        const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
        for (let trial = 0; trial < 300; trial++) {
            const { g } = makeGame(M);
            g.colliders = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
                const x = (rnd() - 0.5) * 8, z = (rnd() - 0.5) * 8, w = 0.5 + rnd() * 2, h = 0.5 + rnd() * 2;
                return { minX: x, maxX: x + w, minZ: z, maxZ: z + h };
            });
            g.monsters = Array.from({ length: Math.floor(rnd() * 3) + 1 }, () => spawn(M, 'skeleton', (rnd() - 0.5) * 8, (rnd() - 0.5) * 8));
            // 壁の外に開始位置を決める
            let tries = 0;
            do { g.player.x = (rnd() - 0.5) * 8; g.player.z = (rnd() - 0.5) * 8; } while (g.isInsideWall(g.player.x, g.player.z) && ++tries < 100);
            if (g.isInsideWall(g.player.x, g.player.z)) continue;
            for (let step = 0; step < 60; step++) {
                g.movePlayer((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5);
                assert.equal(g.isInsideWall(g.player.x, g.player.z), false, `trial ${trial} step ${step}: 壁の中 (${g.player.x}, ${g.player.z})`);
            }
        }
    });

    await t.test('すでに壁にめり込んでいても、次の移動で最も近い壁の外へ出されて、動けるようになる', () => {
        const { g } = makeGame(M);
        g.colliders = [{ minX: 1.0, maxX: 2.0, minZ: -5, maxZ: 5 }]; // 判定範囲 x 0.4〜2.6
        g.player.x = 0.9; // 範囲の左端寄りの奥（左の縁まで 0.5、右の縁まで 1.7）
        g.player.z = 0;
        assert.equal(g.isInsideWall(g.player.x, g.player.z), true);
        g.movePlayer(0, 0);
        assert.equal(g.isInsideWall(g.player.x, g.player.z), false);
        assert.ok(g.player.x < 0.4, `近い側（左）の縁の外へ出る (${g.player.x})`);
        const x0 = g.player.x;
        g.movePlayer(-0.2, 0);
        assert.ok(g.player.x < x0, '動ける');
    });

    await t.test('無効（disabled）な壁にはめり込み扱いにならない', () => {
        const { g } = makeGame(M);
        g.colliders = [{ minX: 1.0, maxX: 2.0, minZ: -5, maxZ: 5, disabled: true }];
        g.player.x = 1.5;
        g.movePlayer(0, 0);
        assert.equal(g.player.x, 1.5);
    });

    await t.test('すでに重なっている敵から離れる方向の移動は妨げられない', () => {
        const { g } = makeGame(M);
        const m = spawn(M, 'skeleton', 0, -0.3); // 敵のほうから重なってきた
        g.monsters.push(m);
        g.movePlayer(0, 0.3);
        assert.ok(Math.abs(g.player.z - 0.3) < 1e-9, '後ろへ離れられる');
    });
});

test('爆発火球の効果音（SoundFX）', async (t) => {
    const M = await loadModules();

    await t.test('落下の笛: 予告の長さに合わせて、高い音から低い音へ滑り落ちる', () => {
        const { fx, log } = fakeAudio(M);
        fx.playStrikeWhistle(0.3);
        const whistle = log.oscillators.find(o => o.type === 'sine' && o.frequency.ramps.length > 0);
        assert.ok(whistle, '周波数が下降する音がある');
        const [freq, endTime] = whistle.frequency.ramps[0];
        assert.ok(freq < 2400 && Math.abs(endTime - 0.3) < 1e-9, `600Hz まで 0.3 秒で下降 (${freq}, ${endTime})`);
    });

    await t.test('重い爆発音: 衝撃・低い地鳴り・長い爆風ノイズが鳴る。AudioContext が無い（未初期化）場合は何もしない', () => {
        const { fx, log } = fakeAudio(M);
        fx.playBigExplosion();
        assert.equal(log.oscillators.length, 2, '衝撃と地鳴り');
        assert.equal(log.noises, 1, '爆風のノイズ');
        assert.ok(log.started >= 3);
        const boom = log.oscillators.find(o => o.type === 'sine');
        assert.ok(boom.frequency.ramps[0][0] <= 40, '低い音まで下がる');

        const silent = new M.SoundFX(); // ctx = null
        assert.doesNotThrow(() => { silent.playBigExplosion(); silent.playStrikeWhistle(0.3); });
    });
});

test('呪文の個性（見た目・状態異常・貫通・効果音）', async (t) => {
    const M = await loadModules();
    // 魔法スロット 1〜4 に入っている呪文を、スロット番号で撃って、できた弾を返す
    const cast = (slot) => {
        const { g, calls } = makeGame(M);
        g.selectMagic(slot);
        g.useMagic();
        return { g, calls, p: g.projectiles[0] };
    };
    const geoTypes = (p) => p.mesh.children.map(c => c.geometry.type);

    await t.test('弾の見た目が呪文ごとに違う（火=球、氷=結晶、雷=細長い光弾）', () => {
        const fire = cast(0).p, ice = cast(2).p, bolt = cast(3).p;
        assert.deepEqual(geoTypes(fire), ['SphereGeometry', 'DodecahedronGeometry']);
        assert.deepEqual(geoTypes(ice), ['OctahedronGeometry', 'OctahedronGeometry']);
        assert.deepEqual(geoTypes(bolt), ['BoxGeometry', 'BoxGeometry']);
        assert.ok(ice.mesh.scale.x < fire.mesh.scale.x, '氷の礫は小さい');
        assert.equal(bolt.noSpin, true, '光弾は回転しない');
        assert.equal(fire.noSpin, undefined);
        assert.notEqual(fire.trailColor, ice.trailColor);
        assert.notEqual(ice.trailColor, bolt.trailColor);
        assert.notEqual(fire.color, bolt.color);
    });

    await t.test('発射の効果音が呪文ごとに違う（ファイア / 氷 / 雷）', () => {
        assert.deepEqual(cast(0).calls.sounds.find(([n]) => n === 'playSpellShoot'), ['playSpellShoot', 'fire']);
        assert.deepEqual(cast(2).calls.sounds.find(([n]) => n === 'playSpellShoot'), ['playSpellShoot', 'ice']);
        assert.deepEqual(cast(3).calls.sounds.find(([n]) => n === 'playSpellShoot'), ['playSpellShoot', 'bolt']);
    });

    await t.test('ファイア: 命中した敵が燃え、毎秒3の継続ダメージを3秒受ける（再命中は延長のみ）', () => {
        const { g, calls, p } = cast(0);
        const m = spawn(M, 'skeleton', 0, -3);
        g.monsters.push(m);
        assert.equal(g.hitMonsterWithProjectile(p, m), true, '弾は消える');
        assert.equal(m.maxHp - m.hp, 25);
        assert.ok(calls.popups.includes('燃焼!'));
        assert.ok(m.spriteMat.color !== undefined);

        const popupsBefore = calls.popups.filter(s => s === '燃焼!').length;
        const p2 = cast(0).p;
        g.hitMonsterWithProjectile(p2, m);
        assert.equal(calls.popups.filter(s => s === '燃焼!').length, popupsBefore, '二重には「燃焼!」を出さない');

        // 3 秒間で 3 回（毎秒 3）= 9 ダメージ
        const hp0 = m.hp;
        for (let i = 0; i < 70; i++) { m.update(0.05, { x: 0, z: 0, radius: 0.4 }, [], [], null, null, 1.0); g.processBurn(m); }
        assert.equal(hp0 - m.hp, 9);
        assert.equal(m.burnTimer <= 0, true, '燃焼は終わる');
        assert.ok(calls.popups.some(s => s.startsWith('燃焼 -3')));
    });

    await t.test('燃焼で倒れたら経験値が入る', () => {
        const { g, calls, p } = cast(0);
        const m = spawn(M, 'slime', 0, -3);
        g.monsters.push(m);
        m.hp = 30;
        g.hitMonsterWithProjectile(p, m); // 25 ダメージ → HP 5、燃焼
        for (let i = 0; i < 70 && m.active; i++) { m.update(0.05, { x: 0, z: 0, radius: 0.4 }, [], [], null, null, 1.0); g.processBurn(m); }
        assert.equal(m.active, false);
        assert.ok(calls.exp > 0);
    });

    await t.test('敵の色: 燃焼中は赤み、鈍足中は青み（状態異常がなければ白）', () => {
        const m = spawn(M, 'skeleton', 0, -3);
        const color = () => { m.update(0.05, { x: 0, z: 0, radius: 0.4 }, [], [], null, null, 1.0); return m.spriteMat.color; };
        assert.deepEqual([color().r, color().g, color().b], [1, 1, 1]);
        m.applyStatus({ type: 'burn', duration: 3, dps: 3 });
        const burning = color();
        assert.ok(burning.r > burning.g && burning.r > burning.b);
        const m2 = spawn(M, 'skeleton', 0, -3);
        m2.applyStatus({ type: 'slow', duration: 2.5, speedScale: 0.6 });
        m2.update(0.05, { x: 0, z: 0, radius: 0.4 }, [], [], null, null, 1.0);
        assert.ok(m2.spriteMat.color.b > m2.spriteMat.color.r);
    });

    await t.test('拡散弾（氷）: 命中した敵が鈍足になり、移動が 60% に落ちて、時間が経つと戻る', () => {
        const { g, calls, p } = cast(2);
        assert.equal(g.projectiles.length, 3);
        const slowed = spawn(M, 'skeleton', 0, -10);
        const normal = spawn(M, 'skeleton', 0, -10);
        g.monsters.push(slowed);
        g.hitMonsterWithProjectile(p, slowed);
        assert.ok(calls.popups.includes('鈍足!'));
        assert.equal(slowed.slowScale, 0.6);

        const player = { x: 0, z: 0, radius: 0.4 };
        const moved = (m, sec) => { const z0 = m.z; for (let i = 0; i < sec / 0.05; i++) m.update(0.05, player, [], [], null, null, 1.0); return m.z - z0; };
        slowed.knockback.set(0, 0, 0); // ノックバックの影響を消す
        const slowMove = moved(slowed, 1.0);
        const normalMove = moved(normal, 1.0);
        assert.ok(Math.abs(slowMove / normalMove - 0.6) < 0.1, `移動量は約 60% (${slowMove / normalMove})`);

        moved(slowed, 2.0); // 2.5 秒を超えて鈍足が解ける
        assert.equal(slowed.slowTimer <= 0, true);
        assert.equal(slowed.slowScale, 1);
    });

    await t.test('マジックボルト: 2 体まで貫通し、同じ敵には二重ヒットしない（ファイアは貫通しない）', () => {
        const { g, p } = cast(3);
        assert.equal(p.hitsLeft, 2);
        const a = spawn(M, 'skeleton', 0, -3);
        const b = spawn(M, 'skeleton', 0, -4);
        const c = spawn(M, 'skeleton', 0, -5);
        assert.equal(g.hitMonsterWithProjectile(p, a), false, '1 体目: 弾は残る');
        assert.equal(p.active, true);
        assert.equal(g.hitMonsterWithProjectile(p, b), true, '2 体目: 弾が消える');
        assert.equal(p.active, false);
        assert.equal(a.maxHp - a.hp, 8);
        assert.equal(b.maxHp - b.hp, 8);
        assert.equal(c.hp, c.maxHp);
        assert.ok(p.hitMonsters.has(a) && p.hitMonsters.has(b) && !p.hitMonsters.has(c));

        assert.equal(g.hitMonsterWithProjectile(cast(0).p, spawn(M, 'skeleton', 0, -3)), true, 'ファイアは 1 体で消える');
    });

    await t.test('命中の効果音が呪文ごとに違う', () => {
        for (const [slot, kind] of [[0, 'fire'], [2, 'ice'], [3, 'bolt']]) {
            const { g, calls, p } = cast(slot);
            g.hitMonsterWithProjectile(p, spawn(M, 'skeleton', 0, -3));
            assert.deepEqual(calls.sounds.find(([n]) => n === 'playSpellHit'), ['playSpellHit', kind]);
        }
    });

    await t.test('SoundFX: 敵への打撃音は、重い（heavy）ほど低く長い。AudioContext が無ければ何もしない', () => {
        const light = fakeAudio(M); light.fx.playEnemyHit(false);
        const heavy = fakeAudio(M); heavy.fx.playEnemyHit(true);
        assert.equal(light.log.oscillators.length, 1);
        assert.equal(light.log.noises, 1);
        const lightEnd = light.log.oscillators[0].frequency.ramps[0];
        const heavyEnd = heavy.log.oscillators[0].frequency.ramps[0];
        assert.ok(heavyEnd[0] < lightEnd[0], '重いほど低い音まで下がる');
        assert.ok(heavyEnd[1] > lightEnd[1], '重いほど長い');
        assert.doesNotThrow(() => new M.SoundFX().playEnemyHit(true));
    });

    await t.test('SoundFX: 氷・雷の発射音と命中音が鳴る（火は既存の音）。AudioContext が無ければ何もしない', () => {
        for (const kind of ['fire', 'ice', 'bolt']) {
            const { fx, log } = fakeAudio(M);
            fx.playSpellShoot(kind);
            assert.ok(log.oscillators.length >= 1 && log.started >= 1, `${kind}: 発射音`);
            const hit = fakeAudio(M);
            hit.fx.playSpellHit(kind);
            assert.ok(hit.log.started >= 1, `${kind}: 命中音`);
        }
        const ice = fakeAudio(M); ice.fx.playIceHit();
        assert.equal(ice.log.oscillators.length, 2, '氷の命中は 2 音の響き');
        const bolt = fakeAudio(M); bolt.fx.playBoltHit();
        assert.equal(bolt.log.noises, 1, '雷の命中は電撃＋ノイズ');
        const silent = new M.SoundFX();
        assert.doesNotThrow(() => { silent.playSpellShoot('ice'); silent.playSpellHit('bolt'); });
    });
});

test('落下エフェクト（StrikeEffectSystem）', async (t) => {
    const M = await loadModules();

    await t.test('予告の輪 → 着弾（onImpact を 1 回だけ呼ぶ）→ 火柱 → 消える。シーンから取り除かれる', () => {
        const scene = { added: [], removed: [], add(o) { this.added.push(o); }, remove(o) { this.removed.push(o); } };
        const fx = new M.StrikeEffectSystem(scene, null);
        let impacts = 0;
        fx.schedule(0, -6, { radius: 3, warnTime: 0.3, pillarTime: 0.8, onImpact: () => impacts++ });
        assert.equal(scene.added.length, 1, '予告の輪');

        fx.update(0.2);
        assert.equal(impacts, 0, '予告中は着弾しない');
        assert.equal(scene.removed.length, 0);

        fx.update(0.11); // t = 0.31 → 着弾
        assert.equal(impacts, 1);
        assert.equal(scene.removed.length, 1, '予告の輪が消える');
        assert.equal(scene.added.length, 2, '火柱が出る');
        const pillar = fx.strikes[0].pillar;
        assert.equal(pillar.group.children.length, 4, '交差する板 3 枚 + 衝撃波リング');

        fx.update(0.3); // 火柱の持続の途中
        assert.equal(impacts, 1, '着弾は 1 回だけ');
        assert.equal(fx.strikes.length, 1);
        assert.ok(pillar.group.scale.y === 1 && pillar.mat.uniforms.uOpacity.value > 0, '立ち上がっている');

        fx.update(0.6); // 持続 0.8 を超える
        assert.equal(fx.strikes.length, 0);
        assert.equal(scene.removed.length, 2);
    });

    await t.test('煙: 火柱の持続の半分を過ぎると、ふわっとした煙の塊が出始め、火柱と並行して立ちのぼり、smokeTime 後にすべて消えて終了する', () => {
        const scene = { added: [], removed: [], add(o) { this.added.push(o); }, remove(o) { this.removed.push(o); } };
        const fx = new M.StrikeEffectSystem(scene, null);
        fx.schedule(0, -6, { radius: 3, warnTime: 0, pillarTime: 0.8, smokeTime: 2.0 });
        fx.update(0.01);                       // 着弾 → 火柱
        const addedBeforeSmoke = scene.added.length;
        fx.update(0.3);                        // 火柱の前半（q ≈ 0.39）
        assert.equal(fx.strikes[0].puffs, null, '火柱の前半は煙なし');

        fx.update(0.15);                       // q ≈ 0.58: 煙が出始める。火柱はまだ立っている
        const s = fx.strikes[0];
        assert.ok(s.pillar, '火柱はまだある（煙と並行）');
        assert.equal(s.puffs.length, 32, '煙の塊が 32 個');
        assert.equal(scene.added.length - addedBeforeSmoke, 32, '煙がシーンに追加される');

        fx.update(0.5);                        // 火柱が消えて、煙だけが残る
        assert.equal(fx.strikes[0].pillar, null);
        assert.equal(fx.strikes.length, 1, '煙が残っている間は終了しない');
        const risen = s.puffs.filter(f => f.mesh.visible);
        assert.ok(risen.length > 0, '煙が現れている');
        assert.ok(risen.every(f => f.mesh.position.y > 0.3), '立ちのぼる');
        assert.ok(risen.some(f => f.mesh.scale.x > f.size0), '膨らむ');
        assert.ok(risen.every(f => f.mat.uniforms.uAlpha.value >= 0 && f.mat.uniforms.uAlpha.value <= 0.85), '濃さは 0〜0.85');

        fx.update(2.2);                        // 出し始めから smokeTime(2.0) を超える
        assert.equal(fx.strikes.length, 0, 'すべて消えたら終了');
        assert.ok(scene.removed.length >= 32 + 1, '煙の塊 32 個と火柱が取り除かれる');
    });

    await t.test('煙の塊は炎の色から冷めていき（uHeat が下がる）、カメラの方を向く。壁には隠され、塊どうしは隠し合わない', () => {
        const scene = { add() {}, remove() {} };
        const camera = { quaternion: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 } };
        const fx = new M.StrikeEffectSystem(scene, null, camera);
        fx.schedule(0, 0, { warnTime: 0, pillarTime: 0.2, smokeTime: 2.0 });
        fx.update(0.01);
        fx.update(0.2);                        // 煙が出始める
        const f = fx.strikes[0].puffs.reduce((a, b) => (a.delay <= b.delay ? a : b)); // 最初に出る塊
        fx.update(0.05);
        const heatEarly = f.mat.uniforms.uHeat.value;
        fx.update(0.6);
        const heatLater = f.mat.uniforms.uHeat.value;
        assert.ok(heatEarly > 0.4, `最初は炎の色 (${heatEarly})`);
        assert.ok(heatLater < heatEarly * 0.5, `冷める (${heatLater})`);
        const q = f.mesh.quaternion;
        assert.ok(Math.abs(q.x - 0.1) < 1e-9 && Math.abs(q.y - 0.2) < 1e-9 && Math.abs(q.z - 0.3) < 1e-9 && Math.abs(q.w - 0.9) < 1e-9, 'カメラと同じ向き');
        assert.equal(f.mat.isShaderMaterial, true);
        assert.equal(f.mat.transparent, true);
        assert.equal(f.mat.depthWrite, false, '塊どうしが重なって濃くなる');
        assert.notEqual(f.mat.depthTest, false, '壁には隠される（深度テストあり）');
    });

    await t.test('天井のあるマップ: 火柱の高さも煙の位置も、天井（高さ 4）に届かない。天井なしは従来どおり', () => {
        const scene = { add() {}, remove() {} };
        const run = (ceiling) => {
            const fx = new M.StrikeEffectSystem(scene, null);
            fx.setCeilingHeight(ceiling);
            fx.schedule(0, 0, { radius: 3, warnTime: 0, pillarTime: 0.4, smokeTime: 2.0 });
            fx.update(0.01);
            const height = fx.strikes[0].pillar.height;
            let maxTop = 0;
            for (let k = 0; k < 60; k++) {
                fx.update(0.05);
                for (const f of fx.strikes[0]?.puffs ?? []) {
                    if (f.mesh.visible) maxTop = Math.max(maxTop, f.mesh.position.y + f.mesh.scale.x / 2);
                }
            }
            return { height, maxTop };
        };
        const low = run(4);
        assert.ok(low.height <= 4 - 0.2 + 1e-9, `火柱の高さ ${low.height}`);
        assert.ok(low.maxTop <= 4 - 0.2 + 1e-9, `煙の上端 ${low.maxTop}`);
        const open = run(null);
        assert.equal(open.height, 5);
        assert.ok(open.maxTop > 4, `天井なしは天井より高く昇る (${open.maxTop})`);
    });

    await t.test('火柱: 画像の暗い背景と縁を消すシェーダーで描く（板の縁に長方形の輪郭が出ない）', () => {
        const scene = { add() {}, remove() {} };
        const texture = { isTexture: true };
        const fx = new M.StrikeEffectSystem(scene, texture);
        fx.schedule(0, 0, { warnTime: 0, pillarTime: 0.8 });
        fx.update(0.01);
        const pl = fx.strikes[0].pillar;
        assert.equal(pl.mat.isShaderMaterial, true, '画像をそのまま貼る材質ではなく、専用のシェーダー');
        assert.equal(pl.mat.uniforms.uHasMap.value, 1);
        assert.equal(pl.mat.uniforms.uMap.value, texture);
        assert.equal(pl.mat.blending, 2, '加算合成');
        assert.equal(pl.mat.depthWrite, false);
        assert.equal(pl.group.children.filter(c => c.geometry.type === 'PlaneGeometry').length, 3, '交差する板 3 枚');

        // 画像が無い場合は単色のグラデーションに切り替わる
        const none = new M.StrikeEffectSystem(scene, null);
        none.schedule(0, 0, { warnTime: 0, pillarTime: 0.8 });
        none.update(0.01);
        assert.equal(none.strikes[0].pillar.mat.uniforms.uHasMap.value, 0);
    });

    await t.test('火柱のシェーダー: ASCII のみ・色管理を通す・暗い背景を消し、左右・上端・根元をなめらかに消す式を含む', () => {
        const src = fs.readFileSync(path.join(projectRoot, 'public/js/strikeEffect.js'), 'utf-8');
        const shaders = [...src.slice(src.indexOf('const PILLAR_VERTEX'), src.indexOf('// ---- 煙のシェーダー')).matchAll(/`([^`]*)`/g)].map(m => m[1]);
        assert.equal(shaders.length, 2);
        for (const body of shaders) assert.equal(/[^\x00-\x7F]/.test(body), false, '非 ASCII 文字なし');
        const frag = shaders[1];
        assert.ok(frag.includes('#include <colorspace_fragment>'));
        assert.ok(frag.includes('smoothstep(0.12, 0.45, lum)'), '暗い背景を消す');
        assert.ok(frag.includes('float side =') && frag.includes('float top =') && frag.includes('float root ='), '左右・上端・根元をなめらかに消す');
        for (const u of ['uMap', 'uHasMap', 'uOpacity']) assert.ok(frag.includes(u), u);
    });

    await t.test('煙のシェーダーのソースは ASCII のみで、three.js の色管理（colorspace_fragment）を通す', () => {
        const src = fs.readFileSync(path.join(projectRoot, 'public/js/strikeEffect.js'), 'utf-8');
        const shaders = [...src.slice(src.indexOf('const SMOKE_VERTEX'), src.indexOf('const SMOKE_COUNT')).matchAll(/`([^`]*)`/g)].map(m => m[1]);
        assert.equal(shaders.length, 2);
        for (const body of shaders) assert.equal(/[^\x00-\x7F]/.test(body), false, '非 ASCII 文字なし');
        assert.ok(shaders[1].includes('#include <colorspace_fragment>'));
        for (const u of ['uSeed', 'uAge', 'uHeat', 'uAlpha']) assert.ok(shaders[1].includes(`uniform float ${u};`), u);
    });

    await t.test('煙なし（smokeTime 未指定）: 火柱が消えたら従来どおりすぐ終了する', () => {
        const scene = { add() {}, remove() {} };
        const fx = new M.StrikeEffectSystem(scene, null);
        fx.schedule(0, 0, { warnTime: 0, pillarTime: 0.5 });
        fx.update(0.01);
        fx.update(0.6);
        assert.equal(fx.strikes.length, 0);
    });

    await t.test('火柱は終盤で透明になって消える', () => {
        const scene = { add() {}, remove() {} };
        const fx = new M.StrikeEffectSystem(scene, null);
        fx.schedule(0, 0, { warnTime: 0, pillarTime: 1.0 });
        fx.update(0.01);
        const pl = fx.strikes[0].pillar;
        fx.update(0.9);
        assert.ok(pl.mat.uniforms.uOpacity.value < 0.5, `終盤は薄い (${pl.mat.uniforms.uOpacity.value})`);
    });
});

test('斬撃エフェクト（SlashEffectSystem）: カメラに固定した、シェーダーで描く画面上の表示', async (t) => {
    const M = await loadModules();
    // カメラの代用品（子の追加・削除を記録する）
    const makeCamera = () => ({ children: [], add(o) { this.children.push(o); }, remove(o) { this.children = this.children.filter(c => c !== o); } });
    const def = (shape, extra = {}) => ({ shape, color: '#e0f2fe', size: 1, duration: 0.2, tiltDeg: -35, ...extra });
    const SHAPES = ['slash', 'thrust', 'smash', 'punch'];
    const DURATION = 0.2 * 2.2; // effect.duration × 2.2
    const spawn1 = (shape, power = 1.0, extra = {}) => {
        const camera = makeCamera();
        const fx = new M.SlashEffectSystem(camera);
        fx.spawn(2.6, 70, def(shape, extra), power);
        return { camera, fx, e: fx.effects[0] };
    };

    for (const shape of SHAPES) {
        await t.test(`${shape}: カメラの子（本体とフラッシュ）として表示され、時間経過で消えてすべて取り除かれる`, () => {
            const { camera, fx, e } = spawn1(shape);
            assert.equal(camera.children.length, 2, '本体とフラッシュがカメラに取り付けられる');
            assert.equal(e.shape, shape);
            fx.update(DURATION * 0.5);
            assert.equal(fx.effects.length, 1, '途中ではまだ表示されている');
            fx.update(DURATION * 0.6);
            assert.equal(fx.effects.length, 0);
            assert.equal(camera.children.length, 0, '本体もフラッシュも取り除かれる');
        });
    }

    await t.test('敵や壁に隠されず、常に手前に光って見える（シェーダー材質・深度テストなし・加算合成・描画順が最後）', () => {
        for (const shape of SHAPES) {
            const { e } = spawn1(shape);
            assert.ok(e.materials.length > 0);
            for (const m of e.materials) {
                assert.equal(m.isShaderMaterial, true);
                assert.equal(m.transparent, true);
                assert.equal(m.depthTest, false);
                assert.equal(m.depthWrite, false);
                assert.equal(m.blending, 2, '加算合成 (THREE.AdditiveBlending)');
            }
            for (const mesh of e.meshes) assert.equal(mesh.renderOrder, 999);
            assert.equal(e.flash.renderOrder, 998, 'フラッシュは本体の後ろ');
            assert.equal(e.flashMat.depthTest, false);
        }
    });

    await t.test('形ごとに重ねて描く（弧=弧2本＋星＋火花、突き=筋3本＋星＋火花、衝撃波=リング2＋円盤＋光線14＋火花、素手=星2＋リング＋火花）', () => {
        const sparks = 14, star = 5; // 星 = 円盤 1 + 筋 4
        assert.equal(spawn1('slash').e.meshes.length, 2 + star + sparks);
        assert.equal(spawn1('thrust').e.meshes.length, 3 + star + sparks);
        assert.equal(spawn1('smash').e.meshes.length, 2 + 1 + 14 + sparks);
        assert.equal(spawn1('punch').e.meshes.length, 2 * star + 1 + sparks);
    });

    await t.test('斬撃: 光の先端が弧に沿って走り（0→1）、その後は尾が流れ去る（1 を超える）。先端が尖る・尾を引く', () => {
        const { fx, e } = spawn1('slash');
        const main = e.meshes[0];
        const head = () => main.material.uniforms.uHead.value;
        assert.equal(head(), 0, '最初は端にある');
        fx.update(DURATION * 0.2);
        const mid = head();
        assert.ok(mid > 0.4 && mid < 1, `走っている途中 (${mid})`);
        fx.update(DURATION * 0.2); // p = 0.4
        assert.ok(head() >= 1, '弧の端まで走った');
        fx.update(DURATION * 0.4); // p = 0.8
        assert.ok(head() > 1.2, `尾が流れ去っていく (${head()})`);
        assert.ok(main.material.uniforms.uTail.value > 0.5, '尾が長い');
    });

    await t.test('最初の 62% は全開で光り、その後に薄くなって消える。画面全体のフラッシュは最初の 25% で消える', () => {
        const { fx, e } = spawn1('slash');
        const fade = () => e.meshes[0].material.uniforms.uFade.value;
        assert.ok(e.flashMat.opacity > 0, '最初はフラッシュ');
        fx.update(DURATION * 0.3);
        assert.equal(fade(), 1, '全開');
        assert.equal(e.flashMat.opacity, 0, 'フラッシュは消えている');
        fx.update(DURATION * 0.3); // p = 0.6
        assert.equal(fade(), 1);
        fx.update(DURATION * 0.2); // p = 0.8
        assert.ok(fade() > 0 && fade() < 1, `薄くなっていく (${fade()})`);
    });

    await t.test('火花: 当たった点から飛び散る線。会心・撃破（power が大きい）ほど数が増え、本体も大きい', () => {
        const normal = spawn1('slash', 1.0).e;
        const strong = spawn1('slash', 1.68).e;
        assert.equal(normal.sparkCount, 14);
        assert.equal(strong.sparkCount, 24);
        assert.ok(strong.meshes.length > normal.meshes.length);
        assert.ok(strong.flashBase > normal.flashBase, 'フラッシュも濃い');
        for (const e of [normal, strong]) e.meshes[0].geometry.computeBoundingSphere();
        assert.ok(strong.meshes[0].geometry.boundingSphere.radius > normal.meshes[0].geometry.boundingSphere.radius, '弧が大きい');
    });

    await t.test('火花は途中から現れ、時間とともに外へ飛び、薄くなって消える', () => {
        const { fx, e } = spawn1('punch');
        const spark = e.meshes[e.meshes.length - 1];
        assert.equal(spark.visible, false, '最初は出ていない');
        fx.update(DURATION * 0.3);
        assert.equal(spark.visible, true);
        const d1 = Math.hypot(spark.position.x, spark.position.y);
        fx.update(DURATION * 0.3);
        const d2 = Math.hypot(spark.position.x, spark.position.y);
        assert.ok(d2 > d1, '外へ飛んでいく');
        fx.update(DURATION * 0.35); // p = 0.95
        assert.equal(spark.visible, false, '消えた');
    });

    await t.test('弧の厚みと開き: 両端が尖った帯（幅が両端で 0 に近い）で、クラスの弧の広がり（arcDeg）に応じて開く', () => {
        const widthAtEnds = (arcDeg) => {
            const camera = makeCamera();
            const fx = new M.SlashEffectSystem(camera);
            const random = Math.random;
            Math.random = () => 0.5; // 大きさのランダムなばらつきを固定して、弧の広がりだけを比べる
            try { fx.spawn(2.6, arcDeg, def('slash')); } finally { Math.random = random; }
            const geo = fx.effects[0].meshes[0].geometry;
            const pos = geo.getAttribute('position');
            const w = (i) => Math.hypot(pos.getX(2 * i + 1) - pos.getX(2 * i), pos.getY(2 * i + 1) - pos.getY(2 * i));
            const n = pos.count / 2 - 1;
            geo.computeBoundingBox();
            return { start: w(0), mid: w(Math.floor(n / 2)), end: w(n), spanX: geo.boundingBox.max.x - geo.boundingBox.min.x };
        };
        const sword = widthAtEnds(70), great = widthAtEnds(120);
        assert.ok(sword.start < sword.mid * 0.05 && sword.end < sword.mid * 0.05, '両端が尖る');
        assert.ok(sword.mid > 0.3, '中央は太い');
        assert.ok(great.spanX > sword.spanX, '大剣のほうが広い弧');
    });

    await t.test('シェーダーは three.js の色管理（colorspace_fragment）を通す。使う include は three.module.js に実在する', () => {
        const src = fs.readFileSync(path.join(projectRoot, 'public/js/slashEffect.js'), 'utf-8');
        const three = fs.readFileSync(path.join(projectRoot, 'public/js/three.module.js'), 'utf-8');
        const includes = [...src.matchAll(/#include <([a-z_]+)>/g)].map(m => m[1]);
        assert.ok(includes.includes('colorspace_fragment'));
        for (const name of includes) assert.ok(three.includes(name), `three.module.js に ${name} がある`);
        // シェーダーのソースは ASCII のみ（非 ASCII 文字を拒否するドライバーがあるため）
        const shaders = src.slice(src.indexOf('const VERTEX'), src.indexOf('const ease'));
        const shaderBodies = [...shaders.matchAll(/`([^`]*)`/g)].map(m => m[1]);
        assert.equal(shaderBodies.length, 2, '頂点・フラグメントの 2 つ');
        for (const body of shaderBodies) assert.equal(/[^\x00-\x7F]/.test(body), false, '非 ASCII 文字なし');
        // 変数の宣言ミスなどの単純な誤りを防ぐ: 使う uniform は、すべてシェーダー内で宣言されている
        const frag = src.slice(src.indexOf('const FRAGMENT'), src.indexOf('const ease'));
        for (const u of ['uKind', 'uHead', 'uTail', 'uFade', 'uColor', 'uCore']) assert.ok(frag.includes(`uniform`) && frag.includes(`${u};`), `${u}`);
    });

    await t.test('位置は画面の正面のやや手前で、攻撃のたびに画面内のランダムな位置・傾き・向き（左右反転）で出る', () => {
        const camera = makeCamera();
        const fx = new M.SlashEffectSystem(camera);
        const xs = new Set(), ys = new Set(), rots = new Set(), flips = new Set();
        for (let i = 0; i < 60; i++) {
            fx.spawn(2.6, 70, def('slash'));
            const g = fx.effects[fx.effects.length - 1].group;
            assert.equal(g.position.z, -1.5, 'カメラの正面 1.5 の位置');
            assert.ok(Math.abs(g.position.x) <= 0.35 && g.position.y >= -0.2 && g.position.y <= 0.2, `画面内に収まる (${g.position.x}, ${g.position.y})`);
            xs.add(g.position.x.toFixed(3)); ys.add(g.position.y.toFixed(3)); rots.add(g.rotation.z.toFixed(3)); flips.add(g.scale.x);
        }
        assert.ok(xs.size > 30 && ys.size > 30 && rots.size > 30, '位置・傾きがランダムに変わる');
        assert.deepEqual([...flips].sort(), [-1, 1], '斬る向きが左右に反転する');
    });
});

test('エフェクトテストボタン（武器エフェクトの確認用）', async (t) => {
    const M = await loadModules();

    await t.test('testWeaponEffect: 近接クラスのエフェクトを、強さ（通常 / 会心 / 会心＋撃破）に応じた power で表示する', () => {
        const { g, calls } = makeGame(M);
        assert.equal(g.testWeaponEffect('sword', 'normal'), true);
        assert.equal(g.testWeaponEffect('sword', 'crit'), true);
        assert.equal(g.testWeaponEffect('greatsword', 'kill'), true);
        assert.deepEqual(calls.slashes.map(s => s[2].shape), ['slash', 'slash', 'slash']);
        assert.deepEqual(calls.slashes.map(s => s[0]), [2.6, 2.6, 3.2], 'クラスの範囲の目安');
        const powers = calls.slashes.map(s => s[3]);
        assert.equal(powers[0], 1.0);
        assert.equal(powers[1], 1.4);
        assert.ok(Math.abs(powers[2] - 1.4 * 1.2) < 1e-9, '会心＋撃破が最も強い');
    });

    await t.test('近接でないクラス・未定義のクラスは何も出さない', () => {
        const { g, calls } = makeGame(M);
        assert.equal(g.testWeaponEffect('staff'), false);
        assert.equal(g.testWeaponEffect('bow'), false);
        assert.equal(g.testWeaponEffect('no_such_class'), false);
        assert.equal(calls.slashes.length, 0);
    });

    await t.test('突進が当たったとき: 通常=1.0、会心=1.4、撃破=1.2 倍（会心で撃破なら 1.68）の強さで出る', () => {
        const run = (x, hp) => {
            const { g, calls } = makeGame(M);
            const m = spawn(M, 'slime', x, -1.2);
            if (hp) m.hp = hp;
            g.monsters.push(m);
            bump(g, m);
            return calls.slashes[0][3];
        };
        assert.equal(run(0), 1.0);
        assert.equal(run(0.5), 1.4, '半ずらし会心');
        assert.ok(Math.abs(run(0, 1) - 1.2) < 1e-9, '通常の突進で撃破');
        assert.ok(Math.abs(run(0.5, 1) - 1.68) < 1e-9, '会心で撃破');
    });
});

test('HUD の描画（武器スロット・魔法スロット）', async (t) => {
    // jhtml.browser.js は maachang フレームワーク（MAACHANG_HOME/public/）にある。見つからない環境ではスキップする
    const jhtmlPath = path.join(process.env.MAACHANG_HOME || '/home/maachang/project/maachang', 'public/jhtml.browser.js');
    if (!fs.existsSync(jhtmlPath)) {
        t.skip('jhtml.browser.js が見つかりません');
        return;
    }
    const M = await loadModules();
    // jhtml.browser.js をそのまま読み込み、DOM 取得（$）だけ仮の要素に差し替える
    await import(jhtmlPath);
    const els = { weaponHud: { innerHTML: '' }, magicHud: { innerHTML: '' }, effectTestHud: { innerHTML: '' } };
    const realDollar = globalThis.jhtml.$;
    globalThis.jhtml.$ = (id) => els[id] ?? null;

    try {
        const { g } = makeGame(M);
        // makeGame の updateEquipHud は空にしてあるため、本物のメソッドを呼ぶ
        g.updateEquipHud = M.GameEngine.prototype.updateEquipHud;
        g.selectSlot(bySlot('apprentice_staff')); // 補正に装備（この間は空の updateEquipHud 差し替えの影響を受けない）
        g.updateEquipHud();

        const weapon = els.weaponHud.innerHTML;
        assert.equal((weapon.match(/class="weapon-slot/g) || []).length, 8, '武器スロット 8 枠');
        assert.match(weapon, /class="weapon-slot active-melee "[^>]*data-slot="0">ダガー</, '突進用はダガー');
        assert.match(weapon, /class="weapon-slot active-focus "[^>]*data-slot="4">見習いの杖</, '補正は見習いの杖');
        assert.match(weapon, /class="weapon-slot empty"[^>]*data-slot="6">―</, '空きは破線');

        const magicHtml = els.magicHud.innerHTML;
        assert.equal((magicHtml.match(/<select /g) || []).length, 4, '魔法スロット 4 枠');
        assert.match(magicHtml, /class="magic-slot active-magic">1<select data-slot="0">/, '選択中は 1 番');
        assert.match(magicHtml, /<option value="fire" selected>ファイア<\/option>/, '1 番の中身はファイア');
        assert.match(magicHtml, /<option value="short_bow"\s*>短弓<\/option>/, '選択肢に弓がある');
        assert.doesNotMatch(magicHtml, /iron_sword/, '近接武器は選択肢にない');

        // エフェクトテストのパネル: 強さの選択と、近接クラスごとのボタン
        g.updateEffectTestHud = M.GameEngine.prototype.updateEffectTestHud;
        g.updateEffectTestHud();
        const testHtml = els.effectTestHud.innerHTML;
        assert.match(testHtml, /<select id="effectTestStrength">/);
        assert.deepEqual([...testHtml.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]), ['normal', 'crit', 'kill']);
        const buttons = [...testHtml.matchAll(/<button class="test-btn" data-class="([^"]+)">([^<]+)<\/button>/g)].map(m => [m[1], m[2]]);
        assert.deepEqual(buttons, [['bare_hands', '素手'], ['dagger', 'ダガー'], ['sword', '剣'], ['greatsword', '大剣'], ['mace', 'メイス']], '近接クラスだけ');

        g.selectMagic(2);
        g.setMagicSlot(2, 'magic_bolt');
        assert.match(els.magicHud.innerHTML, /class="magic-slot active-magic">3<select data-slot="2">/);
        assert.match(els.magicHud.innerHTML, /<option value="magic_bolt" selected>マジックボルト<\/option>/);
    } finally {
        globalThis.jhtml.$ = realDollar;
    }
});
