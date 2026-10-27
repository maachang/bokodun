import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();

async function loadSoundFX() {
    const src = fs.readFileSync(path.join(projectRoot, 'public/js/audio.js'), 'utf-8')
        .replace("'/js/three.module.js'", JSON.stringify(path.join(projectRoot, 'public/js/three.module.js')));
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'footstep-')), 'audio.mjs');
    fs.writeFileSync(tmp, src);
    return (await import(tmp)).SoundFX;
}

// Web Audio の最小モック（生成されたノードの数だけ数える）
function fakeCtx() {
    const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 });
    const node = () => ({ connect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param() });
    const ctx = { currentTime: 0, sampleRate: 8000, destination: {}, started: 0 };
    ctx.createBuffer = (_c, n) => ({ getChannelData: () => new Float32Array(n) });
    ctx.createBufferSource = () => { const n = node(); const s = n.start; n.start = () => { ctx.started++; return s(); }; return n; };
    ctx.createBiquadFilter = node;
    ctx.createGain = node;
    ctx.createOscillator = () => { const n = node(); n.start = () => { ctx.started++; }; return n; };
    return ctx;
}

test('足音: 床の種類ごとに鳴らせる（未知の種類・未指定は石）', async () => {
    const SoundFX = await loadSoundFX();
    for (const floor of ['stone', 'cave', 'grass', 'sand', 'swamp', 'water', 'unknown', undefined]) {
        const s = new SoundFX();
        s.ctx = fakeCtx();
        s.playFootstep(floor);
        assert.ok(s.ctx.started >= 1, `${floor} で音が出ない`);
    }
});

test('足音: AudioContext 未初期化なら何もしない', async () => {
    const SoundFX = await loadSoundFX();
    assert.doesNotThrow(() => new SoundFX().playFootstep('stone'));
});

test('足音: 全マップの footstep は定義済みの種類、または無し（屋外は無音）', () => {
    const dir = path.join(projectRoot, 'public/data/maps');
    const expected = { dungeon: 'stone', cave: 'cave' };
    for (const f of fs.readdirSync(dir)) {
        const id = f.replace('.json', '');
        const footstep = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')).environment?.footstep;
        assert.equal(footstep, expected[id], `${f}: ${footstep}`);
    }
});
