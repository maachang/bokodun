/**
 * 通常プレイ画面の操作部分（メニュー・ダイアログ・一時停止・画面の拡大縮小）
 *
 * 画面の見た目の元は public/mock/play_layout.html（ユーザーと決めたレイアウト）。
 * 決まっていないもの（ストック・装備・道具・設定の中身、受注イベント、ボスの帯、会話、死亡の墓）は、モックと同じ「見た目だけ」の表示。
 * ゲームの値を使っているのは、HP・MP・スタミナ・GOLD・経験値・レベル・現在位置・敵の情報・ミニマップ（hud.js が書く）。
 *
 * ダイアログ・会話・死亡の画面を開いている間は、game.uiPaused を立てて、ゲームの進行と操作を止める（game.js の update と controls.js）。
 */
const { $, refs, on, html, show, hide } = jhtml;

import { MENU, keymap, EVENT, EQUIPS, ITEMS, MSG_SIZES, prefs } from '/js/playUiData.js';

// 本体は、ここから先
// 状態と、部品どうしの受け渡し（S）を作って、部品ごとの初期化を呼ぶ
export function initPlayUi(game) {
    const S = {
        game,
        paused: false,          // ダイアログ・会話・死亡の画面が出ている間は true（ゲームを止める）
        winBackTo: null,        // 「← 戻る」の戻り先
        keyCapture: null,       // ショートカットの割り当て中の、メニューの項目
        E: refs('talk', 'death', 'deathMsg', 'selInfo', 'pauseBadge', 'miniTitle', 'slots', 'menu', 'win', 'winBody', 'winBack', 'winClose', 'bottomStack', 'bossBar', 'panel-location', 'panel-event', 'panelStore', 'region-debug')
    };
    initStock(S);
    initWindow(S);
    initBodies(S);
    initTalk(S);
    initKeys(S);
    initTimeAndFit(S);
    game.ui = { setPaused: S.setPaused };   // 店のメニュー（interact.js）が、開閉のときに呼ぶ
    S.renderSlots(); S.renderMenu(); S.showTime(); S.fit();
    // 動きの確認は、ブラウザのコンソールから（例: mock.die()、mock.bossHit()、mock.talk('村人', '…')、mock.guild()）
    window.mock = { die: S.die, guild: S.guild, talk: S.talk, openDebug: S.openDebug, bossHit: S.bossHit, bossEnd: S.bossEnd };
}

// ストックの種類の表示名・詳細（ゲームのアイテム定義から作る）
function kindLabel(game, it) {
    if (it.kind === 'spell') return '魔法';
    const a = game.weaponClasses?.[it.weaponClass]?.attack;
    return { melee: '近接', cast: '杖', shoot: '弓' }[a] ?? '武器';
}
function itemDetail(game, it) {
    if (it.kind === 'spell') return `MP ${it.mp}`;
    return game.weaponClasses?.[it.weaponClass]?.name ?? '';
}

// ストック（右の列の 9 枠。ゲームの player.stock を映す）とメニュー
function initStock(S) {
    const { E, game } = S;
    let lastSig = '';
    S.renderSlots = () => {
        const p = game.player, items = game.items;
        if (!p || !items) return;
        const sig = JSON.stringify([p.stock, p.selMelee, p.selFocus, p.selMagic, Math.floor(p.mp)]);
        if (sig === lastSig) return;   // 変わっていないときは、描き直さない
        lastSig = sig;
        E.slots.innerHTML = p.stock.map((id, i) => {
            const it = id && items[id];
            if (!it) return html`<div class="slot empty"><span class="no">${i + 1}</span>空き</div>`;
            const lack = it.kind === 'spell' && p.mp < it.mp;   // MP が足りない魔法
            const cls = [i === p.selMelee ? 'selW' : '', i === p.selFocus ? 'selF' : '', i === p.selMagic ? 'selM' : '', lack ? 'lack' : ''].join(' ');
            return html`<div class="slot ${cls}" data-i="${i}"><span class="no">${i + 1}</span><span class="tag">${kindLabel(game, it)}</span>${it.name}</div>`;
        }).join('');
        const nm = i => { const it = i !== null && i !== undefined && p.stock[i] && items[p.stock[i]]; return it ? it.name : 'なし'; };
        E.selInfo.innerHTML = html`<div class="sel" data-sel="${p.selMelee}">武器　${p.selMelee === null ? '素手' : nm(p.selMelee)}</div><div class="sel" data-sel="${p.selFocus}">杖　　${nm(p.selFocus)}</div><div class="sel" data-sel="${p.selMagic}">魔法　${nm(p.selMagic)}</div>`;
    };
    game.onStockChange = () => { lastSig = ''; S.renderSlots(); };
    setInterval(S.renderSlots, 200);   // MP の増減で、足りない魔法の薄い表示が変わる
    on(E.selInfo, 'click', '.sel', (e, t) => {
        const i = t.dataset.sel === 'null' ? -1 : Number(t.dataset.sel);
        const it = i >= 0 && game.items[game.player.stock[i]];
        if (it) { S.setBody(html`<h3>${it.name}</h3><p>${kindLabel(game, it)}</p><p>${itemDetail(game, it)}</p>`); S.openWindow(null); S.setBack(() => S.openWin('stock')); }
    });
    on(E.slots, 'click', '.slot[data-i]', (e, t) => game.selectSlot(Number(t.dataset.i)));
    S.renderMenu = () => { E.menu.innerHTML = MENU.map(([id, name]) => html`<div class="mi" data-id="${id}"><span>${name}</span><kbd>${keymap[id].toUpperCase()}</kbd></div>`).join(''); };
    on(E.menu, 'click', '.mi', (e, t) => S.openWin(t.dataset.id));
}

// ダイアログの開閉・一時停止・「← 戻る」・現在位置（開発用）と受注イベント
function initWindow(S) {
    const { E, game } = S;
    S.markMenu = (id) => document.querySelectorAll('.mi').forEach(el => el.classList.toggle('on', el.dataset.id === id));
    S.setPaused = () => {
        S.paused = E.win.style.display === 'block' || E.talk.style.display === 'flex' || E.death.style.display === 'flex';
        E.pauseBadge.style.display = S.paused ? 'block' : 'none';
        game.uiPaused = S.paused;
    };
    // デバッグ用のパネル（region-debug）は、ダイアログの中身を作り直すとき、壊れないよう、先にパネル置き場へ戻す
    const stashDebug = () => { if (E['region-debug'].parentNode !== E.panelStore) E.panelStore.appendChild(E['region-debug']); };
    S.setBody = (h) => { stashDebug(); E.winBody.innerHTML = h; };
    S.openWindow = (menuId) => { show(E.win); S.markMenu(menuId); S.setPaused(); };
    S.setBack = (fn) => { S.winBackTo = fn; E.winBack.style.display = fn ? 'inline-block' : 'none'; };
    on(E.winBack, 'click', () => { if (S.winBackTo) S.winBackTo(); });
    S.closeWin = () => { S.setBack(null); stashDebug(); hide(E.win); S.markMenu(null); S.setPaused(); };
    on(E.winClose, 'click', S.closeWin);
    // ダイアログの枠の外をクリックしたら、閉じる（開く操作そのもの＝メニュー・現在位置・イベント・選択中の武器/魔法は除く）。
    // 中身を作り直す操作で、クリックされた要素が消えても誤って閉じないよう、中身の処理より先（キャプチャ段階）で判定する
    document.addEventListener('click', (e) => {
        if (E.win.style.display !== 'block' || S.keyCapture) return;
        if (e.target.closest('#win, #workshopModal, .mi, #panel-location, #panel-event, #selInfo')) return;
        S.closeWin();
    }, true);
    S.openWin = (id) => {
        S.setBack(null);
        const m = MENU.find(x => x[0] === id); if (!m) return;
        S.setBody('<h3>' + m[1] + '</h3>' + S.bodies[id]());
        S.openWindow(id);
    };
    // 現在位置をクリックすると、開発用の機能（マップ切り替え・AI工房・魔法/武器・エフェクトテスト・操作の説明）のダイアログ
    S.openDebug = () => {
        S.setBack(null);
        S.setBody('<h3>開発用（マップ切り替え・魔法/武器・エフェクトテストなど）</h3>');
        E.winBody.appendChild(E['region-debug']);
        S.openWindow(null);
    };
    on(E['panel-location'], 'click', S.openDebug);
    // 受注イベントの詳細（見た目だけ）
    on(E['panel-event'], 'click', () => {
        S.setBack(null);
        S.setBody(html`<h3>受注イベント：${EVENT.name}</h3>
            <div class="cols" style="--c:7em 1fr"><span class="title">受けた日時</span><span>${EVENT.at}</span></div>
            <div class="cols" style="--c:7em 1fr"><span class="title">受けた場所</span><span>${EVENT.place}</span></div>
            <div class="cols" style="--c:7em 1fr"><span class="title">進み具合</span><span>${EVENT.progress}</span></div>
            <div class="title" style="margin-top:8px">詳細内容</div><p>${EVENT.detail}</p>`);
        S.openWindow(null);
    });
}

// 各ダイアログの中身（見た目だけ）。ストック・設定・ステータス・装備・道具
function initBodies(S) {
    const { E, game } = S;
    const slotItem = (i) => { const id = game.player.stock[i]; return id ? game.items[id] : null; };
    const stockBody = () => '<p class="legend">最大 9 枠。✕ で外し、「＋追加」で武器・魔法を選んで入れます。</p><div class="grid3">' + game.player.stock.map((id, i) => id
        ? html`<div class="cell filled" data-detail="${i}"><button class="x" data-rm="${i}">✕</button><b>${i + 1}</b> ${game.items[id].name}<br><small>${kindLabel(game, game.items[id])}　${itemDetail(game, game.items[id])}</small></div>`
        : html`<div class="cell add" data-add="${i}">＋ 追加（${i + 1}）</div>`).join('') + '</div>';
    const pickBody = (slotNo) => {
        const used = new Set(game.player.stock.filter(Boolean));
        const all = Object.values(game.items).filter(it => game.isStockable(it));
        const row = (it) => html`<div class="pick cols ${used.has(it.id) ? 'dis' : ''}" style="--c:1fr 7em 12em" data-id="${it.id}" data-slot="${slotNo}"><span>${it.name}</span><small>${used.has(it.id) ? '入っています' : ''}</small><small>${kindLabel(game, it)}　${itemDetail(game, it)}</small></div>`;
        return '<p>枠 ' + (slotNo + 1) + ' に入れる武器・魔法</p><div class="title">武器・杖</div>' + all.filter(it => !game.isMagicItem(it)).map(row).join('') + '<div class="title" style="margin-top:8px">魔法・弓</div>' + all.filter(it => game.isMagicItem(it)).map(row).join('');
    };
    const settingBody = () => '<p class="legend">ショートカットキーの割り当て（「変更」を押して、割り当てたいキーを押す。1〜9 と Esc は使えません）</p>' + MENU.map(([id, name]) => html`<div class="cols" style="--c:110px 3em 9em;margin-bottom:4px"><span>${name}</span><kbd>${keymap[id].toUpperCase()}</kbd><button data-keyset="${id}">変更</button></div>`).join('') + '<div class="cols" style="--c:110px 200px;margin-top:10px"><span>音量</span><input type="range" min="0" max="100" value="60"></div>'
        + html`<div class="cols" style="--c:110px auto;margin-top:10px"><span>メッセージ文字</span><span>${jhtml.raw(Object.entries(MSG_SIZES).map(([k, v]) => html`<button data-msg="${k}" class="${prefs.msg === k ? 'on' : ''}">${v[0]}</button>`).join(' '))}</span></div>`;
    const statusBody = () => {
        const lv = game.player ? game.player.level : 1;
        return '<div class="cols" style="--c:5em 1fr"><span class="k">種族</span><span>人間</span></div><div class="title" style="margin-top:8px">職業</div>'
            + `<div class="cols" style="--c:5em 1fr 4.2em"><span>メイン</span><span>戦士</span><span class="lv"><span>Lv.</span><span>${lv}</span></span></div>`
            + '<div class="cols" style="--c:5em 1fr 4.2em"><span>サブ</span><span>ウィザード</span><span class="lv"><span>Lv.</span><span>5</span></span></div><hr>'
            + '<div class="abil"><span>筋力<b>14</b><i>(2)</i></span><span>器用度<b>12</b><i>(2)</i></span><span>敏捷度<b>13</b><i>(2)</i></span><span>知力<b>11</b><i>(2)</i></span><span>精神力<b>10</b><i>(2)</i></span><span>生命力<b>15</b><i>(3)</i></span></div>'
            + '<p>攻撃力 / 防御 / 回避 / クリティカル など（ダミー）</p>';
    };
    const equipBody = () => '<p class="legend">防具・アクセサリの設定（武器・魔法は「ストック」）</p>' + EQUIPS.map((q, i) => q[1] ? html`<div class="pick cols" style="--c:6em 1fr 14em" data-equip="${i}"><span class="k">${q[0]}</span><span>${q[1]}</span><small>${q[2]}</small></div>` : html`<div class="pick cols dis" style="--c:6em 1fr 14em"><span class="k">${q[0]}</span><span>（なし）</span><small></small></div>`).join('');
    const itemBody = () => '<p class="legend">道具と防具を見る画面（身につけるのは「装備」）。クリックで詳細</p>' + ITEMS.map((it, i) => html`<div class="pick cols" data-item="${i}"><span class="k">${it[1]}</span><span>${it[0]}</span><span class="n">${it[2]}</span></div>`).join('');
    S.bodies = { stock: stockBody, status: statusBody, equip: equipBody, item: itemBody, setting: settingBody };

    on(E.winBody, 'click', '[data-rm]', (e, t) => { game.setStockSlot(Number(t.dataset.rm), null); S.openWin('stock'); });
    on(E.winBody, 'click', '[data-detail]', (e, t) => {
        if (e.target.closest('[data-rm]')) return;
        const i = Number(t.dataset.detail), it = slotItem(i);
        S.setBody(html`<h3>ストック</h3><p>枠 ${i + 1}</p><h3>${it.name}</h3><p>${kindLabel(game, it)}</p><p>${itemDetail(game, it)}</p>`);
        S.setBack(() => S.openWin('stock'));
    });
    on(E.winBody, 'click', '[data-add]', (e, t) => { S.setBody('<h3>ストック</h3>' + pickBody(Number(t.dataset.add))); S.setBack(() => S.openWin('stock')); });
    on(E.winBody, 'click', '.pick[data-slot]:not(.dis)', (e, t) => { game.setStockSlot(Number(t.dataset.slot), t.dataset.id); S.openWin('stock'); });
    on(E.winBody, 'click', '[data-keyset]', (e, t) => { S.keyCapture = t.dataset.keyset; t.textContent = 'キーを押してください'; });
    on(E.winBody, 'click', '[data-equip]', (e, t) => { const q = EQUIPS[Number(t.dataset.equip)]; S.setBody(html`<h3>装備</h3><h3>${q[1]}</h3><p>${q[0]}</p><p>${q[2]}</p><p>${q[3]}</p>`); S.setBack(() => S.openWin('equip')); });
    on(E.winBody, 'click', '.pick[data-item]', (e, t) => { const it = ITEMS[Number(t.dataset.item)]; S.setBody(html`<h3>道具</h3><h3>${it[0]}</h3><p>${it[1]}${it[1] === '道具' ? '　所持 ' + it[2] + ' 個' : ''}</p><p>${it[3]}</p>`); S.setBack(() => S.openWin('item')); });
}

// 会話・ボスの帯・死亡（見た目だけ。コンソールの window.mock から確認できる）
function initTalk(S) {
    const { E } = S;
    S.talk = (who, text, choices = []) => {
        E.talk.innerHTML = html`<div class="who">${who}</div><div>${text}</div><div class="ch">${choices.map((c, i) => html`<button data-ch="${i}">${c[0]}</button>`)}${choices.length ? '' : jhtml.raw('<small style="color:#9ca3af">Esc で閉じる</small>')}</div>`;
        E.talk._choices = choices; E.talk.style.display = 'flex'; E.bottomStack.classList.add('talking'); S.setPaused();
    };
    S.closeTalk = () => { E.talk.style.display = 'none'; E.bottomStack.classList.remove('talking'); S.setPaused(); };
    on(E.talk, 'click', '[data-ch]', (e, t) => { const c = E.talk._choices[Number(t.dataset.ch)]; if (c[1]) c[1](); else S.closeTalk(); });
    S.guild = () => S.talk('冒険者ギルド', 'いらっしゃいませ。ご用件は？', [['セーブする', async () => { const r = await S.game.saveCharacter(); S.talk('冒険者ギルド', r.ok ? 'セーブしました。（保存したのは、ストックだけ。ほかは、あとでつなぎます）' : `セーブできませんでした。（${r.message}）`, [['やめる']]); }], ['預ける・引き出す', () => S.talk('冒険者ギルド', '（預かりの画面は、あとで作ります）', [['戻る', S.guild]])], ['やめる']]);
    let deathTimer = null;
    S.revive = () => { clearTimeout(deathTimer); E.death.style.display = 'none'; S.setPaused(); S.talk('冒険者ギルド', '冒険者は、ギルドで目を覚ました。（所持金・持ち物はそのまま）', [['はい']]); };
    S.die = () => { S.closeAll(); E.deathMsg.textContent = '冒険者は 力尽きた…'; E.death.style.display = 'flex'; S.setPaused(); clearTimeout(deathTimer); deathTimer = setTimeout(S.revive, 5000); };
    let boss = null;
    const renderBoss = () => {
        E.bossBar.classList.toggle('on', !!boss);
        E.bossBar.innerHTML = boss ? html`<span class="nm">${boss.name}</span><div class="bar"><i style="width:${boss.hp / boss.maxHp * 100}%;background:#ef4444"></i></div><span class="num">${boss.hp} / ${boss.maxHp}</span>` : '';
    };
    S.bossHit = () => { if (!boss) boss = { name: 'ワイバーン', hp: 1200, maxHp: 1200 }; else boss.hp = Math.max(0, boss.hp - 150); renderBoss(); };
    S.bossEnd = () => { boss = null; renderBoss(); };
    S.closeAll = () => { S.closeWin(); S.closeTalk(); };
}

// キー操作（メニューのショートカット・Esc・ショートカットの割り当て）
function initKeys(S) {
    const { E } = S;
    on(document, 'keydown', e => {
        if (S.keyCapture) {
            if (e.key.length === 1 && !/^[1-9]$/.test(e.key) && e.key !== ' ') { const k = e.key.toLowerCase(); Object.keys(keymap).forEach(id => { if (keymap[id] === k && id !== S.keyCapture) keymap[id] = keymap[S.keyCapture]; }); keymap[S.keyCapture] = k; S.renderMenu(); }
            S.keyCapture = null; e.preventDefault(); return S.openWin('setting');
        }
        if (S.game.shopMenu) return;   // 店のメニュー（ゲーム側が、キーを処理する）の間は、ここでは何もしない
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;   // 入力中は、ショートカットにしない
        if (e.key === 'Enter' && E.death.style.display === 'flex') return S.revive();
        if (e.key === 'Escape') return S.closeAll();
        if (S.paused || e.ctrlKey || e.metaKey || e.altKey) return;
        const id = Object.keys(keymap).find(k => keymap[k] === e.key.toLowerCase());
        if (id) S.openWin(id);
    });
}

// ミニマップの見出しのゲーム内の日時（ダミー。時間の進み方は、あとで決める）と、画面全体の縮小・拡大
function initTimeAndFit(S) {
    const { E } = S;
    let gameTime = new Date(2026, 10, 15, 14, 32, 0);
    const p2 = n => String(n).padStart(2, '0');
    S.showTime = () => { const d = gameTime; E.miniTitle.textContent = `ミニマップ: ${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
    setInterval(() => { if (!S.paused) { gameTime = new Date(gameTime.getTime() + 100); S.showTime(); } }, 100);
    // 縦横の合う方に合わせ、上限は MAX_SCALE 倍。余白は中央に寄せる
    const MAX_SCALE = 3;
    S.fit = () => {
        const app = $('app');
        app.style.transform = 'none';
        const w = app.offsetWidth, h = app.offsetHeight;
        const k = Math.min(MAX_SCALE, window.innerWidth / w, window.innerHeight / h);
        app.style.transform = `scale(${k})`;
        app.style.left = `${Math.max(0, (window.innerWidth - w * k) / 2)}px`;
        app.style.top = `${Math.max(0, (window.innerHeight - h * k) / 2)}px`;
    };
    on(window, 'resize', S.fit);
}
