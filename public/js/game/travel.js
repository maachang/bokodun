// 乗り物での移動（渡し船など）。GameEngine のメソッド（this は GameEngine。game.js が GameEngine.prototype へ組み込む）。
// 渡し場は、店と同じ売り場（shops.json の routes）。店員に話しかけて、行き先（「コマチ港町　60G」など）を選ぶと、船賃を払って、演出を見せてから移動する。
export const travelMethods = {
    // 行き先を選んだ: 船賃を払って、演出（route.event）があれば見せてから移動する。お金が足りなければ false を返す
    boardFerry(route) {
        const price = route.price ?? 0;
        if ((this.player.gold ?? 0) < price) return false;
        this.player.gold -= price;
        this.closeShopMenu();
        this.sound.playLevelClear();
        this.nav.stack.pop();   // 売り場へ入ったときの「戻る先」の記録は、使わない（行き先は spawn で決まる）
        const go = () => this.enterMap(route.nextMap, route);
        if (route.event?.image) this.playTravelEvent(route.event, go);
        else { this.addPopup(route.message ?? '次のエリアへ', '#fef08a'); go(); }
        return true;
    },

    // 全画面の演出（暗転 → 画像と文 → 移動 → 明ける）。Enter/Space/E/クリックで飛ばせる
    playTravelEvent(ev, onDone) {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;inset:0;background:#000;z-index:300;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .6s;cursor:pointer;';
        const img = document.createElement('img');
        img.src = ev.image;
        img.style.cssText = 'max-width:80vw;max-height:70vh;border-radius:8px;box-shadow:0 0 40px #000;';
        const cap = document.createElement('div');
        cap.style.cssText = 'color:#f8fafc;font-size:20px;margin-top:16px;text-shadow:0 0 6px #000;';
        cap.textContent = ev.caption ?? '';
        const hint = document.createElement('div');
        hint.style.cssText = 'color:#cbd5e1;font-size:16px;margin-top:10px;text-shadow:0 0 6px #000;';
        const total = (ev.seconds ?? 3) * 1000 + 600;
        const t0 = performance.now();
        const showRest = () => { hint.textContent = `あと ${Math.max(0, Math.ceil((total - (performance.now() - t0)) / 1000))} 秒　（Enter / クリックで飛ばす）`; };   // 終わるまでの残り秒数
        showRest();
        const ticker = setInterval(showRest, 200);
        el.append(img, cap, hint);
        document.body.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; });
        let timer = null;
        const finish = () => {
            if (!this.travelScene) return;
            clearTimeout(timer); clearInterval(ticker);
            this.travelScene = null;
            onDone();   // 移動（読み込み中は、画面を黒で隠したまま。終わってから明ける）
            const wait = () => { if (this.nav.busy || this.loadingMap) return setTimeout(wait, 100); el.style.opacity = '0'; setTimeout(() => el.remove(), 700); };
            setTimeout(wait, 100);
        };
        this.travelScene = { skip: finish };
        el.onclick = finish;
        timer = setTimeout(finish, total);
    },
};
