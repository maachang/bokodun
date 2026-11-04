// 敵の「特徴と動き」を、敵の定義（enemies.json の abilities・family・個別の指定）から決める。
//   Monster（entities.js）が、これを使って、動き方（aiType）・飛ぶか・撃つか・突進するか、などを決める。
//   enemies.json の敵に、次の項目を書けば、個別に上書きできる:
//     aiType        動き方（walk_chase / ranged_maintain / flying_dive / flying_ranged / charge_dash / big_hop / hop_pounce / ...）
//     flying        true で空を飛ぶ（川・崖・毒沼・高低差に関係なく動け、見えなくても感知する）
//     flightHeight  飛ぶ高さ（地面から。既定は大きさで決まる）
//     charge        { windup, dash, speed, stun } 突進（猪突猛進）の溜め時間・走る距離・速さ倍率・壁にぶつかったときのスタン
//     hop           { range, height, rest } 兎: 低く速いリズムで跳ぶときの 1 回の距離・高さ・着地後の休み
//     rush          { flurry, flurryScale, cool } クマ: 攻撃を始めると、近くで連打（1 回は小さく、回数が多い）
//     cat           { range, height, rest, flurry, flurryScale, away, cool } 猫系: 隠密・低く長く跳ぶ・近くで連続攻撃・ヒットアンドアウェイ
//     relentless    { speed, joinRadius } 一定の速さで追跡をやめない・仲間が合流する（狼）
//     territory     { radius, mode, leash } 縄張り（guard=縄張りに入ると攻撃 / patrol=範囲を巡回、入ると攻撃 / roam=住民のようにうろつき、攻撃されたときだけ追う）
//     shoot         { type, range, cooldown, speed, damage } 遠距離攻撃

// 能力から決まる、遠距離攻撃の種類
const SHOOT_BY_ABILITY = [
    // [能力, 弾の種類, 射程, 間隔(秒), 弾の速さ, 威力の倍率（attackPower に対して）]
    ['breath', 'breath_fire', 12, 3.4, 9, 0.9],
    ['ranged', 'magic', 15, 2.8, 8, 0.6],
    ['curse', 'magic', 13, 4.0, 7, 0.55],
];

// 飛ぶ敵の、地面からの高さ（大きな敵ほど高い）
function defaultFlightHeight(def) {
    const sy = def.scale?.[1] ?? 2.0;
    if (def.family === 'dragon') return 3.2;
    return sy > 3.0 ? 2.6 : (sy > 2.0 ? 2.0 : 1.5);
}

// 敵の定義から、動きの特徴（profile）を決める
export function deriveProfile(def = {}) {
    const ab = new Set(def.abilities || []);
    const id = def.id || '';
    const p = {
        aiType: def.aiType || null,
        flying: !!(def.flying ?? (ab.has('fly') || /^flying/.test(def.aiType || ''))),
        flightHeight: def.flightHeight ?? null,
        charge: null,
        hop: null,
        shoot: null,
        pack: ab.has('pack'),
        enrage: ab.has('enrage'),
        flee: ab.has('flee'),
        evasion: ab.has('evasion'),
        regen: ab.has('regen'),
        ambush: ab.has('ambush'),
        knockback: ab.has('knockback'),
    };
    if (p.flying && p.flightHeight == null) p.flightHeight = defaultFlightHeight(def);

    // 遠距離攻撃: 個別の指定 > canShoot（従来の定義） > 能力
    if (def.shoot) p.shoot = { type: 'magic', range: 14, cooldown: 3, speed: 8, damage: null, ...def.shoot };
    else if (def.canShoot) p.shoot = { type: def.shootType || 'magic', range: def.shootRange ?? 15, cooldown: def.shootCooldown ?? 3, speed: null, damage: null };
    else {
        for (const [a, type, range, cooldown, speed, mult] of SHOOT_BY_ABILITY) {
            if (ab.has(a)) { p.shoot = { type, range, cooldown, speed, damage: Math.max(4, Math.round((def.attackPower ?? 10) * mult)) }; break; }
        }
        // 飛びながら燃やす敵（ドラゴンフライなど）は、火の粉を吐く
        if (!p.shoot && p.flying && ab.has('burn')) p.shoot = { type: 'breath_fire', range: 10, cooldown: 3.2, speed: 8, damage: Math.max(4, Math.round((def.attackPower ?? 10) * 0.7)) };
    }

    // 突進（猪突猛進）: charge の能力を持つ、地上の敵。大きく跳ぶ兎は別（big_hop）
    const isRabbit = /rabbit|almiraj/.test(id);
    const isCat = /leopard|panther|tiger|lion|cheetah|^cat/.test(id) && !p.flying;
    if (def.cat || isCat) {
        // 猫系: 攻撃体制に入ると、隠密で姿を消し、低く・長く跳んで近づき（不意打ち）、近くでは噛みつき・ひっかきで、素早く何度も攻撃し、
        //   すぐ離れて、また姿を消す（ヒットアンドアウェイ）。range: 1 回の跳躍の距離、height: 跳ぶ高さ、rest: 着地後の休み、
        //   flurry: 近くで攻撃し続ける時間、flurryScale: 1 回あたりの威力の倍率（攻撃回数が多い分、小さい）、away: 離れる跳躍の距離、cool: 次に狙うまでの間
        p.cat = { range: 11, height: 0.8, rest: 0.3, flurry: 1.0, flurryScale: 0.55, away: 7, cool: 2.5, ...(def.cat || {}) };
    } else if (isRabbit) {
        // 兎: 低く、速いリズムで、ぴょんぴょん跳んで近づく。上位種（アルミラージ）は、1 回の跳躍が、少し長い
        const upper = /almiraj/.test(id);
        p.hop = { range: upper ? 6.5 : 4.5, height: upper ? 1.1 : 0.9, rest: upper ? 0.22 : 0.26, ...(def.hop || {}) };
    } else if (def.charge) {
        p.charge = { windup: 0.9, dash: 13, speed: 3.2, stun: 1.3, rest: 0.8, vulnerable: 1.0, ...def.charge };
    } else if (ab.has('charge') && !p.flying && !p.cat) {
        const heavy = /boar|bear|ogre|cyclops|beetle|pillbug|orc_king|bandit_boss|berserker/.test(id);
        p.charge = { windup: heavy ? 1.0 : 0.8, dash: heavy ? 14 : 11, speed: heavy ? 3.4 : 3.0, stun: heavy ? 1.5 : 1.1, rest: 0.8, vulnerable: 1.0 };
        // イノシシ: ブルブル震えて溜め（攻撃体制）→ ロケットスタートで、かなり速く突っ込み、突き抜けて攻撃する。
        //   よけられる（当たらずに突き抜ける）と、息切れして、長く動けず、被ダメージが増える（弱い）。当てたときは、すぐ立て直す
        if (/boar/.test(id)) p.charge = { windup: 1.1, dash: 18, speed: 6, stun: 1.8, rest: 2.2, vulnerable: 1.6 };
    }

    // 狼（relentless）: 一定のそこそこ速い速さで、どこまでも追ってくる（見失っても追跡をやめない）。追っている間に、近くの仲間（群れ）が合流して、列になって追ってくる（トレイン）
    //   突進（charge）の代わりに、この追跡を使う。個別の指定: relentless: { speed, joinRadius }
    //   索敵範囲（senseScale 倍）も、追跡（見失わない・仲間を呼ぶ距離 joinRadius）も、ふつうの敵の倍ほど。相当しつこい
    if (def.relentless) p.relentless = { speed: 4.8, joinRadius: 36, senseScale: 2, ...def.relentless };
    else if (/wolf|fenrir/.test(id) && def.relentless !== false) p.relentless = { speed: 4.8, joinRadius: 36, senseScale: 2 };
    if (p.relentless) { p.charge = null; p.pack = true; }

    // 縄張り（territory）: クマは、自分の縄張り（生まれた場所のまわり）に入られると、攻撃を始める（縄張りの外へ出ると、追うのをやめて、戻る）。
    //   鳥（飛ぶ敵のうち 鷹・グリフォン・ペガサスなど）は、一定の範囲を巡回していて、その範囲に入られると、攻撃してくる。
    //   個別の指定: territory: { radius, mode: 'guard' | 'patrol', leash }（leash: 追跡をやめる距離の倍率）
    if (def.territory) p.territory = { radius: 11, mode: 'guard', leash: 1.5, ...def.territory };
    else if (/bear|grizzly/.test(id) && !p.flying) p.territory = { radius: 11, mode: 'guard', leash: 1.5 };
    else if (p.flying && /hawk|griffon|eagle|bird|pegasus/.test(id)) p.territory = { radius: 15, mode: 'patrol', leash: 1.6 };

    // クマ（rush）: 縄張りの中を、うろうろしているが、攻撃を始めると、近くで、**連打（ラッシュ）**する。1 回は小さいが、攻撃回数が多く、
    //   まともに近づいて戦うと、体力がどんどん削られる。離れて、魔法・弓で倒すのが、有利。連打のあと、少し間を置いて、また連打する
    if (def.rush || (/bear|grizzly/.test(id) && !p.flying && def.rush !== false)) p.rush = { flurry: 2.6, flurryScale: 0.5, cool: 1.2, ...(def.rush || {}) };

    // 動き方（aiType）を決める。個別の指定があれば、それを優先する（ただし、飛ぶ敵が walk_chase の指定のままなら、飛ぶ動きにする）
    if (p.aiType === 'walk_chase' && p.flying) p.aiType = null;
    if (!p.aiType) {
        if (p.flying) p.aiType = p.shoot ? 'flying_ranged' : 'flying_dive';
        else if (p.cat) p.aiType = 'cat_ambush';
        else if (p.hop) p.aiType = 'big_hop';
        else if (p.relentless) p.aiType = 'pack_chase';
        else if (p.rush) p.aiType = 'bear_rush';
        else if (p.charge) p.aiType = 'charge_dash';
        else if (p.shoot) p.aiType = 'ranged_maintain';
        else p.aiType = 'walk_chase';
    }
    return p;
}

// 地上の敵が、(fromX, fromZ) のマスから (toX, toZ) のマスへ歩けるか。
//   levels: マスの高さの段を返す関数 (x, z) → 段。段差は、プレイヤーと同じく、上りは 1 段まで、下りは 2 段まで
export function groundStepOk(levelAt, fromX, fromZ, toX, toZ) {
    const diff = levelAt(toX, toZ) - levelAt(fromX, fromZ);
    return diff <= 1 && diff >= -2;
}

// 飛ぶ敵が、急降下（攻撃）の途中の、目標の高さ。t: 0（上空）〜 1（プレイヤーの胴の高さ）
export function diveHeight(hoverY, targetY, t) {
    const k = Math.min(1, Math.max(0, t));
    return hoverY + (targetY - hoverY) * (k * k * (3 - 2 * k));
}
