// 話し声の効果音（public/js/audio/audioTalk.js）と、街の人が話し始めたときの連動（interact.js）のテスト。
// 音の良し悪しは、耳で確認する。ここでは、文字ごとに鳴ること・句読点の間・同じ音が続かないこと・止まること・人ごとに声が違うことを確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { talkSounds } from '../public/js/audio/audioTalk.js';
import path from 'node:path';
import { copyGameModules } from './helpers/game.mjs';

function fakeCtx() {
    const log = { osc: [], stopped: 0 };
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = (x = {}) => ({ connect() {}, ...x });
    return { log, currentTime: 1, destination: {},
        createOscillator: () => { const o = node({ type: '', freq: 0, frequency: { setValueAtTime(f, t) { o.freq = f; o.t = t; } }, start() {}, stop(at) { if (at === undefined) log.stopped++; } }); log.osc.push(o); return o; },
        createGain: () => node({ gain: param() }) };
}
const engine = () => { const s = Object.create(talkSounds); s.ctx = fakeCtx(); return s; };

test('話し声: 文字ごとに 1 つ鳴る（空白・句読点・かぎ括弧は数えない）。同じ音が続かない', () => {
    const s = engine(); s.playTalk('よく来た、旅の人。 ここは「静か」じゃ！', '村長');
    const chars = [...'よく来た旅の人ここは静かじゃ'].length;
    assert.equal(s.ctx.log.osc.length, chars);
    for (let i = 1; i < s.ctx.log.osc.length; i++) assert.notEqual(s.ctx.log.osc[i].freq, s.ctx.log.osc[i - 1].freq, `${i} 番目は、前と違う高さ`);
    for (const o of s.ctx.log.osc) assert.equal(o.type, 'square');
});

test('話し声: 句読点の所で、間が空く（時刻が離れる）', () => {
    const s = engine(); s.playTalk('ああ、いい', 'x');
    const t = s.ctx.log.osc.map((o) => o.t);
    assert.ok(t[2] - t[1] > t[1] - t[0] + 0.1, '「、」のあとは、間が空く');
});

test('話し声: 長いセリフは、途中で切る。止めると、残りの音が止まる。前の話し声は、新しい話し声で止まる', () => {
    const s = engine(); s.playTalk('あ'.repeat(500), 'x');
    assert.ok(s.ctx.log.osc.length < 80, '無限に鳴らさない');
    const n = s.ctx.log.osc.length;
    s.stopTalk(); assert.equal(s.ctx.log.stopped, n); assert.equal(s._talk, null);
    s.playTalk('いう', 'x'); const m = s.ctx.log.stopped; s.playTalk('えお', 'y'); assert.equal(s.ctx.log.stopped, m + 2, '新しい話し声の前に、前の話し声を止める');
});

test('話し声: 人ごとに基準の声が違い、同じ人は、いつも同じ。音が使えない（ctx なし）・空のセリフでは、何もしない', () => {
    const s = engine();
    assert.equal(s.talkBaseFreq('村長'), s.talkBaseFreq('村長'));
    const set = new Set(['村長', '商人', '兵士', '少女', '旅人', '神官', '鍛冶屋', '老人'].map((n) => s.talkBaseFreq(n)));
    assert.ok(set.size >= 3, '声は、何種類かに分かれる');
    const t = Object.create(talkSounds); t.ctx = null; t.playTalk('こんにちは', 'x'); t.stopTalk();
    const u = engine(); u.playTalk('', 'x'); assert.equal(u.ctx.log.osc.length, 0);
});

test('街の人が話し始めたとき、1 度だけ鳴らす。同じセリフの間は鳴らし直さない。離れたら止める。別の人に近づけば、その人の声', async () => {
    const { interactMethods } = await import(path.join(copyGameModules('talk-'), 'game/interact.js'));
    const calls = [];
    const mk = (name, line, near) => ({ name, currentLine: line, shopId: null, speechFor() { return near.v ? `${name}「${line}」` : null; } });
    const near = { v: true }, a = mk('村長', 'こんにちは', near);
    const g = Object.assign(Object.create(interactMethods), { npcs: [a], player: {}, sound: { playTalk: (t, w) => calls.push(['play', t, w]), stopTalk: () => calls.push(['stop']) } });
    g.nearbyNpcSpeech(); g.nearbyNpcSpeech(); g.nearbyNpcSpeech();
    assert.deepEqual(calls, [['play', 'こんにちは', '村長']], '近づいた最初の 1 回だけ');
    near.v = false; g.nearbyNpcSpeech(); g.nearbyNpcSpeech();
    assert.deepEqual(calls.at(-1), ['stop']); assert.equal(calls.filter((c) => c[0] === 'stop').length, 1, '止めるのも 1 回');
    near.v = true; a.currentLine = 'さようなら'; g.nearbyNpcSpeech();
    assert.deepEqual(calls.at(-1), ['play', 'さようなら', '村長'], 'セリフが変われば、また鳴る');
    g.sound = undefined; assert.doesNotThrow(() => g.nearbyNpcSpeech());
});
