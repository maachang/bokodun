// ゲームの初期状態（プレイヤー・入力・マップ・描画物の一覧など）。GameEngine のメソッド（this は GameEngine。public/js/game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は GameEngine.constructor の中の段階。移しただけで、動きは同じ（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { TEST_RUN_SPEED_SCALE } from '/js/game/constants.js';
import { MapNavigator } from '/js/mapNavigator.js';

export const stateInitMethods = {
    initPlayerState() {
        this.player = {
            x: 0,
            z: 0,
            angle: 0,
            pitch: 0,
            speed: 8.5,
            runSpeed: 13.0 * TEST_RUN_SPEED_SCALE,   // 走る速さ（Shift）。テスト用の倍率を掛けてある
            rotSpeed: 2.8,
            radius: 0.6,
            maxHp: 100,
            hp: 100,
            maxMp: 60,
            mp: 60,
            maxStamina: 43, stamina: 43,   // スタミナ（仮。能力値ができるまで、Lv1・人間・平均の値。式は character-spec 8.2e、定数は combat.json）
            staminaPause: 0,       // 回復が止まる残り秒（ダッシュ・攻撃・登りのあと）
            staminaExhausted: false,   // 0 になって、最大値の resumeRatio まで回復するまで、ダッシュ・攻撃・登りができない
            gold: 0,
            status: {},         // 状態異常（poison・burn: 継続ダメージ / slow / paralysis / silence / curse）。{ 種類: { t: 残り秒, dps / scale } }
            exp: 0,
            level: 1,
            attackPower: 15,
            isInvincible: false,
            invincibleTimer: 0,
            attackCooldown: 0,
            magicCooldown: 0,
            equipSlots: [],     // 装備スロット（アイテム ID または null＝空き）。初期値は player.json
            meleeSlot: null,    // 突進攻撃に使う近接武器のスロット番号（null=素手）
            focusSlot: null,    // 魔法を補正する杖・ロッドのスロット番号（null=補正なし）
            magicSlots: [],     // 魔法スロット（数字キー 1〜4）。呪文または弓のアイテム ID（null=空き）。中身はセレクトボックスで自由に選べる
            selectedMagic: 0,   // 選択中の魔法スロット番号（Space / F / クリックで使う）
            knockback: new THREE.Vector3(),
            isFalling: false,
            fallDepth: 0,
            fallVelocityY: 0,
            fallRespawnPos: null,
            lastSafePos: { x: 0, z: 0 }
        };

        // Inputs
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            turnLeft: false,
            turnRight: false,
            sprint: false,
            camUp: false, camDown: false, camLeft: false, camRight: false   // Ctrl+矢印キー: 視点の上下・微調整の旋回
        };
    },

    initWorldState() {
        this.isPointerLocked = false;
        this.nav = new MapNavigator();   // マップ間の移動の記録と、移動中の二重実行の防止
        this.mouseMode = false;   // マウスモード（クリックでポインターをロックし、マウスで視点を動かす）。OFF。視点は Ctrl+矢印キー、Ctrl+0 でリセット
        this.currentMapId = 'dungeon';
        this.mapData = null;
        this.mapCache = {};
        this.objectDefinitions = null;
        this.enemyDefinitions = null;
        this.items = {};   // アイテム定義（items.json: id → 定義）
        this.hitStop = 0;        // ヒットストップの残り時間（秒）。0 より大きい間はゲームの時間が止まる
        this.cameraShake = { time: 0, duration: 0.15, amp: 0 };
        this.weaponClasses = {}; // 武器クラス定義（weaponClasses.json: クラス名 → 攻撃の形・範囲・エフェクト）
        this.colliders = [];
        this.treeSprites = [];   // 木のスプライト（距離で、描画の方式を切り替える）
        this.monsters = [];
        this.projectiles = [];
        this.portals = [];   // ポータル（次のマップへの入口）。マップに複数置ける
        this.waterMeshes = [];
        this.seaCells = [];   // 海のマス（type: sea_tile）。1 マスずつは描かず、マップ全体の水面 1 枚と、並びごとの当たり判定にする
        this.heatHazePlanes = [];
        this.torchGlows = [];   // 松明の光（光だまり・光の輪）。ゆらぎのアニメーション用
        this.fountains = [];
        this.chompers = [];
        this.popSpikes = [];
        this.crumblingFloors = [];
        this.dartTraps = [];
        this.chests = [];
        this.fireJets = [];
        this.buzzsaws = [];
        this.terrainGrid = [];
        this.raisedFloors = [];   // 高さのある床（王城の高台の段など）。目線とNPCの足元の高さに使う
        this.doors = [];
        this.signposts = [];
        this.npcs = [];
        this.npcTextures = {};
        this.activeEnemyCards = [];
        this.popups = [];

        this.clock = new THREE.Clock();
    },
};
