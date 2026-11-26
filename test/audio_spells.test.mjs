// 魔法の効果音（public/js/audio/audioSpellFx.js）のテスト。ブラウザの Web Audio は鳴らせないので、偽の AudioContext で、
// 全部の種類が、例外なく、音の部品（発振器・ノイズ）を作って鳴らし始めることだけを確かめる（音の良し悪しは、耳で確認する）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spellFxSounds } from '../public/js/audio/audioSpellFx.js';

const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));

function fakeCtx() {
    const log = { starts: 0, noises: 0 };
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = (extra = {}) => ({ connect() {}, ...extra });
    return {
        log, currentTime: 1, sampleRate: 8000, destination: {},
        createOscillator: () => node({ frequency: param(), type: '', start() { log.starts++; }, stop() {} }),
        createGain: () => node({ gain: param() }),
        createBiquadFilter: () => node({ frequency: param(), Q: param(), type: '' }),
        createBuffer: (ch, n) => ({ getChannelData: () => new Float32Array(n) }),
        createBufferSource: () => node({ start() { log.starts++; log.noises++; } })
    };
}
const sfx = () => { const s = Object.create(spellFxSounds); s.ctx = fakeCtx(); s.healed = 0; s.playHeal = () => { s.healed++; }; return s; };

test('回復・補助・解錠・罠解除の効果音: 全部の種類が、例外なく鳴る', () => {
    for (const kind of ['heal', 'heal_big', 'refresh', 'refresh_big', 'cure', 'cure_poison', 'recover', 'enchant', 'protect', 'speedy', 'fly', 'unlock', 'trap']) {
        const s = sfx();
        s.playSelfSpell(kind);
        assert.ok(s.ctx.log.starts >= 2, `${kind}: 音の部品が鳴る`);
        assert.equal(s.healed, 0, `${kind}: 従来の「ふわっ」には落ちない`);
    }
});

test('知らない種類は、従来の「ふわっ」。音の機能がない（ctx なし）ときは、何もしない', () => {
    const s = sfx(); s.playSelfSpell('no_such');
    assert.equal(s.healed, 1);
    const n = sfx(); n.ctx = null; n.playSelfSpell('heal'); n.playRumble(1);
    assert.equal(n.healed, 0);
});

test('地鳴り: 揺れの長さの間、鳴る', () => {
    const s = sfx(); s.playRumble(1.8);
    assert.ok(s.ctx.log.starts >= 3 && s.ctx.log.noises === 1);
});

test('items.json の回復・補助の呪文は、効果音の種類（sound）を持ち、実際に鳴らせる', () => {
    const items = D('items.json'), magic = D('magic.json').spells;
    const known = new Set(['heal', 'heal_big', 'refresh', 'refresh_big', 'cure', 'cure_poison', 'recover', 'enchant', 'protect', 'speedy', 'fly', 'unlock', 'trap']);
    const sounds = new Set();
    for (const [id, it] of Object.entries(items)) {
        if (it.kind !== 'spell' || !(it.type === 'heal' || it.type === 'support') || magic[id]?.usable === false) continue;
        assert.ok(known.has(it.sound), `${id}: sound ${it.sound} は、効果音の種類にある`);
        sounds.add(it.sound);
    }
    assert.ok(sounds.size >= 10, '魔法ごとに、音が分かれている');
});
