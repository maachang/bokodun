// 敵の「特徴と動き」を、敵の定義（enemies.json の abilities・family・個別の指定）から決める。
//   Monster（entities.js）が、これを使って、動き方（aiType）・飛ぶか・撃つか・突進するか、などを決める。
//   enemies.json の敵に、次の項目を書けば、個別に上書きできる:
//     aiType        動き方（walk_chase / ranged_maintain / flying_dive / flying_ranged / charge_dash / big_hop / hop_pounce / ...）
//     flying        true で空を飛ぶ（川・崖・毒沼・高低差に関係なく動け、見えなくても感知する）
//     flightHeight  飛ぶ高さ（地面から。既定は大きさで決まる）
//     charge        { windup, dash, speed, stun } 突進（猪突猛進）の溜め時間・走る距離・速さ倍率・壁にぶつかったときのスタン
//     hop           { range, height, rest } 兎: 低く速いリズムで跳ぶときの 1 回の距離・高さ・着地後の休み
//     raptor        { high, wait, glideSpeed, glideTime, recover, hitRecover, vulnerable } 猛禽: 舞い上がって、滑空で突っ込む。よけられると隙ができる
//     inflict       [{ type, chance, t, dps / scale }] プレイヤーへの状態異常（poison・burn・slow・paralysis・silence・curse）
//     guard / summon / blink / burrow / slam  盾持ち・召喚・瞬間移動・潜る・範囲攻撃（上の各コメント参照）
//     rush          { flurry, flurryScale, cool } クマ: 攻撃を始めると、近くで連打（1 回は小さく、回数が多い）
//     cat           { range, height, rest, flurry, flurryScale, away, cool } 猫系: 隠密・低く長く跳ぶ・近くで連続攻撃・ヒットアンドアウェイ
//     relentless    { speed, joinRadius } 一定の速さで追跡をやめない・仲間が合流する（狼）
//     territory     { radius, mode, leash } 縄張り（guard=縄張りに入ると攻撃 / patrol=範囲を巡回、入ると攻撃 / roam=住民のようにうろつき、攻撃されたときだけ追う）
//     shoot         { type, range, cooldown, speed, damage, mult } 遠距離攻撃（mult: 攻撃力に対する威力の倍率。damage を省いたとき、attackPower × mult）
//     turret        true で固定砲台（動かない・待ち伏せしない・ノックバックしない。向きだけプレイヤーへ回り、射程に入ると撃ち続ける）。能力 turret でも同じ
//     immune        魔法（弾・爆発）の、効かない属性の配列（fire / ice / holy / ... と、全属性を表す 'elemental'）。無属性（none）の魔法と、物理攻撃（剣・矢など）は、効く

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
        turret: !!(def.turret || ab.has('turret')) && def.turret !== false,   // 固定砲台
        immune: new Set(def.immune || []),                                    // 魔法の、効かない属性
    };
    if (p.flying && p.flightHeight == null) p.flightHeight = defaultFlightHeight(def);

    // 遠距離攻撃: 個別の指定 > canShoot（従来の定義） > 能力
    if (def.shoot) {
        p.shoot = { type: 'magic', range: 14, cooldown: 3, speed: 8, damage: null, ...def.shoot };
        if (p.shoot.damage == null && def.shoot.mult != null) p.shoot.damage = Math.max(2, Math.round((def.attackPower ?? 10) * def.shoot.mult));
    }
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

    // 状態異常（プレイヤーへ）: 攻撃が当たったとき、能力に応じて、一定の確率で、プレイヤーを状態異常にする
    //   poison=毒（継続ダメージ）/ burn=火傷（継続ダメージ）/ slow=鈍足 / paralysis=麻痺（少しの間、動けない）/ silence=沈黙（魔法が使えない）/ curse=呪い（攻撃力が下がる）
    p.inflict = [];
    if (ab.has('venom')) p.inflict.push({ type: 'poison', chance: 0.55, t: 8, dps: 4 });
    else if (ab.has('poison')) p.inflict.push({ type: 'poison', chance: 0.45, t: 6, dps: 3 });
    if (ab.has('burn')) p.inflict.push({ type: 'burn', chance: 0.4, t: 4, dps: 4 });
    if (ab.has('paralysis')) p.inflict.push({ type: 'paralysis', chance: 0.3, t: 1.0 });
    if (ab.has('silence')) p.inflict.push({ type: 'silence', chance: 0.4, t: 5 });
    if (ab.has('slow')) p.inflict.push({ type: 'slow', chance: 0.5, t: 4, scale: 0.55 });
    if (ab.has('curse')) p.inflict.push({ type: 'curse', chance: 0.4, t: 8, scale: 0.7 });
    if (def.inflict) p.inflict = def.inflict;
    p.lifesteal = ab.has('lifesteal') ? 0.35 : 0;   // 与えたダメージの 35% を、自分が回復する

    // 盾持ち（guard）: 盾・甲羅・硬い体で、正面からの近接・矢を防ぐ（ダメージ 1/4）。向きを変えるのが遅いので、横や背後へ回り込めば、効く。
    //   魔法は、防げない（魔法で倒すか、回り込んで攻撃する）。arc: 防ぐ範囲の角度、reduction: 防いだときに残るダメージの割合、turn: 向きを変える速さ（ラジアン/秒）
    if (def.guard || (/guard_heavy|guard_elite|golem|turtle|pillbug|beetle|ant_knight/.test(id) && def.guard !== false)) {
        p.guard = { arc: 120, reduction: 0.25, turn: 1.6, ...(def.guard || {}) };
    }
    // 召喚（summon）: 戦っている間、一定の間隔で、仲間（手下）を呼ぶ。数が増えると、戦いが面倒になるので、呼んでいる本体を、先に倒したい
    if (def.summon || (ab.has('summon') && def.summon !== false)) {
        const fam = def.family, byId = [[/slime/, 'slime'], [/ant_/, 'ant_pawn'], [/goblin|hobgoblin/, 'goblin_scout'], [/bandit/, 'bandit_grunt'], [/lich|vampire|no_life|no_life_king/, 'skeleton'], [/demon|devil/, 'lesser_demon']];
        const minion = (byId.find(([re]) => re.test(id)) ?? [null, fam === 'undead' ? 'skeleton' : 'goblin_scout'])[1];
        p.summon = { type: minion, every: 11, max: 3, ...(def.summon || {}) };
    }
    // 瞬間移動（teleport）: 一定の間隔で、少し光って（予兆）、プレイヤーの背後へ移動する
    if (def.blink || (ab.has('teleport') && def.blink !== false)) p.blink = { every: 7, windup: 0.7, behind: 3.5, ...(def.blink || {}) };
    // 潜る（burrow）: 地中を、姿を消して近づき（その間は、攻撃も受けない）、近くで飛び出して、しばらく戦い、また潜る
    if (def.burrow || (ab.has('burrow') && def.burrow !== false)) p.burrow = { surface: 2.8, stay: 3.0, cool: 3.0, speed: 1.4, ...(def.burrow || {}) };
    // 待ち伏せ（ambush）: 姿を隠して動かず、近づかれた瞬間に、不意打ちで襲いかかる（最初の 1.5 秒は、威力 1.5 倍）。ミミック・クモは、専用の動きがある
    if (ab.has('ambush') && !p.burrow && !/mimic|tarantula|gargoyle/.test(id) && def.ambush !== false) p.ambushHide = { reveal: 4.5 };
    // 範囲攻撃（aoe）: プレイヤーの足元に、赤い輪（予兆）を出し、少しあとに、その範囲を攻撃する。輪の外へ出れば、よけられる
    if (def.slam || (ab.has('aoe') && def.slam !== false)) p.slam = { radius: 3.4, windup: 1.1, cool: 7, mult: 1.3, range: 12, ...(def.slam || {}) };
    // 盗む（stealItem）: 攻撃が当たると、お金の一部を盗んで、逃げる（倒すと、取り返せる）
    p.steal = ab.has('stealItem');

    // 猛禽（鷹・鷲・グリフォンなどの、鳥の頂点）: プレイヤーを獲物と認識すると、まず高く舞い上がり、そこから滑空して、速い速さで突っ込んでくる。
    //   滑空の向きは、飛び出す瞬間に決まる（途中で曲がらない）ので、よけられる。よけられると、低い所で隙ができ（被ダメージが増え）、近接で反撃できる。
    //   高い所にいる間は、近接が届かない（魔法・弓で撃ち落とす）。high: 高さ、wait: 高い所で狙う時間、glide: 滑空の速さと時間、recover: よけられたあとの隙、vulnerable: 隙の間の被ダメージ倍率
    if (def.raptor || (p.flying && /hawk|eagle|falcon|griffon/.test(id) && def.raptor !== false)) {
        p.raptor = { high: 5.0, wait: 1.5, glideSpeed: 14, glideTime: 0.9, recover: 1.8, hitRecover: 0.6, vulnerable: 1.5, ...(def.raptor || {}) };
    }

    // 固定砲台（turret）: 動かない（突進・跳ねる・追う動きは、すべてやめる）。待ち伏せもしない。弾は、上の遠距離攻撃（shoot）で撃つ
    if (p.turret) {
        p.flying = false; p.flightHeight = null; p.charge = null; p.hop = null; p.cat = null; p.relentless = null; p.rush = null;
        p.raptor = null; p.territory = null; p.burrow = null; p.blink = null; p.ambushHide = null; p.knockback = false; p.aiType = 'stationary';
    }

    // 動き方（aiType）を決める。個別の指定があれば、それを優先する（ただし、飛ぶ敵が walk_chase の指定のままなら、飛ぶ動きにする）
    if (p.aiType === 'walk_chase' && p.flying) p.aiType = null;
    if (!p.aiType) {
        if (p.raptor) p.aiType = 'raptor_dive';
        else if (p.flying) p.aiType = p.shoot ? 'flying_ranged' : 'flying_dive';
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

// 吊橋のマス（床 deck 段・橋の下の谷の底 under 段）の、動く者が使う層の高さの段。
//   ref: 動く者の、今の高さの段。橋の床（deck）と谷の底（under）の、真ん中より上にいれば、橋の上（deck）、下にいれば、橋の下（under）の層を使う。
//   ref が未指定のときは、橋の上。橋の上と下は、行き来できない（橋の脇は、崖）
export function bridgeLayerLevel(deck, under, ref) {
    if (ref === undefined || ref === null) return deck;
    return ref >= (deck + under) / 2 ? deck : under;
}

// 飛ぶ敵が、急降下（攻撃）の途中の、目標の高さ。t: 0（上空）〜 1（プレイヤーの胴の高さ）
export function diveHeight(hoverY, targetY, t) {
    const k = Math.min(1, Math.max(0, t));
    return hoverY + (targetY - hoverY) * (k * k * (3 - 2 * k));
}
