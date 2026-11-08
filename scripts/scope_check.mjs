// 未定義の変数の検査（構文解析 acorn による、簡易のスコープ解析）。ファイルの分割・移動で、使っている変数の宣言を、取りこぼしていないかを確かめる。
// 描画のコード（game.js・game/*.js・textures/*.js など）は、テストでは実行されないため、この検査と、scripts/verify_maps.mjs（ブラウザでの実行）で守る。
// 使い方: bun scripts/scope_check.mjs [ファイル ...]（省略時は public/js 以下の全部）。テスト（test/scope_check.test.mjs）からも使う
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

export const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
// ブラウザ・JS の標準の名前（宣言しなくても使える）
export const GLOBALS = new Set(('Math Number Object Array Set Map WeakMap WeakSet Promise Symbol console document window navigator location performance localStorage sessionStorage JSON Infinity NaN undefined Date String Boolean ' +
    'parseInt parseFloat isNaN isFinite setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame fetch Image URL Blob FileReader Error TypeError RangeError arguments ' +
    'Float32Array Float64Array Uint8Array Uint8ClampedArray Uint16Array Uint32Array Int8Array Int16Array Int32Array ArrayBuffer DataView KeyboardEvent MouseEvent Event CustomEvent Audio AudioContext webkitAudioContext ' +
    'jhtml alert confirm prompt btoa atob TextDecoder TextEncoder structuredClone queueMicrotask globalThis Intl Reflect Proxy Function URLSearchParams encodeURIComponent decodeURIComponent encodeURI decodeURI FormData Headers AbortController').split(' '));

function patNames(p, fn) {
    if (!p) return;
    switch (p.type) {
        case 'Identifier': fn(p.name); break;
        case 'ObjectPattern': p.properties.forEach(q => patNames(q.value ?? q.argument, fn)); break;
        case 'ArrayPattern': p.elements.forEach(q => patNames(q, fn)); break;
        case 'AssignmentPattern': patNames(p.left, fn); break;
        case 'RestElement': patNames(p.argument, fn); break;
    }
}

// ソースの、宣言されていない名前の集合
export function undefinedNames(src) {
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
    const free = new Set(), scopes = [new Set()];
    const declare = (n) => scopes[scopes.length - 1].add(n);
    const isDeclared = (n) => scopes.some(s => s.has(n));
    const hoist = (body) => {
        const walk = (n) => {
            if (!n || typeof n.type !== 'string') return;
            if (n.type === 'VariableDeclaration' && n.kind === 'var') n.declarations.forEach(d => patNames(d.id, declare));
            if (n.type === 'FunctionDeclaration') { declare(n.id.name); return; }
            if (/Function/.test(n.type)) return;
            for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
        };
        walk(body);
    };
    const blockDecls = (stmts) => stmts.forEach(s0 => {
        const s = (s0.type === 'ExportNamedDeclaration' || s0.type === 'ExportDefaultDeclaration') && s0.declaration ? s0.declaration : s0;
        if (s.type === 'VariableDeclaration' && s.kind !== 'var') s.declarations.forEach(d => patNames(d.id, declare));
        if ((s.type === 'ClassDeclaration' || s.type === 'FunctionDeclaration') && s.id) declare(s.id.name);
    });
    const visit = (n) => {
        if (!n || typeof n.type !== 'string') return;
        switch (n.type) {
            case 'ImportDeclaration': return;
            case 'ExportNamedDeclaration': if (n.declaration) visit(n.declaration); else if (!n.source) (n.specifiers || []).forEach(s => { if (!isDeclared(s.local.name)) free.add(s.local.name); }); return;
            case 'Identifier': if (!isDeclared(n.name) && !GLOBALS.has(n.name)) free.add(n.name); return;
            case 'MemberExpression': visit(n.object); if (n.computed) visit(n.property); return;
            case 'Property': if (n.computed) visit(n.key); visit(n.value); return;
            case 'MethodDefinition': case 'PropertyDefinition': if (n.computed) visit(n.key); visit(n.value); return;
            case 'LabeledStatement': visit(n.body); return;
            case 'BreakStatement': case 'ContinueStatement': return;
            case 'FunctionExpression': case 'FunctionDeclaration': case 'ArrowFunctionExpression':
                scopes.push(new Set()); if (n.id && n.type === 'FunctionExpression') declare(n.id.name);
                n.params.forEach(p => patNames(p, declare)); hoist(n.body);
                n.params.forEach(p => { if (p.type === 'AssignmentPattern') visit(p.right); });
                if (n.body.type === 'BlockStatement') { blockDecls(n.body.body); n.body.body.forEach(visit); } else visit(n.body);
                scopes.pop(); return;
            case 'ClassDeclaration': case 'ClassExpression': if (n.superClass) visit(n.superClass); n.body.body.forEach(visit); return;
            case 'BlockStatement': scopes.push(new Set()); blockDecls(n.body); n.body.forEach(visit); scopes.pop(); return;
            case 'ForStatement': case 'ForOfStatement': case 'ForInStatement': {
                scopes.push(new Set());
                const init = n.init ?? n.left; if (init && init.type === 'VariableDeclaration' && init.kind !== 'var') init.declarations.forEach(d => patNames(d.id, declare));
                for (const k of ['init', 'test', 'update', 'left', 'right', 'body']) if (n[k]) visit(n[k]);
                scopes.pop(); return; }
            case 'CatchClause': scopes.push(new Set()); patNames(n.param, declare); visit(n.body); scopes.pop(); return;
            case 'VariableDeclarator': if (n.id.type !== 'Identifier') visit(n.id); if (n.init) visit(n.init); return;
            case 'SwitchStatement': visit(n.discriminant); scopes.push(new Set()); n.cases.forEach(c => blockDecls(c.consequent)); n.cases.forEach(c => { if (c.test) visit(c.test); c.consequent.forEach(visit); }); scopes.pop(); return;
        }
        for (const k of Object.keys(n)) { const v = n[k]; if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
    };
    // モジュール直下: import の名前・直下の宣言（すべて、先に使える）
    for (const n of ast.body) if (n.type === 'ImportDeclaration') n.specifiers.forEach(s => declare(s.local.name));
    hoist({ type: 'Program', body: ast.body });
    blockDecls(ast.body);
    ast.body.forEach(visit);
    return free;
}

export function jsFiles(dir = 'public/js') {
    const out = [];
    for (const f of fs.readdirSync(path.join(root, dir))) {
        const rel = path.join(dir, f);
        if (fs.statSync(path.join(root, rel)).isDirectory()) out.push(...jsFiles(rel));
        else if (f.endsWith('.js') && f !== 'three.module.js') out.push(rel);
    }
    return out.sort();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const files = process.argv.length > 2 ? process.argv.slice(2) : jsFiles();
    let bad = 0;
    for (const f of files) {
        const names = [...undefinedNames(fs.readFileSync(path.join(root, f), 'utf8'))];
        if (names.length) { bad++; console.log(`${f}: ${names.join(', ')}`); }
    }
    console.log(bad ? `NG: ${bad} ファイルに、宣言されていない名前` : `OK: ${files.length} ファイル、宣言されていない名前なし`);
    process.exit(bad ? 1 : 0);
}
