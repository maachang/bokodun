// コードの健康診断と管理。長いファイル・長い関数ほど、人にも AI にも、編集の誤り（位置違い・見落とし・前後の文脈の取りこぼし）が増える。
// 管理の形（docs/code-health.md）:
//   1. 目標値（TARGET）: ファイル 800 行・60KB、関数 100 行。新しく書くコード・新しいファイルは、必ず目標を守る（テストが止める）。
//   2. 負債台帳（scripts/codeHealth.debt.json）: 目標を超えている既存のファイル・関数を、計画（plan）つきで登録する。台帳の値は、増やせない。
//   3. 解消: 目標を満たしたら、台帳から外す（外し忘れも、テストが指摘する）。台帳に残る間は、触るたびに、触った分だけ小さくする。
//   4. 定期の見直し: `bun scripts/code_health.mjs`（報告）。負債の合計・優先順位を見て、次に分割するものを決める。
// 使い方: bun scripts/code_health.mjs            … 報告（目標との差・負債の一覧・優先順位）
//         bun scripts/code_health.mjs --init     … 台帳が無いとき、今の超過を登録（plan は要記入）
//         bun scripts/code_health.mjs --tighten  … 台帳の値を、今の値まで下げ、目標を満たしたものを外す
import fs from 'node:fs';
import path from 'node:path';

export const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
export const TARGET = { fileLines: 800, fileBytes: 60000, funcLines: 100 };
export const LEDGER_FILE = path.join(root, 'scripts/codeHealth.debt.json');
const SKIP = new Set(['three.module.js']);

export function targets() {
    const out = [];
    const walk = (dir, exts) => {
        const full = path.join(root, dir);
        if (!fs.existsSync(full)) return;
        for (const f of fs.readdirSync(full)) {
            if (SKIP.has(f)) continue;
            const p = path.join(full, f);
            if (fs.statSync(p).isDirectory()) { walk(path.join(dir, f), exts); continue; }
            if (exts.some(e => f.endsWith(e))) out.push(path.join(dir, f));
        }
    };
    walk('public/js', ['.js']); walk('scripts', ['.mjs', '.py']); walk('public/api', ['.js']); walk('lib', ['.js']);
    return out.sort();
}

// 関数・メソッドの長さ（行）。JS: 4 字下げのクラスメソッド・行頭の function・タイル描画の `    name(t) {` / `    async name(t) {`。Python: def。次の定義の手前までを、その長さとする（目安）
export function measure(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const lines = text.split('\n');
    const re = file.endsWith('.py') ? /^(?:async )?def ([A-Za-z_]\w*)\(/ : /^(?: {4}(?:async |static )?([A-Za-z_$][\w$]*)\([^)]*\) \{$|(?:export )?(?:async )?function ([A-Za-z_$][\w$]*)\()/;
    const heads = [];
    lines.forEach((l, i) => {
        const m = re.exec(l);
        const name = m && (m[1] ?? m[2]);
        if (name && !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(name)) heads.push([i, name]);
    });
    // JS は、波かっこの対応で、関数の終わりを求める（最後の関数に、後ろの `};` などが入らない）。Python は、次の定義の手前まで
    const jsEnd = (i) => {
        let depth = 0, started = false;
        for (let j = i; j < lines.length; j++) {
            const t = lines[j].replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\/\/.*/g, '');
            for (const ch of t) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
            if (started && depth <= 0) return j + 1;
        }
        return lines.length;
    };
    const seen = Object.create(null);   // （{} だと、constructor という名前が、標準の constructor と衝突する）
    const funcs = heads.map(([i, name], k) => {
        const end = file.endsWith('.py') ? (k + 1 < heads.length ? heads[k + 1][0] : lines.length) : jsEnd(i);
        seen[name] = (seen[name] ?? 0) + 1;
        return { name: seen[name] > 1 ? `${name}#${seen[name]}` : name, lines: end - i };
    });
    return { file, lines: lines.length, bytes: Buffer.byteLength(text), funcs };
}

export function readLedger() {
    return fs.existsSync(LEDGER_FILE) ? JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) : { files: {}, funcs: {} };
}

// 今の状態: 目標を超えているファイル・関数
export function violations() {
    const files = {}, funcs = {};
    for (const f of targets()) {
        const m = measure(f);
        if (m.lines > TARGET.fileLines || m.bytes > TARGET.fileBytes) files[f] = { lines: m.lines, bytes: m.bytes };
        for (const fn of m.funcs) if (fn.lines > TARGET.funcLines) funcs[`${f}::${fn.name}`] = { lines: fn.lines };
    }
    return { files, funcs };
}

export const TODO_PLAN = '要計画';

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const v = violations();
    let ledger = readLedger();
    if (process.argv.includes('--init')) {
        ledger = { files: {}, funcs: {} };
        for (const [k, x] of Object.entries(v.files)) ledger.files[k] = { ...x, plan: TODO_PLAN };
        for (const [k, x] of Object.entries(v.funcs)) ledger.funcs[k] = { ...x, plan: TODO_PLAN };
    }
    if (process.argv.includes('--tighten')) {
        // 関数が別のファイルへ移った（台帳の `旧::名前` が消え、同じ名前の違反が、別のファイルに現れた）ときは、台帳の項目（計画つき）を、新しい場所へ付け替える
        const base = (k) => k.split('::').pop();
        const staleFuncs = Object.keys(ledger.funcs).filter(k => !v.funcs[k]);
        const newFuncs = Object.keys(v.funcs).filter(k => !ledger.funcs[k]);
        for (const nk of newFuncs) {
            const cands = staleFuncs.filter(k => base(k) === base(nk));
            if (cands.length === 1 && newFuncs.filter(k => base(k) === base(nk)).length === 1) { ledger.funcs[nk] = { ...ledger.funcs[cands[0]] }; delete ledger.funcs[cands[0]]; console.log(`台帳を付け替え: ${cands[0]} → ${nk}`); }
        }
        for (const k of Object.keys(ledger.files)) { if (!v.files[k]) delete ledger.files[k]; else ledger.files[k] = { ...ledger.files[k], lines: Math.min(ledger.files[k].lines, v.files[k].lines), bytes: Math.min(ledger.files[k].bytes, v.files[k].bytes) }; }
        for (const k of Object.keys(ledger.funcs)) { if (!v.funcs[k]) delete ledger.funcs[k]; else ledger.funcs[k] = { ...ledger.funcs[k], lines: Math.min(ledger.funcs[k].lines, v.funcs[k].lines) }; }
    }
    if (process.argv.includes('--init') || process.argv.includes('--tighten')) fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2) + '\n');
    console.log(`目標: ファイル ${TARGET.fileLines} 行・${TARGET.fileBytes / 1000}KB 以下 / 関数 ${TARGET.funcLines} 行以下`);
    const fileRows = Object.entries(v.files).map(([k, x]) => ({ k, over: Math.max(x.lines - TARGET.fileLines, 0), ...x })).sort((a, b) => b.over - a.over);
    console.log(`\n■ 目標を超えているファイル（${fileRows.length}）  超過行の合計: ${fileRows.reduce((s, r) => s + r.over, 0)}`);
    for (const r of fileRows) console.log(`  ${String(r.lines).padStart(5)} 行 ${String(Math.round(r.bytes / 1000)).padStart(4)}KB  超過 ${String(r.over).padStart(5)}  ${r.k}${ledger.files[r.k] ? '' : '  ← 台帳にない'}`);
    const fnRows = Object.entries(v.funcs).map(([k, x]) => ({ k, over: x.lines - TARGET.funcLines, ...x })).sort((a, b) => b.over - a.over);
    console.log(`\n■ 目標を超えている関数（${fnRows.length}）  超過行の合計: ${fnRows.reduce((s, r) => s + r.over, 0)}`);
    for (const r of fnRows.slice(0, 15)) console.log(`  ${String(r.lines).padStart(5)} 行  超過 ${String(r.over).padStart(4)}  ${r.k}${ledger.funcs[r.k] ? '' : '  ← 台帳にない'}`);
    if (fnRows.length > 15) console.log(`  …ほか ${fnRows.length - 15} 件`);
    // 注意リスト: 目標の 80% 以上（まだ超えていないが、近い）。大きくなる前に、分けるものを見つける（超えると、テストが失敗する）
    const WARN = 0.8, warnFiles = [], warnFuncs = [];
    for (const f of targets()) {
        const m = measure(f);
        if (!v.files[f] && (m.lines > TARGET.fileLines * WARN || m.bytes > TARGET.fileBytes * WARN)) warnFiles.push({ k: f, lines: m.lines, bytes: m.bytes });
        for (const fn of m.funcs) if (!v.funcs[`${f}::${fn.name}`] && fn.lines > TARGET.funcLines * WARN) warnFuncs.push({ k: `${f}::${fn.name}`, lines: fn.lines });
    }
    warnFiles.sort((a, b) => b.lines - a.lines); warnFuncs.sort((a, b) => b.lines - a.lines);
    console.log(`\n■ 注意（目標の ${WARN * 100}% 以上。ファイル ${warnFiles.length}・関数 ${warnFuncs.length}）`);
    for (const r of warnFiles.slice(0, 8)) console.log(`  ファイル ${String(r.lines).padStart(5)} 行 ${String(Math.round(r.bytes / 1000)).padStart(4)}KB  ${r.k}`);
    for (const r of warnFuncs.slice(0, 12)) console.log(`  関数     ${String(r.lines).padStart(5)} 行            ${r.k}`);
    const noPlan = [...Object.entries(ledger.files), ...Object.entries(ledger.funcs)].filter(([, x]) => !x.plan || x.plan === TODO_PLAN).map(([k]) => k);
    if (noPlan.length) console.log(`\n■ 計画（plan）が未記入の負債: ${noPlan.length} 件`);
    const stale = [...Object.keys(ledger.files).filter(k => !v.files[k]), ...Object.keys(ledger.funcs).filter(k => !v.funcs[k])];
    if (stale.length) console.log(`\n■ 解消済みなのに台帳に残っている: ${stale.join(', ')}  （--tighten で外す）`);
}
