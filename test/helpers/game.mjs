// テストの補助: ゲーム本体（public/js）の読み込み。game.js を分割しても、テストが同じように動く。
//   gameSource()      … game.js と、分割した部品（public/js/game/*.js）を、つなげたソース文字列（「ソースに○○がある」の確認用）
//   texturesSource()  … textures.js と、分割した部品（public/js/textures/*.js）をつなげたソース
//   audioSource() / entitiesSource() … audio.js・entities.js と、それぞれの分割した部品をつなげたソース
//   copyGameModules() … public/js 以下の全ファイルを、一時フォルダへ写し、ブラウザ向けの絶対パス import（'/js/xxx.js'）を、一時フォルダの絶対パスに読み替える（GameEngine を import して試す用）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const jsDir = path.join(process.cwd(), 'public/js');

function listJs(rel = '') {
    const out = [];
    for (const f of fs.readdirSync(path.join(jsDir, rel))) {
        const r = rel ? `${rel}/${f}` : f;
        if (fs.statSync(path.join(jsDir, r)).isDirectory()) out.push(...listJs(r));
        else if (f.endsWith('.js')) out.push(r);
    }
    return out;
}

export function gameSource() {
    const parts = ['game.js', ...listJs().filter(f => f.startsWith('game/')).sort()];
    return parts.map(f => fs.readFileSync(path.join(jsDir, f), 'utf-8')).join('\n');
}

export function texturesSource() {
    // textures.js と、分割した部品（public/js/textures/*.js）をつなげたソース
    const parts = ['textures.js', ...listJs().filter(f => f.startsWith('textures/')).sort()];
    return parts.map(f => fs.readFileSync(path.join(jsDir, f), 'utf-8')).join('\n');
}

function joinSources(main, dir) {
    const parts = [main, ...listJs().filter(f => f.startsWith(dir + '/')).sort()];
    return parts.map(f => fs.readFileSync(path.join(jsDir, f), 'utf-8')).join('\n');
}
export const audioSource = () => joinSources('audio.js', 'audio');          // audio.js と、public/js/audio/*.js
export const entitiesSource = () => joinSources('entities.js', 'monster');  // entities.js と、public/js/monster/*.js

export function copyGameModules(prefix = 'game-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    for (const f of listJs()) {
        const dst = path.join(dir, f);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, fs.readFileSync(path.join(jsDir, f), 'utf-8').replaceAll("'/js/", `'${dir}/`));
    }
    return dir;
}
