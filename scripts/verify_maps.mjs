// 全種類のタイル（objects.json の type）を含むマップを、1 種類ずつ選び、ブラウザ（headless Chrome）で順に読み込んで、例外・console.error が出ないことを確かめる。
// game.js などの描画コードを分割・整理したときの確認に使う（テストでは、描画の実行は確かめられないため）。
// 各マップで、立っているだけでなく、前へ歩く（120 フレーム）・左へ回る（30 フレーム）の更新も実行して、毎フレームの処理（移動・罠・弾など）の例外を拾う（歩いて、門などから別のマップへ移るのは、正常。読み込んだ直後に、そのマップであることを確かめる）。
// 使い方: maachang -p 3012 を起動しておき、`PROF=$(mktemp -d) bun scripts/verify_maps.mjs [ポート 3012]`。追加で見たいマップは、引数の後ろに ID を並べる
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const server = Number(process.argv[2] ?? 3012), extra = process.argv.slice(3);
const objects = JSON.parse(fs.readFileSync(path.join(root, 'public/data/objects.json'), 'utf8'));
const dir = path.join(root, 'public/data/maps');
const maps = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort((a, b) => (a.startsWith('w_') - b.startsWith('w_')) || a.localeCompare(b));
const pick = {};
for (const f of maps) {
    const legend = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).legend ?? {};
    for (const v of Object.values(legend)) { const t = objects[v]?.type; if (t && !pick[t]) pick[t] = f.replace('.json', ''); }
}
const ids = [...new Set([...Object.values(pick), ...extra])];
console.log(`種類 ${Object.keys(pick).length} → マップ ${ids.length} 枚:`, ids.join(' '));

const port = 9334;
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=900,600', `--user-data-dir=${process.env.PROF}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://localhost:${server}/` });
await sleep(5000);
const expr = `(async()=>{ const errs=[]; window.addEventListener('error',e=>errs.push('error: '+e.message)); window.addEventListener('unhandledrejection',e=>errs.push('reject: '+(e.reason&&e.reason.stack||e.reason))); console.error=(...a)=>{errs.push('console.error: '+a.map(String).join(' ').slice(0,200)); }; const bad=[], bad0=[]; for (const id of ${JSON.stringify(ids)}) { const before=errs.length; try { await window.game.loadMap(id); await new Promise(r=>setTimeout(r,700)); const g=window.game; if (g.currentMapId!==id) bad0.push(id); g.keys.forward=true; for (let i=0;i<120;i++) g.update(1/60); g.keys.forward=false; g.keys.turnLeft=true; for (let i=0;i<30;i++) g.update(1/60); g.keys.turnLeft=false; for (let w=0; w<100 && g.nav.busy; w++) await new Promise(r=>setTimeout(r,100)); await new Promise(r=>setTimeout(r,300)); if (!(Number.isFinite(g.player.x)&&Number.isFinite(g.player.z))) errs.push('NaN: '+id); } catch(e) { errs.push('throw: '+e.stack); } if (bad0.includes(id) || errs.length>before) bad.push(id); } return JSON.stringify({checked: ${ids.length}, bad, errs: errs.slice(0,15)}); })()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 280000 });
const res = JSON.parse(r.result?.result?.value ?? '{"bad":["(評価に失敗)"],"errs":[]}');
console.log(res.bad.length ? `NG: ${res.bad.join(', ')}\n${res.errs.join('\n')}` : `OK: ${res.checked} 枚、エラーなし`);
ws.close(); chrome.kill();
process.exit(res.bad.length ? 1 : 0);
