import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyGameModules } from './helpers/game.mjs';

const projectRoot = process.cwd();

async function loadSoundFX() {
    const dir = copyGameModules('footstep-');   // public/js 全体の一時コピー（import は一時コピーの絶対パスに読み替え済み）
    return (await import(path.join(dir, 'audio.js'))).SoundFX;
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
    const expected = { dungeon: 'stone', cave: 'cave', cave_terrace: 'cave', castle: 'stone', castle_f: 'stone', castle_a: 'stone', castle_b: 'stone', castle_g: 'stone', castle_j: 'stone', temple_b: 'stone', shop: 'stone', shop_a: 'stone', temple: 'stone', temple_2f: 'stone', temple_3f: 'stone', temple_town: 'stone', temple_village: 'stone', temple_kitchen: 'stone', temple_confession: 'stone', temple_sacristy: 'stone', castle_2f: 'stone', castle_3f: 'stone', castle_basement: 'stone', temple_village_bedroom: 'stone', temple_village_kitchen: 'stone', temple_town_dining: 'stone', temple_town_2f: 'stone', temple_refectory: 'stone', temple_chapter_house: 'stone', temple_library: 'stone', temple_treasury: 'stone', temple_infirmary: 'stone', temple_guesthouse: 'stone', temple_almonry: 'stone', temple_crypt: 'stone', castle_chapel: 'stone', castle_bakehouse: 'stone', castle_guardroom: 'stone', castle_smithy: 'stone', castle_4f: 'stone', castle_prison: 'stone', castle_guest_wing: 'stone', pyramid: 'stone' };
    for (const f of fs.readdirSync(dir)) {
        const id = f.replace('.json', '');
        const footstep = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')).environment?.footstep;
        assert.equal(footstep, expected[id], `${f}: ${footstep}`);
    }
});
