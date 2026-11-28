// BGM（public/js/audio/audioBgm.js・public/js/game/bgm.js・public/data/bgm.json）のテスト。
// 音の良し悪しは、耳で確認する。ここでは、曲データが正しいこと・全曲がエラーなく演奏できること・選曲の規則を確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bgmSounds, noteMidi, midiFreq, chordNotes } from '../public/js/audio/audioBgm.js';
import { bgmMethods } from '../public/js/game/bgm.js';

const bgm = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/bgm.json'), 'utf-8'));

test('音名・和音の計算', () => {
    assert.equal(noteMidi('A4'), 69);
    assert.equal(noteMidi('C5'), 72);
    assert.equal(noteMidi('G#5'), 80);
    assert.equal(noteMidi('Bb5'), 82);
    assert.equal(noteMidi('X9'), null);
    assert.equal(Math.round(midiFreq(69)), 440);
    assert.deepEqual(chordNotes('C').tones, [48, 52, 55]);
    assert.deepEqual(chordNotes('Am').tones, [57, 60, 64]);
    assert.deepEqual(chordNotes('E7').tones.length, 4);
    assert.equal(chordNotes('H'), null);
});

test('曲データ: 場面ごとの曲があり、旋律・和音・パターンが正しい', () => {
    assert.deepEqual(Object.keys(bgm.tracks).sort(), ['boss', 'castle', 'castle_k', 'desert', 'dungeon', 'field', 'forest', 'guild', 'makahiki', 'mountain', 'port', 'posttown', 'shrine_k', 'snow', 'south', 'temple', 'temple_b', 'temple_cardinal', 'temple_cloister', 'temple_crypt', 'temple_life', 'temple_village', 'town', 'town_a', 'town_b', 'town_c', 'town_e', 'town_f', 'town_g', 'town_k']);
    for (const [name, t] of Object.entries(bgm.tracks)) {
        const steps = t.chords.length * 8, mel = t.melody.trim().split(/\s+/);
        assert.equal(mel.length, steps, `${name}: 旋律は、和音 1 つにつき 8 ステップ`);
        for (const tok of mel) assert.ok(tok === '-' || tok === '.' || noteMidi(tok) != null, `${name}: 旋律の音名 ${tok}`);
        assert.notEqual(mel[0], '-', `${name}: 旋律は、「-」から始まらない`);
        for (const c of t.chords) assert.ok(chordNotes(c), `${name}: 和音 ${c}`);
        assert.ok(t.bpm >= 40 && t.bpm <= 200, `${name}: bpm`);
        const v = t.voices;
        for (const k of ['arp', 'bass']) if (v[k]) assert.equal(v[k].pattern.split(' ').length, 8, `${name}: ${k} は 8 ステップ`);
        for (const k of ['kick', 'snare', 'hat', 'tom', 'clap']) if (v.drums?.[k]) assert.equal(v.drums[k].length, 8, `${name}: drums.${k} は 8 文字`);
        if (t.dynamics) { assert.equal(t.dynamics.length, t.chords.length, `${name}: 起伏は、小節ごと`); for (const x of t.dynamics) assert.ok(x > 0 && x <= 1.2, `${name}: 起伏の値`); }
        if (v.bass) for (const tok of v.bass.pattern.split(' ')) assert.ok(['R', '5', '3', '8', '.'].includes(tok), `${name}: 低音の記号 ${tok}`);
        if (v.drums?.fill) assert.ok(['snare', 'tom'].includes(v.drums.fill), `${name}: フィル`);
        for (const [vn, vv] of Object.entries(v)) if (vv.gain !== undefined) assert.ok(vv.gain > 0 && vv.gain <= 0.3, `${name}: ${vn} の音量が、大きすぎない`);
    }
    for (const r of bgm.rules) assert.ok(bgm.tracks[r.track], `規則の曲 ${r.track} がある`);
});

function fakeCtx() {
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
    const node = (x = {}) => ({ connect() {}, disconnect() {}, ...x });
    const log = { osc: 0, noise: 0 };
    return { log, currentTime: 0, sampleRate: 8000, destination: {},
        createOscillator: () => node({ frequency: param(), detune: param(), type: '', start() { log.osc++; }, stop() {} }),
        createGain: () => node({ gain: param() }),
        createBiquadFilter: () => node({ frequency: param(), Q: param(), type: '' }),
        createConvolver: () => node({ buffer: null }),
        createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
        createBufferSource: () => node({ start() { log.noise++; }, stop() {} }) };
}
const engine = () => { const s = Object.create(bgmSounds); s.ctx = fakeCtx(); s.setBgmTracks(bgm); return s; };

test('全曲が、1 周（ステップを全部）、例外なく演奏できる。曲の切り替えは、古い曲を止める', () => {
    const s = engine();
    for (const name of Object.keys(bgm.tracks)) {
        s.playBgm(name);
        const st = s._bgm, total = st.melody.length;
        let guard = 0;
        while (st.step < total + 8 && guard++ < 2000) { s.ctx.currentTime += 0.1; s._bgmTick(st); }
        assert.ok(st.step >= total, `${name}: 1 周を演奏した`);
        assert.ok(s.ctx.log.osc > 20, `${name}: 音が鳴った`);
    }
    const before = s._bgm;
    s.playBgm('field'); s.playBgm('boss');
    assert.notEqual(s._bgm, before);
    assert.equal(s._bgm.name, 'boss');
    s.playBgm('boss');   // 同じ曲は、作り直さない
    const same = s._bgm; s.playBgm('boss'); assert.equal(s._bgm, same);
    s.stopBgm(); assert.equal(s._bgm, null);
});

test('音が使えるようになる前は、曲を覚えておく（ctx がない）。曲データにない曲は、鳴らさない', () => {
    const s = engine(); s.ctx = null;
    s.playBgm('town');
    assert.equal(s._bgmWant, 'town'); assert.equal(s._bgm, undefined);
    const t = engine(); t.playBgm('no_such'); assert.equal(t._bgm, undefined);
    t.stopBgm();
});

test('音量: 0〜1 に収める', () => {
    const s = engine(); s.playBgm('field');
    s.setBgmVolume(2); assert.equal(s.bgmVolume, 1);
    s.setBgmVolume(-1); assert.equal(s.bgmVolume, 0);
    s.stopBgm();
});

test('選曲: マップの種類で曲が決まり、ボスが近くにいる間は、ボス戦', () => {
    const g = Object.create(bgmMethods);
    g.bgmDef = bgm; g.player = { x: 0, z: 0 }; g.monsters = []; g.currentMapId = 'w_05_05'; g.bgmMapType = 'open';
    assert.equal(g.bgmChooseTrack(), 'field', '世界（屋外）は、草原');
    for (const [id, want] of [['town_d', 'town'], ['town_h', 'town'], ['city_noble', 'town'], ['village_pub', 'town'], ['castle_b_2f', 'castle'], ['mansion_duke_i', 'castle'], ['cave', 'dungeon'], ['dungeon', 'dungeon'], ['field_x', 'field'], ['field_grass', 'field'],
        // 国ごとの町・店・宿
        ['town_a', 'town_a'], ['shop_a', 'town_a'], ['town_b', 'town_b'], ['town_c', 'town_c'], ['town_e', 'town_e'], ['town_f', 'town_f'], ['town_g', 'town_g'], ['city_inn_2f_g', 'town_g'], ['elder_house_g', 'town_g'], ['city_inn', 'town'],
        // ギルド全般・大神殿・マカヒキ国
        ['guild_adv', 'guild'], ['guild_adv_a', 'guild'], ['guild_mage_master_g', 'guild'], ['guild_training_k', 'town_k'], ['temple', 'temple'], ['temple_2f', 'temple'], ['temple_town', 'temple'], ['temple_town_2f', 'temple'], ['temple_town_dining', 'temple'],
        ['temple_3f', 'temple_cardinal'], ['temple_b', 'temple_b'], ['temple_cloister_b', 'temple_b'], ['temple_treasury_b', 'temple_b'], ['temple_crypt', 'temple_crypt'], ['temple_treasury', 'temple_crypt'], ['temple_cloister', 'temple_cloister'],
        ['temple_library', 'temple_life'], ['temple_kitchen', 'temple_life'], ['temple_infirmary', 'temple_life'], ['temple_village', 'temple_village'], ['temple_village_kitchen', 'temple_village'], ['temple_village_bedroom', 'temple_village'],
        ['town_k', 'town_k'], ['shop_k', 'town_k'], ['city_inn_2f_k', 'town_k'], ['castle_k', 'castle_k'], ['castle_k_basement', 'castle_k'], ['tenshu_k_3f', 'castle_k'], ['shrine_k', 'shrine_k'], ['shrine_k_2f', 'shrine_k'], ['shrine_k_dining', 'shrine_k'], ['w_12_03', 'makahiki'], ['w_13_02', 'makahiki']]) {
        g.currentMapId = id; g.bgmMapType = ['field_x', 'field_grass', 'w_12_03', 'w_13_02', 'temple_cloister', 'temple_cloister_b'].includes(id) || /^town|^village|^city$|^city_noble/.test(id) ? 'open' : 'indoor'; g.bgmMapName = '';
        assert.equal(g.bgmChooseTrack(), want, `${id}: ${want}`);
    }
    // 道沿いの町・村（rs_*）は、町の曲。港町は港の曲・宿場は宿場の曲（マップ名で決まる）
    g.currentMapId = 'rs_01'; g.bgmMapType = 'open';
    for (const [name, want] of [['アルマダ村', 'town'], ['ソレミア町', 'town'], ['トレヴ港町', 'port'], ['シルヴァノ宿場', 'posttown']]) { g.bgmMapName = name; assert.equal(g.bgmChooseTrack(), want, `${name}: ${want}`); }
    // 世界の外のマップは、地形名（マップ名）で、場面の曲が決まる
    g.currentMapId = 'w_06_10'; g.bgmMapType = 'open';
    for (const [name, want] of [['北の雪山 (2-8)', 'snow'], ['砂地 (7-11)', 'desert'], ['大森林 (6-5)', 'forest'], ['南国 (12-10)', 'south'], ['岩山 (9-17)', 'mountain'], ['炭鉱の山 (10-16)', 'mountain'], ['草原 (5-5)', 'field'], ['海岸 (2-9)', 'field']]) {
        g.bgmMapName = name; assert.equal(g.bgmChooseTrack(), want, `${name}: ${want}`);
    }
    g.bgmMapName = '';
    g.currentMapId = 'w_05_05'; g.bgmMapType = 'open';
    g.monsters = [{ active: true, isBoss: false, hp: 10, x: 5, z: 0 }];
    assert.equal(g.bgmChooseTrack(), 'field', '普通の敵では、変わらない');
    g.monsters = [{ active: true, isBoss: true, hp: 10, x: 40, z: 0 }];
    assert.equal(g.bgmChooseTrack(), 'field', '遠いボスでは、変わらない');
    g.monsters = [{ active: true, isBoss: true, hp: 10, x: 20, z: 0 }];
    assert.equal(g.bgmChooseTrack(), 'boss');
    g.bgmCurrent = 'boss'; g.monsters[0].x = 35;
    assert.equal(g.bgmChooseTrack(), 'boss', '少し離れても、ボス戦の曲は続く（行ったり来たりしない）');
    g.monsters[0].hp = 0;
    assert.equal(g.bgmChooseTrack(), 'field', 'ボスを倒したら、元の曲');
    // updateBgm: 0.5 秒ごとに、曲が変わったときだけ切り替える
    const played = []; g.sound = { playBgm: (n) => played.push(n) }; g.bgmCurrent = null; g.bgmTimer = 0;
    g.updateBgm(0.016); g.updateBgm(0.016); g.updateBgm(0.6); g.updateBgm(0.016);
    assert.deepEqual(played, ['field']);
});

test('BGM の ON / OFF: OFF の間は鳴らさず（曲は覚えておく）、ON に戻すと、いまの曲が鳴る', () => {
    const s = engine();
    assert.equal(s.bgmEnabled, true, '既定は ON');
    s.playBgm('town'); assert.equal(s._bgm.name, 'town');
    s.setBgmEnabled(false); assert.equal(s._bgm, null);
    s.playBgm('boss'); assert.equal(s._bgm, null, 'OFF の間は、曲が変わっても鳴らさない');
    assert.equal(s._bgmWant, 'boss');
    s.setBgmEnabled(true); assert.equal(s._bgm.name, 'boss', 'ON に戻すと、いまの場面の曲');
    s.stopBgm();
});
