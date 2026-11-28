// 環境音（public/js/audio/audioAmbience.js・public/js/game/ambience.js・public/data/ambience.json）のテスト。
// 音の良し悪しは、耳で確認する。ここでは、データが正しいこと・全マップに環境音が付くこと・全種類が例外なく鳴ること・ON/OFF と音量を確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ambienceSounds } from '../public/js/audio/audioAmbience.js';
import { copyGameModules } from './helpers/game.mjs';

const read = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), f), 'utf-8'));
const amb = read('public/data/ambience.json');
const KINDS = ['chirp', 'rustle', 'gull', 'drip', 'bell', 'crackle', 'clink', 'hammer', 'murmur', 'creak'];

test('環境音のデータ: 音の種類・間隔・大きさが正しく、規則の行き先がある', () => {
    for (const [name, t] of Object.entries(amb.tracks)) {
        assert.ok(t.name, `${name}: 名前`);
        for (const b of t.beds ?? []) {
            assert.ok(['lowpass', 'highpass', 'bandpass'].includes(b.filter), `${name}: フィルタ`);
            assert.ok(b.freq > 20 && b.freq < 12000 && b.gain > 0 && b.gain <= 0.15, `${name}: bed の高さ・大きさ`);
            if (b.lfo) assert.ok(b.lfo.rate > 0 && b.lfo.rate < 3 && (b.lfo.depth ?? 0) <= 1, `${name}: lfo`);
        }
        for (const e of t.events ?? []) {
            assert.ok(KINDS.includes(e.kind), `${name}: 音の種類 ${e.kind}`);
            assert.ok(e.every[0] > 0 && e.every[0] <= e.every[1], `${name}: 間隔`);
            assert.ok(e.gain > 0 && e.gain <= 0.1, `${name}: 大きさ`);
        }
    }
    for (const r of amb.rules) assert.ok(amb.tracks[r.track], `規則の行き先 ${r.track}`);
    assert.ok(amb.tracks[amb.default.open] && amb.tracks[amb.default.indoor]);
});

test('全マップに、環境音が付く（行き先は、必ずデータにある）。場面の例が合っている', async () => {
    const { ambienceMethods } = await import(path.join(copyGameModules('amb-'), 'game/ambience.js'));
    const g = Object.assign(Object.create(ambienceMethods), { ambDef: amb });
    const dir = path.join(process.cwd(), 'public/data/maps'), by = {};
    for (const f of fs.readdirSync(dir)) {
        const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        const tr = g.ambienceForMap(m.id, m.type, m.name);
        assert.ok(amb.tracks[tr], `${m.id}: 環境音 ${tr}`);
        (by[tr] ??= []).push(m.id);
    }
    const cases = [['rs_01', 'open', 'アルマダ村', 'town'], ['rs_15', 'open', 'トレヴ港町', 'port'], ['town_a', 'open', '', 'town'], ['guild_smith', 'indoor', '', 'smithy'], ['guild_adv', 'indoor', '', 'tavern'], ['city_inn', 'indoor', '', 'tavern'], ['shop', 'open', '', 'shop'],
        ['temple', 'indoor', '', 'temple'], ['temple_crypt', 'indoor', '', 'cave'], ['castle', 'open', '', 'castle'], ['castle_prison', 'indoor', '', 'cave'], ['castle_courtyard', 'open', '', 'field'], ['cave', 'indoor', '', 'cave'], ['mansion_2f', 'indoor', '', 'castle'], ['tenshu_k_2f', 'indoor', '', 'castle'], ['shrine_k', 'indoor', '', 'temple'],
        ['w_06_10', 'open', '砂地 (7-11)', 'desert'], ['w_02_08', 'open', '北の雪山 (3-9)', 'snow'], ['w_05_05', 'open', '大森林 (6-6)', 'forest'], ['w_01_08', 'open', '海岸 (2-9)', 'coast'], ['w_09_16', 'open', '岩山 (10-17)', 'mountain'], ['w_12_03', 'open', '草原 (13-4)', 'coast'], ['w_04_05', 'open', '草原 (5-6)', 'field'], ['nowhere', 'indoor', '', 'room']];
    for (const [id, type, name, want] of cases) assert.equal(g.ambienceForMap(id, type, name), want, `${id}: ${want}`);
    assert.equal(Object.keys(by).length >= 12, true);
});

function fakeCtx() {
    const log = { osc: 0, noise: 0, started: 0 };
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
    const node = (x = {}) => ({ connect() {}, disconnect() {}, ...x });
    return { log, currentTime: 0, sampleRate: 8000, destination: {},
        createOscillator: () => node({ frequency: param(), type: '', start() { log.osc++; }, stop() {} }),
        createGain: () => node({ gain: param() }),
        createBiquadFilter: () => node({ frequency: param(), Q: param(), type: '' }),
        createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
        createBufferSource: () => node({ buffer: null, loop: false, start() { log.noise++; }, stop() {} }) };
}
const engine = () => { const s = Object.create(ambienceSounds); s.ctx = fakeCtx(); s.setAmbienceTracks(amb); return s; };

test('全種類の環境音が、例外なく鳴る（流れる音が始まり、ときどき鳴る音が、時間が進むと鳴る）。切り替えは、古い音を止める', () => {
    const s = engine();
    for (const name of Object.keys(amb.tracks)) {
        s.playAmbience(name);
        const st = s._amb; assert.equal(st.name, name);
        const before = s.ctx.log.osc + s.ctx.log.noise;
        for (let i = 0; i < 400; i++) { s.ctx.currentTime += 0.25; s._ambTick(st); }   // 100 秒ぶん
        const t = amb.tracks[name];
        if (t.events.length) assert.ok(s.ctx.log.noise + s.ctx.log.osc > before + 3, `${name}: 時間が進むと、ときどき鳴る音が鳴る`);
    }
    const prev = s._amb; s.playAmbience('field'); assert.notEqual(s._amb, prev);
    const same = s._amb; s.playAmbience('field'); assert.equal(s._amb, same, '同じなら、作り直さない');
    s.stopAmbience(); assert.equal(s._amb, null);
});

test('音が使えるようになる前は、覚えておく（ctx なし）。データにない環境音は、鳴らさない。音量は 0〜1。ON / OFF', () => {
    const s = engine(); s.ctx = null; s.playAmbience('town'); assert.equal(s._ambWant, 'town'); assert.equal(s._amb, undefined);
    const t = engine(); t.playAmbience('no_such'); assert.equal(t._amb, undefined);
    const u = engine(); u.playAmbience('coast');
    u.setAmbVolume(3); assert.equal(u.ambVolume, 1); u.setAmbVolume(-1); assert.equal(u.ambVolume, 0);
    assert.equal(u.ambEnabled, true, '既定は ON');
    u.setAmbEnabled(false); assert.equal(u._amb, null); u.playAmbience('cave'); assert.equal(u._amb, null, 'OFF の間は鳴らさない');
    assert.equal(u._ambWant, 'cave'); u.setAmbEnabled(true); assert.equal(u._amb.name, 'cave', 'ON に戻すと、いまの場面の音が鳴る');
});

test('ときどき鳴る音: 間隔のあいだは鳴らさず、間隔が来ると鳴る', () => {
    const s = engine(); s.playAmbience('tavern');
    const st = s._amb, before = s.ctx.log.osc + s.ctx.log.noise;
    for (const ev of st.events) ev.next = 1000;   // しばらく先
    s._ambTick(st); assert.equal(s.ctx.log.osc + s.ctx.log.noise, before, 'まだ鳴らない');
    for (const ev of st.events) ev.next = 0;      // 今
    s._ambTick(st); assert.ok(s.ctx.log.osc + s.ctx.log.noise > before, '鳴る');
});
