import * as THREE from '/js/three.module.js';
import { RetroTextureGenerator } from '/js/textures.js';
import { Monster, Projectile } from '/js/entities.js';
import { Npc } from '/js/npc.js';
import { MapNavigator, stairsFacing, STAIRS_DIRS } from '/js/mapNavigator.js';
import { fetchMap } from '/js/mapFormat.js';
import { worldNeighbor, edgeCrossing, clampToWorld } from '/js/world.js';
import { groundStepOk, bridgeLayerLevel } from '/js/enemyBehavior.js';
import { SoundFX } from '/js/audio.js';
import { SDAssetManager } from '/js/sdAssetManager.js';
import { ParticleSystem } from '/js/particles.js';
import { SlashEffectSystem } from '/js/slashEffect.js';
import { StrikeEffectSystem } from '/js/strikeEffect.js';
import { tileBuilders } from '/js/game/tiles.js';
import { updateWorldMethods } from '/js/game/updateWorld.js';
import { updatePlayerMethods } from '/js/game/updatePlayer.js';
import { equipmentMethods } from '/js/game/equipment.js';
import { combatMethods } from '/js/game/combat.js';
import { hudMethods } from '/js/game/hud.js';
import { interactMethods } from '/js/game/interact.js';
import { controlsMethods } from '/js/game/controls.js';
import { textureSetupMethods } from '/js/game/textureSetup.js';
import { mapSceneryMethods } from '/js/game/mapScenery.js';
import { renderSupportMethods } from '/js/game/renderSupport.js';
import { movementMethods } from '/js/game/movement.js';
import { TREE_SHADOWS, TREE_SHADOW_OPACITY, TEST_RUN_SPEED_SCALE, CLIMB_RISE, CLIMB_SEC, CLIMB_HOLD_SEC, compassDirection, NEIGHBOR_TERRAIN_RANGE, NEIGHBOR_OBJECT_RANGE, NEIGHBOR_PLANT_RANGE, CULL_CHUNK, FOOTSTEP_STRIDE, effectPower, HIT_FEEDBACK, SHOP_PAGE_SIZE } from '/js/game/constants.js';
export { TREE_SHADOWS, TREE_SHADOW_OPACITY, TEST_RUN_SPEED_SCALE, CLIMB_RISE, CLIMB_SEC, CLIMB_HOLD_SEC, COMPASS_NAMES, compassDirection, NEIGHBOR_TERRAIN_RANGE, NEIGHBOR_OBJECT_RANGE, NEIGHBOR_PLANT_RANGE, CULL_CHUNK } from '/js/game/constants.js';   // 設定・定数は /js/game/constants.js（従来どおり game.js からも読める）

export class GameEngine {
    constructor() {
        this.container = document.getElementById('viewport');
        this.canvas = document.getElementById('gameCanvas');
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        this.sound = new SoundFX();
        this.sdManager = new SDAssetManager();

        // Screen low-res retro setup
        this.internalWidth = 320;
        this.internalHeight = 240;

        // Player state
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

        this.initThree();
        this.initTextures();
        this.strikeEffects = new StrikeEffectSystem(this.scene, this.textures.firePillar, this.camera);
        this.initControls();
        this.initEquipHudEvents();
        this.initEffectTestEvents();
    }

    async init() {
        await this.loadDefinitions();
        // 最初に入るマップ: 世界（world.json）の start。読めなければ、そのまま（currentMapId の既定）
        try {
            this.world = await (await fetch('/data/world.json')).json();
            if (this.world.start) this.currentMapId = this.world.start;
        } catch { this.world = null; }
        await this.loadMap(this.currentMapId);
    }

    async loadDefinitions() {
        try {
            const [objRes, enemyRes, itemRes, classRes, playerRes, npcRes] = await Promise.all([
                fetch('/data/objects.json'),
                fetch('/data/enemies.json'),
                fetch('/data/items.json'),
                fetch('/data/weaponClasses.json'),
                fetch('/data/player.json'),
                fetch('/data/npcs.json')
            ]);
            this.staminaDef = (await (await fetch('/data/combat.json')).json()).stamina;
            this.objectDefinitions = await objRes.json();
            this.enemyDefinitions = await enemyRes.json();
            this.items = await itemRes.json();
            this.weaponClasses = await classRes.json();
            this.npcDefinitions = await npcRes.json();
            this.shops = await (await fetch('/data/shops.json')).json();   // 店の種類（店名・店主）。汎用の店マップが、入った店に応じて切り替える
            // 初期装備（装備スロットの中身と選択中のスロット）
            const playerDef = await playerRes.json();
            this.player.equipSlots = [...playerDef.equipSlots];
            this.player.meleeSlot = playerDef.meleeSlot ?? null;
            this.player.focusSlot = playerDef.focusSlot ?? null;
            this.player.magicSlots = [...playerDef.magicSlots];
            this.player.selectedMagic = playerDef.selectedMagic ?? 0;
        } catch (e) {
            console.error('Failed to load definitions:', e);
            this.objectDefinitions = this.objectDefinitions || {};
            this.enemyDefinitions = this.enemyDefinitions || {};
            this.items = this.items || {};
            this.weaponClasses = this.weaponClasses || {};
        }
        this.updateEquipHud();
        this.updateEffectTestHud();
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(65, 4 / 3, 0.1, 100);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.internalWidth, this.internalHeight, false);

        // Lighting
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        this.dirLight.position.set(10, 20, 10);
        this.scene.add(this.dirLight);

        this.particles = new ParticleSystem(this.scene);
        this.scene.add(this.camera); // カメラに固定した画面上のエフェクト（斬撃）を描画するため、カメラをシーンに入れる
        this.slashEffects = new SlashEffectSystem(this.camera);
    }

    // 建物などへの出入り: 行き先 nextMap へ移動する。扉・門のマスごとの指定は、マップの links（"列,行": { nextMap, message, params, back }）
    //   nextMap が '$back' なら、直前に入った場所の、link.back の位置へ戻る（建物の出口用）。params は行き先マップへ渡す値（店の種類など）
    enterMap(nextMap, link = {}) {
        // 移動中（マップの読み込み中）は何もしない。呼ばれるたびに戻る先を記録して、出口で別の場所へ飛ぶのを防ぐ
        const plan = this.nav.plan(this.currentMapId, nextMap, link, this.currentMapData?.nextMap);
        if (plan) this.loadMap(plan.mapId, plan.opts);
    }

    async loadMap(mapId, opts = {}) {
        if (this.nav.busy) return;   // 読み込み中は、次の移動を受け付けない
        this.nav.busy = true;
        this.loadingMap = true;   // 読み込み中は、更新・描画を止める（作りかけの画面や、前のマップの位置のままの画面が、一瞬映らない。前の画面のまま止まる）
        try {
            await this.loadMapBody(mapId, opts);
        } finally {
            this.nav.busy = false;
            this.loadingMap = false;
            this.clock?.getDelta();   // 止めていた間の時間を、捨てる（切り替え直後に、大きな時間が、一度に進まない）
        }
    }

    async loadMapBody(mapId, opts = {}) {
        if (!opts.keepStack) this.nav.clear();   // 画面の切り替えボタンなどで直接移動したら、戻る先の記録は捨てる
        this.mapParams = opts.params ?? {};
        const fromMapId = this.currentMapId;   // 移動前のマップ（出現位置の切り替えに使う）
        this.currentMapId = mapId;

        if (!this.objectDefinitions) {
            await this.loadObjectDefinitions();
        }
        // 外のマップの世界の並び（world.json）。端の移動に使う。読めなければ、端の移動はなし
        if (this.world === undefined) {
            try { this.world = await (await fetch('/data/world.json')).json(); } catch { this.world = null; }
        }
        // 端の移動のときは、空と霧と光の色を、前のマップから数秒かけて切り替える
        const prevEnv = opts.edgeBlend ? this.snapshotEnv() : null;

        let mapData = this.mapCache[mapId];
        if (!mapData) {
            try {
                mapData = await fetchMap(mapId);
                this.mapCache[mapId] = mapData;
            } catch (err) {
                console.error(`Failed to load map data for ${mapId}:`, err);
                return;
            }
        }
        this.mapData = mapData;

        this.resetScene();

        this.colliders = [];
        this.monsters = [];
        this.projectiles = [];
        this.portals = [];   // ポータル（次のマップへの入口）。マップに複数置ける
        this.waterMeshes = [];
        this.seaCells = [];
        this.heatHazePlanes = [];
        this.treeSprites = [];   // 木のスプライト（前のマップの木が溜まって、毎フレームの処理が増えないよう、マップごとに空にする）
        this.cullSprites = [];   // 遠くで隠す飾りのスプライト（草・花）
        this.cullChunks = [];   // 木・草・花の板の区画（マップを作り終えたあとに、buildCullChunks で作る）
        this.minimapBase = null; // ミニマップの、動かない部分（壁）の絵
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
        this.npcTextures = this.npcTextures || {};
        this.activeEnemyCards = [];
        const enemyListEl = document.getElementById('enemyHudList');
        if (enemyListEl) enemyListEl.innerHTML = '';

        const env = mapData.environment || {};
        // Environment lighting and fog
        this.ambientLight.color.setHex(env.ambientLight || 0x555555);
        this.dirLight.color.setHex(env.directionalLight || 0xffffff);
        this.scene.fog = new THREE.Fog(env.fogColor || 0x000000, env.fogNear || 10, env.fogFar || 50);
        this.fitCameraFar();
        // 地形ごとの視界係数（敵の感知距離・未発見の敵の描画距離に掛かる。未指定は 1.0）
        this.visibility = env.visibility ?? 1.0;
        this.scene.background = new THREE.Color(env.skyColor || 0x000000);
        this.envBlend = null;
        if (prevEnv) {
            this.envBlend = { t: 0, dur: 3, from: prevEnv, to: this.snapshotEnv() };
            this.applyEnvBlend(0);
        }

        const rows = mapData.layout.length;
        const cols = mapData.layout[0].length;
        const tileSize = mapData.tileSize || 4;
        const wallH = mapData.wallHeight || 4;

        // Pre-build terrain lookup grid
        const waterMap = Array.from({ length: rows }, () => Array(cols).fill(false));
        const holeFloorMap = Array.from({ length: rows }, () => Array(cols).fill(false));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const char = mapData.layout[r][c];
                const objType = mapData.legend ? mapData.legend[char] : null;
                const objDef = objType ? this.objectDefinitions[objType] : null;
                if (objDef && (objDef.type === 'liquid_tile' || objDef.type === 'sea_tile' || objDef.waterBelow)) {   // waterBelow: 橋の下に水（床は敷かない）
                    waterMap[r][c] = true;
                }
                if (objDef && objDef.type === 'crumbling_floor') {
                    holeFloorMap[r][c] = true; // Crumbling floor has a deep bottomless pit cavity instead of normal floor!
                }
                if (objDef && objDef.type === 'stairs' && objDef.direction === 'down') {
                    holeFloorMap[r][c] = true; // 下り階段は、床に四角い穴を開けて、段を下へ降ろす
                }
            }
        }

        // 起伏のあるマップ: heights（1 マス 1 文字の高さの段。0〜9、a〜z。省略は 0）を読み込む。段の高さは heightStep（省略は 1.0）
        this.heightMap = null;
        this.heightStep = mapData.heightStep ?? 1.0;
        this.fallDamagePerLevel = mapData.fallDamagePerLevel ?? 8;
        if (mapData.heights) {
            this.heightMap = mapData.heights.map(row => Array.from(row, ch => parseInt(ch, 36) || 0));
        }
        // 吊橋（type: bridge_deck）のマス: 床（歩く高さ）は heights だが、地形（地面・崖の面）は、下の谷の底（bridgeUnder）の高さで作る
        this.bridgeCells = new Set();
        this.bridgeUnder = mapData.bridgeUnder ?? 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this.objectDefinitions[mapData.legend?.[mapData.layout[r][c]]]?.type === 'bridge_deck') this.bridgeCells.add(`${r},${c}`);
            }
        }

        // 1. Grid-based Floor Generation (carving holes for sunken water tiles and crumbling pitfall cavities)
        // 地面の種類: 既定は environment.floorType。マップの floorLayer（行ごとの文字列）と floorLegend（文字 → 地面の種類）で、マスごとに変えられる
        //   （広い世界で、草原・砂地・雪などが、同じマップの中に混ざる。物体（木・草）を置いても、地面は変わらない）
        const floorMats = new Map();
        const floorMatOf = (ft) => {
            if (!floorMats.has(ft)) floorMats.set(ft, new THREE.MeshLambertMaterial({ map: this.floorTextureOf(ft) }));
            return floorMats.get(ft);
        };
        const floorTypeAt = (r, c) => {
            const ch = mapData.floorLayer?.[r]?.[c];
            return (ch !== undefined && mapData.floorLegend?.[ch]) || env.floorType;
        };
        const baseFloorMat = floorMatOf(env.floorType);
        const cellGeo = new THREE.PlaneGeometry(tileSize, tileSize);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (waterMap[r][c] || holeFloorMap[r][c]) continue; // Water and crumbling pits do not have base floor at Y=0!
                if (this.terrainLevelAtTile(r, c) > 0) continue;   // 高くなっている所は、下の面を描かない（buildHeightTerrain が、上面と側面を作る）

                const wx = c * tileSize + tileSize / 2;
                const wz = r * tileSize + tileSize / 2;

                const cellMesh = new THREE.Mesh(cellGeo, floorMatOf(floorTypeAt(r, c)));
                cellMesh.rotation.x = -Math.PI / 2;
                cellMesh.position.set(wx, 0, wz);
                this.addStatic(cellMesh);
            }
        }

        if (this.heightMap) this.buildHeightTerrain(mapData, rows, cols, tileSize, floorMats, floorMatOf, floorTypeAt);

        // 外のマップ（world.json にあるマップ）: 隣のマップがある方向は、端の外へ、隣の地面が遠くまで続く（外に出ると、隣のマップへ切り替わる）
        await this.buildOutsideGround(mapId, cols, rows, tileSize, mapData, floorMatOf);

        // Ceiling mesh if specified
        this.strikeEffects.setCeilingHeight(env.hasCeiling ? wallH : null);
        if (env.hasCeiling) {
            const ceilGeo = new THREE.PlaneGeometry(cols * tileSize, rows * tileSize);
            let ceilTex = this.textures.brick;
            if (env.ceilingTexture && this.textures[env.ceilingTexture]) {
                ceilTex = this.textures[env.ceilingTexture];
            } else if (env.ceilingTexture === 'rock') {
                ceilTex = this.textures.rock;
            }
            const ceilMat = this.makeLitMaterial(env.ceilingTexture, ceilTex);
            const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set((cols * tileSize) / 2, wallH, (rows * tileSize) / 2);
            this.addStatic(ceiling);
        }

        // Shared reusable materials & geometries
        const brickMat = new THREE.MeshLambertMaterial({ map: this.textures.brick });
        const rockMat = new THREE.MeshLambertMaterial({ map: this.textures.rock });
        const standardWallGeo = new THREE.BoxGeometry(tileSize, wallH, tileSize);

        // Spawn objects based on map layout & legend
        // 起伏のあるマップ: 高くなっているマスに置く、木・草・壁などは、そのマスの高さだけ持ち上げて置く（scene.add を、その間だけ差し替える）
        const LIFT_TYPES = new Set(['block', 'tree', 'boulder', 'plant', 'tree_wall', 'furniture', 'floor_tile', 'wooden_fence', 'chest', 'portal']);   // 高低差のあるマスで、そのマスの高さまで持ち上げる種類。宝箱・ポータルも（高台で、床に埋まらない）
        // 見た目の共通部品（visualBlock など。隣のマップの先読み描画 buildNeighborDecor と共通）が使う、今のマップの環境
        const visEnv = {
            rows, cols, wallH, tileSize, brickMat, standardWallGeo,
            charAt: (cc, rr) => mapData.layout[rr]?.[cc],
            defOf: (ch) => this.objectDefinitions[mapData.legend?.[ch]],
            add: (o, isStatic) => { if (isStatic) o.userData.static = true; this.scene.add(o); }
        };
        const origSceneAdd = this.scene.add;
        const unlift = () => { if (this.scene.add !== origSceneAdd) this.scene.add = origSceneAdd; };
        // 地面の影の元（マップを作り終えたあと、buildGroundShadows が、InstancedMesh にまとめる）: 丸い影（単体の物）と、壁の足元の帯
        this.groundShadowItems = { round: [], edges: [] };
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                unlift();
                const char = mapData.layout[r][c];
                if (char === '0' || char === ' ') continue;

                const wx = c * tileSize + tileSize / 2;
                const wz = r * tileSize + tileSize / 2;

                let enemyTile = false;
                // 1. Check if char represents an enemy
                const enemyType = mapData.enemies ? mapData.enemies[char] : null;
                if (enemyType && this.enemyDefinitions && this.enemyDefinitions[enemyType]) {
                    const enemyDef = this.enemyDefinitions[enemyType];
                    const m = new Monster(enemyType, wx, wz, this.textures, enemyDef);
                    m.floorY = this.heightLevelAtTile(r, c) * this.heightStep;
                    this.attachMonsterHooks(m);
                    m.sprite.position.y = m.floorY;
                    this.monsters.push(m);
                    this.scene.add(m.sprite);
                    if (!mapData.enemyFloor?.chars?.includes(char)) continue;
                    enemyTile = true;   // enemyFloor: { floor, chars }。chars の敵のマスにも、その床（ピラミッドの石の床など）を敷く
                }

                // 2. Check if char represents an object
                const objType = enemyTile ? mapData.enemyFloor.floor : (mapData.legend ? mapData.legend[char] : null);
                const objDef = objType ? this.objectDefinitions[objType] : null;

                if (!objDef) {
                    continue;
                }

                const liftH = this.heightLevelAtTile(r, c) * this.heightStep;
                // 地面の影: groundShadow（立て札・像・噴水など単体の物）は丸い影、baseShadow（建物・壁）は、開けた側の足元に帯の影
                if (objDef.groundShadow || objDef.baseShadow) {
                    const lifted = (LIFT_TYPES.has(objDef.type) || objDef.lift) ? liftH : 0;   // 物体が持ち上がる高さ（持ち上げない種類は 0）
                    if (objDef.groundShadow) {
                        const d = objDef.shadowSize ?? (objDef.type === 'signpost' ? (objDef.scale?.[0] ?? 1.9) * 0.9 : (objDef.radius ?? 0.5) * 2.6);   // 影の直径: 物の幅から決める
                        this.groundShadowItems.round.push({ x: wx, z: wz, y: lifted, d });
                    }
                    if (objDef.baseShadow) {
                        const lvl = this.heightLevelAtTile(r, c);
                        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                            const rr = r + dr, cc = c + dc;
                            if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
                            if (this.objectDefinitions[mapData.legend?.[mapData.layout[rr][cc]]]?.type === 'block') continue;   // 隣が壁・建物なら、足元ではない
                            if (this.heightLevelAtTile(rr, cc) !== lvl) continue;   // 段差のある側は、帯が浮く・埋まるので、置かない
                            this.groundShadowItems.edges.push({ x: wx + dc * tileSize / 2, z: wz + dr * tileSize / 2, ox: dc, oz: dr, y: lifted });
                        }
                    }
                }
                if (liftH > 0 && (LIFT_TYPES.has(objDef.type) || objDef.lift) && !(objDef.type === 'floor_tile' && objDef.elevation > 0)) {   // lift: true の定義（頂上の入口の扉など）は、種類に関係なく、高さだけ持ち上げる
                    this.scene.add = function (o) { o.position.y += liftH; return origSceneAdd.call(this, o); };
                }

                // タイルの種類ごとの描画は、/js/game/tiles*.js（tileBuilders）。this は GameEngine のまま渡す
                const buildTile = tileBuilders[objDef.type];
                if (buildTile) {
                    const pending = buildTile.call(this, { c, char, cols, liftH, mapData, objDef, r, rows, standardWallGeo, tileSize, visEnv, wallH, waterMap, wx, wz });
                    if (pending) await pending;
                }
            }
        }

        unlift();   // 持ち上げ用に差し替えた scene.add を元に戻す
        if (this.seaCells.length) this.buildSea(rows, cols, tileSize);

        // 動かない部品（床・天井・壁・家具など）を、材質ごとに1つにまとめる（描画の回数を減らして、CPU の負荷を下げる）
        this.mergeStaticMeshes();
        this.buildGroundShadows(tileSize);   // 立て札・像・噴水などの丸い影と、建物・壁の足元の影（それぞれ 1 つの InstancedMesh）
        this.buildCullChunks();   // 木・草・花の板を、区画ごとにまとめる（遠い区画は、まとめて隠す。毎フレームの走査・判定を減らして、CPU の負荷を下げる）

        // 村人（NPC）: マップの npcs（{ id: npcs.json の ID, x, z: マスの位置 }）。マスの上の床や家具とは独立に置く
        const shop = this.shops?.[this.mapParams.shopId];   // 汎用の店マップ: 入った店の種類（店名・店主）
        for (const n of mapData.npcs || []) {
            const npcId = n.id === '$shopkeeper' ? (shop?.keeper ?? 'merchant_man') : n.id;   // '$shopkeeper' は店ごとの店主に置き換える
            const npcDef = this.npcDefinitions?.[npcId];
            if (!npcDef) continue;
            if (!this.npcTextures[npcId]) {
                const tex = new THREE.TextureLoader().load(npcDef.texture);
                tex.colorSpace = THREE.SRGBColorSpace;   // 写実的な絵なので、色をそのまま出す
                this.npcTextures[npcId] = tex;
            }
            // マップごとに、speed / wanderRadius（歩き回り）を上書きできる（神殿の司祭を、像の前で動かさない、など）
            const def = { ...npcDef, ...(n.speed !== undefined && { speed: n.speed }), ...(n.wanderRadius !== undefined && { wanderRadius: n.wanderRadius }) };
            // ox / oz: マスの中心からのずれ（マス単位。カウンターのそばに立たせるなど。省略は 0）
            const npc = new Npc(npcId, (n.x + (n.ox ?? 0)) * tileSize + tileSize / 2, (n.z + (n.oz ?? 0)) * tileSize + tileSize / 2, this.npcTextures[npcId], def);
            if (n.id === '$shopkeeper' && shop) npc.shopId = this.mapParams.shopId;   // 話しかけて（Eキー）売買のメニューを開ける店主
            else if (n.shopId && this.shops?.[n.shopId]) npc.shopId = n.shopId;      // マップに直接置く店主（神殿の司祭など。店の種類は shops.json の ID）
            this.npcs.push(npc);
            this.scene.add(npc.sprite);
        }

        // Spawn player
        // 別のマップから来たときの出現位置は、マップの spawnFrom（{ 元のマップID: {x, z, angle} }）があればそれを使う
        const spawn = opts.spawn || (fromMapId !== mapId && mapData.spawnFrom?.[fromMapId]) || mapData.spawn;
        this.player.x = spawn.x * tileSize + tileSize / 2;
        this.player.z = spawn.z * tileSize + tileSize / 2;
        if (opts.edgeBlend) this.pushPlayerOutOfWalls();   // 端を越えて、隣のマップの木・岩の中に出たら、近くの空きへ出す
        this.player.lastSafePos = { x: this.player.x, z: this.player.z };
        this.player.angle = spawn.angle || 0;
        this.player.pitch = 0;
        this.player.knockback.set(0, 0, 0);
        this.player.isFalling = false;
        this.player.fallDepth = 0;
        this.player.fallVelocityY = 0;
        this.player.heightLevel = this.heightLevelAt(this.player.x, this.player.z);
        this.player.floorY = this.getFloorHeight(this.player.x, this.player.z);   // 起伏のある所へ出たときは、目線の高さを、すぐ合わせる

        if (!opts.edgeBlend) this.player.status = {};   // 場面が変わったら（端の移動を除く）、状態異常は治る
        // Reset inputs on scene transition to prevent stuck keys
        // （端を越える移動のときは、歩き続けられるよう、リセットしない。押しているキーは、そのまま生かす）
        if (!opts.edgeBlend) Object.keys(this.keys).forEach(k => this.keys[k] = false);

        // Check if player spawns inside a collider and push out safely
        for (const c of this.colliders) {
            const r = this.player.radius;
            if (this.player.x >= c.minX - r && this.player.x <= c.maxX + r &&
                this.player.z >= c.minZ - r && this.player.z <= c.maxZ + r) {
                this.player.x = c.maxX + r + 0.5;
            }
        }

        this.currentMapData = mapData;
        document.getElementById('currentAreaName').innerText = (shop ? `${mapData.name}：${shop.name}` : mapData.name) || '';
    }

    update(dt) {
        if (this.shopMenu) return;   // 店のメニュー中はゲームの時間を止める
        // ヒットストップ中はゲームの時間を止める（描画は続く）
        if (this.hitStop > 0) {
            this.hitStop -= dt;
            return;
        }

        this.updateStamina(dt);

        // Player cooldown & invincibility
        if (this.player.attackCooldown > 0) this.player.attackCooldown -= dt;
        if (this.player.magicCooldown > 0) this.player.magicCooldown -= dt;
        if (this.player.invincibleTimer > 0) {
            this.player.invincibleTimer -= dt;
            if (this.player.invincibleTimer <= 0) this.player.isInvincible = false;
        }

        // MP auto-regeneration
        if (this.player.mp < this.player.maxMp) {
            this.player.mp = Math.min(this.player.maxMp, this.player.mp + 8 * dt);
        }

        // Update Doors (proximity interaction & sliding open animation)
        if (this.updateDoors(dt)) return;   // 打ち切り（マップ移動など）

        // Update Prince of Persia Chompers (Steel Guillotine Clamp Traps)
        this.updateChompers(dt);

        // Update Prince of Persia Floor Spikes (Periodic rhythm: thrusts up and retracts like guillotines)
        this.updatePopSpikes(dt);

        // Update Crumbling Floor Tiles (Falling Floor / Pitfall)
        this.updateCrumblingFloors(dt);

        // Update Wall Dart Traps & Pressure Plates
        this.updateDartTraps(dt);

        // Update Treasure Chests & Mimic Respawns
        const { nearChestInteractable } = this.updateChests(dt);

        // Update Periodic Flamethrower / Fire Jets
        this.updateFireJets(dt);

        // Update Rail Buzzsaws (Sweeping / oscillating saw blade across corridor)
        this.updateBuzzsaws(dt);

        // Proximity check for Signposts and Chests (Display guidance banner while near, hide immediately when leaving)
        this.updateGuidance(nearChestInteractable);

        // Animate liquid surfaces (water, shallow water, lava, swamp)
        this.updateLiquidSurfaces(dt);

        // Turning via Q/E or arrows
        const { worldMoveX, worldMoveZ } = this.updatePlayerMovement(dt);

        // Calculate terrain special effects (Hazards, MP Regen, Spikes)
        const { playerFloorDepth } = this.updateTerrainEffects(dt, worldMoveX, worldMoveZ);

        // Apply knockback to player if any
        this.updateCameraAndKnockback(dt, playerFloorDepth);

        // 外のマップの端: 隣のマップがない端の外へは出られず、隣がある端の外へ出ると、隣のマップへ切り替わる
        if (this.updateWorldEdge(dt)) return;   // 打ち切り（マップ移動など）

        // Update Portal Animation & Check
        if (this.updatePortals(dt)) return;   // 打ち切り（マップ移動など）

        // Update Projectiles
        this.updateProjectiles(dt);

        // Update Particle System
        this.particles.update(dt);
        this.slashEffects.update(dt);
        this.strikeEffects.update(dt);

        // Update Monsters and Ys-style "Bump Combat"
        this.updatePlayerStatus(dt);
        this.updateCombat(dt);

        // 村人（歩き回る）
        this.updateNpcs(dt);

        // Update Popups
        this.updatePopups(dt);

        // Update UI
        this.updateUI(dt);

        // Render Minimap
        this.renderMinimap();
    }

    /**
     * sdServerから取得したテクスチャをゲーム内の壁や床に差し替える
     */
    render() {
        this.renderer.render(this.scene, this.camera);
    }

    start() {
        // 描画の上限は 60fps（120Hz・144Hz の画面で、必要以上に回さない。CPU の負荷を下げる）
        const MIN_FRAME_MS = 1000 / 60 - 1;
        let last = 0;
        const loop = (now) => {
            requestAnimationFrame(loop);
            if (now - last < MIN_FRAME_MS) return;
            last = now;
            if (this.loadingMap) return;   // マップの読み込み中は、更新も描画もしない（前の画面のまま）
            const dt = Math.min(0.1, this.clock.getDelta());
            this.update(dt);
            if (!this.loadingMap) this.render();   // この更新で、マップの読み込みが始まったとき（端を越えたとき）は、作りかけの画面を描かない（読み込みの最初の部分は、同じフレームの中で、すぐ実行され、床の一部だけ作られる）
        };
        requestAnimationFrame(loop);
    }
}

// 部品（public/js/game/*.js）のメソッドを、GameEngine に組み込む
Object.assign(GameEngine.prototype, updateWorldMethods, updatePlayerMethods, mapSceneryMethods, renderSupportMethods, movementMethods, equipmentMethods, combatMethods, hudMethods, interactMethods, controlsMethods, textureSetupMethods);
