import * as THREE from '/js/three.module.js';
import { RetroTextureGenerator } from '/js/textures.js';
import { Monster, Projectile } from '/js/entities.js';
import { Npc } from '/js/npc.js';
import { MapNavigator, stairsFacing, STAIRS_DIRS } from '/js/mapNavigator.js';
import { worldNeighbor, edgeCrossing, clampToWorld } from '/js/world.js';
import { groundStepOk, bridgeLayerLevel } from '/js/enemyBehavior.js';
import { SoundFX } from '/js/audio.js';
import { SDAssetManager } from '/js/sdAssetManager.js';
import { ParticleSystem } from '/js/particles.js';
import { SlashEffectSystem } from '/js/slashEffect.js';
import { StrikeEffectSystem } from '/js/strikeEffect.js';

// テスト用: 走る速さ（Shift）の倍率。広い世界を、すばやく見て回るため。通常の速さに戻すときは 1 にする（歩く速さは、そのまま）
export const TEST_RUN_SPEED_SCALE = 5;

// 木の足元の影（暗い緑の丸い板）を置くか。雪原などで目立つため、いったん、すべてなくした（true で、小さな木だけ、影が戻る。2 倍・3 倍の木は、noShadow で、いつも、影なし）
export const TREE_SHADOWS = false;

// 端の向こうに描く、隣のマップの地形の幅（マス）。最小 16・最大 32。境の高さに合わせて広げ、1 マスに 1 段までの傾きで、高さ 0 へ下げる（高い所の端で、急な崖にならない）
export const OUTSIDE_TERRAIN_MIN_DEPTH = 16;
export const OUTSIDE_TERRAIN_MAX_DEPTH = 32;

// 被弾リアクション（突進の命中時）の調整値
//   ヒットストップ: 命中した瞬間にゲームの時間を一瞬止める（秒）。重い武器・会心・撃破で長くなる
//   カメラの揺れ: 会心・撃破・重い武器の命中で、画面を短く揺らす（amp=揺れの大きさ、duration=秒）
// 斬撃エフェクトの強さ（SlashEffectSystem.spawn の power）: 会心・撃破で大きく・多くの火花になる
// 足音: 歩いた距離がこの値（ワールド単位）に達するたびに1回鳴らす
const FOOTSTEP_STRIDE = 3.2;

const EFFECT_POWER = { normal: 1.0, crit: 1.4, kill: 1.2 };
const effectPower = (crit, killed) => (crit ? EFFECT_POWER.crit : EFFECT_POWER.normal) * (killed ? EFFECT_POWER.kill : 1);

const HIT_FEEDBACK = {
    hitStop: { charge: 0.05, crit: 0.08, kill: 0.10, heavyBonus: 0.03, blast: 0.04 },
    shake: { amp: 0.08, duration: 0.15 }
};

const SHOP_PAGE_SIZE = 6;   // 販売一覧の 1 画面あたりの件数

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

    initTextures() {
        const loader = new THREE.TextureLoader();
        const denseForestTex = loader.load('/images/objects/dense_forest.jpg');
        denseForestTex.magFilter = THREE.NearestFilter;
        denseForestTex.minFilter = THREE.NearestFilter;

        const barrierTex = loader.load('/images/objects/barrier_dq.png?v=' + Date.now());
        barrierTex.magFilter = THREE.NearestFilter;
        barrierTex.minFilter = THREE.NearestFilter;
        barrierTex.wrapS = THREE.RepeatWrapping;
        barrierTex.wrapT = THREE.RepeatWrapping;
        barrierTex.repeat.set(2, 2);

        const mossyCaveTex = loader.load('/images/objects/mossy_cave_rock.jpg');
        mossyCaveTex.magFilter = THREE.NearestFilter;
        mossyCaveTex.minFilter = THREE.NearestFilter;

        const forestCanopyTex = loader.load('/images/objects/forest_canopy_treeline.png');
        forestCanopyTex.magFilter = THREE.NearestFilter;
        forestCanopyTex.minFilter = THREE.NearestFilter;

        const firePillarTex = loader.load('/images/effects/fire_pillar.png?v=' + Date.now());
        firePillarTex.magFilter = THREE.NearestFilter;
        firePillarTex.minFilter = THREE.NearestFilter;

        this.textures = {
            brick: RetroTextureGenerator.createBrickTexture(),
            brickWindow: RetroTextureGenerator.createBrickWindowTexture(),
            floorStone: RetroTextureGenerator.createStoneFloorTexture(),
            grass: RetroTextureGenerator.createGrassTexture(),
            sand: RetroTextureGenerator.createSandTexture(),
            shallowWater: RetroTextureGenerator.createShallowWaterTexture(),
            water: RetroTextureGenerator.createWaterTexture(),
            lava: RetroTextureGenerator.createLavaTexture(),
            heatHaze: RetroTextureGenerator.createHeatHazeTexture(),
            poisonSwamp: RetroTextureGenerator.createPoisonSwampTexture(),
            ice: RetroTextureGenerator.createIceTexture(),
            woodBridge: RetroTextureGenerator.createWoodBridgeTexture(),
            cobblestone: RetroTextureGenerator.createCobblestonePathTexture(),
            magicCircle: RetroTextureGenerator.createMagicCircleTexture(),
            electricBarrier: barrierTex,
            spikeTrap: RetroTextureGenerator.createSpikeTrapTexture(),
            pitfall: RetroTextureGenerator.createPitfallTexture(),
            door: RetroTextureGenerator.createDoorTexture(),
            mossyStone: mossyCaveTex,
            rock: RetroTextureGenerator.createRockWallTexture(),
            slime: RetroTextureGenerator.createSlimeTexture(),
            skeleton: RetroTextureGenerator.createSkeletonTexture(),
            goblin: RetroTextureGenerator.createGoblinTexture(),
            goblinArcher: RetroTextureGenerator.createGoblinArcherTexture(),
            tree: RetroTextureGenerator.createTreeTexture(),
            swampTree: RetroTextureGenerator.createSwampTreeTexture(),
            fGrassTree: RetroTextureGenerator.createFieldImageTexture('grass_tree'),
            fSwampTreeA: RetroTextureGenerator.createFieldImageTexture('swamp_tree_a'),
            fSwampTreeDead: RetroTextureGenerator.createFieldImageTexture('swamp_tree_dead'),
            fTropicalTree: RetroTextureGenerator.createFieldImageTexture('tropical_tree'),
            fPalm: RetroTextureGenerator.createFieldImageTexture('palm'),
            fRiversideTree: RetroTextureGenerator.createFieldImageTexture('riverside_tree'),
            fHedgeWall: RetroTextureGenerator.createFieldImageTexture('forest_hedge_wall'),
            fCactus: RetroTextureGenerator.createFieldImageTexture('cactus'),
            fSucculent: RetroTextureGenerator.createFieldImageTexture('succulent'),
            fConiferWall: RetroTextureGenerator.createFieldImageTexture('conifer_wall'),
            fOddTree: RetroTextureGenerator.createFieldImageTexture('desert_odd_tree'),
            fTundraConifers: RetroTextureGenerator.createFieldImageTexture('tundra_conifers'),
            fConiferTreeA: RetroTextureGenerator.createFieldImageTexture('conifer_tree_a'),
            fConiferTreeB: RetroTextureGenerator.createFieldImageTexture('conifer_tree_b'),
            fBroadleafWall: RetroTextureGenerator.createFieldImageTexture('broadleaf_wall'),
            fTundraWall: RetroTextureGenerator.createFieldImageTexture('tundra_wall'),
            fJungleTree: RetroTextureGenerator.createFieldImageTexture('jungle_tree'),
            fFern: RetroTextureGenerator.createFieldImageTexture('fern'),
            fCattailCluster: RetroTextureGenerator.createFieldImageTexture('cattail_cluster'),
            fCattailSingle: RetroTextureGenerator.createFieldImageTexture('cattail_single'),
            fPathFlower: RetroTextureGenerator.createFieldImageTexture('path_flower'),
            fBushFlower: RetroTextureGenerator.createFieldImageTexture('bush_flower'),
            fLavenderFlower: RetroTextureGenerator.createFieldImageTexture('lavender_flower'),
            fRoadsideFlowers: RetroTextureGenerator.createFieldImageTexture('roadside_flowers'),
            fWeedFlower: RetroTextureGenerator.createFieldImageTexture('weed_flower'),
            fMarshFlower: RetroTextureGenerator.createFieldImageTexture('marsh_flower'),
            fFlowerbedFlower: RetroTextureGenerator.createFieldImageTexture('flowerbed_flower'),
            fRoadWeed: RetroTextureGenerator.createFieldImageTexture('road_weed'),
            fHighlandWeed: RetroTextureGenerator.createFieldImageTexture('highland_weed'),
            fMarshWeed: RetroTextureGenerator.createFieldImageTexture('marsh_weed'),
            fMeadowGrass: RetroTextureGenerator.createFieldImageTexture('meadow_grass'),
            fMarshGrass: RetroTextureGenerator.createFieldImageTexture('marsh_grass'),
            fHighlandGrass: RetroTextureGenerator.createFieldImageTexture('highland_grass'),
            fAridGrass: RetroTextureGenerator.createFieldImageTexture('arid_grass'),
            fAridGrassThick: RetroTextureGenerator.createFieldImageTexture('arid_grass_thick'),
            fRockA: RetroTextureGenerator.createFieldImageTexture('rock_a'),
            fRockB: RetroTextureGenerator.createFieldImageTexture('rock_b'),
            fRockC: RetroTextureGenerator.createFieldImageTexture('rock_c'),
            fRockD: RetroTextureGenerator.createFieldImageTexture('rock_d'),
            reed: RetroTextureGenerator.createReedTexture(),
            dryTuft: RetroTextureGenerator.createDryTuftTexture(),
            desertSand: RetroTextureGenerator.createDesertSandTexture(),
            cliffGray: RetroTextureGenerator.createCliffTexture(['#7d7a78', '#6c6967', '#8a8683', '#5e5b5a', '#928e88'], '#2a2827'),
            cliffSand: RetroTextureGenerator.createCliffTexture(['#b8845a', '#a67448', '#c4936a', '#97653d', '#cfa07a'], '#4a2e1c', 31),
            cliffDark: RetroTextureGenerator.createCliffTexture(['#4a4344', '#3b3536', '#574f50', '#2f2a2b', '#625858'], '#120f10', 77),
            snowGround: RetroTextureGenerator.createSpeckleFloorTexture('#f4f8ff', ['#ffffff', '#e2eaf4', '#eaf0f8']),
            forestGround: RetroTextureGenerator.createSpeckleFloorTexture('#667744', ['#566a38', '#788a50', '#876c46', '#6c5838']),   // 森の地面: 普通の、緑と茶の落ち葉の色（暗さは、環境の光と霧で出す。床自体を黒くしない）
            rockGround: RetroTextureGenerator.createSpeckleFloorTexture('#6e6a66', ['#59554f', '#85807a', '#4a4642']),
            whiteSand: RetroTextureGenerator.createSpeckleFloorTexture('#fff6d8', ['#fffbe8', '#f0e6c4', '#faf0d0']),
            dryGrassGround: RetroTextureGenerator.createSpeckleFloorTexture('#a89a52', ['#8f8240', '#bcae64', '#7d7338', '#c9bb70']),
            tundraGround: RetroTextureGenerator.createSpeckleFloorTexture('#8d8a70', ['#7a785e', '#a09c80', '#a8a48c', '#6f7a66']),
            redEarthGround: RetroTextureGenerator.createSpeckleFloorTexture('#c0703f', ['#a85a34', '#d48a58', '#b8663a', '#dc9a68']),
            ashGround: RetroTextureGenerator.createSpeckleFloorTexture('#3a3430', ['#2a2522', '#4a423c', '#554a42', '#1f1b19']),
            boulder: RetroTextureGenerator.createBoulderTexture(),
            signpost: RetroTextureGenerator.createSignpostTexture(),
            weaponShopSign: RetroTextureGenerator.createShopSignTexture('weapon'),
            itemShopSign: RetroTextureGenerator.createShopSignTexture('item'),
            innSign: RetroTextureGenerator.createShopSignTexture('inn'),
            barSign: RetroTextureGenerator.createShopSignTexture('bar'),
            weaponShopIcon: RetroTextureGenerator.createShopIconTexture('weapon'),
            itemShopIcon: RetroTextureGenerator.createShopIconTexture('item'),
            templeIcon: RetroTextureGenerator.createShopIconTexture('temple'),
            advGuildIcon: RetroTextureGenerator.createShopIconTexture('adventurer'),
            mageGuildIcon: RetroTextureGenerator.createShopIconTexture('mage'),
            merchantGuildIcon: RetroTextureGenerator.createShopIconTexture('merchant'),
            smithIcon: RetroTextureGenerator.createShopIconTexture('smith'),
            trainingIcon: RetroTextureGenerator.createShopIconTexture('training'),
            thiefGuildIcon: RetroTextureGenerator.createShopIconTexture('thief'),
            barIcon: RetroTextureGenerator.createShopIconTexture('bar'),
            innIcon: RetroTextureGenerator.createShopIconTexture('inn'),
            forestCanopy: forestCanopyTex,
            denseForest: denseForestTex,
            woodWall: RetroTextureGenerator.createWoodWallTexture(),
            woodFloor: RetroTextureGenerator.createWoodFloorTexture(),
            marbleWall: RetroTextureGenerator.createMarbleWallTexture(),
            marbleFloor: RetroTextureGenerator.createMarbleFloorTexture(),
            rug: RetroTextureGenerator.createRugTexture(),
            woodDoor: RetroTextureGenerator.createWoodDoorTexture(),
            grassTuft: RetroTextureGenerator.createGrassTuftTexture(),
            tallGrass: RetroTextureGenerator.createTallGrassTexture(),
            wildFlowers: RetroTextureGenerator.createWildFlowersTexture(),
            woodenFence: RetroTextureGenerator.createWoodenFenceTexture(),
            villageRoof: RetroTextureGenerator.createVillageRoofTexture(),
            dirtRoad: RetroTextureGenerator.createDirtRoadTexture(),
            cityWall: RetroTextureGenerator.createCityWallTexture(),
            shopWall: RetroTextureGenerator.createShopWallTexture(),
            innWall: RetroTextureGenerator.createInnWallTexture(),
            cityRoof: RetroTextureGenerator.createCityRoofTexture(),
            pavedRoad: RetroTextureGenerator.createPavedRoadTexture(),
            fountainWater: RetroTextureGenerator.createFountainWaterTexture(),
            chomperBlade: RetroTextureGenerator.createChomperBladeTexture(),
            popSpikePlate: RetroTextureGenerator.createPoPSpikePlateTexture(),
            crumblingFloor: RetroTextureGenerator.createCrumblingFloorTexture(),
            pressurePlate: RetroTextureGenerator.createPressurePlateTexture(),
            dartDispenser: RetroTextureGenerator.createDartDispenserTexture(),
            chest: RetroTextureGenerator.createChestTexture(),
            mimic: RetroTextureGenerator.createMimicTexture(),
            fireVent: RetroTextureGenerator.createFireVentTexture(),
            buzzsawBlade: RetroTextureGenerator.createBuzzsawBladeTexture(),
            buzzsawRail: RetroTextureGenerator.createBuzzsawRailTexture(),
            swampGround: RetroTextureGenerator.createSwampGroundTexture(),
            firePillar: firePillarTex,
            tarantulaSwamp: RetroTextureGenerator.createTarantulaSwampTexture(),
            parasiteWasp: RetroTextureGenerator.createParasiteWaspTexture(),
            mariaMosquito: RetroTextureGenerator.createMariaMosquitoTexture(),
            acidWorm: RetroTextureGenerator.createAcidWormTexture(),
            poisonMoth: RetroTextureGenerator.createPoisonMothTexture(),
            poisonToad: RetroTextureGenerator.createPoisonToadTexture()
        };
    }

    initControls() {
        window.addEventListener('keydown', (e) => {
            this.sound.init();
            // 店のメニューを開いている間は、メニューの操作だけを受け付ける
            if (this.shopMenu) {
                this.shopMenuKey(e);
                return;
            }
            // カメラ操作: Ctrl+↑↓ で視点の上下、Ctrl+←→ で微調整の旋回（移動・旋回の矢印キーとは別）、Ctrl+0 で視点を水平に戻す
            if (e.ctrlKey) {
                const camKey = { ArrowUp: 'camUp', ArrowDown: 'camDown', ArrowLeft: 'camLeft', ArrowRight: 'camRight' }[e.code];
                if (camKey) {
                    this.keys[camKey] = true;
                    e.preventDefault();
                    return;
                }
                if (e.code === 'Digit0' || e.code === 'Numpad0') {
                    this.player.pitch = 0;
                    e.preventDefault();
                    return;
                }
            }
            switch (e.code) {
                case 'KeyW': case 'ArrowUp':
                    this.keys.forward = true;
                    e.preventDefault();
                    break;
                case 'KeyS': case 'ArrowDown':
                    this.keys.backward = true;
                    e.preventDefault();
                    break;
                case 'KeyA':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                    this.keys.right = true;
                    break;
                case 'ArrowLeft':
                case 'KeyQ':
                    this.keys.turnLeft = true;
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                    this.keys.turnRight = true;
                    e.preventDefault();
                    break;
                case 'KeyE':
                    // E Key: Interact with nearest Chest or Door, or Turn Right if no object near
                    if (!this.interactNearestObject()) {
                        this.keys.turnRight = true;
                    }
                    e.preventDefault();
                    break;
                case 'Space':
                case 'KeyF':
                    this.useMagic();
                    e.preventDefault();
                    break;
                case 'Tab':
                    this.cycleMagic();
                    e.preventDefault();
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.sprint = true;
                    break;
            }
            // 数字キー 1〜4: 魔法スロットの直接選択
            const magicKey = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
            if (magicKey) this.selectMagic(Number(magicKey[1]) - 1);
        });

        window.addEventListener('keyup', (e) => {
            // Ctrl を離したときや、矢印キーを離したときは、カメラ操作も止める
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
                this.keys.camUp = this.keys.camDown = this.keys.camLeft = this.keys.camRight = false;
            }
            const camRelease = { ArrowUp: 'camUp', ArrowDown: 'camDown', ArrowLeft: 'camLeft', ArrowRight: 'camRight' }[e.code];
            if (camRelease) this.keys[camRelease] = false;
            switch (e.code) {
                case 'KeyW': case 'ArrowUp':
                    this.keys.forward = false;
                    break;
                case 'KeyS': case 'ArrowDown':
                    this.keys.backward = false;
                    break;
                case 'KeyA':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                    this.keys.right = false;
                    break;
                case 'ArrowLeft':
                case 'KeyQ':
                    this.keys.turnLeft = false;
                    break;
                case 'ArrowRight':
                case 'KeyE':
                    this.keys.turnRight = false;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.sprint = false;
                    break;
            }
        });

        this.canvas.addEventListener('click', (e) => {
            this.sound.init();
            // マウスモードOFFのときは、クリックでは何もしない（魔法は Space / F）
            if (!this.mouseMode) return;
            if (!this.isPointerLocked) {
                this.canvas.requestPointerLock?.();
            } else {
                // ロック済みのクリックで、選択中の魔法を撃つ
                this.useMagic();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === this.canvas);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isPointerLocked) return;
            const sens = 0.0026;
            this.player.angle -= e.movementX * sens;
            this.player.pitch -= e.movementY * sens;
            this.player.pitch = Math.max(-0.6, Math.min(0.6, this.player.pitch));
        });
    }

    // シーンの子をすべて取り除き、照明とカメラだけを入れ直す。
    // カメラは、カメラに取り付けた画面上のエフェクト（斬撃）を描画するために、シーンに入っている必要がある
    resetScene() {
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
        this.scene.add(this.ambientLight);
        this.scene.add(this.dirLight);
        this.scene.add(this.camera);
    }

    // 地面の種類から、地面のテクスチャを返す
    floorTextureOf(floorType) {
        if (floorType === 'grass') return this.textures.grass;
        if (floorType === 'sand') return this.textures.sand;
        if (floorType === 'desert') return this.textures.desertSand;
        if (floorType === 'water') return this.textures.water;
        if (floorType === 'swamp') return this.textures.swampGround;
        if (floorType === 'snow') return this.textures.snowGround;
        if (floorType === 'forest') return this.textures.forestGround;
        if (floorType === 'rock') return this.textures.rockGround;
        if (floorType === 'whiteSand') return this.textures.whiteSand;
        if (floorType === 'dryGrass') return this.textures.dryGrassGround;
        if (floorType === 'tundra') return this.textures.tundraGround;
        if (floorType === 'redEarth') return this.textures.redEarthGround;
        if (floorType === 'ash') return this.textures.ashGround;
        if (floorType === 'ice') return this.textures.ice;
        return this.textures.floorStone;
    }

    // 今の空・霧・光の色を控える（端の移動で、色を滑らかに切り替えるため）
    snapshotEnv() {
        const fog = this.scene.fog;
        return {
            ambient: this.ambientLight.color.clone(),
            dir: this.dirLight.color.clone(),
            fogColor: fog ? fog.color.clone() : new THREE.Color(0),
            fogNear: fog ? fog.near : 10,
            fogFar: fog ? fog.far : 50,
            sky: this.scene.background?.isColor ? this.scene.background.clone() : new THREE.Color(0)
        };
    }

    // 色の切り替えを、k（0〜1）の分だけ進める
    applyEnvBlend(k) {
        const b = this.envBlend;
        if (!b) return;
        this.ambientLight.color.copy(b.from.ambient).lerp(b.to.ambient, k);
        this.dirLight.color.copy(b.from.dir).lerp(b.to.dir, k);
        this.scene.fog.color.copy(b.from.fogColor).lerp(b.to.fogColor, k);
        this.scene.fog.near = b.from.fogNear + (b.to.fogNear - b.from.fogNear) * k;
        this.scene.fog.far = b.from.fogFar + (b.to.fogFar - b.from.fogFar) * k;
        this.scene.background = b.from.sky.clone().lerp(b.to.sky, k);
        this.fitCameraFar();
    }

    // 霧で見えなくなる距離より先は描画しない（カメラの描画距離を霧の終わりに合わせる。CPU 負荷の軽減）
    fitCameraFar() {
        // 高い所（山の上）では、低い地面（下に見える海・低地）が、霧の終わりより遠くにあり、描画距離で切れて、空が見える（地面に穴が空いたように見える）。
        //   そこで、目の高さ（地面からの高さ）ぶんだけ、描画距離をのばす（霧は同じなので、遠くは霧の色に溶ける）
        const boost = Math.min(160, Math.max(0, (this.camera.position.y - 6) * 8));
        const far = Math.min(100, (this.scene.fog?.far ?? 96) + 4) + boost;
        if (Math.abs(this.camera.far - far) < 3) return;
        this.camera.far = far;
        this.camera.updateProjectionMatrix();
    }

    // マス (行 r, 列 c) の高さの段（起伏のないマップは 0。マップの外は 0）
    //   マップの外のマスは、いちばん近い端のマスの高さ（端を越えるとき、段差にならない。連続した高さの世界で、端の高さが 3 段以上でも、越えられる）
    heightLevelAtTile(r, c) {
        const hm = this.heightMap;
        if (!hm) return 0;
        const rr = Math.min(Math.max(r, 0), hm.length - 1);
        return hm[rr][Math.min(Math.max(c, 0), hm[rr].length - 1)] ?? 0;
    }

    // マス (行 r, 列 c) の、地形（地面・崖の面）の高さの段。吊橋のマスは、橋の下の谷の底（bridgeUnder）の高さ
    terrainLevelAtTile(r, c) {
        return this.bridgeCells?.has(`${r},${c}`) ? this.bridgeUnder : this.heightLevelAtTile(r, c);
    }

    // ワールド座標 (x, z) の高さの段。
    //   ref: 動く者の、今の高さの段（省略可）。吊橋のマスは、層が 2 つ（橋の上＝heights の値・橋の下＝bridgeUnder）で、ref に近いほうの層を返す
    heightLevelAt(x, z, ref) {
        if (!this.heightMap) return 0;
        const ts = this.mapData?.tileSize || 4;
        const r = Math.floor(z / ts), c = Math.floor(x / ts);
        const h = this.heightLevelAtTile(r, c);
        if (this.bridgeCells?.has(`${r},${c}`)) return bridgeLayerLevel(h, this.bridgeUnder, ref);
        return h;
    }

    // 床の高さ（ワールドの y）から、高さの段（吊橋の層を選ぶ ref に使う）
    levelOfFloorY(floorY) {
        return (floorY ?? 0) / (this.heightStep || 1);
    }

    // 起伏のある地面: 高くなっているマスの上面と、低い隣との境の側面を作る。
    //   段差 1 は、地面と同じ模様の側面（歩いて上れる）。段差 2 以上は、崖（岩肌。mapData.cliffTexture、省略は cliffGray）
    buildHeightTerrain(mapData, rows, cols, tileSize, floorMats, floorMatOf, floorTypeAt) {
        const step = this.heightStep;
        const cliffMat = new THREE.MeshLambertMaterial({ map: this.textures[mapData.cliffTexture] || this.textures.cliffGray });
        // 高さごとに、地面の明るさを変える（低い所は少し暗く、高い所は明るく）。起伏が、見て分かるようにする
        //   mapData.heightTint: [最も低い所, 最も高い所] の明るさ（省略は [0.82, 1.0]）。洞窟など、段の高さを強調したいマップは、幅を広げる。
        //   heightTint があるマップは、崖の面も、上の段の高さに応じた明るさにする（段ごとの崖が、見分けやすい）
        //   mapData.sideShade: 段差 1 の側面の明るさ（省略は 0.78。1.0 で、上の面と同じ。なだらかな斜面を、線にしたくないマップ用）
        let maxLv = 1;
        for (const row of this.heightMap) for (const v of row) if (v > maxLv) maxLv = v;
        const [tintLo, tintHi] = mapData.heightTint ?? [0.82, 1.0];
        const tintOf = (lv) => tintLo + (tintHi - tintLo) * Math.min(1, lv / maxLv);
        const cliffMats = new Map();
        const cliffMatFor = (lv) => {
            if (!mapData.heightTint) return cliffMat;
            if (!cliffMats.has(lv)) { const m = cliffMat.clone(); m.color.setScalar(Math.min(1.2, tintOf(lv) * 1.05)); cliffMats.set(lv, m); }
            return cliffMats.get(lv);
        };
        const topMats = new Map(), sideMats = new Map();
        const matFor = (cache, lv, k, ft) => {   // ft: 地面の種類。高さ・種類ごとの材質（明るさを変えた複製）
            const key = `${ft}|${lv}`;
            if (!cache.has(key)) {
                const m = floorMatOf(ft).clone();
                m.color.setScalar(tintOf(lv) * k);
                cache.set(key, m);
            }
            return cache.get(key);
        };
        for (const m of floorMats.values()) m.color.setScalar(tintOf(0));   // 高さ 0 の平らな地面も、同じ基準にそろえる
        const topGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        const dirs = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]];   // [dx(列), dz(行), 向き]
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const h = this.terrainLevelAtTile(r, c);
                if (h <= 0) continue;
                const wx = c * tileSize + tileSize / 2;
                const wz = r * tileSize + tileSize / 2;
                const ft = floorTypeAt(r, c);
                const top = new THREE.Mesh(topGeo, matFor(topMats, h, 1.0, ft));
                top.rotation.x = -Math.PI / 2;
                top.position.set(wx, h * step, wz);
                this.addStatic(top);
                for (const [dx, dz, rotY] of dirs) {
                    const nh = this.terrainLevelAtTile(r + dz, c + dx);
                    const inMap = r + dz >= 0 && r + dz < rows && c + dx >= 0 && c + dx < cols;
                    if (!inMap || nh >= h) continue;
                    const drop = h - nh;
                    const faceH = drop * step;
                    const face = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, faceH), drop >= 2 ? cliffMatFor(h) : matFor(sideMats, h, mapData.sideShade ?? 0.78, ft));
                    face.rotation.y = rotY;
                    face.position.set(wx + dx * tileSize / 2, nh * step + faceH / 2, wz + dz * tileSize / 2);
                    this.addStatic(face);
                }
            }
        }
    }

    // 海: マップの外まで広がる水面 1 枚（深い水の模様。ゆれる）と、海のマスの当たり判定（同じ行の連続を 1 つにまとめる。入れない・弾は通る）
    buildSea(rows, cols, tileSize) {
        const FAR = 400;
        const w = cols * tileSize + FAR * 2, d = rows * tileSize + FAR * 2;
        const geo = new THREE.PlaneGeometry(w, d);
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tileSize, uv.getY(i) * d / tileSize);
        const sea = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.textures.water }));
        sea.rotation.x = -Math.PI / 2;
        sea.position.set(cols * tileSize / 2, -0.2, rows * tileSize / 2);
        this.scene.add(sea);
        this.waterMeshes.push(sea);   // 水の模様のアニメーションを動かす
        const byRow = new Map();
        for (const [r, c] of this.seaCells) { if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(c); }
        for (const [r, cs] of byRow) {
            cs.sort((a, b) => a - b);
            let start = cs[0], prev = cs[0];
            const push = (a, b) => this.colliders.push({ minX: a * tileSize, maxX: (b + 1) * tileSize, minZ: r * tileSize, maxZ: (r + 1) * tileSize, blocksProjectiles: false });
            for (let i = 1; i < cs.length; i++) {
                if (cs[i] !== prev + 1) { push(start, prev); start = cs[i]; }
                prev = cs[i];
            }
            push(start, prev);
        }
    }

    // 弾が、地面（崖の面・斜面）・吊橋の床にぶつかっているか。吊橋のマスは、弾の高さに近い層を地面とし、
    //   橋の下から上へ撃った弾は、橋の床（厚み）に当たって消える
    projectileHitsGround(p) {
        if (p.y < this.getFloorHeight(p.x, p.z, this.levelOfFloorY(p.y))) return true;
        const ts = this.mapData?.tileSize || 4;
        const r = Math.floor(p.z / ts), c = Math.floor(p.x / ts);
        if (this.bridgeCells?.has(`${r},${c}`)) {
            const deckY = this.heightLevelAtTile(r, c) * this.heightStep;
            if (p.y >= deckY - 0.4 && p.y <= deckY) return true;
        }
        return false;
    }

    // 敵に、ゲーム側の処理（地形・召喚・範囲攻撃）をつなぐ
    attachMonsterHooks(m) {
        m.terrainBlock = (mm, x, z) => this.monsterTerrainBlocked(mm, x, z);   // 地上の敵は、崖・毒沼へ進まない
        m.summonHook = (owner, type, max) => this.summonMinion(owner, type, max);
        m.slamHook = (owner, pos, radius, mult) => this.slamAttack(owner, pos, radius, mult);
    }

    // 召喚: 敵（owner）が、仲間（type）を 1 体、近くに呼ぶ。呼んだ数（生きている手下）が max 以上なら、呼ばない
    summonMinion(owner, type, max) {
        const alive = this.monsters.filter(x => x.active && x.minionOf === owner).length;
        if (alive >= max) return null;
        const def = this.enemyDefinitions?.[type];
        if (!def) return null;
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 1.2;
            const x = owner.x + Math.cos(a) * r, z = owner.z + Math.sin(a) * r;
            if (this.isInsideWall(x, z) || this.monsterTerrainBlocked({ x: owner.x, z: owner.z }, x, z)) continue;
            const m = new Monster(type, x, z, this.textures, { ...def, id: type });
            m.floorY = this.getFloorHeight(x, z);
            m.sprite.position.set(x, m.floorY, z);
            m.minionOf = owner;
            m.state = 'chase'; m.lostTimer = 0; m.appearAlpha = 1; m.spriteMat.opacity = 1;
            this.attachMonsterHooks(m);
            this.monsters.push(m);
            this.scene.add(m.sprite);
            this.particles.spawnBurst(x, m.floorY + 1.0, z, 0xa855f7, 12, 3.0);
            this.addPopup(`${owner.name}が、仲間を呼んだ！`, '#c084fc', owner.x, owner.z);
            return m;
        }
        return null;
    }

    // 範囲攻撃: 予兆の輪（pos を中心に、半径 radius）の中に、プレイヤーがいれば、ダメージを与える
    slamAttack(owner, pos, radius, mult) {
        this.particles.spawnBurst(pos.x, (this.player.floorY ?? 0) + 0.3, pos.z, 0xef4444, 24, 5.0);
        this.sound.playBigExplosion?.();
        const d = Math.hypot(this.player.x - pos.x, this.player.z - pos.z);
        if (d <= radius && !this.player.isFalling) {
            const dmg = Math.max(1, Math.floor(owner.attackPower * mult));
            const k = d > 0.01 ? new THREE.Vector3((this.player.x - pos.x) / d, 0, (this.player.z - pos.z) / d) : new THREE.Vector3(0, 0, 0);
            this.addPopup(`範囲攻撃! -${dmg}`, '#ef4444');
            this.playerTakeDamage(dmg, k, 1.2, owner);
        }
    }

    // 地上の敵が、(x, z) へ進めないか: 崖（上り 2 段以上・下り 3 段以上）、毒沼・溶岩などのダメージ床
    monsterTerrainBlocked(m, x, z) {
        if (this.heightMap && !groundStepOk((px, pz) => this.heightLevelAt(px, pz, this.levelOfFloorY(m.floorY)), m.x, m.z, x, z)) return true;
        for (const t of this.terrainGrid) {
            if (t.damagePerSec > 0 && x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ) return true;
        }
        return false;
    }

    // 攻撃力（呪いの間は、下がる）
    playerAttackPower() {
        const c = this.player.status?.curse;
        return this.player.attackPower * (c?.t > 0 ? (c.scale ?? 0.7) : 1);
    }

    // プレイヤーを状態異常にする。type: poison / burn / slow / paralysis / silence / curse。すでに同じ状態なら、長いほうの時間にする
    applyPlayerStatus(type, opt = {}) {
        const names = { poison: '毒', burn: '火傷', slow: '鈍足', paralysis: '麻痺', silence: '沈黙', curse: '呪い' };
        const colors = { poison: '#a3e635', burn: '#fb923c', slow: '#60a5fa', paralysis: '#fde047', silence: '#a78bfa', curse: '#c084fc' };
        this.player.status ??= {};
        const cur = this.player.status[type];
        const t = opt.t ?? 4;
        const fresh = !(cur?.t > 0);
        this.player.status[type] = { ...opt, t: Math.max(cur?.t ?? 0, t), tick: cur?.tick ?? 0.5 };
        if (fresh) this.addPopup(`${names[type] ?? type}！`, colors[type] ?? '#ffffff');
        return fresh;
    }

    // 状態異常の経過（毎フレーム）: 毒・火傷は、0.5 秒ごとに継続ダメージ。時間が切れたら、治る
    updatePlayerStatus(dt) {
        const st = this.player.status;
        if (!st) return;
        for (const type of Object.keys(st)) {
            const e = st[type];
            e.t -= dt;
            if (e.t <= 0) { delete st[type]; continue; }
            if ((type === 'poison' || type === 'burn') && e.dps) {
                e.tick -= dt;
                if (e.tick <= 0) {
                    e.tick += 0.5;
                    const dmg = Math.max(1, Math.round(e.dps * 0.5));
                    this.player.hp = Math.max(0, this.player.hp - dmg);
                    this.sound.playHurt?.();
                    this.particles.spawnBurst(this.player.x, (this.player.floorY ?? 0) + 1.0, this.player.z, type === 'poison' ? 0xa3e635 : 0xfb923c, 4, 1.5);
                    if (this.player.hp <= 0) {
                        this.player.status = {};
                        this.addPopup(type === 'poison' ? 'GAME OVER! 毒で力尽きた…' : 'GAME OVER! 火傷で力尽きた…', '#ef4444');
                        setTimeout(() => { this.player.hp = this.player.maxHp; this.loadMap(this.currentMapId); }, 1000);
                        return;
                    }
                }
            }
        }
    }

    // 敵の攻撃が当たったとき: その敵の特徴（profile.inflict）に応じて、一定の確率で、状態異常にする。生命力を吸う敵は、与えたダメージの一部を回復する
    onPlayerHitBy(monster, damage) {
        const pr = monster?.profile;
        if (!pr) return;
        // 盗む: お金の一部を盗んで、逃げる（倒すと、取り返せる）
        if (pr.steal && !monster.fleeing && (this.player.gold ?? 0) > 0) {
            const amount = Math.min(this.player.gold, Math.max(5, Math.floor(this.player.gold * 0.2)));
            this.player.gold -= amount; monster.stolenGold += amount; monster.fleeing = true;
            this.addPopup(`ゴールドを盗まれた！ -${amount}G`, '#facc15');
        }
        for (const f of pr.inflict ?? []) {
            if (Math.random() < f.chance) this.applyPlayerStatus(f.type, f);
        }
        if (pr.lifesteal > 0 && damage > 0) monster.hp = Math.min(monster.maxHp, monster.hp + damage * pr.lifesteal);
    }

    // 高い所から落ちたときのダメージ（levels: 落ちた段の数。1 段の段差は、落下にしない）
    applyHeightFall(levels) {
        if (this.nav?.busy) return;   // マップ間の移動中は、ダメージなし
        const dmg = Math.round((levels - 1) * this.fallDamagePerLevel);
        if (dmg <= 0) return;
        this.player.hp = Math.max(0, this.player.hp - dmg);
        this.sound.playHurt();
        this.flashDamageScreen();
        this.particles.spawnBurst(this.player.x, this.player.floorY ?? 0, this.player.z, 0xb08d58, 16, 4.0);
        this.addPopup(`高所から落下！ -${dmg}`, '#ef4444');
        if (this.player.hp <= 0) {
            this.addPopup('GAME OVER! 崖から落ちて力尽きた…', '#ef4444');
            setTimeout(() => {
                this.player.hp = this.player.maxHp;
                this.loadMap(this.currentMapId);
            }, 1500);
        }
    }

    // 世界の並びの中のマップなら、隣のマップがある方向の外側に、隣の地面を遠くまで敷く。隣がない方向は、何も描かない（空だけ）
    async buildOutsideGround(mapId, cols, rows, tileSize) {
        const world = this.world;
        if (!world || !world.grid?.some(r => r.includes(mapId))) return;
        const W = cols * tileSize, D = rows * tileSize, FAR = 400;
        // 4 方向の隣のマップを、同時に読み込む（順に待つと、読み込みが遅くなる）
        await Promise.all(['north', 'south', 'west', 'east'].map(async (dir) => {
            const nid = worldNeighbor(world, mapId, dir);
            if (!nid || this.mapCache[nid]) return;
            try { this.mapCache[nid] = await (await fetch(`/data/maps/${nid}.json`)).json(); } catch { /* 読めなければ、隣の地形は描かない */ }
        }));
        const floorOf = async (dir) => {
            const nid = worldNeighbor(world, mapId, dir);
            if (!nid) return null;
            let nd = this.mapCache[nid];
            if (!nd) {
                try { nd = await (await fetch(`/data/maps/${nid}.json`)).json(); this.mapCache[nid] = nd; } catch { return null; }
            }
            return nd.environment?.floorType;
        };
        // 各方向の、地面の四角（中心 x, z と大きさ w, d）。角は、南北の隣の地面にする
        const strips = {
            north: [W / 2, -FAR / 2, W + FAR * 2, FAR],
            south: [W / 2, D + FAR / 2, W + FAR * 2, FAR],
            west: [-FAR / 2, D / 2, FAR, D],
            east: [W + FAR / 2, D / 2, FAR, D]
        };
        for (const dir of Object.keys(strips)) {
            if (!worldNeighbor(world, mapId, dir)) continue;
            const ft = await floorOf(dir);
            const [cx, cz, w, d] = strips[dir];
            const tex = this.floorTextureOf(ft).clone();
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(w / tileSize, d / tileSize);
            tex.needsUpdate = true;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex }));
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(cx, -0.01, cz);
            this.scene.add(mesh);
        }
        // 端の向こうの、隣のマップの地形（高さ・地面の種類・水）を、端から 16〜32 マスの幅で描く（端が高い所で、高い所から下へ落ちるように見えないため）
        for (const dir of Object.keys(strips)) {
            const nid = worldNeighbor(world, mapId, dir);
            if (!nid) continue;
            let nd = this.mapCache[nid];
            if (!nd) { try { nd = await (await fetch(`/data/maps/${nid}.json`)).json(); this.mapCache[nid] = nd; } catch { continue; } }
            if (nd?.heights) this.buildNeighborTerrain(dir, nd, cols, rows, tileSize);
        }
    }

    // 隣のマップ nd の、境から 16〜32 マス（境の高さに合わせる）の地形を、このマップの外側に描く。
    //   高さは、隣のマップの heights（境の高さに合わせて広げ、1 マスに 1 段までの傾きで、なだらかに 0 へ下げる）。地面は floorLayer の種類。水（川・湖・海）は、水面。木・草は、描かない。
    buildNeighborTerrain(dir, nd, cols, rows, ts) {
        const W = cols * ts, D = rows * ts;
        const nrows = nd.layout.length, ncols = nd.layout[0].length;
        const step = nd.heightStep ?? 1;
        const horizontal = (dir === 'east' || dir === 'west');   // 境が縦（東西）なら、境に沿って行を並べる
        const along = horizontal ? rows : cols;
        // 隣のマップのマス（境から k 番目・境に沿って i 番目）
        const tileAt = (k, i) => {
            if (dir === 'east') return [i, k];
            if (dir === 'west') return [i, ncols - 1 - k];
            if (dir === 'south') return [k, i];
            return [nrows - 1 - k, i];
        };
        // 幅: 境の高さ（最大の段）に合わせる。1 マスに 1 段までの傾きで 0 へ下げるので、高い端ほど、広く描く
        let edgeMax = 0;
        for (let i = 0; i < along; i++) {
            const [tr, tc] = tileAt(0, i);
            edgeMax = Math.max(edgeMax, parseInt(nd.heights[tr]?.[tc] ?? '0', 36) || 0);
        }
        const DEPTH = Math.min(OUTSIDE_TERRAIN_MAX_DEPTH, Math.max(OUTSIDE_TERRAIN_MIN_DEPTH, edgeMax + 2));
        const info = [];   // [k][i] = { h, water, shallow, ft }
        for (let k = 0; k < DEPTH; k++) {
            const row = [];
            for (let i = 0; i < along; i++) {
                const [tr, tc] = tileAt(k, i);
                const ch = nd.layout[tr]?.[tc] ?? '0';
                const def = ch === '0' ? null : this.objectDefinitions?.[nd.legend?.[ch]];
                const isWater = !!def && (def.type === 'liquid_tile' || def.type === 'sea_tile' || !!def.waterBelow);
                // 高さ（段）: 隣の高さと、「境からの距離ぶんだけ、1 マスに 1 段で下がる線」の、低いほう（なだらかに 0 へ）
                const lv = Math.min(parseInt(nd.heights[tr]?.[tc] ?? '0', 36) || 0, DEPTH - k);
                const fch = nd.floorLayer?.[tr]?.[tc];
                row.push({ h: lv * step, water: isWater, shallow: !!def && (def.texture === 'shallowWater' || !!def.waterBelow), ft: (fch !== undefined && nd.floorLegend?.[fch]) || nd.environment?.floorType });
            }
            info.push(row);
        }
        // なめらかな 1 枚の面（頂点の高さ・色は、まわりのマスの平均）。1 マスずつの板にすると、雪と草の境や 1 段の段差が、四角い板になり、遠くで宙に浮いて見えた。
        //   水（川・湖・海）のマスは、高さ 0・青い色。頂点は、境の線の上（k: 境から離れる向き・i: 境に沿う向き）に、(DEPTH+1)×(along+1) 個
        const FLOOR_COLOR = { grass: 0x5b7f3a, snow: 0xe6edf5, forest: 0x55663a, desert: 0xd6be82, rock: 0x77706a, whiteSand: 0xece4c8, tundra: 0x8d8a70, dryGrass: 0xa89a52, redEarth: 0xc0703f, ash: 0x4a4440, ice: 0xaad7f0, swamp: 0x3a4a30, sand: 0xd8c690 };
        const WATER_DEEP = 0x2a4fa0, WATER_SHALLOW = 0x6fbad8;
        const cornerXZ = (k, i) => {
            if (dir === 'east') return [W + k * ts, i * ts];
            if (dir === 'west') return [-k * ts, i * ts];
            if (dir === 'south') return [i * ts, D + k * ts];
            return [i * ts, -k * ts];
        };
        // 地面の色: 床のテクスチャの平均の色（実際の床と、同じ色合いにする）。取れなければ、上の表の色
        this.outsideColors = this.outsideColors || new Map();
        const floorColor = (ft) => {
            if (!this.outsideColors.has(ft)) {
                let col = new THREE.Color(FLOOR_COLOR[ft] ?? 0x5b7f3a);
                try {
                    const img = this.floorTextureOf(ft)?.image;
                    if (img && (img.width || img.naturalWidth)) {
                        const cv = document.createElement('canvas'); cv.width = cv.height = 1;
                        const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 1, 1);
                        const [r, g, b] = cx.getImageData(0, 0, 1, 1).data;
                        col = new THREE.Color(r / 255, g / 255, b / 255);
                        col.convertSRGBToLinear();
                    }
                } catch { /* テクスチャが取れなければ、表の色 */ }
                this.outsideColors.set(ft, col);
            }
            return this.outsideColors.get(ft);
        };
        const colOf = (t) => t.water ? new THREE.Color(t.shallow ? WATER_SHALLOW : WATER_DEEP) : floorColor(t.ft).clone();
        const nV = (DEPTH + 1) * (along + 1);
        const pos = new Float32Array(nV * 3), colr = new Float32Array(nV * 3);
        for (let k = 0; k <= DEPTH; k++) {
            for (let i = 0; i <= along; i++) {
                let hs = 0, n = 0; const c = new THREE.Color(0, 0, 0);
                for (const [tk, ti] of [[k - 1, i - 1], [k - 1, i], [k, i - 1], [k, i]]) {
                    const t = info[tk]?.[ti];
                    if (!t) continue;   // 範囲の外のマスは、数えない
                    hs += t.water ? 0 : t.h; n++; c.add(colOf(t));
                }
                const idx = k * (along + 1) + i;
                const [wx, wz] = cornerXZ(k, i);
                pos[idx * 3] = wx; pos[idx * 3 + 1] = (n ? hs / n : 0) + 0.01; pos[idx * 3 + 2] = wz;
                if (n) c.multiplyScalar(1 / n);
                colr[idx * 3] = c.r; colr[idx * 3 + 1] = c.g; colr[idx * 3 + 2] = c.b;
            }
        }
        // 面の向き: 4 方向で、頂点の並びの向きが違う。上から見て表になる並びに、そろえる（法線を後から反転すると、裏表の判定とずれて、暗くなる）
        const buildIndices = (flip) => {
            const idx = [];
            for (let k = 0; k < DEPTH; k++) {
                for (let i = 0; i < along; i++) {
                    const a = k * (along + 1) + i, b = a + 1, c2 = a + (along + 1), d = c2 + 1;
                    if (flip) idx.push(a, b, c2, b, d, c2); else idx.push(a, c2, b, b, c2, d);
                }
            }
            return idx;
        };
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
        geo.setIndex(buildIndices(false));
        geo.computeVertexNormals();
        if (geo.attributes.normal.getY(Math.floor(nV / 2)) < 0) { geo.setIndex(buildIndices(true)); geo.computeVertexNormals(); }
        this.outsideMats = this.outsideMats || new Map();
        if (!this.outsideMats.has('smooth')) this.outsideMats.set('smooth', new THREE.MeshLambertMaterial({ vertexColors: true }));
        const mesh = new THREE.Mesh(geo, this.outsideMats.get('smooth'));
        mesh.matrixAutoUpdate = false;
        this.scene.add(mesh);
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
        try {
            await this.loadMapBody(mapId, opts);
        } finally {
            this.nav.busy = false;
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
                const res = await fetch(`/data/maps/${mapId}.json`);
                mapData = await res.json();
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
        await this.buildOutsideGround(mapId, cols, rows, tileSize);

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
        const origSceneAdd = this.scene.add;
        const unlift = () => { if (this.scene.add !== origSceneAdd) this.scene.add = origSceneAdd; };
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
                if (liftH > 0 && (LIFT_TYPES.has(objDef.type) || objDef.lift) && !(objDef.type === 'floor_tile' && objDef.elevation > 0)) {   // lift: true の定義（頂上の入口の扉など）は、種類に関係なく、高さだけ持ち上げる
                    this.scene.add = function (o) { o.position.y += liftH; return origSceneAdd.call(this, o); };
                }

                switch (objDef.type) {
                    case 'block': {
                        let blockTex = this.textures.rock;
                        if (objDef.texture === 'brick') blockTex = this.textures.brick;
                        else if (objDef.texture && this.textures[objDef.texture]) blockTex = this.textures[objDef.texture];

                        const mat = this.makeLitMaterial(objDef.texture, blockTex);
                        if (objDef.jagged || objDef.texture === 'mossyStone') {
                            // Natural craggy rock height variation & slight scale offsets for natural cave look
                            const rockH = wallH * (0.9 + ((r * 7 + c * 13) % 10) * 0.06);
                            const rockGeo = new THREE.BoxGeometry(tileSize * 1.02, rockH, tileSize * 1.02);
                            const rock = new THREE.Mesh(rockGeo, mat);
                            rock.position.set(wx, rockH / 2, wz);
                            this.addStatic(rock);
                        } else if (objDef.hasRoof) {
                            // Buildings with European pitched roofs (Village wood or City brick/stone houses)
                            const houseH = wallH * 0.92;
                            const houseGeo = new THREE.BoxGeometry(tileSize, houseH, tileSize);
                            const house = new THREE.Mesh(houseGeo, mat);
                            house.position.set(wx, houseH / 2, wz);
                            this.addStatic(house);

                            // Triangular pitched roof capping the building (Slate blue for city or terracotta for village)
                            const roofH = tileSize * 0.48;
                            const roofGeo = new THREE.ConeGeometry(tileSize * 0.78, roofH, 4);
                            const roofTex = (objDef.roofTexture && this.textures[objDef.roofTexture])
                                ? this.textures[objDef.roofTexture]
                                : (this.textures.villageRoof || this.textures.brick);
                            const roofMat = new THREE.MeshLambertMaterial({ map: roofTex });
                            const roofMesh = new THREE.Mesh(roofGeo, roofMat);
                            roofMesh.rotation.y = Math.PI / 4;
                            roofMesh.position.set(wx, houseH + roofH / 2, wz);
                            this.addStatic(roofMesh);

                            // 外に向いた壁の面に付く部品（窓・鎧戸など。objects.json の faceParts。座標は wall_deco と同じ）
                            //   faceEvery（n）があれば、(列+行) が n で割り切れるマスだけに付ける（外壁に、1マスおきに窓が並ぶ）。
                            //   隣に、位置を決めて置いた窓（faceEvery のない faceParts）があるマスには、自動では付けない
                            const faceDefAt = (cc, rr) => this.objectDefinitions[mapData.legend?.[mapData.layout[rr]?.[cc]]];
                            const nearFixedWindow = objDef.faceEvery && [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([ex, ez]) => { const nd = faceDefAt(c + ex, r + ez); return nd && nd.faceParts && !nd.faceEvery; });
                            if (objDef.faceParts && (!objDef.faceEvery || (c + r) % objDef.faceEvery === 0) && !nearFixedWindow) {
                                for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                                    const cc = c + dx, rr = r + dz;
                                    if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
                                    const nt = this.objectDefinitions[mapData.legend?.[mapData.layout[rr][cc]]];
                                    if (nt && ['block', 'door', 'wall_image', 'wall_deco'].includes(nt.type)) continue;
                                    const face = new THREE.Group();
                                    for (const p of objDef.faceParts) {
                                        const pm = p.basic ? new THREE.MeshBasicMaterial({ color: p.color }) : new THREE.MeshLambertMaterial({ color: p.color });
                                        const pmesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]), pm);
                                        pmesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
                                        face.add(pmesh);
                                    }
                                    face.position.set(wx + dx * tileSize / 2, 0, wz + dz * tileSize / 2);
                                    face.rotation.y = Math.atan2(dx, dz);
                                    this.addStatic(face);
                                }
                            }
                        } else {
                            const wall = new THREE.Mesh(standardWallGeo, mat);
                            wall.position.set(wx, wallH / 2, wz);
                            this.addStatic(wall);
                        }
                        if (objDef.solid) {
                            this.colliders.push({
                                minX: wx - tileSize / 2,
                                maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2,
                                maxZ: wz + tileSize / 2,
                                blocksProjectiles: objDef.blocksProjectiles !== false
                            });
                        }
                        break;
                    }

                    case 'tree_wall': {
                        // 林の壁（画像の木々を、向きの固定した板で壁にする）。画像を普通のスプライトで出すと、常にこちらを向いて、壁にならない。
                        // 壁の外側（隣が同じ林の壁でない、マップの中の側）の面に、板を立てる。板は、動かず、向きも変わらない。
                        // 1 マスの林の壁は、両側に板が立つ。連なる林の壁は、並んだ板が少し重なって、つながって見える
                        const wallTex = this.textures[objDef.texture] || this.textures.forestCanopy;
                        this.treeWallMats = this.treeWallMats || new Map();
                        let panelMat = this.treeWallMats.get(wallTex);
                        if (!panelMat) {
                            panelMat = new THREE.MeshLambertMaterial({ map: wallTex, alphaTest: 0.35, side: THREE.DoubleSide });   // 切り抜きだけ（transparent を外す）: 半透明の距離順に頼らず、奥の木が隠れない
                            this.treeWallMats.set(wallTex, panelMat);
                        }
                        const panelH = (objDef.height ?? wallH * 1.4) * (0.9 + ((r * 7 + c * 13) % 5) * 0.05);
                        const panelW = Math.max(tileSize * 1.5, panelH * (objDef.aspect ?? 1));
                        const wallTypeAt = (cc, rr) => this.objectDefinitions[mapData.legend?.[mapData.layout[rr]?.[cc]]]?.type;
                        // [列の差, 行の差, 板の向き（法線）の回転]。板の法線は、標準で +Z（南）向き
                        for (const [dx, dz, rotY] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
                            const nc = c + dx, nr = r + dz;
                            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;   // マップの外側には、板を立てない
                            if (wallTypeAt(nc, nr) === 'tree_wall') continue;               // 隣も林の壁の面は、内側
                            const inset = tileSize / 2 - 0.1 - ((r + c) % 2) * 0.06;         // 隣の板との、重なりのちらつき（z-fighting）を避ける
                            const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), panelMat);
                            panel.rotation.y = rotY;
                            panel.position.set(wx + dx * inset, panelH / 2, wz + dz * inset);
                            this.addStatic(panel);
                        }
                        // 出っ張りの角（凹んだ角）: 斜め向かいがマップの中で、林の壁でなく、その間の 2 マスが林の壁（かマップの外）のとき、
                        //   2 枚の板の間に穴があくので、斜めの板で埋める（マップの四隅など）
                        const isWallOrOut = (cc, rr) => cc < 0 || rr < 0 || cc >= cols || rr >= rows || wallTypeAt(cc, rr) === 'tree_wall';
                        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                            const dc = c + dx, dr = r + dz;
                            if (dc < 0 || dr < 0 || dc >= cols || dr >= rows || isWallOrOut(dc, dr)) continue;
                            if (!isWallOrOut(c + dx, r) || !isWallOrOut(c, r + dz)) continue;
                            const diag = new THREE.Mesh(new THREE.PlaneGeometry(tileSize * 1.7, panelH), panelMat);
                            diag.rotation.y = Math.atan2(dx, dz);
                            diag.position.set(wx + dx * tileSize * 0.2, panelH / 2, wz + dz * tileSize * 0.2);
                            this.addStatic(diag);
                        }
                        if (objDef.solid) {
                            this.colliders.push({
                                minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                                blocksProjectiles: objDef.blocksProjectiles !== false
                            });
                        }
                        break;
                    }

                    case 'dense_forest': {
                        // Completely organic bumpy treeline canopy with transparent uneven top
                        // Check which edges need trees (inward facing towards open ground)
                        const isNorth = (r === 0);
                        const isSouth = (r === rows - 1);
                        const isWest = (c === 0);
                        const isEast = (c === cols - 1);
                        const isCorner = (isNorth || isSouth) && (isWest || isEast);

                        // Organic uneven canopy height (varied per coordinate so top is bumpy and wavy)
                        const canopyH = wallH * (1.6 + ((r * 13 + c * 7) % 5) * 0.12);
                        // Increase width so adjacent trees seamlessly interlock without corner/edge gaps
                        const canopyW = tileSize * 1.5;

                        const canopyMat = new THREE.MeshLambertMaterial({
                            map: this.textures.forestCanopy,
                            transparent: true,
                            alphaTest: 0.15,
                            side: THREE.DoubleSide
                        });

                        const shadowCanopyMat = new THREE.MeshLambertMaterial({
                            map: this.textures.forestCanopy,
                            transparent: true,
                            alphaTest: 0.15,
                            color: 0x4a6b4a,
                            side: THREE.DoubleSide
                        });

                        // Helper to spawn a treeline plane
                        const spawnCanopyPlane = (posY, rotY, posX, posZ, w, h, mat) => {
                            const geo = new THREE.PlaneGeometry(w, h);
                            const mesh = new THREE.Mesh(geo, mat);
                            mesh.rotation.y = rotY;
                            mesh.position.set(posX, posY, posZ);
                            this.scene.add(mesh);
                        };

                        // 1. Horizontal face (North or South)
                        if (isNorth) {
                            spawnCanopyPlane(canopyH / 2, 0, wx, wz, canopyW, canopyH, canopyMat);
                            spawnCanopyPlane((canopyH * 1.15) / 2, 0, wx, wz - tileSize * 0.25, canopyW * 1.2, canopyH * 1.15, shadowCanopyMat);
                        } else if (isSouth) {
                            spawnCanopyPlane(canopyH / 2, Math.PI, wx, wz, canopyW, canopyH, canopyMat);
                            spawnCanopyPlane((canopyH * 1.15) / 2, Math.PI, wx, wz + tileSize * 0.25, canopyW * 1.2, canopyH * 1.15, shadowCanopyMat);
                        }

                        // 2. Vertical face (West or East)
                        if (isWest) {
                            spawnCanopyPlane(canopyH / 2, Math.PI / 2, wx, wz, canopyW, canopyH, canopyMat);
                            spawnCanopyPlane((canopyH * 1.15) / 2, Math.PI / 2, wx - tileSize * 0.25, wz, canopyW * 1.2, canopyH * 1.15, shadowCanopyMat);
                        } else if (isEast) {
                            spawnCanopyPlane(canopyH / 2, -Math.PI / 2, wx, wz, canopyW, canopyH, canopyMat);
                            spawnCanopyPlane((canopyH * 1.15) / 2, -Math.PI / 2, wx + tileSize * 0.25, wz, canopyW * 1.2, canopyH * 1.15, shadowCanopyMat);
                        }

                        // 3. Corner filler: diagonally oriented diagonal plane at 4 corners so 90-degree seam is completely sealed
                        if (isCorner) {
                            const diagRot = (isNorth && isWest) ? Math.PI / 4 :
                                            (isNorth && isEast) ? -Math.PI / 4 :
                                            (isSouth && isWest) ? (3 * Math.PI) / 4 : -(3 * Math.PI) / 4;
                            spawnCanopyPlane(canopyH * 1.05 / 2, diagRot, wx, wz, canopyW * 1.3, canopyH * 1.05, canopyMat);
                        }

                        if (objDef.solid) {
                            this.colliders.push({
                                minX: wx - tileSize / 2,
                                maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2,
                                maxZ: wz + tileSize / 2,
                                blocksProjectiles: objDef.blocksProjectiles !== false
                            });
                        }
                        break;
                    }

                    case 'barrier': {
                        // Invisible boundary wall for open spaces
                        if (objDef.solid) {
                            this.colliders.push({
                                minX: wx - tileSize / 2,
                                maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2,
                                maxZ: wz + tileSize / 2,
                                blocksProjectiles: objDef.blocksProjectiles !== false
                            });
                        }
                        break;
                    }

                    case 'wooden_fence': {
                        // Wooden Picket Fence surrounding village & paths
                        // Check adjacent neighbors to see which sides need fence panels
                        const isNorthFence = (r > 0 && mapData.layout[r - 1][c] === char);
                        const isSouthFence = (r < rows - 1 && mapData.layout[r + 1][c] === char);
                        const isWestFence = (c > 0 && mapData.layout[r][c - 1] === char);
                        const isEastFence = (c < cols - 1 && mapData.layout[r][c + 1] === char);

                        const fenceMat = new THREE.MeshLambertMaterial({
                            map: this.textures.woodenFence,
                            transparent: true,
                            alphaTest: 0.15,
                            side: THREE.DoubleSide
                        });

                        const fenceH = objDef.height || 2.4;
                        const fenceW = tileSize * 1.05;

                        // Center square fence post
                        const postGeo = new THREE.BoxGeometry(0.35, fenceH * 1.08, 0.35);
                        const postMat = new THREE.MeshLambertMaterial({ map: this.textures.woodWall });
                        const postMesh = new THREE.Mesh(postGeo, postMat);
                        postMesh.position.set(wx, fenceH * 1.08 / 2, wz);
                        this.addStatic(postMesh);

                        // If it has connections, draw matching fence panels
                        if (isWestFence || isEastFence || (!isNorthFence && !isSouthFence)) {
                            // Horizontal X plane
                            const fGeo = new THREE.PlaneGeometry(fenceW, fenceH);
                            const fMesh = new THREE.Mesh(fGeo, fenceMat);
                            fMesh.position.set(wx, fenceH / 2, wz);
                            this.addStatic(fMesh);
                        }
                        if (isNorthFence || isSouthFence) {
                            // Vertical Z plane
                            const fGeo = new THREE.PlaneGeometry(fenceW, fenceH);
                            const fMesh = new THREE.Mesh(fGeo, fenceMat);
                            fMesh.rotation.y = Math.PI / 2;
                            fMesh.position.set(wx, fenceH / 2, wz);
                            this.addStatic(fMesh);
                        }

                        if (objDef.solid) {
                            // Full tile collision box to completely prevent slipping through between fence posts
                            this.colliders.push({
                                minX: wx - tileSize / 2,
                                maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2,
                                maxZ: wz + tileSize / 2,
                                blocksProjectiles: objDef.blocksProjectiles === true
                            });
                        }
                        break;
                    }

                    case 'tree': {
                        // 木のスプライト。同じ画像の材質（遠い木＝切り抜き・近い木＝なめらか）と、足元の影は、全部の木で共有する（森は、木が大量になるため）
                        this.treeMats = this.treeMats || new Map();
                        const texKey = objDef.texture;
                        if (!this.treeMats.has(texKey)) {
                            const tx = this.textures[texKey] || this.textures.tree;
                            this.treeMats.set(texKey, {
                                far: new THREE.SpriteMaterial({ map: tx, transparent: false, alphaTest: 0.4 }),   // 遠い木: 切り抜き。透明な画素が奥行きを書いて、奥の壁の木を四角く隠すのを防ぐ
                                near: new THREE.SpriteMaterial({ map: tx })                                      // 近い木: 従来の（なめらかな）描画
                            });
                        }
                        const { far: treeMat, near: treeMatNear } = this.treeMats.get(texKey);
                        const tree = new THREE.Sprite(treeMat);
                        tree.center.set(0.5, 0.0);
                        const baseH = objDef.height ?? 4.8;   // 木の高さ（省略時は標準の木）。ばらつきは、高さに比例
                        const scaleVar = baseH + ((r * 5 + c * 3) % 4) * 0.5 * (baseH / 4.8);
                        tree.scale.set(scaleVar * (objDef.aspect ?? (899 / 893)), scaleVar, 1);   // aspect: 画像の幅/高さ（省略時は標準の木）
                        // Sink tree base slightly into grass (-0.08) so trunk roots naturally penetrate the terrain
                        tree.position.set(wx, -0.08, wz);
                        this.scene.add(tree);
                        tree.updateMatrix(); tree.matrixAutoUpdate = false;   // 動かない: 毎フレームの行列の計算をしない

                        // Ground contact shadow under the tree trunk（1 つの影の材質・形を共有）。
                        //   noShadow: true の木（2 倍・3 倍の大きな木）は、影を置かない（起伏のある地面で、大きな影の板が、隣の高いマスに埋まって、三角形などの欠けた形に見えるため。木の数が多い森が、軽くなる）
                        let shadowMesh = null;
                        if (TREE_SHADOWS && !objDef.noShadow) {
                            if (!this.treeShadowMat) {
                                const shadowCanvas = document.createElement('canvas');
                                shadowCanvas.width = 32;
                                shadowCanvas.height = 32;
                                const sCtx = shadowCanvas.getContext('2d');
                                const grad = sCtx.createRadialGradient(16, 16, 2, 16, 16, 16);
                                grad.addColorStop(0, 'rgba(10, 25, 10, 0.65)');
                                grad.addColorStop(0.5, 'rgba(15, 30, 15, 0.35)');
                                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                                sCtx.fillStyle = grad;
                                sCtx.fillRect(0, 0, 32, 32);
                                this.treeShadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false });
                                this.treeShadowGeo = new THREE.PlaneGeometry(2.4, 2.4);
                            }
                            shadowMesh = new THREE.Mesh(this.treeShadowGeo, this.treeShadowMat);
                            shadowMesh.rotation.x = -Math.PI / 2;
                            const shadowK = Math.min(3, Math.max(1, baseH / 5.2));
                            shadowMesh.scale.set(shadowK, shadowK, 1);
                            shadowMesh.position.set(wx, 0.012, wz);
                            this.scene.add(shadowMesh);
                            shadowMesh.updateMatrix(); shadowMesh.matrixAutoUpdate = false;
                        }
                        this.treeSprites.push({ sprite: tree, shadow: shadowMesh, far: treeMat, near: treeMatNear, vis: true });
                        if (objDef.solid) {
                            const half = objDef.colliderHalf ?? 0.6;   // 幹の当たり判定の半幅（大きな木ほど、太い）
                            this.colliders.push({
                                minX: wx - half, maxX: wx + half,
                                minZ: wz - half, maxZ: wz + half
                            });
                        }
                        break;
                    }

                    case 'boulder': {
                        // Mossy natural boulder sprite with ground shadow & projectile blocking
                        const boulderMat = new THREE.SpriteMaterial({ map: this.textures[objDef.texture] || this.textures.boulder });
                        const boulder = new THREE.Sprite(boulderMat);
                        boulder.center.set(0.5, 0.0);
                        const bScale = objDef.scale || [2.6, 2.0, 1.0];
                        boulder.scale.set(bScale[0], bScale[1], bScale[2]);
                        boulder.position.set(wx, -0.05, wz);
                        this.scene.add(boulder);

                        // Ground contact shadow
                        const shadowCanvas = document.createElement('canvas');
                        shadowCanvas.width = 32; shadowCanvas.height = 32;
                        const sCtx = shadowCanvas.getContext('2d');
                        const grad = sCtx.createRadialGradient(16, 16, 3, 16, 16, 16);
                        grad.addColorStop(0, 'rgba(15, 25, 15, 0.65)');
                        grad.addColorStop(0.6, 'rgba(10, 20, 10, 0.3)');
                        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        sCtx.fillStyle = grad;
                        sCtx.fillRect(0, 0, 32, 32);

                        const shadowTex = new THREE.CanvasTexture(shadowCanvas);
                        const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
                        const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), shadowMat);
                        shadowMesh.rotation.x = -Math.PI / 2;
                        shadowMesh.position.set(wx, 0.012, wz);
                        this.scene.add(shadowMesh);

                        if (objDef.solid) {
                            const rad = objDef.radius || 0.85;
                            this.colliders.push({
                                minX: wx - rad, maxX: wx + rad,
                                minZ: wz - rad, maxZ: wz + rad,
                                blocksProjectiles: objDef.blocksProjectiles !== false
                            });
                        }
                        break;
                    }

                    case 'signpost': {
                        // Rustic wooden signpost sprite
                        const signMat = new THREE.SpriteMaterial({ map: this.textures[objDef.texture] || this.textures.signpost });
                        const sign = new THREE.Sprite(signMat);
                        sign.center.set(0.5, 0.0);
                        const sScale = objDef.scale || [1.9, 2.0, 1.0];
                        sign.scale.set(sScale[0], sScale[1], sScale[2]);
                        sign.position.set(wx, 0.0, wz);
                        this.scene.add(sign);

                        if (objDef.solid) {
                            const rad = objDef.radius || 0.5;
                            this.colliders.push({
                                minX: wx - rad, maxX: wx + rad,
                                minZ: wz - rad, maxZ: wz + rad,
                                blocksProjectiles: false
                            });
                        }

                        // Store signpost interaction
                        if (objDef.message) {
                            this.signposts = this.signposts || [];
                            this.signposts.push({
                                x: wx, z: wz, message: objDef.message, radius: 2.2, triggered: false
                            });
                        }
                        break;
                    }

                    case 'monster': {
                        const m = new Monster(objDef.monsterId || 'S', wx, wz, this.textures);
                        this.monsters.push(m);
                        this.scene.add(m.sprite);
                        break;
                    }

                    case 'fountain': {
                        // European Plaza Fountain: stone basin with sparkling water & center water spire
                        const basinMat = new THREE.MeshLambertMaterial({ map: this.textures.cityWall });
                        const waterMat = new THREE.MeshLambertMaterial({
                            map: this.textures.fountainWater,
                            transparent: true,
                            opacity: 0.88
                        });

                        // Hexagonal/Cylindrical stone pool rim
                        const rimGeo = new THREE.CylinderGeometry(tileSize * 0.44, tileSize * 0.46, 0.5, 12, 1, true);
                        const rimMesh = new THREE.Mesh(rimGeo, basinMat);
                        rimMesh.position.set(wx, 0.25, wz);
                        this.scene.add(rimMesh);

                        // Water surface inside fountain
                        const poolWaterGeo = new THREE.CircleGeometry(tileSize * 0.43, 12);
                        const poolWater = new THREE.Mesh(poolWaterGeo, waterMat);
                        poolWater.rotation.x = -Math.PI / 2;
                        poolWater.position.set(wx, 0.38, wz);
                        this.scene.add(poolWater);
                        this.waterMeshes.push(poolWater);

                        // Center ornamental stone spout pillar
                        const centerGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.3, 8);
                        const centerMesh = new THREE.Mesh(centerGeo, basinMat);
                        centerMesh.position.set(wx, 0.65, wz);
                        this.scene.add(centerMesh);

                        // Track active fountain for water spurting particles & player splash interaction
                        this.fountains.push({
                            x: wx,
                            z: wz,
                            topY: 1.3,
                            surfaceY: 0.38,
                            radius: tileSize * 0.45,
                            splashCooldown: 0
                        });

                        if (objDef.solid) {
                            const rad = tileSize * 0.45;
                            this.colliders.push({
                                minX: wx - rad, maxX: wx + rad,
                                minZ: wz - rad, maxZ: wz + rad,
                                blocksProjectiles: false
                            });
                        }
                        break;
                    }

                    case 'chomper': {
                        // Prince of Persia Chomper / Steel Guillotine Clamp Trap
                        // Detect corridor orientation:
                        // East-West corridor has walls at North (r-1) and South (r+1) -> Blades emerge from North & South walls (Z-movement)
                        // North-South corridor has walls at West (c-1) and East (c+1) -> Blades emerge from West & East walls (X-movement)
                        const isWallLeft = (c > 0 && mapData.layout[r][c - 1] === '1');
                        const isWallRight = (c < cols - 1 && mapData.layout[r][c + 1] === '1');
                        const isWallTop = (r > 0 && mapData.layout[r - 1][c] === '1');
                        const isWallBottom = (r < rows - 1 && mapData.layout[r + 1][c] === '1');

                        // In a hallway running East-West (between top & bottom walls), passage is horizontal -> blades come from North/South walls
                        const isEastWestPassage = (isWallTop || isWallBottom) && !(isWallLeft && isWallRight);

                        const chomperGroup = new THREE.Group();
                        const bladeMat = new THREE.MeshLambertMaterial({
                            map: this.textures.chomperBlade,
                            transparent: true,
                            alphaTest: 0.1,
                            side: THREE.DoubleSide
                        });

                        const bladeW = tileSize * 0.52;
                        const bladeH = 2.4;
                        const bladeGeo = new THREE.PlaneGeometry(bladeW, bladeH);

                        const leftBlade = new THREE.Mesh(bladeGeo, bladeMat);
                        const rightBlade = new THREE.Mesh(bladeGeo, bladeMat);

                        const chomperCycle = objDef.cycleDuration || 2.2;
                        const chomperOffset = (objDef.timeOffset !== undefined) ? objDef.timeOffset : ((r * 7 + c * 3) % chomperCycle);

                        const chomperObj = {
                            group: chomperGroup,
                            leftBlade: leftBlade,
                            rightBlade: rightBlade,
                            isEastWestPassage: isEastWestPassage,
                            x: wx,
                            z: wz,
                            timer: chomperOffset, // Staggered or custom offset
                            cycleDuration: chomperCycle, // Period between chomp snaps
                            damage: objDef.damage || 45,
                            isCurrentlyDangerous: false,
                            bladeWidth: bladeW
                        };

                        if (isEastWestPassage) {
                            // Player walks along X (East-West corridor).
                            // The two guillotine blades lie in the X=0 plane across the hallway (width along Z).
                            // Left blade slides from North wall (z = -half) towards center (z = 0) with cutting edge pointing South (+Z).
                            // Right blade slides from South wall (z = +half) towards center (z = 0) with cutting edge pointing North (-Z).
                            // A PlaneGeometry in local space is in XY plane. Rotating around Y by 90deg (PI/2) puts its face along X, spanning Z!
                            leftBlade.rotation.y = Math.PI / 2;
                            // Right blade flipped around Y so its cutting edge faces the opposite way (-Z)
                            rightBlade.rotation.y = -Math.PI / 2;
                        } else {
                            // Player walks along Z (North-South corridor).
                            // The two guillotine blades lie in the Z=0 plane across the hallway (width along X).
                            // Left blade slides from West wall (x = -half) towards center (x = 0) with cutting edge pointing East (+X).
                            // Right blade slides from East wall (x = +half) towards center (x = 0) with cutting edge pointing West (-X).
                            leftBlade.rotation.y = 0; // Flat along X
                            rightBlade.rotation.y = Math.PI; // Flipped along X
                        }

                        chomperGroup.add(leftBlade);
                        chomperGroup.add(rightBlade);
                        chomperGroup.position.set(wx, 0, wz);
                        this.scene.add(chomperGroup);

                        this.chompers.push(chomperObj);
                        break;
                    }

                    case 'pop_spikes': {
                        // Prince of Persia hidden spikes that thrust out violently when stepped on (especially when running)
                        const plateMat = new THREE.MeshLambertMaterial({ map: this.textures.popSpikePlate });
                        const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), plateMat);
                        plateMesh.rotation.x = -Math.PI / 2;
                        plateMesh.position.set(wx, 0.015, wz);
                        this.scene.add(plateMesh);

                        // Group holding 8 sharp 3D metal spikes (conical spikes that thrust up out of floor holes)
                        const spikesGroup = new THREE.Group();
                        const spikeH = 1.8;
                        const spikeGeo = new THREE.ConeGeometry(0.09, spikeH, 6);
                        const spikeMat = new THREE.MeshLambertMaterial({ color: 0xd4d4d8 });

                        const holeOffsets = [
                            [-1.1, -1.1], [0, -1.1], [1.1, -1.1],
                            [-0.55, 0], [0.55, 0],
                            [-1.1, 1.1], [0, 1.1], [1.1, 1.1]
                        ];

                        holeOffsets.forEach(([ox, oz]) => {
                            const spike = new THREE.Mesh(spikeGeo, spikeMat);
                            // Set spike cone center so base is at y = 0 inside the group
                            spike.position.set(ox, spikeH / 2, oz);
                            spikesGroup.add(spike);
                        });

                        // Initially hidden retracted below floor
                        const retractedY = -spikeH;
                        spikesGroup.position.set(wx, retractedY, wz);
                        this.scene.add(spikesGroup);

                        const spikeCycle = objDef.cycleDuration || 2.4;
                        const spikeOffset = (objDef.timeOffset !== undefined) ? objDef.timeOffset : ((r * 5 + c * 3) % spikeCycle);

                        const popSpikeObj = {
                            mesh: spikesGroup,
                            x: wx,
                            z: wz,
                            isThrust: false,
                            retractedY: retractedY,
                            thrustY: 0.0, // Base at 0.0 -> spike tips reach y = +1.8 above floor!
                            targetY: retractedY,
                            currentY: retractedY,
                            damage: objDef.damage || 35,
                            timer: spikeOffset, // Periodic cycle with staggered or custom offset
                            cycleDuration: spikeCycle, // Period between spike thrust cycles
                            thrustSoundPlayed: false,
                            bounds: {
                                minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2
                            }
                        };
                        this.popSpikes.push(popSpikeObj);
                        break;
                    }

                    case 'crumbling_floor': {
                        // Prince of Persia Loose / Crumbling Floor Tile
                        // Deep 3D pit shaft (dark dungeon rock cavity with bottomless void)
                        const pitDepth = 8.0;
                        const pitGroup = new THREE.Group();

                        // 4 side walls of the deep pit cavity
                        const pitWallMat = new THREE.MeshLambertMaterial({ map: this.textures.rock });
                        const pitWallGeo = new THREE.PlaneGeometry(tileSize, pitDepth);

                        // North pit wall
                        const pWallN = new THREE.Mesh(pitWallGeo, pitWallMat);
                        pWallN.position.set(0, -pitDepth / 2, -tileSize / 2);
                        pitGroup.add(pWallN);

                        // South pit wall
                        const pWallS = new THREE.Mesh(pitWallGeo, pitWallMat);
                        pWallS.rotation.y = Math.PI;
                        pWallS.position.set(0, -pitDepth / 2, tileSize / 2);
                        pitGroup.add(pWallS);

                        // West pit wall
                        const pWallW = new THREE.Mesh(pitWallGeo, pitWallMat);
                        pWallW.rotation.y = Math.PI / 2;
                        pWallW.position.set(-tileSize / 2, -pitDepth / 2, 0);
                        pitGroup.add(pWallW);

                        // East pit wall
                        const pWallE = new THREE.Mesh(pitWallGeo, pitWallMat);
                        pWallE.rotation.y = -Math.PI / 2;
                        pWallE.position.set(tileSize / 2, -pitDepth / 2, 0);
                        pitGroup.add(pWallE);

                        // Pitch-black bottom abyss
                        const abyssGeo = new THREE.PlaneGeometry(tileSize, tileSize);
                        const abyssMat = new THREE.MeshBasicMaterial({ color: 0x020202 });
                        const abyssMesh = new THREE.Mesh(abyssGeo, abyssMat);
                        abyssMesh.rotation.x = -Math.PI / 2;
                        abyssMesh.position.set(0, -pitDepth, 0);
                        pitGroup.add(abyssMesh);

                        // Sharp iron spikes at the bottom of the pit cavity!
                        const pitSpikeGeo = new THREE.ConeGeometry(0.12, 1.4, 5);
                        const pitSpikeMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
                        const bottomSpikes = [
                            [-1.0, -1.0], [0, -1.0], [1.0, -1.0],
                            [-0.5, 0], [0.5, 0],
                            [-1.0, 1.0], [0, 1.0], [1.0, 1.0]
                        ];
                        bottomSpikes.forEach(([ox, oz]) => {
                            const pSpike = new THREE.Mesh(pitSpikeGeo, pitSpikeMat);
                            pSpike.position.set(ox, -pitDepth + 0.7, oz);
                            pitGroup.add(pSpike);
                        });

                        pitGroup.position.set(wx, 0, wz);
                        this.scene.add(pitGroup);

                        // The fragile crumbling stone slab covering the pit
                        const slabMat = new THREE.MeshLambertMaterial({
                            map: this.textures.crumblingFloor
                        });
                        const slabGeo = new THREE.BoxGeometry(tileSize * 0.98, 0.16, tileSize * 0.98);
                        const slabMesh = new THREE.Mesh(slabGeo, slabMat);
                        slabMesh.position.set(wx, 0.08, wz);
                        this.scene.add(slabMesh);

                        const crumbleObj = {
                            mesh: slabMesh,
                            pitGroup: pitGroup,
                            x: wx,
                            z: wz,
                            baseX: wx,
                            baseZ: wz,
                            state: 'intact', // 'intact' -> 'shaking' -> 'falling' -> 'fallen' -> (respawns)
                            timer: 0,
                            shakeDuration: objDef.shakeDuration || 0.85, // 0.85s warning rattle
                            respawnTime: objDef.respawnTime || 4.5, // Respawns after 4.5s
                            velocityY: 0,
                            damage: objDef.damage || 35,
                            bounds: {
                                minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2
                            }
                        };
                        this.crumblingFloors.push(crumbleObj);
                        break;
                    }

                    case 'dart_trap': {
                        // Wall Dart Trap linked with floor Pressure Plate
                        // 1. Floor pressure plate switch at (wx, wz)
                        const plateMat = new THREE.MeshLambertMaterial({ map: this.textures.pressurePlate });
                        const plateGeo = new THREE.BoxGeometry(tileSize * 0.7, 0.05, tileSize * 0.7);
                        const plateMesh = new THREE.Mesh(plateGeo, plateMat);
                        plateMesh.position.set(wx, 0.025, wz);
                        this.scene.add(plateMesh);

                        // 2. Find closest adjacent wall in North/South/West/East to mount the dart dispenser block
                        const checkDirs = [
                            { dir: 'north', dr: -1, dc: 0, fwdX: 0, fwdZ: 1 },  // Wall is north -> shoots South (+Z)
                            { dir: 'south', dr: 1, dc: 0, fwdX: 0, fwdZ: -1 }, // Wall is south -> shoots North (-Z)
                            { dir: 'west', dr: 0, dc: -1, fwdX: 1, fwdZ: 0 },  // Wall is west -> shoots East (+X)
                            { dir: 'east', dr: 0, dc: 1, fwdX: -1, fwdZ: 0 }   // Wall is east -> shoots West (-X)
                        ];

                        let chosenWall = null;
                        for (const cd of checkDirs) {
                            const nr = r + cd.dr;
                            const nc = c + cd.dc;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                                if (mapData.layout[nr][nc] === '1') {
                                    chosenWall = {
                                        wx: nc * tileSize + tileSize / 2,
                                        wz: nr * tileSize + tileSize / 2,
                                        shootDirX: cd.fwdX,
                                        shootDirZ: cd.fwdZ
                                    };
                                    break;
                                }
                            }
                        }

                        // If no direct adjacent wall, shoot from North by default
                        if (!chosenWall) {
                            chosenWall = {
                                wx: wx,
                                wz: wz - tileSize,
                                shootDirX: 0,
                                shootDirZ: 1
                            };
                        }

                        // Mount dart dispenser decoration on wall surface
                        const dispenserMat = new THREE.MeshLambertMaterial({ map: this.textures.dartDispenser });
                        const dispenserGeo = new THREE.PlaneGeometry(1.4, 1.4);
                        const dispenserMesh = new THREE.Mesh(dispenserGeo, dispenserMat);
                        // Offset slightly out of wall face towards plate
                        dispenserMesh.position.set(
                            chosenWall.wx + chosenWall.shootDirX * (tileSize / 2 + 0.02),
                            1.3, // Eye-level dart height
                            chosenWall.wz + chosenWall.shootDirZ * (tileSize / 2 + 0.02)
                        );
                        // Face outwards along shooting direction
                        const dispenserYaw = Math.atan2(chosenWall.shootDirX, chosenWall.shootDirZ);
                        dispenserMesh.rotation.y = dispenserYaw;
                        this.scene.add(dispenserMesh);

                        const dartTrapObj = {
                            plateMesh: plateMesh,
                            plateBaseY: 0.025,
                            platePressedY: 0.008,
                            x: wx,
                            z: wz,
                            isStepped: false,
                            cooldown: 0,
                            damage: objDef.damage || 25,
                            speed: objDef.speed || 18, // Swift whistling dart speed
                            shootOriginX: chosenWall.wx + chosenWall.shootDirX * (tileSize / 2 + 0.1),
                            shootOriginZ: chosenWall.wz + chosenWall.shootDirZ * (tileSize / 2 + 0.1),
                            dirX: chosenWall.shootDirX,
                            dirZ: chosenWall.shootDirZ,
                            bounds: {
                                minX: wx - tileSize * 0.35, maxX: wx + tileSize * 0.35,
                                minZ: wz - tileSize * 0.35, maxZ: wz + tileSize * 0.35
                            }
                        };
                        this.dartTraps.push(dartTrapObj);
                        break;
                    }

                    case 'chest': {
                        // Antique Treasure Chest (or Mimic Monster in disguise)
                        const chestGroup = new THREE.Group();
                        const chestMat = new THREE.MeshLambertMaterial({ map: this.textures.chest });

                        const chestW = 1.3;
                        const chestH = 0.85;
                        const chestD = 0.95;

                        // Chest Lower Base Box
                        const baseGeo = new THREE.BoxGeometry(chestW, chestH * 0.6, chestD);
                        const baseMesh = new THREE.Mesh(baseGeo, chestMat);
                        baseMesh.position.set(0, (chestH * 0.6) / 2, 0);
                        chestGroup.add(baseMesh);

                        // Chest Lid with Hinge Pivot at Back (-Z)
                        const lidPivot = new THREE.Group();
                        lidPivot.position.set(0, chestH * 0.6, -chestD / 2); // Hinge line

                        const lidGeo = new THREE.BoxGeometry(chestW * 1.02, chestH * 0.42, chestD * 1.02);
                        const lidMesh = new THREE.Mesh(lidGeo, chestMat);
                        lidMesh.position.set(0, (chestH * 0.42) / 2, chestD / 2); // Center lid on pivot
                        lidPivot.add(lidMesh);
                        chestGroup.add(lidPivot);

                        // Subtle gold lock cube on front
                        const lockGeo = new THREE.BoxGeometry(0.22, 0.22, 0.08);
                        const lockMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
                        const lockMesh = new THREE.Mesh(lockGeo, lockMat);
                        lockMesh.position.set(0, (chestH * 0.6) / 2, chestD / 2 + 0.04);
                        chestGroup.add(lockMesh);

                        // Chest subtle ground shadow
                        const cShadowMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55 });
                        const cShadow = new THREE.Mesh(new THREE.PlaneGeometry(chestW * 1.3, chestD * 1.3), cShadowMat);
                        cShadow.rotation.x = -Math.PI / 2;
                        cShadow.position.set(0, 0.015, 0);
                        chestGroup.add(cShadow);

                        chestGroup.position.set(wx, 0, wz);
                        this.scene.add(chestGroup);

                        const chestObj = {
                            floorY: this.heightLevelAtTile(r, c) * this.heightStep,   // 置かれている床の高さ（高台の宝箱を、下から開けないように）
                            group: chestGroup,
                            lidPivot: lidPivot,
                            baseMesh: baseMesh,
                            x: wx,
                            z: wz,
                            isMimic: !!objDef.isMimic,
                            isOpen: false,
                            targetLidAngle: 0, // 0 = closed, -Math.PI * 0.55 = open
                            currentLidAngle: 0,
                            respawnTimer: 0,
                            respawnDuration: objDef.respawnTime || 120, // default 120s
                            lootTable: objDef.lootTable || [
                                { type: 'gold', min: 30, max: 80, name: 'ゴールド' }
                            ],
                            radius: objDef.radius || 1.4
                        };
                        this.chests.push(chestObj);

                        if (objDef.solid) {
                            const rad = 0.7;
                            const collider = {
                                minX: wx - rad, maxX: wx + rad,
                                minZ: wz - rad, maxZ: wz + rad,
                                blocksProjectiles: true
                            };
                            chestObj.collider = collider;
                            this.colliders.push(collider);
                        }
                        break;
                    }

                    case 'floor_tile': {
                        // Ground-level custom floor tile
                        const tileMat = this.makeLitMaterial(objDef.texture, this.textures[objDef.texture] || this.textures.sand);
                        if (objDef.elevation > 0) {
                            // 高さのある床（階段状の高台）: 上面の高さが elevation の箱。歩いて上れる（壁ではない）
                            const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(tileSize, objDef.elevation, tileSize), tileMat);
                            stepMesh.position.set(wx, objDef.elevation / 2, wz);
                            this.addStatic(stepMesh);
                            this.raisedFloors.push({
                                minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                                height: objDef.elevation
                            });
                        } else {
                        const tileGeo = new THREE.PlaneGeometry(tileSize, tileSize);
                        const tileMesh = new THREE.Mesh(tileGeo, tileMat);
                        tileMesh.rotation.x = -Math.PI / 2;
                        // Wood bridge and paths are slightly raised above water/grass
                        const elev = (objDef.texture === 'woodBridge') ? 0.04 : 0.01;
                        tileMesh.position.set(wx, elev, wz);
                        this.addStatic(tileMesh);
                        }
                        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);   // 屋内の床は天井もつける

                        this.terrainGrid.push({
                            minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                            minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                            depth: 0,
                            slowdown: objDef.slowdown || 1.0,
                            speedBonus: objDef.speedBonus || 1.0,
                            friction: objDef.friction,
                            mpRegenBonus: objDef.mpRegenBonus || 0,
                            isWater: false
                        });
                        break;
                    }

                    case 'sea_tile': {
                        // 海: 1 マスずつは描かない（大量になるため）。buildSea が、水面 1 枚と、当たり判定を作る
                        this.seaCells.push([r, c]);
                        break;
                    }

                    case 'bridge_deck': {
                        // 吊橋: 薄い板の床（側面も、下の面もない。下に、谷の底が見える）と、橋の縁に沿った、ロープの手すり・支柱。
                        //   床の高さは、heights（objDef.lift で、このマスの高さまで持ち上がる）。歩く・段差の判定は、高さの仕組みのまま
                        const deckMat = this.makeLitMaterial(objDef.texture, this.textures[objDef.texture] || this.textures.sand);
                        const thick = 0.16;
                        const deck = new THREE.Mesh(new THREE.BoxGeometry(tileSize, thick, tileSize), deckMat);
                        deck.position.set(wx, 0.02 - thick / 2, wz);
                        this.addStatic(deck);
                        const isBridge = (rr, cc) => this.bridgeCells.has(`${rr},${cc}`);
                        const ropeMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3b });
                        const postMat = new THREE.MeshLambertMaterial({ map: this.textures.woodWall });
                        // 手すり（ロープ 2 本）と支柱は、橋の脇（隣が、橋の床より 2 段以上低い谷）の縁だけに立てる。
                        //   橋の端（隣が、同じ高さの地面）は、出入り口なので、塞がない
                        const deckLv = this.heightLevelAtTile(r, c);
                        // waterBelow: 橋の下に水の面（川）を置く。railOnWater: 手すりは、隣が水のマス（橋の脇）だけ
                        if (objDef.waterBelow) {
                            const under = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), new THREE.MeshLambertMaterial({ map: this.textures.water }));
                            under.rotation.x = -Math.PI / 2;
                            under.position.set(wx, -0.2, wz);
                            this.scene.add(under);
                            this.waterMeshes.push(under);
                        }
                        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                            if (isBridge(r + dr, c + dc)) continue;
                            if (objDef.railOnWater) { if (!waterMap[r + dr]?.[c + dc]) continue; }
                            else if (this.heightLevelAtTile(r + dr, c + dc) > deckLv - 2) continue;
                            const ex = wx + dc * tileSize / 2, ez = wz + dr * tileSize / 2;
                            const alongX = dr !== 0;   // 北・南の縁は、x 方向に伸びる
                            for (const y of [1.05, 0.55]) {
                                const rope = new THREE.Mesh(new THREE.BoxGeometry(alongX ? tileSize : 0.07, 0.07, alongX ? 0.07 : tileSize), ropeMat);
                                rope.position.set(ex, y, ez);
                                this.addStatic(rope);
                            }
                            // 支柱: 縁の始まり（西・北）に必ず。終わり（東・南）は、縁が続かないときだけ（隣のマスの始まりと、重ねない）
                            const nextCell = alongX ? isBridge(r, c + 1) && !isBridge(r + dr, c + 1) : isBridge(r + 1, c) && !isBridge(r + 1, c + dc);
                            for (const end of nextCell ? [-1] : [-1, 1]) {
                                const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.16), postMat);
                                post.position.set(alongX ? ex + end * tileSize / 2 : ex, 0.65, alongX ? ez : ez + end * tileSize / 2);
                                this.addStatic(post);
                            }
                        }
                        this.terrainGrid.push({
                            minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                            minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                            depth: 0, slowdown: 1.0, speedBonus: 1.0, friction: objDef.friction, mpRegenBonus: 0, isWater: false
                        });
                        break;
                    }

                    case 'torch_stand': {
                        // 松明（燭台）: 木の柱と、炎（自ら光る箱）。周囲を照らす光源（PointLight）は置かず（GPU の上限のため）、
                        //   床に光だまり（加算合成の丸い光）と、炎のまわりの光の輪を置く。ゆらぐ（update の torchGlows）。通り抜けられる。
                        //   床の高さは、マップの heights（objDef.lift で持ち上がる）
                        const group = new THREE.Group();
                        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), new THREE.MeshLambertMaterial({ color: 0x5a3b1e }));
                        stake.position.set(0, 0.75, 0);
                        group.add(stake);
                        const bowl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
                        bowl.position.set(0, 1.55, 0);
                        group.add(bowl);
                        group.position.set(wx, 0, wz);
                        this.addStatic(group);
                        const glowTex = this.getGlowTexture();
                        const lightColor = new THREE.Color(objDef.lightColor ?? '#ffa040');
                        const poolR = (objDef.lightRadius ?? 3.2) * tileSize / 2;
                        const poolOpacity = objDef.poolOpacity ?? 0.5, haloOpacity = objDef.haloOpacity ?? 0.8;
                        const pool = new THREE.Mesh(new THREE.PlaneGeometry(poolR * 2, poolR * 2), new THREE.MeshBasicMaterial({ map: glowTex, color: lightColor, transparent: true, opacity: poolOpacity, blending: THREE.AdditiveBlending, depthWrite: false }));
                        pool.rotation.x = -Math.PI / 2;
                        pool.position.set(wx, 0.05, wz);
                        this.scene.add(pool);
                        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lightColor, transparent: true, opacity: haloOpacity, blending: THREE.AdditiveBlending, depthWrite: false }));
                        halo.scale.set(2.6, 2.6, 1);
                        halo.position.set(wx, 1.9, wz);
                        this.scene.add(halo);
                        // 炎: ゆらぐので、静的な部品（addStatic で結合される）ではなく、シーンに直接追加する
                        const liveFlame = new THREE.Group();
                        const lo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0xff8a1f }));
                        lo.position.set(0, 1.9, 0);
                        const li = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), new THREE.MeshBasicMaterial({ color: 0xffe58a }));
                        li.position.set(0, 1.86, 0);
                        liveFlame.add(lo, li);
                        liveFlame.position.set(wx, 0, wz);
                        this.scene.add(liveFlame);
                        this.torchGlows.push({ pool, halo, flame: liveFlame, poolOpacity, haloOpacity, phase: (r * 7 + c * 13) % 10 });
                        break;
                    }

                    case 'fire_jet': {
                        // Periodic Flamethrower / Fire Jet Floor Grate Trap
                        const ventMat = new THREE.MeshLambertMaterial({ map: this.textures.fireVent });
                        const ventMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), ventMat);
                        ventMesh.rotation.x = -Math.PI / 2;
                        ventMesh.position.set(wx, 0.015, wz);
                        this.scene.add(ventMesh);

                        // Flame Pillar Group: Cross-plane volumetric sprite + billboard flame effect
                        const flameGroup = new THREE.Group();
                        const flameW = tileSize * 0.95;
                        const flameH = 4.8; // Tall towering vortex of fire

                        const firePillarMat = new THREE.MeshBasicMaterial({
                            map: this.textures.firePillar,
                            transparent: true,
                            blending: THREE.AdditiveBlending,
                            side: THREE.DoubleSide,
                            depthWrite: false
                        });

                        const firePlaneGeo = new THREE.PlaneGeometry(flameW, flameH);

                        // 4 Cross-planes (0°, 45°, 90°, 135°) for thick 3D cylindrical flame column
                        const planes = [];
                        for (let i = 0; i < 4; i++) {
                            const p = new THREE.Mesh(firePlaneGeo, firePillarMat);
                            p.rotation.y = (i * Math.PI) / 4;
                            p.position.y = flameH / 2;
                            flameGroup.add(p);
                            planes.push(p);
                        }

                        // Dynamic point light for roaring flame
                        const flameLight = new THREE.PointLight(0xff4500, 0, tileSize * 2.8);
                        flameLight.position.set(0, 1.8, 0);
                        flameGroup.add(flameLight);

                        flameGroup.position.set(wx, 0, wz);
                        flameGroup.visible = false;
                        this.scene.add(flameGroup);

                        const jetCycle = objDef.cycleDuration || 3.0;
                        const jetOffset = (objDef.timeOffset !== undefined) ? objDef.timeOffset : ((r * 7 + c * 5) % jetCycle);

                        const fireJetObj = {
                            group: flameGroup,
                            flamePlanes: planes,
                            flameLight: flameLight,
                            x: wx,
                            z: wz,
                            timer: jetOffset,
                            cycleDuration: jetCycle,
                            flameActiveDuration: objDef.activeDuration || 1.2, // 1.2s of roaring fire
                            isErupting: false,
                            soundPlayed: false,
                            damage: objDef.damage || 40,
                            bounds: {
                                minX: wx - tileSize * 0.45, maxX: wx + tileSize * 0.45,
                                minZ: wz - tileSize * 0.45, maxZ: wz + tileSize * 0.45
                            }
                        };
                        this.fireJets.push(fireJetObj);
                        break;
                    }

                    case 'buzzsaw': {
                        // Rail-mounted Rotating Buzzsaw / Sawblade Trap
                        // Detect corridor orientation to sweep ACROSS the hallway (left wall <-> right wall)
                        // If walls are Top and Bottom (East-West passage), saw travels North-South (Z axis)
                        // If walls are Left and Right (North-South passage), saw travels East-West (X axis)
                        const isWallLeft = (c > 0 && mapData.layout[r][c - 1] === '1');
                        const isWallRight = (c < cols - 1 && mapData.layout[r][c + 1] === '1');
                        const isWallTop = (r > 0 && mapData.layout[r - 1][c] === '1');
                        const isWallBottom = (r < rows - 1 && mapData.layout[r + 1][c] === '1');

                        const isEastWestPassage = (isWallTop || isWallBottom) && !(isWallLeft && isWallRight);

                        // Floor rail track (crosswise across corridor)
                        const railMat = new THREE.MeshLambertMaterial({ map: this.textures.buzzsawRail });
                        const railMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), railMat);
                        railMesh.rotation.x = -Math.PI / 2;
                        if (!isEastWestPassage) {
                            // If corridor runs North-South, rail groove runs East-West across corridor
                            railMesh.rotation.z = Math.PI / 2;
                        }
                        railMesh.position.set(wx, 0.015, wz);
                        this.scene.add(railMesh);

                        // 3D Saw Blade Group (stands upright and sweeps from left wall to right wall)
                        const sawGroup = new THREE.Group();
                        const sawRadius = 1.35;
                        const sawMat = new THREE.MeshLambertMaterial({
                            map: this.textures.buzzsawBlade,
                            transparent: true,
                            alphaTest: 0.1,
                            side: THREE.DoubleSide
                        });
                        const sawGeo = new THREE.PlaneGeometry(sawRadius * 2, sawRadius * 2);
                        const sawMesh = new THREE.Mesh(sawGeo, sawMat);

                        // Upright orientation aligned across the track
                        if (isEastWestPassage) {
                            // Corridor runs East-West: blade moves along Z (North-South).
                            // Face blade towards X so player walking down the corridor sees the saw disk head-on!
                            sawMesh.rotation.y = Math.PI / 2;
                        } else {
                            // Corridor runs North-South: blade moves along X (East-West).
                            // Face blade towards Z so player walking along corridor sees the saw disk head-on!
                            sawMesh.rotation.y = 0;
                        }
                        sawMesh.position.y = sawRadius * 0.85;
                        sawGroup.add(sawMesh);

                        sawGroup.position.set(wx, 0, wz);
                        this.scene.add(sawGroup);

                        const sawObj = {
                            group: sawGroup,
                            sawMesh: sawMesh,
                            baseX: wx,
                            baseZ: wz,
                            isEastWest: isEastWestPassage, // East-West corridor means sweep along Z (crosswise)!
                            travelDist: objDef.travelDistance || (tileSize * 0.35), // Sweeps between left and right walls (safe timing window)
                            speed: objDef.speed || 3.0,
                            timer: (r * 3 + c * 7) % 3.0,
                            damage: objDef.damage || 35,
                            radius: 1.05
                        };
                        this.buzzsaws.push(sawObj);
                        break;
                    }

                    case 'trap_tile': {
                        // Hazard traps (spike traps)
                        const trapMat = new THREE.MeshLambertMaterial({ map: this.textures[objDef.texture] });
                        const trapGeo = new THREE.PlaneGeometry(tileSize, tileSize);
                        const trapMesh = new THREE.Mesh(trapGeo, trapMat);
                        trapMesh.rotation.x = -Math.PI / 2;
                        trapMesh.position.set(wx, 0.015, wz);
                        this.scene.add(trapMesh);

                        this.terrainGrid.push({
                            minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                            minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                            depth: 0,
                            trapDamage: objDef.damage || 15,
                            isTrap: true
                        });
                        break;
                    }

                    case 'barrier_floor': {
                        // Dragon Quest style electric barrier floor
                        const barrierMat = new THREE.MeshLambertMaterial({
                            map: this.textures[objDef.texture] || this.textures.electricBarrier,
                            emissive: 0x0284c7, // Vibrant cyan/blue electric glow
                            emissiveIntensity: 0.35
                        });
                        const barrierGeo = new THREE.PlaneGeometry(tileSize, tileSize);
                        const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
                        barrierMesh.rotation.x = -Math.PI / 2;
                        barrierMesh.position.set(wx, 0.02, wz);
                        this.scene.add(barrierMesh);

                        this.terrainGrid.push({
                            minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                            minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                            depth: 0,
                            isBarrier: true,
                            damagePerStep: objDef.damagePerStep || 15
                        });
                        break;
                    }

                    case 'door': {
                        // Wall-mounted interactive door
                        // Detect wall orientation: check if walls are on Left/Right (horizontal door) or Top/Bottom (vertical door)
                        // 壁は '1'、または凡例が壁ブロック（type: block）の文字
                        const isWallChar = (ch) => ch === '1' || ['block', 'door', 'wall_deco', 'wall_image'].includes(this.objectDefinitions[mapData.legend?.[ch]]?.type);   // 並んだ扉は、隣の扉も壁として数える
                        const isWallLeft = (c > 0 && isWallChar(mapData.layout[r][c - 1]));
                        const isWallRight = (c < cols - 1 && isWallChar(mapData.layout[r][c + 1]));
                        const isWallTop = (r > 0 && isWallChar(mapData.layout[r - 1][c]));
                        const isWallBottom = (r < rows - 1 && isWallChar(mapData.layout[r + 1][c]));

                        const isVertical = (isWallTop || isWallBottom) && !(isWallLeft && isWallRight);

                        const doorMat = new THREE.MeshLambertMaterial({ map: this.textures[objDef.texture] || this.textures.door });
                        const frameMat = objDef.frameTexture && this.textures[objDef.frameTexture]
                            ? this.makeLitMaterial(objDef.frameTexture, this.textures[objDef.frameTexture])
                            : brickMat;
                        // 屋内の戸口は、床と天井もつける
                        if (objDef.floorTexture) this.addFloorTile(wx, wz, tileSize, objDef.floorTexture);
                        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
                        const doorThickness = 0.45;
                        const doorW = tileSize * 0.75;
                        // 扉の高さ: 壁が高い建物（大神殿など）で、扉が細長くならないよう、標準の高さで頭打ちにする。
                        //   objects.json の doorHeight で個別に指定もできる。扉の上から天井までは、枠と同じ材質のまぐさでふさぐ
                        const doorH = Math.min(wallH, objDef.doorHeight ?? (wallH <= 5 ? wallH : 4.5));
                        const doorGeo = new THREE.BoxGeometry(doorW, doorH, doorThickness);
                        const doorMesh = new THREE.Mesh(doorGeo, doorMat);

                        // Door Frame Pillars on both sides
                        const pillarW = (tileSize - doorW) / 2;
                        const pillarGeo = new THREE.BoxGeometry(pillarW, wallH, tileSize);

                        const doorGroup = new THREE.Group();

                        if (isVertical) {
                            // North-South passage door (oriented along Z)
                            doorMesh.rotation.y = Math.PI / 2;
                            doorMesh.position.set(0, doorH / 2, 0);

                            const pillar1 = new THREE.Mesh(pillarGeo, frameMat);
                            pillar1.rotation.y = Math.PI / 2;
                            pillar1.position.set(0, wallH / 2, -(doorW / 2 + pillarW / 2));

                            const pillar2 = new THREE.Mesh(pillarGeo, frameMat);
                            pillar2.rotation.y = Math.PI / 2;
                            pillar2.position.set(0, wallH / 2, (doorW / 2 + pillarW / 2));

                            doorGroup.add(doorMesh);
                            doorGroup.add(pillar1);
                            doorGroup.add(pillar2);
                        } else {
                            // East-West passage door (oriented along X)
                            doorMesh.position.set(0, doorH / 2, 0);

                            const pillar1 = new THREE.Mesh(pillarGeo, frameMat);
                            pillar1.position.set(-(doorW / 2 + pillarW / 2), wallH / 2, 0);

                            const pillar2 = new THREE.Mesh(pillarGeo, frameMat);
                            pillar2.position.set((doorW / 2 + pillarW / 2), wallH / 2, 0);

                            doorGroup.add(doorMesh);
                            doorGroup.add(pillar1);
                            doorGroup.add(pillar2);
                        }

                        // まぐさ（扉の上から天井まで）
                        if (wallH > doorH + 1e-6) {
                            const lintelH = wallH - doorH;
                            const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, lintelH, doorThickness), frameMat);
                            if (isVertical) lintel.rotation.y = Math.PI / 2;
                            lintel.position.set(0, doorH + lintelH / 2, 0);
                            doorGroup.add(lintel);
                        }

                        doorGroup.position.set(wx, 0, wz);
                        this.scene.add(doorGroup);

                        // Collider entry that can be opened/removed
                        const collider = {
                            minX: wx - (isVertical ? doorThickness / 2 : tileSize / 2),
                            maxX: wx + (isVertical ? doorThickness / 2 : tileSize / 2),
                            minZ: wz - (isVertical ? tileSize / 2 : doorThickness / 2),
                            maxZ: wz + (isVertical ? tileSize / 2 : doorThickness / 2),
                            isDoor: true
                        };
                        this.colliders.push(collider);

                        this.doors.push({
                            mesh: doorMesh,
                            collider: collider,
                            isOpen: false,
                            targetY: doorH / 2,
                            baseY: doorH / 2,
                            openY: doorH * 1.45,
                            x: wx,
                            z: wz,
                            link: { ...objDef, ...mapData.links?.[`${c},${r}`] },   // 行き先（nextMap）があれば、開いた扉の中へ入ると、そのマップへ移動する。マスごとの指定は map の links
                            half: tileSize / 2
                        });
                        // 店のアイコン: 扉の外側（戻る先の側）の壁の面に、扉の上のほうへ出す
                        const doorLink = this.doors[this.doors.length - 1].link;
                        if (doorLink.icon && doorLink.back && this.textures[doorLink.icon]) {
                            const dx = doorLink.back.x * tileSize + tileSize / 2 - wx;
                            const dz = doorLink.back.z * tileSize + tileSize / 2 - wz;
                            const len = Math.hypot(dx, dz) || 1;
                            const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures[doorLink.icon] }));
                            icon.scale.set(1.5, 1.5, 1);
                            icon.position.set(wx + dx / len * (tileSize / 2 + 0.15), wallH * 0.78, wz + dz / len * (tileSize / 2 + 0.15));
                            this.scene.add(icon);
                        }
                        break;
                    }

                    case 'furniture': {
                        // 家具: 箱形のパーツを組み合わせた置物（objects.json の parts。座標はマス中心からの相対）。
                        // 当たり判定は collider（幅, 奥行き）と colliderOffset（x, z）。壁に寄せた家具は offset でずらす
                        const group = new THREE.Group();
                        for (const p of objDef.parts || []) {
                            const geo = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
                            const mat = p.basic
                                ? new THREE.MeshBasicMaterial({ color: p.color })
                                : new THREE.MeshLambertMaterial({ color: p.color });
                            const mesh = new THREE.Mesh(geo, mat);
                            mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
                            group.add(mesh);
                        }
                        // 壁に寄せた家具（colliderOffset の奥行き方向が 0.5 より大きい物）は、背中が、隣の壁に付く向きに回す。
                        //   定義の向き（offset の符号の側が背中）の側に壁があれば、そのまま。なければ、北・南・西・東の順で、壁のある側へ回す
                        let fOffX = (objDef.colliderOffset || [0, 0])[0], fOffZ = (objDef.colliderOffset || [0, 0])[1];
                        let fCw = objDef.collider ? objDef.collider[0] : 0, fCd = objDef.collider ? objDef.collider[1] : 0;
                        if (Math.abs(fOffZ) > 0.5 && fOffX === 0 && objDef.autoTurn !== false) {
                            const isWallAt = (cc, rr) => {
                                if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return false;
                                const wt = this.objectDefinitions[mapData.legend?.[mapData.layout[rr][cc]]];
                                return !!wt && ['block', 'wall_deco', 'wall_image'].includes(wt.type);
                            };
                            const own = fOffZ < 0 ? [0, -1] : [0, 1];
                            const wallDir = isWallAt(c + own[0], r + own[1]) ? own
                                : [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dz]) => isWallAt(c + dx, r + dz));
                            if (wallDir) {
                                const sgn = fOffZ < 0 ? -1 : 1, depthOff = Math.abs(fOffZ);
                                group.rotation.y = Math.atan2(sgn * wallDir[0], sgn * wallDir[1]);
                                fOffX = depthOff * wallDir[0]; fOffZ = depthOff * wallDir[1];
                                if (wallDir[0] !== 0) { const t = fCw; fCw = fCd; fCd = t; }   // 東西の壁なら、当たり判定の幅と奥行きを入れ替える
                            }
                        }
                        group.position.set(wx, 0, wz);
                        this.addStatic(group);
                        // 家具の上に、花などの画像（plants: 花壇の花）を植える。マスの位置から決まる配置（毎回同じ）
                        if (objDef.plants) {
                            const pl = objDef.plants;
                            const tex = this.textures[pl.texture] || this.textures.grassTuft;
                            const n = pl.count || 4;
                            for (let i = 0; i < n; i++) {
                                const h1 = Math.sin((r * 12.9898 + c * 78.233 + i * 37.719) * 43758.5453) * 43758.5453;
                                const h2 = Math.sin((r * 39.346 + c * 11.135 + i * 83.155) * 24634.6345) * 24634.6345;
                                const fx = h1 - Math.floor(h1), fz = h2 - Math.floor(h2);
                                // 2×2 のマス目の中で、少しずらす（重ならずに、花壇いっぱいに並ぶ）
                                const gx = (i % 2 ? 1 : -1) * (pl.spread / 4) + (fx - 0.5) * 0.25;
                                const gz = (i < 2 ? -1 : 1) * (pl.spread / 4) + (fz - 0.5) * 0.25;
                                const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
                                sp.center.set(0.5, 0.0);
                                const k = 0.9 + fx * 0.25;
                                sp.scale.set(pl.scale[0] * k, pl.scale[1] * k, 1);
                                sp.position.set(wx + gx, (pl.y ?? 0.3), wz + gz);
                                this.scene.add(sp);
                            }
                        }
                        const furnitureFloor = objDef.floorTexture ?? mapData.decorFloor;   // 屋外の街では、飾りの下も石畳（map の decorFloor）
                        if (furnitureFloor) this.addFloorTile(wx, wz, tileSize, furnitureFloor);
                        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
                        if (objDef.collider) {
                            const cw = fCw, cd = fCd;
                            const ox = fOffX, oz = fOffZ;
                            this.colliders.push({
                                minX: wx + ox - cw / 2, maxX: wx + ox + cw / 2,
                                minZ: wz + oz - cd / 2, maxZ: wz + oz + cd / 2,
                                blocksProjectiles: objDef.blocksProjectiles === true
                            });
                        }
                        break;
                    }

                    case 'plant': {
                        // 草むら・生い茂る草・野の花: 当たり判定のない見た目だけの飾り。
                        // 1 マスに count 枚のスプライトを、マスの位置から決まる配置（毎回同じ）で散らす
                        if (mapData.decorFloor) this.addFloorTile(wx, wz, tileSize, mapData.decorFloor);
                        const plantTex = this.textures[objDef.texture] || this.textures.grassTuft;
                        const count = objDef.count || 4;
                        const spread = objDef.spread || tileSize * 0.8;
                        const [pw, ph] = objDef.scale || [1.2, 1.0];
                        for (let i = 0; i < count; i++) {
                            const h1 = Math.sin((r * 12.9898 + c * 78.233 + i * 37.719) * 43758.5453) * 43758.5453;
                            const h2 = Math.sin((r * 39.346 + c * 11.135 + i * 83.155) * 24634.6345) * 24634.6345;
                            const fx = h1 - Math.floor(h1);
                            const fz = h2 - Math.floor(h2);
                            // 同じ画像の草は、材質を共有する（草が大量になるため。1 枚ごとに作ると、重い）
                            this.plantMats = this.plantMats || new Map();
                            if (!this.plantMats.has(plantTex)) this.plantMats.set(plantTex, new THREE.SpriteMaterial({ map: plantTex }));
                            const sprite = new THREE.Sprite(this.plantMats.get(plantTex));
                            sprite.center.set(0.5, 0.0);
                            const k = 0.8 + fx * 0.5;   // 大きさのばらつき
                            sprite.scale.set(pw * k, ph * k, 1);
                            sprite.position.set(wx + (fx - 0.5) * spread, -0.02, wz + (fz - 0.5) * spread);
                            this.scene.add(sprite);
                            sprite.updateMatrix(); sprite.matrixAutoUpdate = false;   // 動かない
                            this.cullSprites.push(sprite);
                        }
                        break;
                    }

                    case 'liquid_tile': {
                        // Truly sunken water basin: Sand and grass sit at Y=0, water basin sits below at Y=-0.2 ~ -0.4
                        const isShallow = (objDef.texture === 'shallowWater');
                        const bedY = isShallow ? -0.25 : -0.55;
                        const waterSurfaceY = isShallow ? -0.12 : -0.20; // Water surface is below grass level
                        const depth = Math.abs(waterSurfaceY);

                        // 1. Sunken waterbed (Sandy bottom)
                        const bedMat = new THREE.MeshLambertMaterial({ map: this.textures.sand });
                        const bedGeo = new THREE.PlaneGeometry(tileSize, tileSize);
                        const bedMesh = new THREE.Mesh(bedGeo, bedMat);
                        bedMesh.rotation.x = -Math.PI / 2;
                        bedMesh.position.set(wx, bedY, wz);
                        this.scene.add(bedMesh);

                        // 2. Vertical basin walls (Step down from grass Y=0 to waterbed)
                        const bankMat = new THREE.MeshLambertMaterial({ map: this.textures.sand });
                        const wallH = Math.abs(bedY);
                        const half = tileSize / 2;

                        // Check four adjacent cells to build cliffs/banks where land meets water
                        const neighbors = [
                            { dr: -1, dc: 0, pos: [wx, bedY / 2, wz - half], rot: 0, w: tileSize }, // North
                            { dr: 1, dc: 0, pos: [wx, bedY / 2, wz + half], rot: Math.PI, w: tileSize }, // South
                            { dr: 0, dc: -1, pos: [wx - half, bedY / 2, wz], rot: Math.PI / 2, w: tileSize }, // West
                            { dr: 0, dc: 1, pos: [wx + half, bedY / 2, wz], rot: -Math.PI / 2, w: tileSize } // East
                        ];

                        neighbors.forEach(n => {
                            const nr = r + n.dr;
                            const nc = c + n.dc;
                            const isNeighborWater = (nr >= 0 && nr < rows && nc >= 0 && nc < cols && waterMap[nr][nc]);
                            if (!isNeighborWater) {
                                // Land edge bank
                                const bankGeo = new THREE.PlaneGeometry(n.w, wallH);
                                const bankMesh = new THREE.Mesh(bankGeo, bankMat);
                                bankMesh.position.set(n.pos[0], n.pos[1], n.pos[2]);
                                bankMesh.rotation.y = n.rot;
                                this.scene.add(bankMesh);
                            }
                        });

                        // 3. Translucent animated liquid surface below ground level
                        const liquidTex = this.textures[objDef.texture] || (isShallow ? this.textures.shallowWater : this.textures.water);
                        const isLava = (objDef.texture === 'lava');
                        const isPoison = (objDef.texture === 'poisonSwamp');
                        const waterMat = new THREE.MeshLambertMaterial({
                            map: liquidTex,
                            transparent: true,
                            opacity: isShallow ? 0.72 : (isLava ? 1.0 : 0.92),
                            emissive: isLava ? 0xff2200 : (isPoison ? 0x220533 : (objDef.glow ? new THREE.Color(objDef.glow).getHex() : 0x000000)),
                            emissiveIntensity: isLava ? 0.85 : (objDef.glow ? 0.9 : 0.3)   // glow: 水面が、自ら光る（洞窟の地底湖）
                        });
                        const waterGeo = new THREE.PlaneGeometry(tileSize, tileSize);
                        const waterMesh = new THREE.Mesh(waterGeo, waterMat);
                        waterMesh.rotation.x = -Math.PI / 2;
                        waterMesh.position.set(wx, waterSurfaceY, wz);
                        this.scene.add(waterMesh);
                        this.waterMeshes.push(waterMesh);

                        // If lava, add rising 3D heat wisps/smoke
                        // （溶岩 1 マスごとの点光源は置かない: 火山では 566 個になり、GPU の上限を超えて、地面などの材質が描画されなくなるため）
                        if (isLava) {

                            // Spawn 3 layered billboard sprites per lava tile that rise vertically and face player
                            const hazeMat = new THREE.SpriteMaterial({
                                map: this.textures.heatHaze,
                                transparent: true,
                                opacity: 0.65,
                                blending: THREE.AdditiveBlending,
                                depthWrite: false
                            });

                            // Positions scattered slightly across the tile with balanced heat shimmer volume
                            const hazeOffsets = [
                                { ox: 0, oz: 0, baseScale: 2.2, phase: 0 },
                                { ox: -tileSize * 0.22, oz: tileSize * 0.2, baseScale: 1.8, phase: 1.8 },
                                { ox: tileSize * 0.25, oz: -tileSize * 0.18, baseScale: 1.9, phase: 3.5 }
                            ];

                            hazeOffsets.forEach(ho => {
                                const sprite = new THREE.Sprite(hazeMat.clone());
                                sprite.center.set(0.5, 0.0); // Exact bottom contact with lava surface
                                sprite.scale.set(ho.baseScale, ho.baseScale * 0.55, 1);
                                sprite.position.set(wx + ho.ox, waterSurfaceY, wz + ho.oz);
                                this.scene.add(sprite);
                                this.heatHazePlanes.push({
                                    sprite: sprite,
                                    baseX: wx + ho.ox,
                                    baseZ: wz + ho.oz,
                                    baseY: waterSurfaceY,
                                    baseScale: ho.baseScale,
                                    phase: ho.phase,
                                    tileX: wx,
                                    tileZ: wz
                                });
                            });
                        }

                        if (objDef.solid) {
                            this.colliders.push({
                                minX: wx - tileSize / 2,
                                maxX: wx + tileSize / 2,
                                minZ: wz - tileSize / 2,
                                maxZ: wz + tileSize / 2,
                                blocksProjectiles: objDef.blocksProjectiles !== false
                            });
                        }

                        this.terrainGrid.push({
                            minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                            minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                            depth: depth,
                            slowdown: objDef.slowdown || 0.65,
                            damagePerSec: objDef.damagePerSec || 0,
                            hazardType: objDef.hazardType,
                            current: objDef.current ? { x: objDef.current[0], z: objDef.current[1], speed: objDef.currentSpeed ?? 3 } : null,   // 急流: 乗ると、この向きへ流される
                            isWater: true
                        });
                        break;
                    }

                    case 'gateway': {
                        // 壁の切れ目・開いた門: 見えない移動マス。このマスへ入ると nextMap へ移動する
                        if (objDef.floorTexture) this.addFloorTile(wx, wz, tileSize, objDef.floorTexture);
                        this.portals.push({ x: wx, z: wz, halfSize: tileSize / 2, mesh: null, link: { ...objDef, nextMap: objDef.nextMap ?? mapData.nextMap, ...mapData.links?.[`${c},${r}`] } });
                        break;
                    }

                    case 'stairs': {
                        // 階段（上り・下り）: 見た目は、段を積んだ箱。踏むと、links の nextMap の spawn の位置へ移動する（別の階・別の建物）。
                        //   向き（上る・下りる方向）は、links の dir（n/e/s/w）。なければ、通れる隣マスが1つだけのとき、その反対側（行き止まりの壁へ向かう）
                        const key = `${c},${r}`;
                        const isSolidChar = (cc, rr) => {
                            if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return true;
                            const ch = mapData.layout[rr][cc];
                            if (ch === '1') return true;
                            const t = this.objectDefinitions[mapData.legend?.[ch]];
                            return !!t && (t.solid === true || ['block', 'door', 'furniture'].includes(t.type));
                        };
                        const dirKey = stairsFacing(isSolidChar, c, r, mapData.links?.[key]?.dir);
                        const [sdx, sdz] = STAIRS_DIRS[dirKey];

                        const stairTex = this.textures[objDef.texture] || this.textures.floorStone;
                        const STEPS = 5, total = Math.min(wallH * 0.7, 2.8), riser = total / STEPS;
                        const group = new THREE.Group();
                        if (objDef.direction === 'down') {
                            // 下り階段: 上り階段と同じ作りで、段が、床から下へ降りていく（床に穴を開けて、段を下へ降ろす）。枠や黒い壁は付けない。
                            //   段は浅く（1段 0.25）して、床の縁に隠れず、階段に見えるようにする。段ごとに、明暗を交互にして、段を見せる
                            const DROP = 0.25, deepTotal = STEPS * DROP;
                            for (let i = 0; i < STEPS; i++) {
                                const k = (i % 2 === 0 ? 1.0 : 0.72) * (1 - i * 0.04);
                                const mat = new THREE.MeshLambertMaterial({ map: stairTex, color: new THREE.Color(0xffffff).multiplyScalar(k) });
                                const depth = tileSize / STEPS, top = -(i + 1) * DROP, h = Math.max(deepTotal + top, 0.05);   // 底は、穴の底（-deepTotal）
                                const step = new THREE.Mesh(new THREE.BoxGeometry(depth, h, tileSize), mat);
                                step.position.set(-tileSize / 2 + (i + 0.5) * depth, -deepTotal + h / 2, 0);
                                group.add(step);
                            }
                            // 穴の壁（左右と奥）。段と同じ材質。壁がないと、浅い角度から見たとき、穴の奥の下から、空の色が透けて見える
                            const wallMat = new THREE.MeshLambertMaterial({ map: stairTex, color: new THREE.Color(0xffffff).multiplyScalar(0.75), side: THREE.DoubleSide });
                            for (const side of [-1, 1]) {
                                const w = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, deepTotal), wallMat);
                                w.position.set(0, -deepTotal / 2, side * tileSize / 2);
                                group.add(w);
                            }
                            const far = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, deepTotal), wallMat);
                            far.rotation.y = Math.PI / 2;
                            far.position.set(tileSize / 2, -deepTotal / 2, 0);
                            group.add(far);
                            group.position.set(wx, 0, wz);
                            group.rotation.y = Math.atan2(-sdz, sdx);   // ローカルの +X（奥）を、dir の向きにする
                            this.scene.add(group);
                        } else {
                            // 上り階段: 段を5つ積んだ箱。上面は (i+1) × riser
                            const stairMat = new THREE.MeshLambertMaterial({ map: stairTex });
                            for (let i = 0; i < STEPS; i++) {
                                const depth = tileSize / STEPS, h = (i + 1) * riser;
                                const step = new THREE.Mesh(new THREE.BoxGeometry(depth, h, tileSize), stairMat);
                                step.position.set(-tileSize / 2 + (i + 0.5) * depth, h / 2, 0);   // 向き（dir）に沿った位置
                                group.add(step);
                            }
                            group.position.set(wx, 0, wz);
                            group.rotation.y = Math.atan2(-sdz, sdx);   // ローカルの +X を、dir の向きにする
                            this.scene.add(group);
                        }
                        if (objDef.floorTexture) this.addFloorTile(wx, wz, tileSize, objDef.floorTexture);
                        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
                        this.portals.push({ x: wx, z: wz, halfSize: tileSize / 2, mesh: null, link: { ...objDef, nextMap: objDef.nextMap ?? mapData.nextMap, ...mapData.links?.[key] } });
                        break;
                    }

                    case 'statue': {
                        // 像（画像）: 台座の上に、画像の板が、常にこちらを向いて立つ（スプライト）。後ろに、淡い光の輪（glow）をつける
                        const pedH = objDef.pedestalHeight ?? 0.6;
                        const pedMat = this.makeLitMaterial(objDef.pedestalTexture || 'marbleWall', this.textures[objDef.pedestalTexture || 'marbleWall']);
                        const ped = new THREE.Mesh(new THREE.BoxGeometry(objDef.pedestalWidth ?? tileSize * 0.55, pedH, objDef.pedestalWidth ?? tileSize * 0.55), pedMat);   // 台座の幅は、pedestalWidth で指定（特大・小の像用）
                        ped.position.set(wx, pedH / 2, wz);
                        this.scene.add(ped);
                        const imgTex = this.getObjectImageTexture(objDef.imageFile);
                        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: imgTex, transparent: true, alphaTest: 0.05 }));
                        sprite.center.set(0.5, 0.0);
                        sprite.scale.set(objDef.height * (objDef.aspect || 0.5), objDef.height, 1);
                        sprite.position.set(wx, pedH, wz);
                        this.scene.add(sprite);
                        if (objDef.glow) {
                            const cv = document.createElement('canvas');
                            cv.width = cv.height = 128;
                            const cx = cv.getContext('2d');
                            const grad = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
                            grad.addColorStop(0, 'rgba(255, 244, 200, 0.55)');
                            grad.addColorStop(1, 'rgba(255, 244, 200, 0)');
                            cx.fillStyle = grad;
                            cx.fillRect(0, 0, 128, 128);
                            const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
                            halo.scale.set(objDef.height * 1.3, objDef.height * 1.3, 1);
                            halo.position.set(wx, pedH + objDef.height * 0.5, wz - 0.05);
                            this.scene.add(halo);
                        }
                        if (objDef.floorTexture ?? mapData.decorFloor) this.addFloorTile(wx, wz, tileSize, objDef.floorTexture ?? mapData.decorFloor);
                        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
                        if (objDef.solid) {
                            const rad = objDef.radius || 0.8;
                            this.colliders.push({
                                minX: wx - rad, maxX: wx + rad, minZ: wz - rad, maxZ: wz + rad,
                                blocksProjectiles: objDef.blocksProjectiles === true
                            });
                        }
                        break;
                    }

                    case 'wall_image': {
                        // 壁の画像（ステンドグラスなど）: 壁のブロックの、通れる隣のマスに向いた面に、画像を貼る。画像は自ら光る材質（ガラス越しの光）
                        const wallMat = this.makeLitMaterial(objDef.wallTexture || 'marbleWall', this.textures[objDef.wallTexture || 'marbleWall']);
                        const body = new THREE.Mesh(standardWallGeo, wallMat);
                        body.position.set(wx, wallH / 2, wz);
                        this.scene.add(body);
                        if (objDef.solid) {
                            this.colliders.push({
                                minX: wx - tileSize / 2, maxX: wx + tileSize / 2, minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                                blocksProjectiles: objDef.blocksProjectiles !== false
                            });
                        }
                        const isOpen = (cc, rr) => {
                            if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return false;
                            const ch = mapData.layout[rr][cc];
                            if (ch === '1') return false;
                            const t = this.objectDefinitions[mapData.legend?.[ch]];
                            return !t || !['block', 'door', 'wall_image'].includes(t.type);   // 像・家具の後ろの壁にも、画像を貼る
                        };
                        const imgMat = new THREE.MeshBasicMaterial({ map: this.getObjectImageTexture(objDef.imageFile), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
                        const ih = objDef.height, iw = ih * (objDef.aspect || 0.5), off = tileSize / 2 + 0.02;
                        for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                            if (!isOpen(c + dx, r + dz)) continue;
                            const plane = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), imgMat);
                            plane.position.set(wx + dx * off, (objDef.bottom ?? 1.0) + ih / 2, wz + dz * off);
                            plane.rotation.y = Math.atan2(dx, dz);   // 面の向きを、開いた隣のマスのほうへ
                            this.scene.add(plane);
                        }
                        break;
                    }

                    case 'hanging': {
                        // 天井から吊るす飾り（シャンデリア・吊りランプ）: 箱形のパーツの組み合わせ（家具と同じ parts）。
                        //   fromCeiling が true なら、パーツの y は、天井からの相対（下向きは負）。通り抜けられる（当たり判定なし）。
                        //   炎などは basic: true（自ら光る材質）で、光らせる。周囲を照らす光源（PointLight）は付けない（見た目のみ）
                        const group = new THREE.Group();
                        for (const p of objDef.parts || []) {
                            const mat = p.basic
                                ? new THREE.MeshBasicMaterial({ color: p.color })
                                : new THREE.MeshLambertMaterial({ color: p.color });
                            const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]), mat);
                            mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
                            group.add(mesh);
                        }
                        group.position.set(wx, objDef.fromCeiling ? wallH : 0, wz);
                        this.addStatic(group);
                        const hangFloor = objDef.floorTexture ?? mapData.decorFloor;
                        if (hangFloor) this.addFloorTile(wx, wz, tileSize, hangFloor);
                        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
                        break;
                    }

                    case 'wall_deco': {
                        // 壁の飾り（燭台・旗など）: 壁のブロックの、通れる隣のマスに向いた面に、箱形のパーツを付ける。
                        //   パーツの座標は、面の中心からの相対（x: 横、y: 床からの高さ、z: 壁から手前へ）
                        const wallMat = this.makeLitMaterial(objDef.wallTexture || 'brick', this.textures[objDef.wallTexture || 'brick']);
                        const body = new THREE.Mesh(standardWallGeo, wallMat);
                        body.position.set(wx, wallH / 2, wz);
                        this.addStatic(body);
                        this.colliders.push({
                            minX: wx - tileSize / 2, maxX: wx + tileSize / 2, minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                            blocksProjectiles: true
                        });
                        const isOpenDeco = (cc, rr) => {
                            if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return false;
                            const ch = mapData.layout[rr][cc];
                            if (ch === '1') return false;
                            const t = this.objectDefinitions[mapData.legend?.[ch]];
                            return !t || !['block', 'door', 'wall_image', 'wall_deco'].includes(t.type);
                        };
                        for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                            if (!isOpenDeco(c + dx, r + dz)) continue;
                            const face = new THREE.Group();
                            for (const p of objDef.parts || []) {
                                const mat = p.basic
                                    ? new THREE.MeshBasicMaterial({ color: p.color })
                                    : new THREE.MeshLambertMaterial({ color: p.color });
                                const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]), mat);
                                mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
                                face.add(mesh);
                            }
                            face.position.set(wx + dx * tileSize / 2, 0, wz + dz * tileSize / 2);
                            face.rotation.y = Math.atan2(dx, dz);   // ローカルの +Z（手前）を、開いた隣のマスのほうへ
                            this.addStatic(face);
                        }
                        break;
                    }

                    case 'portal': {
                        const portalGeo = new THREE.CylinderGeometry(0.8, 0.8, 2.5, 16);
                        const portalMat = new THREE.MeshBasicMaterial({ color: objDef.color ? parseInt(objDef.color.slice(1), 16) : 0x38bdf8, wireframe: true });
                        const portalMesh = new THREE.Mesh(portalGeo, portalMat);
                        portalMesh.position.set(wx, 1.25, wz);
                        this.scene.add(portalMesh);
                        this.portals.push({ x: wx, z: wz, radius: 1.2, mesh: portalMesh, link: { ...objDef, nextMap: objDef.nextMap ?? mapData.nextMap, ...mapData.links?.[`${c},${r}`] } });
                        break;
                    }
                }
            }
        }

        unlift();   // 持ち上げ用に差し替えた scene.add を元に戻す
        if (this.seaCells.length) this.buildSea(rows, cols, tileSize);

        // 動かない部品（床・天井・壁・家具など）を、材質ごとに1つにまとめる（描画の回数を減らして、CPU の負荷を下げる）
        this.mergeStaticMeshes();

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

    // ---- 武器スロットと魔法スロット（アイテム定義は items.json、初期値は player.json）----
    //   武器スロット（player.equipSlots・8 枠）: 近接武器は「突進攻撃」に、杖・ロッドは魔法の補正に使う。HUD のクリックで選ぶ
    //   魔法スロット（player.magicSlots・4 枠）: 呪文または弓。数字キー 1〜4 で切り替え、中身は HUD のセレクトボックスで自由に選ぶ。Space / F / クリックで使う
    getSlotItem(slot) {
        const id = (slot === null || slot === undefined) ? null : this.player.equipSlots[slot];
        return (id && this.items[id]) || null;
    }

    // 突進攻撃に使う近接武器（未装備なら素手）
    getMeleeItem() {
        return this.getSlotItem(this.player.meleeSlot) || this.items.fists || null;
    }

    // 魔法を補正する杖・ロッド（未装備なら null）
    getFocusItem() {
        return this.getSlotItem(this.player.focusSlot);
    }

    // 選択中の魔法スロットのアイテム（空きなら null）
    getMagicItem(slot = this.player.selectedMagic) {
        const id = this.player.magicSlots[slot];
        return (id && this.items[id]) || null;
    }

    // 武器スロットのクリック選択: 近接武器は突進用に装備、杖・ロッドは補正として装備（もう一度選ぶと外れる）。空きは何も変わらない
    selectSlot(slot) {
        const item = this.getSlotItem(slot);
        const cls = item && this.weaponClasses[item.weaponClass];
        if (!cls) return;
        if (cls.attack === 'melee') {
            this.player.meleeSlot = slot;
        } else if (cls.attack === 'cast') {
            this.player.focusSlot = (this.player.focusSlot === slot) ? null : slot;
        }
        this.updateEquipHud();
    }

    // 数字キー 1〜4: 魔法スロットを選ぶ（範囲外は無視。空きスロットも選べる）
    selectMagic(slot) {
        if (slot < 0 || slot >= this.player.magicSlots.length) return;
        this.player.selectedMagic = slot;
        this.updateEquipHud();
    }

    // Tab: 次の「空きでない」魔法スロットへ順送り
    cycleMagic() {
        const slots = this.player.magicSlots;
        for (let step = 1; step <= slots.length; step++) {
            const next = (this.player.selectedMagic + step) % slots.length;
            if (this.getMagicItem(next)) {
                this.selectMagic(next);
                return;
            }
        }
    }

    // 魔法スロットに入れられるのは、呪文または弓（shoot クラスの武器）
    isMagicItem(item) {
        if (!item) return false;
        if (item.kind === 'spell') return true;
        return this.weaponClasses[item.weaponClass]?.attack === 'shoot';
    }

    // 魔法スロットの中身を変える（HUD のセレクトボックス / デバッグ: game.setMagicSlot(2, 'magic_bolt')）
    setMagicSlot(slot, itemId) {
        if (slot < 0 || slot >= this.player.magicSlots.length) {
            console.warn(`魔法スロット番号が範囲外です (0〜${this.player.magicSlots.length - 1})`);
            return false;
        }
        if (itemId !== null && !this.isMagicItem(this.items[itemId])) {
            console.warn(`魔法スロットに入れられません（呪文または弓のみ）: ${itemId}`);
            return false;
        }
        this.player.magicSlots[slot] = itemId;
        this.updateEquipHud();
        return true;
    }

    // デバッグ用: 武器スロットの中身を差し替える（コンソールから game.equipItem(6, 'iron_mace') / game.equipItem(6, null)）
    //   入れられるのは近接武器と杖・ロッド。呪文と弓は魔法スロットへ（setMagicSlot）
    equipItem(slot, itemId) {
        if (slot < 0 || slot >= this.player.equipSlots.length) {
            console.warn(`スロット番号が範囲外です (0〜${this.player.equipSlots.length - 1})`);
            return false;
        }
        if (itemId !== null && !this.items[itemId]) {
            console.warn(`未定義のアイテムです: ${itemId} （game.listItems() で一覧）`);
            return false;
        }
        if (itemId !== null && this.isMagicItem(this.items[itemId])) {
            console.warn(`武器スロットには入れられません（呪文・弓は魔法スロットへ: game.setMagicSlot）: ${itemId}`);
            return false;
        }
        this.player.equipSlots[slot] = itemId;
        // 装備中だったスロットを差し替えた場合は、装備を外す
        if (this.player.meleeSlot === slot) this.player.meleeSlot = null;
        if (this.player.focusSlot === slot) this.player.focusSlot = null;
        this.updateEquipHud();
        return true;
    }

    // デバッグ用: アイテム定義の一覧と、現在の武器・魔法スロットの中身をコンソールに表示
    listItems() {
        console.table(Object.values(this.items).map(i => ({ id: i.id, name: i.name, kind: i.kind, class: i.weaponClass ?? i.type })));
        console.log('武器スロット:', this.player.equipSlots.map((id, i) => `${i + 1}:${id ?? '(空き)'}`).join('  '));
        console.log('魔法スロット:', this.player.magicSlots.map((id, i) => `${i + 1}:${id ?? '(空き)'}`).join('  '));
    }

    // 武器・魔法スロット HUD
    //   武器: クリックで選択（突進用=金、補正の杖・ロッド=緑。空きは破線）
    //   魔法: 数字キー 1〜4 で切り替え（選択中=青）、中身はセレクトボックスで自由に選ぶ
    updateEquipHud() {
        const weaponEl = jhtml.$('weaponHud');
        if (weaponEl) {
            weaponEl.innerHTML = this.player.equipSlots.map((id, i) => {
                const item = (id && this.items[id]) || null;
                const cls = (i === this.player.meleeSlot ? 'active-melee ' : '') + (i === this.player.focusSlot ? 'active-focus ' : '') + (item ? '' : 'empty');
                return jhtml.html`<span class="weapon-slot ${cls}" data-slot="${i}">${item ? item.name : '―'}</span>`;
            }).join('');
        }

        const magicEl = jhtml.$('magicHud');
        if (magicEl) {
            const options = Object.values(this.items).filter(it => this.isMagicItem(it));
            magicEl.innerHTML = this.player.magicSlots.map((id, i) => jhtml.html`<label class="magic-slot ${i === this.player.selectedMagic ? 'active-magic' : ''}">${i + 1}<select data-slot="${i}"><option value="">（なし）</option>${options.map(o => jhtml.html`<option value="${o.id}" ${o.id === id ? 'selected' : ''}>${o.name}</option>`)}</select></label>`).join('');
        }
    }

    // HUD の操作（武器スロットのクリック、魔法スロットのセレクトボックス）。コンストラクタから一度だけ呼ぶ
    initEquipHudEvents() {
        jhtml.on('weaponHud', 'click', '.weapon-slot', (e, el) => {
            this.selectSlot(Number(el.dataset.slot));
        });
        jhtml.on('magicHud', 'change', 'select', (e, el) => {
            this.setMagicSlot(Number(el.dataset.slot), el.value || null);
            el.blur(); // ゲームのキー操作（数字キーなど）をセレクトボックスが奪わないようにする
        });
        jhtml.on('magicHud', 'click', '.magic-slot', (e, el) => {
            // 枠のラベルをクリックしたとき（セレクトボックス以外）はその枠を選ぶ
            if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') {
                this.selectMagic(Number(el.querySelector('select').dataset.slot));
            }
        });
    }

    // 武器エフェクトのテスト表示（HUD の「エフェクトテスト」パネル）。突進を当てなくても、各武器クラスの斬撃エフェクトを確認できる
    //   strength: 'normal'=通常のヒット / 'crit'=半ずらし会心 / 'kill'=会心で撃破（最も強い）
    testWeaponEffect(classId, strength = 'normal') {
        const cls = this.weaponClasses[classId];
        if (!cls || cls.attack !== 'melee') return false;
        this.slashEffects.spawn(cls.range, cls.arcDeg, cls.effect, effectPower(strength !== 'normal', strength === 'kill'));
        return true;
    }

    updateEffectTestHud() {
        const el = jhtml.$('effectTestHud');
        if (!el) return;
        const classes = Object.entries(this.weaponClasses).filter(([, c]) => c.attack === 'melee');
        el.innerHTML = jhtml.html`<select id="effectTestStrength"><option value="normal">通常</option><option value="crit">会心</option><option value="kill">会心＋撃破</option></select>`
            + classes.map(([id, c]) => jhtml.html`<button class="test-btn" data-class="${id}">${c.name}</button>`).join('');
    }

    // エフェクトテストの操作（コンストラクタから一度だけ呼ぶ）
    initEffectTestEvents() {
        jhtml.on('effectTestHud', 'click', '.test-btn', (e, el) => {
            const strength = jhtml.$('effectTestStrength')?.value || 'normal';
            this.testWeaponEffect(el.dataset.class, strength);
            el.blur(); // ゲームのキー操作をボタンが奪わないようにする
        });
        jhtml.on('effectTestHud', 'change', 'select', (e, el) => el.blur());
    }

    // Space / F / クリック: 選択中の魔法スロットを使う。呪文は杖・ロッドの補正（威力・消費MP・間隔）を受け、弓は矢を放つ
    useMagic() {
        const item = this.getMagicItem();
        if (!item) return;
        if (this.player.magicCooldown > 0) return;
        if (this.player.status?.paralysis?.t > 0) return;   // 麻痺: 何もできない
        if (item.kind === 'spell' && this.player.status?.silence?.t > 0) {   // 沈黙: 呪文が使えない（弓は使える）
            this.player.magicCooldown = 0.5;
            this.addPopup('沈黙… 魔法が使えない', '#a78bfa');
            return;
        }

        if (item.kind === 'spell') {
            const focus = this.getFocusItem();
            const fcls = focus && this.weaponClasses[focus.weaponClass];
            const powerScale = (fcls?.spellPowerScale ?? 1) * (focus?.powerScale ?? 1);
            const mp = Math.ceil(item.mp * (fcls?.mpScale ?? 1));
            if (mp > 0 && this.player.mp < mp) {
                this.addPopup('MP不足!', '#38bdf8');
                return;
            }
            this.player.mp -= mp;
            this.player.magicCooldown = item.cooldown * (fcls?.cooldownScale ?? 1);
            if (item.type === 'strike') this.castStrike(item, powerScale);
            else this.shootProjectiles(item, powerScale);
        } else {
            const cls = this.weaponClasses[item.weaponClass];
            if (cls?.attack !== 'shoot') return;
            this.player.magicCooldown = cls.cooldown;
            this.shootArrow(item, cls);
        }
    }

    // プレイヤーの弾の、発射の高さを決める。起伏のあるマップでは、目の前（正面の ±25 度）の最も近い敵へ、
    //   上下にも狙いをつける（高い所から、低い所の敵へ撃ち下ろす／低い所から、高い所の敵へ撃ち上げる）。敵がいなければ、水平に飛ぶ
    aimProjectileHeight(p, dirX, dirZ) {
        const y0 = this.getFloorHeight(this.player.x, this.player.z, this.player.heightLevel) + 1.3;
        let vy = 0;
        if (this.heightMap || this.monsters.some(m => m.flying)) {
            let best = null, bestD = 40;
            for (const m of this.monsters) {
                if (!m.active) continue;
                const dx = m.x - this.player.x, dz = m.z - this.player.z;
                const d = Math.hypot(dx, dz);
                if (d < 0.5 || d >= bestD) continue;
                if ((dx * dirX + dz * dirZ) / d < Math.cos(25 * Math.PI / 180)) continue;   // 正面の外
                best = m; bestD = d;
            }
            if (best) {
                const ty = (best.floorY ?? 0) + (best.baseY ?? 0) + 0.9;   // 敵の胴の高さ（飛んでいる敵は、飛んでいる高さ）
                vy = (ty - y0) / (bestD / p.speed);
            }
        }
        p.setHeight(y0, vy);
    }

    // 弓: 重力で落ちる矢を放つ（MP 不要。射程はクラスの range）
    shootArrow(item, cls) {
        const dirX = -Math.sin(this.player.angle);
        const dirZ = -Math.cos(this.player.angle);
        const damage = Math.floor(this.playerAttackPower() * cls.damageScale * (item.powerScale ?? 1) + Math.random() * (item.randomBonus ?? 0));
        const arrow = new Projectile(this.player.x + dirX * 0.8, this.player.z + dirZ * 0.8, dirX, dirZ, true, cls.projectileSpeed, damage, {
            type: 'arrow',
            maxDistance: cls.range
        });
        arrow.label = cls.name;
        this.aimProjectileHeight(arrow, dirX, dirZ);
        this.projectiles.push(arrow);
        this.scene.add(arrow.mesh);
        this.sound.playBowShoot();
    }

    // 飛び道具（ファイア・拡散弾・マジックボルト）: count 発を spreadDeg 間隔の扇状に発射
    shootProjectiles(w, powerScale = 1.0) {
        this.sound.playSpellShoot(w.sound);

        const count = w.count || 1;
        const spreadRad = (w.spreadDeg || 0) * Math.PI / 180;
        let spawnX = this.player.x;
        let spawnZ = this.player.z;

        for (let i = 0; i < count; i++) {
            const angle = this.player.angle + (i - (count - 1) / 2) * spreadRad;
            const dirX = -Math.sin(angle);
            const dirZ = -Math.cos(angle);

            // Spawn fireball slightly ahead of player
            spawnX = this.player.x + dirX * 0.8;
            spawnZ = this.player.z + dirZ * 0.8;

            const fireball = new Projectile(spawnX, spawnZ, dirX, dirZ, true, w.speed, Math.floor(w.damage * powerScale), {
                visual: w.visual,
                status: w.status,
                pierce: w.pierce,
                label: w.name,
                soundKind: w.sound,
                element: w.element
            });
            this.aimProjectileHeight(fireball, dirX, dirZ);
            this.projectiles.push(fireball);
            this.scene.add(fireball.mesh);
        }

        // Muzzle flare effect
        this.particles.spawnBurst(spawnX, 1.3, spawnZ, new THREE.Color(w.visual?.muzzle ?? '#ffaa00').getHex(), 8, 3.0);
    }

    // プレイヤーの弾（魔法・矢）が敵に当たったときの処理: ダメージ・状態異常・効果音・貫通。弾が消費されたら true
    hitMonsterWithProjectile(p, m) {
        const isArrow = (p.type === 'arrow');
        if (isArrow) this.sound.playArrowHit(); else this.sound.playSpellHit(p.soundKind ?? 'fire');
        const hitColor = isArrow ? 0xd4d4d8 : new THREE.Color(p.visual?.hit ?? '#ff5500').getHex();
        this.particles.spawnBurst(p.x, p.y, p.z, hitColor, isArrow ? 8 : 16, isArrow ? 2.5 : 5.0);

        if (!isArrow && m.isImmuneTo(p.element)) {
            // 魔法が効かない敵（ガーゴイルなど）: ダメージ 0・状態異常なし。弾は消える（貫通しない）
            this.addPopup('魔法は効かない!', '#94a3b8', m.x, m.z);
            this.notifyEnemyEngaged(m);
            p.hitMonsters.add(m);
            p.active = false;
            return true;
        }
        const isDead = m.takeDamage(p.damage, { x: p.dirX, z: p.dirZ, magic: !isArrow });
        this.addPopup(m.lastBlocked ? 'ガード!' : `${p.label || 'ファイア'}! -${p.damage}`, m.lastBlocked ? '#94a3b8' : '#f97316', m.x, m.z);
        if (!isDead && p.status && m.applyStatus(p.status)) {
            this.addPopup(p.status.type === 'burn' ? '燃焼!' : '鈍足!', p.status.type === 'burn' ? '#fb923c' : '#7dd3fc', m.x, m.z);
        }
        this.notifyEnemyEngaged(m);
        if (isDead) this.gainExp(m.exp);

        // 貫通: 残り体数があれば弾は消えずに先へ進む（同じ敵に二重ヒットしない）
        p.hitMonsters.add(m);
        p.hitsLeft--;
        if (p.hitsLeft <= 0) p.active = false;
        return !p.active;
    }

    // 燃焼の継続ダメージを受け取って与える（倒したら経験値）
    processBurn(m) {
        const burn = m.consumeBurnDamage();
        if (burn <= 0 || !m.active) return;
        const isDead = m.takeDamage(burn, null);
        this.addPopup(`燃焼 -${burn}`, '#fb923c', m.x, m.z);
        if (isDead) this.gainExp(m.exp);
    }

    // 落下系の魔法（爆発火球）: 前方 targetDistance の地面を狙い（手前に壁があればその直前）、予告の輪 → 着弾の範囲ダメージ → 火柱
    castStrike(spell, powerScale = 1.0) {
        const dirX = -Math.sin(this.player.angle);
        const dirZ = -Math.cos(this.player.angle);

        // 壁・柱など弾を止めるものがあれば、その直前を着弾点にする
        let dist = spell.targetDistance;
        for (let d = 1.0; d <= spell.targetDistance; d += 0.25) {
            const x = this.player.x + dirX * d;
            const z = this.player.z + dirZ * d;
            if (this.colliders.some(c => !c.disabled && c.blocksProjectiles !== false && x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ)) {
                dist = Math.max(0.8, d - 0.3);
                break;
            }
        }
        const tx = this.player.x + dirX * dist;
        const tz = this.player.z + dirZ * dist;
        const damage = Math.floor(spell.damage * powerScale);

        this.sound.playStrikeWhistle(spell.warnTime); // 「ぴゅーーーん」（予告の間に鳴る）→ 着弾で「ばーーん」
        this.strikeEffects.schedule(tx, tz, {
            radius: spell.blastRadius,
            warnTime: spell.warnTime,
            pillarTime: spell.pillarTime,
            smokeTime: spell.smokeTime ?? 0,
            onImpact: () => this.blastAt(tx, tz, spell.blastRadius, damage, spell.element)
        });
    }

    // 着弾の範囲ダメージ: 中心から半径 radius 内の敵すべてに damage（ノックバックは中心から外向き）
    blastAt(x, z, radius, damage, element = null) {
        this.sound.playBigExplosion();
        this.particles.spawnBurst(x, 0.8, z, 0xff5500, 40, 7.0);
        this.particles.spawnBurst(x, 1.5, z, 0xffdd33, 24, 4.5);

        for (const m of this.monsters) {
            if (!m.active) continue;
            const dx = m.x - x;
            const dz = m.z - z;
            const dist = Math.hypot(dx, dz);
            if (dist > radius + m.radius) continue;
            const nx = dist > 0.001 ? dx / dist : 0;
            const nz = dist > 0.001 ? dz / dist : 1;
            if (m.isImmuneTo(element)) {   // 魔法が効かない敵: ダメージ 0
                this.addPopup('魔法は効かない!', '#94a3b8', m.x, m.z);
                this.notifyEnemyEngaged(m);
                continue;
            }
            const isDead = m.takeDamage(damage, { x: nx, z: nz });
            this.requestHitStop(HIT_FEEDBACK.hitStop.blast);
            this.addPopup(`爆発! -${damage}`, '#f97316', m.x, m.z);
            this.notifyEnemyEngaged(m);
            if (isDead) this.gainExp(m.exp);
        }
    }

    update(dt) {
        if (this.shopMenu) return;   // 店のメニュー中はゲームの時間を止める
        // ヒットストップ中はゲームの時間を止める（描画は続く）
        if (this.hitStop > 0) {
            this.hitStop -= dt;
            return;
        }

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
        if (this.doors && this.doors.length > 0) {
            for (const d of this.doors) {
                const distToPlayer = Math.hypot(this.player.x - d.x, this.player.z - d.z);
                // Open door when approaching within 2.4 units, close when far away (>3.2 units)
                // 扉が自分の前側（向いている側）にあるときだけ開く。後ろ向きに近づいたり、後ろ移動（S / ↓）中は開かない
                const inFront = (d.x - this.player.x) * -Math.sin(this.player.angle) + (d.z - this.player.z) * -Math.cos(this.player.angle) > 0;
                if (distToPlayer < 2.4 && !d.isOpen && inFront && !this.keys.backward) {
                    d.isOpen = true;
                    d.targetY = d.openY;
                    this.sound.playDoorOpen();
                    this.addPopup('扉が開いた！', '#fef08a');
                    // Disable collider while door is open
                    d.collider.disabled = true;
                } else if (distToPlayer > 3.4 && d.isOpen) {
                    d.isOpen = false;
                    d.targetY = d.baseY;
                    d.collider.disabled = false;
                }

                // Smooth slide animation (raising up into the ceiling)
                d.mesh.position.y += (d.targetY - d.mesh.position.y) * 8 * dt;

                // 行き先つきの扉: 開いた扉のマスの中へ入ったら移動
                if (d.link.nextMap && d.isOpen && !this.keys.backward &&   // 後ろ移動で扉の中へ入っても移動しない
                    
                    Math.abs(this.player.x - d.x) < d.half && Math.abs(this.player.z - d.z) < d.half) {
                    this.sound.playLevelClear();
                    this.addPopup(d.link.message ?? '次のエリアへ', '#fef08a');
                    this.enterMap(d.link.nextMap, d.link);
                    return;
                }
            }
        }

        // Update Prince of Persia Chompers (Steel Guillotine Clamp Traps)
        if (this.chompers && this.chompers.length > 0) {
            for (const c of this.chompers) {
                c.timer += dt;
                const cycleTime = c.timer % c.cycleDuration;

                // Cycle logic:
                // 0.0 ~ 1.5s: Open (Stay pulled back inside walls)
                // 1.5 ~ 1.65s: Snap shut violently! (Fast clamp)
                // 1.65 ~ 1.95s: Stay tightly closed (Chomp!)
                // 1.95 ~ 2.2s: Slowly retract back into walls
                let progress = 0; // 0 = fully open, 1 = fully closed (meeting at center)
                let snappingThisFrame = false;

                if (cycleTime < 1.5) {
                    progress = 0;
                    c.isCurrentlyDangerous = false;
                } else if (cycleTime < 1.65) {
                    // Lightning fast snap shut
                    const snapProgress = (cycleTime - 1.5) / 0.15;
                    progress = Math.min(1.0, snapProgress);
                    c.isCurrentlyDangerous = true;
                    if (!c.snappedSoundPlayed) {
                        c.snappedSoundPlayed = true;
                        // Play sound if near player with realistic distance attenuation
                        const distToPlayer = Math.hypot(this.player.x - c.x, this.player.z - c.z);
                        const maxAudibleDist = 7.0; // Localized sound: inaudible from distant rooms
                        if (distToPlayer < maxAudibleDist) {
                            const falloff = 1.0 - (distToPlayer / maxAudibleDist);
                            const vol = falloff * falloff; // Quadratic attenuation for natural proximity feeling
                            this.sound.playChomperSnap(vol);
                        }
                    }
                } else if (cycleTime < 1.95) {
                    progress = 1.0;
                    c.isCurrentlyDangerous = true;
                } else {
                    // Retract slowly
                    const retractProgress = (cycleTime - 1.95) / 0.25;
                    progress = Math.max(0, 1.0 - retractProgress);
                    c.isCurrentlyDangerous = false;
                    c.snappedSoundPlayed = false;
                }

                // Position the left and right blades
                const maxSpread = 1.85; // Fully retracted
                const closedSpread = 0.0; // Met at center
                const currentOffset = maxSpread * (1.0 - progress) + closedSpread * progress;

                if (c.isEastWestPassage) {
                    c.leftBlade.position.z = -currentOffset;
                    c.rightBlade.position.z = currentOffset;
                } else {
                    c.leftBlade.position.x = -currentOffset;
                    c.rightBlade.position.x = currentOffset;
                }

                // Check collision with player if dangerous
                if (c.isCurrentlyDangerous) {
                    const distToPlayer = Math.hypot(this.player.x - c.x, this.player.z - c.z);
                    if (distToPlayer < 1.35 && !this.player.isInvincible) {
                        // CHOP! Sliced by chomper!
                        this.sound.playChomperSlice();
                        this.flashDamageScreen();
                        this.particles.spawnBurst(this.player.x, 1.2, this.player.z, 0xdc2626, 24, 6.0); // Gruesome blood burst
                        this.addPopup(`ギロチン切断! -${c.damage}`, '#ef4444');
                        this.playerTakeDamage(c.damage, new THREE.Vector3(0, 0, 0));
                    }
                }
            }
        }

        // Update Prince of Persia Floor Spikes (Periodic rhythm: thrusts up and retracts like guillotines)
        if (this.popSpikes && this.popSpikes.length > 0) {
            for (const sp of this.popSpikes) {
                sp.timer = (sp.timer + dt) % sp.cycleDuration;
                const cycleTime = sp.timer;

                // Spike cycle timeline:
                // 0.0s ~ 1.3s: Hidden beneath floor (safe traversal window)
                // 1.3s ~ 1.45s: Rapid, violent upward thrust
                // 1.45s ~ 1.95s: Fully extended sharp iron needles (dangerous)
                // 1.95s ~ 2.4s: Retracting steadily back into floor
                let progress = 0; // 0 = retracted, 1 = fully thrust
                if (cycleTime < 1.3) {
                    progress = 0;
                    sp.isCurrentlyDangerous = false;
                    sp.thrustSoundPlayed = false;
                    sp.targetY = sp.retractedY;
                } else if (cycleTime < 1.45) {
                    const snapProgress = (cycleTime - 1.3) / 0.15;
                    progress = Math.min(1.0, snapProgress);
                    sp.targetY = sp.retractedY + (sp.thrustY - sp.retractedY) * progress;
                    sp.isCurrentlyDangerous = true;

                    if (!sp.thrustSoundPlayed) {
                        sp.thrustSoundPlayed = true;
                        // Proximity-based sound
                        const distToPlayer = Math.hypot(this.player.x - sp.x, this.player.z - sp.z);
                        const maxAudibleDist = 7.0;
                        if (distToPlayer < maxAudibleDist) {
                            const falloff = 1.0 - (distToPlayer / maxAudibleDist);
                            this.sound.playSpikeThrust(falloff * falloff);
                        }
                    }
                } else if (cycleTime < 1.95) {
                    progress = 1.0;
                    sp.targetY = sp.thrustY;
                    sp.isCurrentlyDangerous = true;
                } else {
                    const retractProgress = (cycleTime - 1.95) / 0.45;
                    progress = Math.max(0, 1.0 - retractProgress);
                    sp.targetY = sp.retractedY + (sp.thrustY - sp.retractedY) * progress;
                    sp.isCurrentlyDangerous = false;
                }

                // Check collision if player is standing on spikes while dangerous
                if (sp.isCurrentlyDangerous) {
                    const b = sp.bounds;
                    const r = this.player.radius || 0.6;
                    const inTrapZone = (this.player.x >= b.minX - r * 0.3 && this.player.x <= b.maxX + r * 0.3 &&
                                       this.player.z >= b.minZ - r * 0.3 && this.player.z <= b.maxZ + r * 0.3);

                    if (inTrapZone && !this.player.isInvincible) {
                        this.sound.playHurt();
                        this.flashDamageScreen();
                        this.particles.spawnBurst(this.player.x, 0.4, this.player.z, 0xdc2626, 16, 4.0);
                        this.addPopup(`針床串刺し! -${sp.damage}`, '#ef4444');
                        this.playerTakeDamage(sp.damage, new THREE.Vector3(0, 0, 0));
                    }
                }

                // Smooth spike vertical movement
                sp.currentY += (sp.targetY - sp.currentY) * 20 * dt;
                sp.mesh.position.y = sp.currentY;
            }
        }

        // Update Crumbling Floor Tiles (Falling Floor / Pitfall)
        if (this.crumblingFloors && this.crumblingFloors.length > 0) {
            for (const cf of this.crumblingFloors) {
                const b = cf.bounds;
                const r = this.player.radius || 0.6;
                const onTile = (this.player.x >= b.minX + 0.25 && this.player.x <= b.maxX - 0.25 &&
                                this.player.z >= b.minZ + 0.25 && this.player.z <= b.maxZ - 0.25);

                if (cf.state === 'intact') {
                    if (onTile && !this.player.isFalling) {
                        cf.state = 'shaking';
                        cf.timer = 0;
                        this.sound.playCrumbleRumble();
                        this.addPopup('床が崩れる！', '#f97316');
                    }
                } else if (cf.state === 'shaking') {
                    cf.timer += dt;
                    // Jitter / shake violently before collapse
                    const shakeAmount = 0.08 * (cf.timer / cf.shakeDuration);
                    cf.mesh.position.x = cf.baseX + (Math.random() - 0.5) * shakeAmount;
                    cf.mesh.position.z = cf.baseZ + (Math.random() - 0.5) * shakeAmount;
                    cf.mesh.position.y = 0.08 - (cf.timer / cf.shakeDuration) * 0.06;

                    // Loose pebble particles falling
                    if (Math.random() < 0.3) {
                        this.particles.spawnBurst(cf.baseX + (Math.random() - 0.5) * 1.5, 0.1, cf.baseZ + (Math.random() - 0.5) * 1.5, 0x78716c, 2, 0.8);
                    }

                    if (cf.timer >= cf.shakeDuration) {
                        // Collapse! Drops into dark bottom
                        cf.state = 'falling';
                        cf.timer = 0;
                        cf.velocityY = 1.0;
                        this.sound.playFloorCollapse();
                        this.particles.spawnBurst(cf.baseX, 0.1, cf.baseZ, 0x44403c, 16, 2.5);

                        // If player is still standing on it when it drops: Fall plunge sequence!
                        if (onTile && !this.player.isFalling) {
                            this.triggerPlayerFall(cf);
                        }
                    }
                } else if (cf.state === 'falling') {
                    cf.velocityY += 25 * dt; // Gravity
                    cf.mesh.position.y -= cf.velocityY * dt;

                    if (cf.mesh.position.y <= -8.0) {
                        cf.state = 'fallen';
                        cf.mesh.visible = false;
                        cf.timer = 0;
                    }
                } else if (cf.state === 'fallen') {
                    // Pit is an open empty hole!
                    // If player steps into the open empty hole, they plummet into the pit!
                    if (onTile && !this.player.isFalling) {
                        this.triggerPlayerFall(cf);
                    }

                    cf.timer += dt;
                    if (cf.timer >= cf.respawnTime) {
                        // Reset intact floor slab
                        cf.state = 'intact';
                        cf.mesh.visible = true;
                        cf.mesh.position.set(cf.baseX, 0.08, cf.baseZ);
                        cf.timer = 0;
                        cf.velocityY = 0;
                    }
                }
            }
        }

        // Update Wall Dart Traps & Pressure Plates
        if (this.dartTraps && this.dartTraps.length > 0) {
            for (const trap of this.dartTraps) {
                if (trap.cooldown > 0) trap.cooldown -= dt;

                const b = trap.bounds;
                const onPlate = (this.player.x >= b.minX && this.player.x <= b.maxX &&
                                 this.player.z >= b.minZ && this.player.z <= b.maxZ);

                if (onPlate) {
                    trap.plateMesh.position.y = trap.platePressedY; // Pressed down
                    if (!trap.isStepped && trap.cooldown <= 0) {
                        trap.isStepped = true;
                        trap.cooldown = 1.2; // Cooldown between dart bursts
                        this.sound.playPlateClick();
                        this.sound.playDartShoot();

                        // Spawn high speed poison dart arrow flying from wall dispenser
                        const dart = new Projectile(
                            trap.shootOriginX,
                            trap.shootOriginZ,
                            trap.dirX,
                            trap.dirZ,
                            false,
                            trap.speed,
                            trap.damage,
                            { type: 'arrow', maxDistance: 25 }
                        );
                        // Subtle green poison tip aura
                        dart.y = 1.3;
                        dart.mesh.position.y = 1.3;
                        this.projectiles.push(dart);
                        this.scene.add(dart.mesh);

                        this.particles.spawnBurst(trap.shootOriginX, 1.3, trap.shootOriginZ, 0x22c55e, 8, 2.5);
                        this.addPopup('カチッ！矢が飛んできた！', '#22c55e');
                    }
                } else {
                    trap.isStepped = false;
                    trap.plateMesh.position.y = trap.plateBaseY;
                }
            }
        }

        // Update Treasure Chests & Mimic Respawns
        let nearChestInteractable = false;
        if (this.chests && this.chests.length > 0) {
            for (const ch of this.chests) {
                // Smooth opening/closing lid rotation
                ch.currentLidAngle += (ch.targetLidAngle - ch.currentLidAngle) * 8 * dt;
                ch.lidPivot.rotation.x = ch.currentLidAngle;

                // Handle Respawn timer if open
                if (ch.isOpen && !ch.isDestroyed) {
                    ch.respawnTimer += dt;
                    if (ch.respawnTimer >= ch.respawnDuration) {
                        // Reclose lid and refill treasure!
                        ch.isOpen = false;
                        ch.targetLidAngle = 0;
                        ch.respawnTimer = 0;
                        if (!ch.group.visible) {
                            ch.group.visible = true; // Make visible again if mimic was defeated
                        }
                        if (ch.collider) {
                            ch.collider.disabled = false;
                        }
                    }
                }

                // Check distance to prompt player interaction
                const distToChest = Math.hypot(this.player.x - ch.x, this.player.z - ch.z);
                if (distToChest < ch.radius + 0.8 && !ch.isOpen && ch.group.visible && this.sameFloorAs(ch.floorY)) {
                    nearChestInteractable = true;
                }
            }
        }

        // Update Periodic Flamethrower / Fire Jets
        if (this.fireJets && this.fireJets.length > 0) {
            for (const fj of this.fireJets) {
                fj.timer = (fj.timer + dt) % fj.cycleDuration;

                // Cycle: [0.0 ~ activeDuration] = Erupting with roaring fire, rest = Inactive / glowing ember
                if (fj.timer < fj.flameActiveDuration) {
                    fj.isErupting = true;
                    fj.group.visible = true;

                    // Flickering flame scale and light intensity
                    const flameIntensity = 0.9 + Math.random() * 0.25;
                    const flickerX = 1.0 + (Math.random() - 0.5) * 0.12;
                    const flickerY = 1.0 + (Math.random() - 0.5) * 0.15;
                    fj.flamePlanes.forEach(p => {
                        p.scale.set(flickerX, flickerY, 1);
                    });
                    fj.flameLight.intensity = 2.4 * flameIntensity;

                    // Spark embers
                    if (Math.random() < 0.45) {
                        this.particles.spawnBurst(fj.x + (Math.random() - 0.5) * 0.8, 1.8, fj.z + (Math.random() - 0.5) * 0.8, 0xffaa00, 3, 2.0);
                    }

                    // Sound playback (with distance attenuation)
                    if (!fj.soundPlayed) {
                        fj.soundPlayed = true;
                        const distToPlayer = Math.hypot(this.player.x - fj.x, this.player.z - fj.z);
                        const maxAudibleDist = 8.0;
                        if (distToPlayer < maxAudibleDist) {
                            const falloff = 1.0 - (distToPlayer / maxAudibleDist);
                            this.sound.playFlameJet(falloff * falloff);
                        }
                    }

                    // Burn collision with player
                    const b = fj.bounds;
                    const inFlameZone = (this.player.x >= b.minX && this.player.x <= b.maxX &&
                                        this.player.z >= b.minZ && this.player.z <= b.maxZ);

                    if (inFlameZone && !this.player.isInvincible) {
                        this.sound.playHurt();
                        this.flashDamageScreen();
                        this.particles.spawnBurst(this.player.x, 1.2, this.player.z, 0xff3300, 16, 4.0);
                        this.addPopup(`火炎放射! -${fj.damage}`, '#f97316');
                        this.playerTakeDamage(fj.damage, new THREE.Vector3(0, 0, 0));
                    }
                } else {
                    fj.isErupting = false;
                    fj.group.visible = false;
                    fj.flameLight.intensity = 0;
                    fj.soundPlayed = false;
                }
            }
        }

        // Update Rail Buzzsaws (Sweeping / oscillating saw blade across corridor)
        if (this.buzzsaws && this.buzzsaws.length > 0) {
            for (const bs of this.buzzsaws) {
                bs.timer += dt * bs.speed;

                // Ping-pong oscillating sweep (-1.0 to 1.0) across corridor (left wall <-> right wall)
                const sweepOffset = Math.sin(bs.timer) * bs.travelDist;

                let curX = bs.baseX;
                let curZ = bs.baseZ;

                if (bs.isEastWest) {
                    // East-West corridor: sweep across North-South (Z axis)
                    curZ += sweepOffset;
                } else {
                    // North-South corridor: sweep across East-West (X axis)
                    curX += sweepOffset;
                }

                bs.group.position.x = curX;
                bs.group.position.z = curZ;

                // Ultra-rapid saw rotation spin around normal
                bs.sawMesh.rotation.z += 25 * dt;

                // Spark sparks flying from rail contact
                if (Math.random() < 0.25) {
                    this.particles.spawnBurst(curX, 0.1, curZ, 0xfacc15, 2, 2.0);
                }

                // Periodic whirring sound if near player
                const distToPlayer = Math.hypot(this.player.x - curX, this.player.z - curZ);
                const maxAudibleDist = 7.0;
                if (distToPlayer < maxAudibleDist && Math.random() < 0.08) {
                    const falloff = 1.0 - (distToPlayer / maxAudibleDist);
                    this.sound.playBuzzsawWhirr(falloff * falloff);
                }

                // Check collision with player
                if (distToPlayer < bs.radius && !this.player.isInvincible) {
                    this.sound.playChomperSlice();
                    this.sound.playHurt();
                    this.flashDamageScreen();
                    this.particles.spawnBurst(this.player.x, 1.0, this.player.z, 0xdc2626, 20, 5.0);
                    this.addPopup(`回転ノコギリ切断! -${bs.damage}`, '#ef4444');
                    this.playerTakeDamage(bs.damage, new THREE.Vector3(0, 0, 0));
                }
            }
        }

        // Proximity check for Signposts and Chests (Display guidance banner while near, hide immediately when leaving)
        let activeSignMessage = null;
        let activeSignIcon = '📜';
        if (nearChestInteractable) {
            activeSignMessage = '【Eキー】宝箱を開ける';
        } else if ((activeSignMessage = this.nearbyNpcSpeech()) !== null) {
            activeSignIcon = '💬';
        } else if (this.signposts && this.signposts.length > 0) {
            for (const s of this.signposts) {
                const distToSign = Math.hypot(this.player.x - s.x, this.player.z - s.z);
                const triggerDist = s.radius || 2.4;
                if (distToSign < triggerDist) {
                    activeSignMessage = s.message;
                    break;
                }
            }
        }
        this.updateSignpostBanner(activeSignMessage, activeSignIcon);

        // Animate liquid surfaces (water, shallow water, lava, swamp)
        if (this.waterMeshes && this.waterMeshes.length > 0) {
            const time = this.clock.getElapsedTime();
            this.textures.water.offset.x = (time * 0.08) % 1;
            this.textures.water.offset.y = (time * 0.05) % 1;
            this.textures.shallowWater.offset.x = (time * 0.05) % 1;
            this.textures.shallowWater.offset.y = (time * 0.07) % 1;
            this.textures.lava.offset.x = (time * 0.03) % 1;
            this.textures.lava.offset.y = (time * 0.02) % 1;
            this.textures.poisonSwamp.offset.x = (time * 0.02) % 1;
            this.textures.poisonSwamp.offset.y = (time * 0.03) % 1;
            if (this.textures.fountainWater) {
                this.textures.fountainWater.offset.x = (time * 0.09) % 1;
                this.textures.fountainWater.offset.y = (time * 0.07) % 1;
            }

            // 松明の光: 光だまり・光の輪が、ゆらゆらと、明るさを変える
            for (const tg of this.torchGlows) {
                const f = 0.85 + 0.15 * Math.sin(time * 9 + tg.phase) * Math.sin(time * 3.7 + tg.phase * 1.7);
                tg.pool.material.opacity = tg.poolOpacity * f;
                tg.halo.material.opacity = tg.haloOpacity * f;
                tg.flame.scale.set(1, 0.9 + 0.2 * f, 1);
            }

            // Animate shimmering rising heat haze & smoke wisps above lava
            if (this.heatHazePlanes && this.heatHazePlanes.length > 0) {
                for (let i = 0; i < this.heatHazePlanes.length; i++) {
                    const h = this.heatHazePlanes[i];
                    // Cycle position within a natural heat shimmer layer (rising up to 0.40 units above surface)
                    const cycle = ((time * 0.7 + h.phase) % 2.0) / 2.0; // 0.0 -> 1.0
                    
                    // Rising Y movement: noticeable heat shimmering layer above surface
                    h.sprite.position.y = h.baseY + cycle * 0.40;

                    // Lateral swaying shimmer (wavy hot air distortion)
                    const sway = Math.sin(time * 3.5 + h.phase) * 0.15;
                    h.sprite.position.x = h.baseX + sway;

                    // Expand horizontally as heat wafts across the lava surface
                    const scaleFactor = 1.0 + cycle * 0.3;
                    h.sprite.scale.set(h.baseScale * scaleFactor, h.baseScale * 0.55 * scaleFactor, 1);

                    // Soft fade in on magma surface, gently fades out around 0.4 units height
                    let alpha = Math.sin(cycle * Math.PI) * 0.70;
                    h.sprite.material.opacity = Math.max(0, alpha);

                    // Periodically spawn floating ember particle
                    if (Math.random() < 0.015) {
                        this.particles.spawnHeatEmber(h.tileX, h.baseY, h.tileZ);
                    }
                }
            }

            // Animate fountain spurts and player water splash interaction (シャバシャバ演出)
            if (this.fountains && this.fountains.length > 0) {
                for (const f of this.fountains) {
                    // Continuous fountain water spurting from central spout (rich, visible spray)
                    this.particles.spawnWaterSpurt(f.x, f.topY, f.z, 2);

                    // Check player touching or walking near the fountain rim
                    const distToPlayer = Math.hypot(this.player.x - f.x, this.player.z - f.z);
                    if (f.splashCooldown > 0) f.splashCooldown -= dt;

                    // If player is right next to the fountain basin (<= radius + 0.6) and moving, trigger splash & sound
                    const isMoving = (this.keys.forward || this.keys.backward || this.keys.left || this.keys.right);
                    if (distToPlayer <= f.radius + 0.65 && isMoving && f.splashCooldown <= 0) {
                        f.splashCooldown = 0.18; // Throttle splash triggers
                        this.sound.playWaterSplash();
                        this.particles.spawnWaterSplash(this.player.x, f.surfaceY + 0.1, this.player.z, 16);
                        if (Math.random() < 0.3) {
                            this.addPopup('シャバシャバ！', '#38bdf8', this.player.x, this.player.z);
                        }
                    }
                }
            }
        }

        // Turning via Q/E or arrows
        if (this.keys.turnLeft) this.player.angle += this.player.rotSpeed * dt;
        if (this.keys.turnRight) this.player.angle -= this.player.rotSpeed * dt;
        // Ctrl+矢印キー: 視点の上下（pitch）と、ゆっくりした旋回（狙いの微調整）
        if (this.keys.camUp) this.player.pitch = Math.min(0.6, this.player.pitch + 1.2 * dt);
        if (this.keys.camDown) this.player.pitch = Math.max(-0.6, this.player.pitch - 1.2 * dt);
        if (this.keys.camLeft) this.player.angle += this.player.rotSpeed * 0.35 * dt;
        if (this.keys.camRight) this.player.angle -= this.player.rotSpeed * 0.35 * dt;

        // Player Move Direction
        const moveDir = new THREE.Vector3();
        if (!this.player.isFalling && !(this.player.status?.paralysis?.t > 0)) {   // 麻痺の間は、動けない
            if (this.keys.forward) moveDir.z -= 1;
            if (this.keys.backward) moveDir.z += 1;
            if (this.keys.left) moveDir.x -= 1;
            if (this.keys.right) moveDir.x += 1;
        }

        let worldMoveX = 0;
        let worldMoveZ = 0;

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();

            // Check terrain depth and speed penalty/bonus
            let speedMod = 1.0;
            let currentDepth = 0;
            if (this.terrainGrid) {
                for (const t of this.terrainGrid) {
                    if (this.player.x >= t.minX && this.player.x <= t.maxX &&
                        this.player.z >= t.minZ && this.player.z <= t.maxZ) {
                        speedMod = speedMod * (t.slowdown || 1.0) * (t.speedBonus || 1.0);
                        currentDepth = Math.max(currentDepth, t.depth || 0);
                    }
                }
            }

            if (this.player.status?.slow?.t > 0) speedMod *= this.player.status.slow.scale ?? 0.55;   // 鈍足

            // Rotate move direction by player's view angle
            const sin = Math.sin(this.player.angle);
            const cos = Math.cos(this.player.angle);
            const baseSpeed = this.keys.sprint ? this.player.runSpeed : this.player.speed;
            const moveSpeed = baseSpeed * speedMod;
            worldMoveX = (moveDir.x * cos + moveDir.z * sin) * moveSpeed * dt;
            worldMoveZ = (-moveDir.x * sin + moveDir.z * cos) * moveSpeed * dt;

            const stepFromX = this.player.x;
            const stepFromZ = this.player.z;
            // 速い移動（走る・倍率つき）でも、壁・崖をすり抜けないよう、0.5 以下の長さに分けて動かす
            const moveLen = Math.hypot(worldMoveX, worldMoveZ), steps = Math.max(1, Math.ceil(moveLen / 0.5));
            for (let i = 0; i < steps; i++) this.movePlayer(worldMoveX / steps, worldMoveZ / steps);
            // 足音: 実際に進んだ距離が一定に達するたびに1回鳴らす（壁に押し付けて進めない間は鳴らさない）
            if (!this.player.isFalling) {
                this.footstepDistance = (this.footstepDistance || 0) + Math.hypot(this.player.x - stepFromX, this.player.z - stepFromZ);
                if (this.footstepDistance >= FOOTSTEP_STRIDE) {
                    this.footstepDistance %= FOOTSTEP_STRIDE;
                    // 足音はマップ（空間）ごとに決める。environment.footstep が無いマップ（屋外など）は鳴らさない
                    const footstep = this.mapData?.environment?.footstep;
                    if (footstep) this.sound.playFootstep(footstep);
                }
            }
        }

        // Record last safe position while walking safely on solid ground (not over pitfall hole or liquid hazard)
        if (!this.player.isFalling) {
            let overPit = false;
            if (this.crumblingFloors) {
                for (const cf of this.crumblingFloors) {
                    const b = cf.bounds;
                    if (this.player.x >= b.minX - 0.2 && this.player.x <= b.maxX + 0.2 &&
                        this.player.z >= b.minZ - 0.2 && this.player.z <= b.maxZ + 0.2) {
                        overPit = true;
                        break;
                    }
                }
            }
            if (!overPit) {
                this.player.lastSafePos.x = this.player.x;
                this.player.lastSafePos.z = this.player.z;
            }
        }

        // Handle Falling Pitfall Animation & Plunge Sequence
        if (this.player.isFalling) {
            this.player.fallVelocityY += 28 * dt; // Rapid acceleration into pit
            this.player.fallDepth += this.player.fallVelocityY * dt;

            // Pitch and tilt camera down into the pit
            this.player.pitch = Math.max(-0.6, this.player.pitch - 1.8 * dt);

            // Reached pit bottom (impaled on pit spikes / crash impact)
            if (this.player.fallDepth >= 5.5) {
                this.finishPlayerFall();
            }
        }

        // Calculate terrain special effects (Hazards, MP Regen, Spikes)
        let playerFloorDepth = 0;
        let inWater = false;
        const wasInCurrent = this.player.inCurrent;
        this.player.inCurrent = false;
        if (this.terrainGrid) {
            for (const t of this.terrainGrid) {
                if (this.player.x >= t.minX && this.player.x <= t.maxX &&
                    this.player.z >= t.minZ && this.player.z <= t.maxZ) {
                    playerFloorDepth = Math.max(playerFloorDepth, t.depth || 0);
                    if (t.isWater) inWater = true;
                    // 急流: 下流へ流される（壁や崖には、止められる。流されて 3 段以上の崖は降りられない）
                    if (t.current) {
                        const cl = Math.hypot(t.current.x, t.current.z) || 1;
                        this.movePlayer(t.current.x / cl * t.current.speed * dt, t.current.z / cl * t.current.speed * dt);
                        if (!wasInCurrent) this.addPopup('急流に流される！', '#38bdf8');
                        this.player.inCurrent = true;
                    }

                    // 1. Hazard floor damage (Lava / Poison)
                    if (t.damagePerSec && t.damagePerSec > 0) {
                        this.player.hazardTimer = (this.player.hazardTimer || 0) + dt;
                        if (this.player.hazardTimer >= 0.5) {
                            this.player.hazardTimer = 0;
                            const dmg = Math.ceil(t.damagePerSec * 0.5);
                            this.player.hp = Math.max(0, this.player.hp - dmg);
                            if (t.hazardType === 'fire') {
                                this.addPopup(`灼熱! -${dmg}`, '#ef4444');
                                this.particles.spawnBurst(this.player.x, 0.5, this.player.z, 0xff5500, 6, 2.0);
                            } else if (t.hazardType === 'poison') {
                                this.addPopup(`毒! -${dmg}`, '#a855f7');
                                this.particles.spawnBurst(this.player.x, 0.5, this.player.z, 0x8b5cf6, 6, 2.0);
                            }
                        }
                    }

                    // 2. Magic Circle MP Recovery
                    if (t.mpRegenBonus && t.mpRegenBonus > 0) {
                        this.player.mp = Math.min(this.player.maxMp, this.player.mp + t.mpRegenBonus * dt);
                        if (Math.random() < 0.2) {
                            this.particles.spawnBurst(this.player.x, 0.2, this.player.z, 0x38bdf8, 2, 1.0);
                        }
                    }

                    // 3. Spike Trap
                    if (t.isTrap && !t.triggered) {
                        t.triggered = true;
                        this.player.hp = Math.max(0, this.player.hp - t.trapDamage);
                        this.sound.playHurt();
                        this.addPopup(`トラップ! -${t.trapDamage}`, '#dc2626');
                        this.particles.spawnBurst(this.player.x, 0.3, this.player.z, 0xef4444, 12, 3.0);
                        setTimeout(() => { t.triggered = false; }, 1800); // Reset trap after 1.8s
                    }

                    // 4. Dragon Quest Barrier Floor (Damage per step / traversal distance)
                    if (t.isBarrier) {
                        this.player.barrierDistance = (this.player.barrierDistance || 0) + (Math.hypot(worldMoveX, worldMoveZ));
                        if (this.player.barrierDistance >= 1.2) {
                            this.player.barrierDistance = 0;
                            const dmg = t.damagePerStep || 15;
                            this.player.hp = Math.max(0, this.player.hp - dmg);
                            this.sound.playBarrierDamage(); // 8-bit Famicom crunch buzz sound
                            this.addPopup(`バリア! -${dmg}`, '#38bdf8');
                            this.particles.spawnBurst(this.player.x, 0.4, this.player.z, 0x0ea5e9, 16, 4.0);
                            this.flashScreen('rgba(14, 165, 233, 0.45)'); // Electric Blue Flash
                        }
                    }
                }
            }
        }

        // Apply knockback to player if any
        if (this.player.knockback.lengthSq() > 0.001) {
            this.movePlayer(this.player.knockback.x * dt, this.player.knockback.z * dt);
            this.player.knockback.multiplyScalar(Math.max(0, 1 - dt * 10));
        }

        // Camera height with elevation difference (wading in water lowers player's eye height naturally, and falling plummets eye height into pit)
        // 高さのある床（高台の段）の上では目線も上がる。段ごとに急に跳ねないよう、なめらかに追従させる
        const targetFloorY = this.getFloorHeight(this.player.x, this.player.z, this.player.heightLevel);
        this.player.floorY = (this.player.floorY ?? targetFloorY) + (targetFloorY - (this.player.floorY ?? targetFloorY)) * Math.min(1, dt * 10);
        const eyeHeight = 1.8 + this.player.floorY - playerFloorDepth - (this.player.isFalling ? this.player.fallDepth : 0);
        // 木の描画: 近い木は従来どおり、遠い木は切り抜き（遠景で、壁の木と重なると四角く欠けるため）。境目で、ちらつかないよう、ヒステリシスをつける（距離は暫定）
        // 霧で見えなくなる距離（霧の遠さ×1.1）より遠い木・影・草は、隠す（描画する数を減らす。大森林は、木が大量にある）
        const cullD2 = this.scene.fog ? (this.scene.fog.far * 1.1) ** 2 : Infinity;
        for (const t of this.treeSprites || []) {
            const dx = t.sprite.position.x - this.player.x, dz = t.sprite.position.z - this.player.z, d2 = dx * dx + dz * dz;
            const wantNear = t.isNear ? d2 < 42 * 42 : d2 < 40 * 40;
            if (wantNear !== t.isNear) { t.isNear = wantNear; t.sprite.material = wantNear ? t.near : t.far; }
            const vis = d2 < cullD2;
            if (vis !== t.vis) { t.vis = vis; t.sprite.visible = vis; if (t.shadow) t.shadow.visible = vis; }
        }
        for (const sp of this.cullSprites || []) {
            const dx = sp.position.x - this.player.x, dz = sp.position.z - this.player.z;
            const vis = dx * dx + dz * dz < cullD2;
            if (vis !== sp.visible) sp.visible = vis;
        }
        this.camera.position.set(this.player.x, eyeHeight, this.player.z);
        this.fitCameraFar();   // 高い所では、描画距離をのばす
        this.camera.rotation.set(0, 0, 0);
        this.camera.rotateY(this.player.angle);
        this.camera.rotateX(this.player.pitch);

        // カメラの揺れ（強い一撃の手応え）。時間とともに小さくなる
        if (this.cameraShake.time > 0) {
            this.cameraShake.time -= dt;
            const a = this.cameraShake.amp * Math.max(0, this.cameraShake.time / this.cameraShake.duration);
            this.camera.position.x += (Math.random() - 0.5) * 2 * a;
            this.camera.position.y += (Math.random() - 0.5) * 2 * a;
        }

        // 外のマップの端: 隣のマップがない端の外へは出られず、隣がある端の外へ出ると、隣のマップへ切り替わる
        const worldMap = this.currentMapData;
        if (this.world && worldMap?.layout && !this.nav.busy && this.world.grid?.some(r => r.includes(this.currentMapId))) {
            const ts = worldMap.tileSize || 4;
            const W = worldMap.layout[0].length * ts, D = worldMap.layout.length * ts;
            const cl = clampToWorld(this.world, this.currentMapId, this.player.x, this.player.z, W, D, this.player.radius);
            this.player.x = cl.x; this.player.z = cl.z;
            const cross = edgeCrossing(this.world, this.currentMapId, this.player.x, this.player.z, W, D);
            if (cross && cross.mapId) {
                this.loadMap(cross.mapId, { keepStack: true, edgeBlend: true, spawn: { x: cross.x / ts - 0.5, z: cross.z / ts - 0.5, angle: this.player.angle } });
                return;
            }
        }
        // 端の移動のあと、空・霧・光の色を、数秒かけて、新しいマップの色にする
        if (this.envBlend) {
            this.envBlend.t += dt;
            const k = Math.min(1, this.envBlend.t / this.envBlend.dur);
            this.applyEnvBlend(k);
            if (k >= 1) this.envBlend = null;
        }

        // Update Portal Animation & Check
        for (const portal of this.portals) {
            if (portal.mesh) portal.mesh.rotation.y += dt * 2;
            const reached = portal.halfSize
                ? Math.abs(this.player.x - portal.x) < portal.halfSize && Math.abs(this.player.z - portal.z) < portal.halfSize   // 門のマス（四角）
                : Math.hypot(this.player.x - portal.x, this.player.z - portal.z) < portal.radius;                                  // 筒のポータル（円）
            if (reached) {
                this.sound.playLevelClear();
                this.addPopup(portal.link.message ?? 'ステージクリア！次のエリアへ', portal.link.color ?? '#38bdf8');
                this.enterMap(portal.link.nextMap, portal.link);
                return;
            }
        }

        // Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt, this.colliders, this.particles);

            // 起伏のあるマップ: 弾が、地面（崖の面・斜面）にぶつかったら消える
            if (this.heightMap && p.active && this.projectileHitsGround(p)) {
                p.active = false;
                this.particles.spawnBurst(p.x, p.y, p.z, p.color ?? 0xb08d58, 8, 2.5);
            }

            if (p.isPlayer) {
                // Check player fireball hit monster
                for (const m of this.monsters) {
                    if (!m.active || m.untouchable || p.hitMonsters.has(m)) continue;
                    const distM = Math.hypot(m.x - p.x, m.z - p.z);
                    // 起伏のあるマップでは、高さも合っているときだけ当たる（敵の胴の高さ ±1.6）
                    if ((this.heightMap || m.flying) && Math.abs(p.y - ((m.floorY ?? 0) + (m.baseY ?? 0) + 0.9)) > 1.6) continue;
                    if (distM < m.radius + p.radius) {
                        if (this.hitMonsterWithProjectile(p, m)) break;
                    }
                }
            } else {
                // Check enemy projectile (arrow or magic) hit player
                const distP = Math.hypot(this.player.x - p.x, this.player.z - p.z);
                const pFloor = this.player.floorY ?? 0;
                if (distP < this.player.radius + p.radius && p.y >= pFloor - 0.3 && p.y <= pFloor + 2.4) {   // 高さが合っているときだけ当たる
                    this.playerTakeDamage(p.damage, new THREE.Vector3(p.dirX, 0, p.dirZ), 1.0, p.sourceMonster ?? null);
                    if (p.sourceMonster) {
                        this.notifyEnemyEngaged(p.sourceMonster);
                    }
                    if (p.type === 'arrow') {
                        this.sound.playArrowHit();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xd4d4d8, 8, 2.5);
                    } else if (p.type === 'poison_breath') {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0x84cc16, 20, 3.5);
                        this.addPopup(`猛毒ブレス被弾! -${p.damage}`, '#a3e635');
                    } else if (p.type === 'breath_fire') {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xff6a00, 20, 3.5);
                        this.addPopup(`炎のブレス被弾! -${p.damage}`, '#fb923c');
                    } else if (p.type === 'fire_bolt') {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xff6a00, 12, 3.0);
                        this.addPopup(`火球被弾! -${p.damage}`, '#fb923c');
                    } else if (p.type === 'poison_dust') {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xd946ef, 16, 3.0);
                        this.addPopup(`毒鱗粉被弾! -${p.damage}`, '#e879f9');
                    } else {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xd946ef, 14, 4.0);
                    }
                    p.active = false;
                }
            }

            if (!p.active) {
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
            }
        }

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

    // プレイヤーが、壁（木・岩・海などの当たり判定）に重なっていたら、近くの空いている所（中心から外へ 0.5 ずつ広げて探す）へ動かす
    pushPlayerOutOfWalls() {
        if (!this.isInsideWall(this.player.x, this.player.z)) return;
        const ts = this.mapData?.tileSize || 4;
        const maxX = (this.mapData?.layout?.[0]?.length ?? 0) * ts, maxZ = (this.mapData?.layout?.length ?? 0) * ts;
        for (let d = 0.5; d <= 20; d += 0.5) {
            for (let k = 0; k < 16; k++) {
                const a = k * Math.PI / 8;
                const x = this.player.x + Math.cos(a) * d, z = this.player.z + Math.sin(a) * d;
                if (x < 0 || z < 0 || x > maxX || z > maxZ) continue;
                if (!this.isInsideWall(x, z)) { this.player.x = x; this.player.z = z; return; }
            }
        }
    }

    // 壁（colliders）の判定範囲（プレイヤーの半径ぶん外側へ広げた矩形）の中に (x, z) があるか
    isInsideWall(x, z) {
        const r = this.player.radius;
        for (const c of this.colliders) {
            if (c.disabled) continue;
            if (x >= c.minX - r && x <= c.maxX + r && z >= c.minZ - r && z <= c.maxZ + r) return true;
        }
        return false;
    }

    // すでに壁の中にいる（めり込んだ）場合に、最も近い壁の外側の縁へ出す。通常の移動は壁に入る位置を事前に止めるので、
    // めり込みは押し戻しなど想定外の原因で起きる。放っておくと、どの方向へも動けなくなる
    depenetrateFromWalls() {
        const r = this.player.radius;
        const EPS = 0.001; // 判定は境界を含む（<=）ので、縁のわずかに外へ出す
        for (let i = 0; i <= this.colliders.length; i++) {
            const c = this.colliders.find(c => !c.disabled &&
                this.player.x >= c.minX - r && this.player.x <= c.maxX + r &&
                this.player.z >= c.minZ - r && this.player.z <= c.maxZ + r);
            if (!c) return;
            const exits = [
                { d: this.player.x - (c.minX - r), x: c.minX - r - EPS },
                { d: (c.maxX + r) - this.player.x, x: c.maxX + r + EPS },
                { d: this.player.z - (c.minZ - r), z: c.minZ - r - EPS },
                { d: (c.maxZ + r) - this.player.z, z: c.maxZ + r + EPS }
            ];
            const best = exits.reduce((a, b) => (b.d < a.d ? b : a));
            if (best.x !== undefined) this.player.x = best.x;
            else this.player.z = best.z;
        }
    }

    // 村人が、その位置に立てないか（壁・家具などの当たり判定、水、プレイヤー、ほかの村人）
    // その位置にある、高さのある床の高さ（なければ 0）
    //   refLevel: 動く者の今の高さの段（吊橋の層を選ぶ。省略は橋の上）
    getFloorHeight(x, z, refLevel) {
        let h = this.heightMap ? this.heightLevelAt(x, z, refLevel) * this.heightStep : 0;
        for (const t of this.raisedFloors ?? []) {
            if (x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ) h = Math.max(h, t.height);
        }
        return h;
    }

    isNpcBlocked(self, x, z, radius) {
        // 起伏のあるマップ: 村人も、崖（上り 2 段以上・下り 3 段以上）へは、進まない
        if (this.heightMap && self && !groundStepOk((px, pz) => this.heightLevelAt(px, pz, this.levelOfFloorY(self.floorY)), self.x, self.z, x, z)) return true;
        for (const c of this.colliders) {
            if (c.disabled) continue;
            if (x >= c.minX - radius && x <= c.maxX + radius && z >= c.minZ - radius && z <= c.maxZ + radius) return true;
        }
        for (const t of this.terrainGrid) {
            if (t.depth > 0 && x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ) return true;
        }
        if (Math.hypot(x - this.player.x, z - this.player.z) < radius + this.player.radius + 0.3) return true;
        for (const n of this.npcs) {
            if (n !== self && Math.hypot(x - n.x, z - n.z) < radius + n.radius + 0.2) return true;
        }
        return false;
    }

    updateNpcs(dt) {
        for (const n of this.npcs ?? []) {
            n.floorY = this.getFloorHeight(n.x, n.z, this.levelOfFloorY(n.floorY));
            n.update(dt, (x, z, r) => this.isNpcBlocked(n, x, z, r));
        }
    }

    // 店のメニュー（「買う」「売る」→「販売一覧」）。品揃え・価格は shops.json のダミー。買う・売るの処理はまだ無い
    openShopMenu(shopId) {
        this.shopMenu = { shopId, screen: 'top', index: 0, note: '' };
        for (const k of Object.keys(this.keys)) this.keys[k] = false;   // 押しっぱなしの移動キーを止める
        if (!this.shopMenuEl) {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:50%;bottom:8%;transform:translateX(-50%);min-width:340px;max-width:90vw;' +
                'background:rgba(15,23,42,0.95);border:2px solid #38bdf8;border-radius:10px;color:#f8fafc;padding:14px 18px;z-index:200;font-size:16px;';
            document.body.appendChild(el);
            this.shopMenuEl = el;
        }
        this.shopMenuEl.style.display = 'block';
        this.renderShopMenu();
    }

    closeShopMenu() {
        this.shopMenu = null;
        if (this.shopMenuEl) this.shopMenuEl.style.display = 'none';
    }

    // 画面ごとの選択肢（label, 選んだときの動き）
    shopMenuChoices() {
        const m = this.shopMenu, shop = this.shops?.[m.shopId] ?? {};
        if (m.screen === 'buy') {
            // 販売一覧は 1 画面に SHOP_PAGE_SIZE 件ずつ。多いときはページ送り（←→ か「次のページ」）
            const all = shop.goods ?? [], pages = Math.max(1, Math.ceil(all.length / SHOP_PAGE_SIZE));
            m.page = Math.min(m.page ?? 0, pages - 1);
            const goods = all.slice(m.page * SHOP_PAGE_SIZE, (m.page + 1) * SHOP_PAGE_SIZE)
                .map(g => ({ label: `${g.name}　${g.price}G`, act: () => { m.note = `（ダミー）${g.name}の購入は準備中です`; } }));
            const turn = (d) => () => { m.page += d; m.index = 0; m.note = ''; };
            if (m.page > 0) goods.push({ label: '◀ 前のページ', act: turn(-1) });
            if (m.page < pages - 1) goods.push({ label: '次のページ ▶', act: turn(1) });
            return [...goods, { label: 'もどる', act: () => { m.screen = 'top'; m.index = 0; m.note = ''; } }];
        }
        if (m.screen === 'sell') {
            return [{ label: 'もどる', act: () => { m.screen = 'top'; m.index = 1; m.note = ''; } }];
        }
        return [
            { label: '買う', act: () => { m.screen = 'buy'; m.page = 0; m.index = 0; m.note = ''; } },
            { label: '売る', act: () => { m.screen = 'sell'; m.index = 0; m.note = ''; } },
            { label: 'やめる', act: () => this.closeShopMenu() }
        ];
    }

    renderShopMenu() {
        const m = this.shopMenu;
        if (!m) return;
        const shop = this.shops?.[m.shopId] ?? {};
        const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const title = { top: `${shop.name ?? '店'}　いらっしゃい！`, buy: `販売一覧（${(m.page ?? 0) + 1}/${Math.max(1, Math.ceil((shop.goods ?? []).length / SHOP_PAGE_SIZE))}）`, sell: '売却（持ち物）' }[m.screen];
        const choices = this.shopMenuChoices();
        const body = m.screen === 'sell' ? '<div style="margin:6px 0;color:#94a3b8">（ダミー）売れる持ち物の一覧は準備中です</div>' : '';
        this.shopMenuEl.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;color:#7dd3fc">${esc(title)}</div>${body}` +
            choices.map((c, i) => `<div data-i="${i}" style="padding:3px 10px;cursor:pointer;${i === m.index ? 'background:#1e3a5f;border-radius:4px' : ''}">${i === m.index ? '▶ ' : '　'}${esc(c.label)}</div>`).join('') +
            `<div style="margin-top:8px;color:#fbbf24;min-height:1.2em">${esc(m.note)}</div>` +
            '<div style="margin-top:4px;color:#64748b;font-size:12px">↑↓ 選ぶ　Enter/E 決定　Esc 閉じる</div>';
        this.shopMenuEl.querySelectorAll('[data-i]').forEach(d => {
            d.onclick = () => { m.index = Number(d.dataset.i); this.shopMenuChoices()[m.index].act(); this.renderShopMenu(); };
        });
    }

    shopMenuKey(e) {
        const m = this.shopMenu, n = this.shopMenuChoices().length;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') m.index = (m.index + n - 1) % n;
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') m.index = (m.index + 1) % n;
        else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && m.screen === 'buy') {
            const all = this.shops?.[m.shopId]?.goods ?? [], pages = Math.ceil(all.length / SHOP_PAGE_SIZE);
            m.page = Math.max(0, Math.min(pages - 1, (m.page ?? 0) + (e.code === 'ArrowLeft' ? -1 : 1)));
            m.index = 0; m.note = '';
        }
        else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') this.shopMenuChoices()[m.index].act();
        else if (e.code === 'Escape') { if (m.screen === 'top') this.closeShopMenu(); else { m.screen = 'top'; m.index = 0; m.note = ''; } }
        else return;
        e.preventDefault();
        this.renderShopMenu();
    }

    // 襲撃者（ambush の住民）が、正体を現す: 住民を消し、同じ姿・同じ位置に、敵（ambush.enemy）を出して、すぐ襲いかからせる。
    //   見た目（絵・大きさ）は、住民のまま。倒すまで、ふつうの住民の姿で襲ってくる
    revealAmbusher(npc) {
        const type = npc.ambush.enemy;
        const def = this.enemyDefinitions?.[type];
        if (!def) return;
        const m = new Monster(type, npc.x, npc.z, this.textures, { ...def, id: type });
        m.spriteMat.map = npc.sprite.material.map;                 // 住民の絵のまま
        m.spriteMat.needsUpdate = true;
        m.sprite.scale.copy(npc.sprite.scale);
        m.baseScaleX = npc.sprite.scale.x; m.baseScaleY = npc.sprite.scale.y;
        m.scale = [npc.sprite.scale.x, npc.sprite.scale.y, 1];
        m.floorY = this.getFloorHeight(npc.x, npc.z);
        m.sprite.position.set(npc.x, m.floorY, npc.z);
        this.attachMonsterHooks(m);
        m.state = 'chase'; m.lostTimer = 0; m.appearAlpha = 1; m.spriteMat.opacity = 1;
        m.provokedTimer = 8;
        m.stun(0.45);   // 正体を現す一瞬の間
        this.monsters.push(m);
        this.scene.add(m.sprite);
        this.scene.remove(npc.sprite);
        const i = this.npcs.indexOf(npc);
        if (i >= 0) this.npcs.splice(i, 1);
        this.addPopup(npc.ambush.line, '#ef4444', npc.x, npc.z);
        this.sound.playHurt?.();
        this.particles.spawnBurst(npc.x, npc.floorY ?? 1.2, npc.z, 0xef4444, 10, 3.0);
    }

    // 近くの村人のセリフ（いなければ null）
    nearbyNpcSpeech() {
        let found = null;
        for (const n of this.npcs ?? []) {
            const s = n.speechFor(this.player);   // 離れた村人のセリフも、ここでリセットされる
            if (s !== null && found === null) found = n.shopId ? `${s}\n【Eキー】取引メニューを表示` : s;   // 店主には、最下行に操作の案内を添える
        }
        return found;
    }

    // 屋内の床（板張りなど）を 1 マス分敷く
    // 大理石（marble〜）のテクスチャは、白く見えるように、少し自ら光らせる（照明が弱い面・影の面でも灰色にならない）
    makeLitMaterial(textureKey, texture) {
        const glow = typeof textureKey === 'string' && textureKey.startsWith('marble');
        return new THREE.MeshLambertMaterial(glow ? { map: texture, emissive: 0x92928c } : { map: texture });
    }

    // 丸いぼかしの光（中心が明るく、外へ消える）のテクスチャ。松明の光だまり・光の輪に使う（1 回だけ作る）
    getGlowTexture() {
        if (!this.glowTexture) {
            const cv = document.createElement('canvas');
            cv.width = cv.height = 128;
            const g = cv.getContext('2d');
            const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grad;
            g.fillRect(0, 0, 128, 128);
            this.glowTexture = new THREE.CanvasTexture(cv);
        }
        return this.glowTexture;
    }

    // オブジェクトの画像（objects.json の imageFile。/images/objects/ 以下）のテクスチャ。同じ画像は1回だけ読み込む
    getObjectImageTexture(file) {
        this.objectImageTextures = this.objectImageTextures || {};
        if (!this.objectImageTextures[file]) {
            const tex = new THREE.TextureLoader().load(`/images/objects/${file}`);
            tex.colorSpace = THREE.SRGBColorSpace;   // 写実的な絵なので、色をそのまま出す
            this.objectImageTextures[file] = tex;
        }
        return this.objectImageTextures[file];
    }

    addFloorTile(wx, wz, tileSize, textureKey) {
        const mat = this.makeLitMaterial(textureKey, this.textures[textureKey] || this.textures.sand);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(wx, 0.03, wz);   // 全体の床（0）と同じ平面だと、ちらつく（z-fighting）ので、少し上げる
        this.addStatic(mesh);
    }

    // 動かない部品として、シーンに足す（あとで mergeStaticMeshes が、材質ごとにまとめる）。
    //   動くもの（扉・罠・水・敵・宝箱など）には使わない
    addStatic(obj) {
        obj.userData.static = true;
        this.scene.add(obj);
    }

    // addStatic で足した部品（グループの中の部品も）を、同じ材質ごとに、1つのメッシュにまとめる。
    //   1マスごとに別々のメッシュだと、描画の命令が1フレームに数百〜千回を超え、CPU が重くなる。見た目は変わらない。
    //   半透明な材質・配列の材質は、描画の順番が崩れるので、まとめずに、そのまま残す
    mergeStaticMeshes() {
        const meshes = [];
        const groups = [];
        for (const obj of [...this.scene.children]) {
            if (!obj.userData?.static) continue;
            if (obj.isMesh) meshes.push(obj);
            else if (obj.isGroup) { groups.push(obj); obj.traverse(o => { if (o.isMesh) meshes.push(o); }); }
        }
        const buckets = new Map();
        for (const mesh of meshes) {
            const m = mesh.material;
            if (!m || Array.isArray(m) || (m.transparent && !(m.alphaTest > 0))) continue;   // 半透明は、描画の順番が崩れるので、まとめない（切り抜き: alphaTest つきは、まとめてよい）
            const key = [m.type, m.map?.uuid, m.color?.getHex(), m.emissive?.getHex?.(), m.side, m.opacity, m.alphaTest, m.depthWrite, m.wireframe].join('|');
            if (!buckets.has(key)) buckets.set(key, { material: m, items: [] });
            buckets.get(key).items.push(mesh);
        }
        for (const { material, items } of buckets.values()) {
            const pos = [], nor = [], uv = [];
            for (const mesh of items) {
                mesh.updateWorldMatrix(true, false);
                let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
                g.applyMatrix4(mesh.matrixWorld);
                pos.push(g.attributes.position.array);
                nor.push(g.attributes.normal.array);
                uv.push(g.attributes.uv.array);
                g.dispose();
            }
            const cat = (arrs) => { const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(cat(uv), 2));
            const merged = new THREE.Mesh(geo, material);
            this.scene.add(merged);
            for (const mesh of items) mesh.removeFromParent();
        }
        for (const g of groups) if (g.children.length === 0) g.removeFromParent();
    }

    // 屋内の天井を 1 マス分張る（壁の高さ。下から見える向き）
    addCeilingTile(wx, wz, tileSize, wallH, textureKey) {
        const mat = this.makeLitMaterial(textureKey, this.textures[textureKey] || this.textures.brick);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), mat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(wx, wallH - 0.05, wz);   // 全体の天井（wallH）と同じ平面だと、動くたびにちらつく（z-fighting）ので、少し下げる
        this.addStatic(mesh);
    }

    movePlayer(dx, dz) {
        // マップの読み込み中は、動かない。読み込み中も、ゲームの時間は進み、新しい地形の高さが先に入るため、古い位置のまま動くと、
        //   段差を落下と判定して、落下ダメージを受けていた（マップ間の移動）
        if (this.nav?.busy) return;
        this.depenetrateFromWalls();
        const prevX = this.player.x;
        const prevZ = this.player.z;
        const nextX = this.player.x + dx;
        const nextZ = this.player.z + dz;
        const r = this.player.radius;

        // X collision
        let canMoveX = true;
        for (const c of this.colliders) {
            if (c.disabled) continue;
            if (nextX >= c.minX - r && nextX <= c.maxX + r &&
                this.player.z >= c.minZ - r && this.player.z <= c.maxZ + r) {
                canMoveX = false;
                break;
            }
        }
        // 起伏: 2 段以上高い所へは、歩いて上れない（崖）。1 段までの段差は上れる。
        //   降りるのは、1 段は普通に、2 段は飛び降りて（ダメージ）降りられる。3 段以上の高さからは、降りられない（崖の縁で止まる）
        const climbOk = (x, z, dirX, dirZ) => {
            if (!this.heightMap) return true;
            const cur = this.player.heightLevel ?? this.heightLevelAt(this.player.x, this.player.z);
            const diff = this.heightLevelAt(x + dirX * r, z + dirZ * r, cur) - cur;   // 吊橋のマスは、今の高さに近い層（橋の上・橋の下）へ進む
            return diff <= 1 && diff >= -2;
        };
        if (canMoveX && !climbOk(nextX, this.player.z, Math.sign(dx), 0)) canMoveX = false;
        if (canMoveX) this.player.x = nextX;

        // Z collision
        let canMoveZ = true;
        for (const c of this.colliders) {
            if (c.disabled) continue;
            if (this.player.x >= c.minX - r && this.player.x <= c.maxX + r &&
                nextZ >= c.minZ - r && nextZ <= c.maxZ + r) {
                canMoveZ = false;
                break;
            }
        }
        if (canMoveZ && !climbOk(this.player.x, nextZ, 0, Math.sign(dz))) canMoveZ = false;
        if (canMoveZ) this.player.z = nextZ;
        // 起伏: 2 段以上低い所へ降りたら、落下（高さに応じたダメージ）
        if (this.heightMap) {
            const prev = this.player.heightLevel ?? this.heightLevelAt(this.player.x, this.player.z);
            const lv = this.heightLevelAt(this.player.x, this.player.z, prev);
            if (prev - lv >= 2) this.applyHeightFall(prev - lv);
            this.player.heightLevel = lv;
        }

        // 生きている敵は障害物（突き抜けられない）。敵に近づく方向の移動だけ、敵の円の縁まで押し戻して横へ滑らせる。
        // 突進の攻撃判定（距離 player.radius + m.radius 未満）が成立するよう、縁は攻撃判定の距離より内側（80%）にする。
        // すでに重なっている敵から離れる方向の移動は妨げない。倒れている最中（active=false）の敵は障害物にしない
        for (const m of [...this.monsters, ...(this.npcs ?? [])]) {
            if (!m.active) continue;
            const minDist = (r + m.radius) * 0.8;
            const cx = this.player.x - m.x;
            const cz = this.player.z - m.z;
            const d = Math.hypot(cx, cz);
            if (d >= minDist) continue;
            const prevD = Math.hypot(prevX - m.x, prevZ - m.z);
            if (d >= prevD) continue;
            // 押し戻した位置が壁に重なる場合は、押し戻さず動く前の位置に留まる（壁にめり込んで動けなくなるのを防ぐ）
            const pushedX = d > 0.0001 ? m.x + cx / d * minDist : prevX;
            const pushedZ = d > 0.0001 ? m.z + cz / d * minDist : prevZ;
            if (this.isInsideWall(pushedX, pushedZ)) {
                this.player.x = prevX;
                this.player.z = prevZ;
            } else {
                this.player.x = pushedX;
                this.player.z = pushedZ;
            }
        }
    }

    updateCombat(dt) {
        // 群れ（pack）: 仲間の 1 体が、プレイヤーを見つけたら、近くの仲間も、すぐ追ってくる
        this.packTimer = (this.packTimer ?? 0) - dt;
        if (this.packTimer <= 0) {
            this.packTimer = 0.5;
            for (const a of this.monsters) {
                if (!a.active || a.state !== 'chase' || !a.profile?.pack) continue;
                for (const b of this.monsters) {
                    if (b === a || !b.active || b.state === 'chase' || !b.profile?.pack) continue;
                    // 狼（relentless）は、追っている間、離れた仲間まで呼び寄せる（逃げると、列になって追ってくる）。縄張りのある敵（クマ・鳥）は、仲間を呼ばない
                    const joinR = a.profile.relentless ? a.profile.relentless.joinRadius : 16;
                    if (b.profile?.territory && b.profile.territory.mode !== 'roam') continue;
                    if (Math.hypot(a.x - b.x, a.z - b.z) < joinR) { b.state = 'chase'; b.lostTimer = 0; }
                }
            }
        }
        for (let i = this.monsters.length - 1; i >= 0; i--) {
            const m = this.monsters[i];
            m.floorY = this.getFloorHeight(m.x, m.z, this.levelOfFloorY(m.floorY));
            m.update(dt, this.player, this.colliders, this.projectiles, this.sound, this.scene, this.visibility ?? 1.0);
            this.processBurn(m);

            // Check collision with player for Ys-style bump attack
            const dx = m.x - this.player.x;
            const dz = m.z - this.player.z;
            const dist = Math.hypot(dx, dz);
            const bumpThreshold = this.player.radius + m.radius;

            // 倒れている最中の敵は攻撃も当たり判定もしない。飛んでいる敵・高低差のある相手とは、高さが合っているときだけ、ぶつかる
            const vDiff = ((m.floorY ?? 0) + (m.baseY ?? 0) + 0.9) - ((this.player.floorY ?? 0) + 0.9);
            if (m.active && !m.untouchable && dist < bumpThreshold && Math.abs(vDiff) < 1.7 && this.player.attackCooldown <= 0) {
                this.resolveYsBump(m, dx, dz, dist);
            }

            if (!m.active) {
                // 死亡演出: 効果音・粒子を出しつつ、倒れて消えるアニメーションが終わってから削除する
                if (!m.deathStarted) {
                    m.deathStarted = true;
                    if (m.stolenGold > 0) { this.player.gold += m.stolenGold; this.addPopup(`ゴールドを取り返した！ +${m.stolenGold}G`, '#facc15'); m.stolenGold = 0; }
                    this.sound.playEnemyDeath();
                    this.particles.spawnBurst(m.x, 1.0, m.z, m.deathColor, 14, 3.5);
                }
                m.deathFxTimer -= dt;
                if (m.deathFxTimer <= 0 && m.deathTimer >= 0.1 && m.deathTimer < 1.2) {
                    m.deathFxTimer = 0.12;
                    this.particles.spawnBurst(m.x, 0.6, m.z, m.deathColor, 3, 2.0);
                }
                if (m.updateDeath(dt)) {
                    this.scene.remove(m.sprite);
                    this.monsters.splice(i, 1);
                }
            }
        }
    }

    // Classic Ys 1 "Half-Offset" Combat resolution
    requestHitStop(seconds) {
        this.hitStop = Math.max(this.hitStop, seconds);
    }

    shakeCamera(amp = HIT_FEEDBACK.shake.amp, duration = HIT_FEEDBACK.shake.duration) {
        this.cameraShake = { time: duration, duration, amp: Math.max(amp, this.cameraShake.time > 0 ? this.cameraShake.amp : 0) };
    }

    // 突進が敵に当たったときの手応え: 打撃音・ヒットストップ・（強い一撃なら）カメラの揺れ
    //   crit=半ずらし会心 / killed=撃破 / heavy=重い武器（大剣・メイス）
    playerHitFeedback({ crit, killed, heavy }) {
        const f = HIT_FEEDBACK;
        this.sound.playEnemyHit(crit || heavy);
        const base = killed ? f.hitStop.kill : (crit ? f.hitStop.crit : f.hitStop.charge);
        this.requestHitStop(base + (heavy ? f.hitStop.heavyBonus : 0));
        if (crit || killed || heavy) this.shakeCamera();
    }

    resolveYsBump(monster, dx, dz, dist) {
        // 装備中の近接武器（未装備なら素手）のクラスが、突進攻撃のダメージ・間隔・ノックバック・スタン・エフェクトを決める
        const weapon = this.getMeleeItem();
        const cls = (weapon && this.weaponClasses[weapon.weaponClass]) || null;
        const damageScale = (cls ? cls.damageScale : 1.0) * (weapon?.powerScale ?? 1);
        const randomBonus = weapon?.randomBonus ?? 3;
        this.player.attackCooldown = cls ? cls.cooldown : 0.22; // Quick hit intervals for "bokosuka"

        // Player forward vector
        const pFwdX = -Math.sin(this.player.angle);
        const pFwdZ = -Math.cos(this.player.angle);

        // Vector to monster
        const nx = dx / (dist || 0.001);
        const nz = dz / (dist || 0.001);

        // Dot product: player facing enemy?
        const dotFront = pFwdX * nx + pFwdZ * nz;

        // Cross product 2D: determine how much the player is offset from center
        const cross = Math.abs(pFwdX * nz - pFwdZ * nx);

        // Player is actively pressing move key to attack/charge forward
        const isPlayerMovingForward = (this.keys.forward && !this.player.isFalling);

        // Ys 1 "Half-offset" rule:
        // Attack only occurs if player is actively moving forward!
        // If player is standing still, player does NOT attack, and enemy gets a free hit.
        const isHalfOffset = (isPlayerMovingForward && dotFront > 0.4 && cross >= 0.25);
        const isCharging = (isPlayerMovingForward && dotFront > 0.6);

        // 武器クラスの効果（ノックバック・スタン・斬撃エフェクト）を、突進が当たった敵に適用する
        const applyWeaponEffects = (isDead, crit) => {
            if (!cls) return;
            if (cls.stun > 0 && !isDead) monster.stun(cls.stun);
            this.slashEffects.spawn(cls.range, cls.arcDeg, cls.effect, effectPower(crit, isDead));
        };
        const knockScale = cls ? cls.knockback : 1.0;
        const heavySound = cls ? cls.sound === 'heavy' : false;

        if (isHalfOffset) {
            // CRITICAL HALF-OFFSET HIT: Player takes 0 damage, monster takes full + bonus damage!
            const damage = Math.floor(this.playerAttackPower() * 1.5 * damageScale + Math.random() * 5);
            this.sound.playAttack(true);
            const isDead = monster.takeDamage(damage, { x: nx, z: nz }, knockScale);
            applyWeaponEffects(isDead, true);
            this.playerHitFeedback({ crit: true, killed: isDead, heavy: heavySound });
            this.particles.spawnBurst(monster.x, 1.2, monster.z, 0xfbbf24, 12, 4.0);
            this.addPopup(monster.lastBlocked ? 'ガード!' : `半ずらし会心! -${damage}`, monster.lastBlocked ? '#94a3b8' : '#fbbf24', monster.x, monster.z);
            this.notifyEnemyEngaged(monster);

            if (isDead) this.gainExp(monster.exp);
        } else if (isCharging) {
            // Normal charge: Mutual damage (player takes half, enemy takes standard)
            const pDmg = Math.floor(this.playerAttackPower() * damageScale + Math.random() * randomBonus);
            if (monster.isDashing) monster.dashHit = true;   // 突進が当たった（よけられていない）
            const mDmg = Math.floor(monster.attackPower * 0.5 * (monster.isDashing ? 1.5 : 1) * (monster.hitScale ?? 1));

            this.sound.playAttack(heavySound);
            const isDead = monster.takeDamage(pDmg, { x: nx, z: nz }, knockScale);
            applyWeaponEffects(isDead, false);
            this.playerHitFeedback({ crit: false, killed: isDead, heavy: heavySound });
            this.playerTakeDamage(mDmg, new THREE.Vector3(-nx, 0, -nz), 1.0, monster);
            this.addPopup(monster.lastBlocked ? 'ガード!' : `ボコッ! -${pDmg}`, monster.lastBlocked ? '#94a3b8' : '#ffffff', monster.x, monster.z);
            this.notifyEnemyEngaged(monster);

            if (isDead) this.gainExp(monster.exp);
        } else {
            // Enemy hits player (player is standing still, stopped, or backing away)
            if (monster.isDashing) monster.dashHit = true;   // 突進が当たった（よけられていない）
            const mDmg = Math.max(1, Math.floor(monster.attackPower * (monster.isDashing ? 1.5 : 1) * (monster.hitScale ?? 1)));   // 突進中は、威力が 1.5 倍。猫系の連続攻撃は、1 回が小さい
            this.playerTakeDamage(mDmg, new THREE.Vector3(-nx, 0, -nz), monster.isDashing ? 2.0 : 1.0, monster);   // 突進は、大きく吹き飛ばす
            this.notifyEnemyEngaged(monster);
        }
    }

    playerTakeDamage(amount, knockDir, knockScale = 1.0, source = null) {
        if (this.player.isInvincible) return;
        if (source) this.onPlayerHitBy(source, amount);   // 状態異常・生命力吸収

        this.player.hp = Math.max(0, this.player.hp - amount);
        this.player.isInvincible = true;
        this.player.invincibleTimer = 0.35;
        this.player.knockback.copy(knockDir).multiplyScalar(8 * knockScale);

        this.sound.playHurt();
        this.flashDamageScreen();

        if (this.player.hp <= 0) {
            this.addPopup('GAME OVER! リスポーンします', '#ef4444');
            setTimeout(() => {
                this.player.hp = this.player.maxHp;
                this.loadMap(this.currentMapId);
            }, 1000);
        }
    }

    // Trigger falling down the pitfall shaft
    triggerPlayerFall(crumbleObj) {
        if (this.player.isFalling) return;
        this.player.isFalling = true;
        this.player.fallDepth = 0;
        this.player.fallVelocityY = 1.0;
        this.player.fallTrapRef = crumbleObj;

        // Use the last confirmed safe position on solid ground before entering the pit trap
        this.player.fallRespawnPos = {
            x: this.player.lastSafePos.x,
            z: this.player.lastSafePos.z
        };

        this.sound.playFallingScream();
        this.addPopup('うわあああっ！奈落へ転落！', '#ef4444');
    }

    // Impact bottom of the pit, take damage and crawl back out
    finishPlayerFall() {
        if (!this.player.isFalling) return;
        this.player.isFalling = false;

        const dmg = this.player.fallTrapRef?.damage || 35;
        this.player.hp = Math.max(0, this.player.hp - dmg);
        this.sound.playHurt();
        this.sound.playFloorCollapse();
        this.flashDamageScreen();
        this.particles.spawnBurst(this.player.x, 0.2, this.player.z, 0xdc2626, 24, 6.0);
        this.addPopup(`針穴へ墜落！ -${dmg}`, '#ef4444');

        if (this.player.hp <= 0) {
            this.addPopup('GAME OVER! 奈落の底で力尽きた…', '#ef4444');
            setTimeout(() => {
                this.player.hp = this.player.maxHp;
                this.player.fallDepth = 0;
                this.player.fallVelocityY = 0;
                this.player.pitch = 0;
                this.loadMap(this.currentMapId);
            }, 1000);
            return;
        }

        // Fade black screen momentarily while crawling back to safety edge
        this.flashScreen('rgba(0, 0, 0, 0.95)');
        setTimeout(() => {
            if (this.player.fallRespawnPos) {
                this.player.x = this.player.fallRespawnPos.x;
                this.player.z = this.player.fallRespawnPos.z;
            }
            // Ensure safe distance from colliders
            const r = this.player.radius || 0.6;
            for (const c of this.colliders) {
                if (c.disabled) continue;
                if (this.player.x >= c.minX - r && this.player.x <= c.maxX + r &&
                    this.player.z >= c.minZ - r && this.player.z <= c.maxZ + r) {
                    // Push out to open side
                    const overlapLeft = (this.player.x + r) - c.minX;
                    const overlapRight = c.maxX - (this.player.x - r);
                    const overlapTop = (this.player.z + r) - c.minZ;
                    const overlapBottom = c.maxZ - (this.player.z - r);
                    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                    if (minOverlap === overlapLeft) this.player.x = c.minX - r - 0.1;
                    else if (minOverlap === overlapRight) this.player.x = c.maxX + r + 0.1;
                    else if (minOverlap === overlapTop) this.player.z = c.minZ - r - 0.1;
                    else this.player.z = c.maxZ + r + 0.1;
                }
            }

            this.player.fallDepth = 0;
            this.player.fallVelocityY = 0;
            this.player.pitch = 0;
            this.addPopup('なんとか穴の縁へ這い上がった！', '#fef08a');
        }, 350);
    }

    // Player interaction with nearest Chest or Door (triggered by pressing E)
    interactNearestObject() {
        // 0. 店主に話しかける（売買のメニューを開く）
        for (const n of this.npcs ?? []) {
            if (n.shopId && Math.hypot(this.player.x - n.x, this.player.z - n.z) <= (n.speechRadius ?? 3)) {
                this.openShopMenu(n.shopId);
                return true;
            }
        }
        // 0b. 話しかけた住民が、襲撃者（ambush）だった: 正体を現して、襲いかかる
        for (const n of this.npcs ?? []) {
            if (n.ambush && Math.hypot(this.player.x - n.x, this.player.z - n.z) <= 3.0) {
                this.revealAmbusher(n);
                return true;
            }
        }
        // 1. Check Treasure Chests
        if (this.chests && this.chests.length > 0) {
            for (const ch of this.chests) {
                if (ch.isOpen || !ch.group.visible) continue;
                const dist = Math.hypot(this.player.x - ch.x, this.player.z - ch.z);
                if (dist <= ch.radius + 1.2 && this.sameFloorAs(ch.floorY)) {
                    this.openChest(ch);
                    return true;
                }
            }
        }
        return false;
    }

    // プレイヤーが、高さ floorY の物と、同じ床にいるか（高台の宝箱を、崖の下から開けない）。段差 1 段までは、同じ床（隣のマスの階段の 1 段目から、など）。2 段以上は、別の床
    sameFloorAs(floorY) {
        return Math.abs((this.player.floorY ?? 0) - (floorY ?? 0)) <= (this.heightStep ?? 1) * 1.1;
    }

    // Open chest or trigger Mimic encounter
    openChest(chest) {
        if (chest.isOpen) return;
        chest.isOpen = true;
        chest.targetLidAngle = -Math.PI * 0.55; // Flip lid wide open!
        chest.respawnTimer = 0;

        if (chest.isMimic) {
            // MIMIC TRAP!
            this.sound.playMimicGrowl();
            this.sound.playHurt();
            this.flashDamageScreen();

            // Bite damage!
            const biteDamage = 28;
            this.playerTakeDamage(biteDamage, new THREE.Vector3(0, 0, 0));
            this.particles.spawnBurst(chest.x, 1.2, chest.z, 0xdc2626, 20, 5.0);
            this.addPopup(`ガブッ！ミミックの奇襲！ -${biteDamage}`, '#ef4444');

            // Hide stationary chest object & disable solid collider so mimic and player can move freely
            chest.group.visible = false;
            if (chest.collider) {
                chest.collider.disabled = true;
            }

            const mimicDef = (this.enemyDefinitions && this.enemyDefinitions.mimic) ? this.enemyDefinitions.mimic : {
                name: '人喰い箱ミミック',
                maxHp: 75,
                speed: 2.2,
                attackPower: 18,
                exp: 80,
                radius: 0.95
            };
            const m = new Monster('mimic', chest.x, chest.z, this.textures, mimicDef);
            // On mimic defeat: gives high rewards
            m.exp = mimicDef.exp || 80;
            this.monsters.push(m);
            this.scene.add(m.sprite);
            this.notifyEnemyEngaged(m);

        } else {
            // NORMAL TREASURE CHEST!
            this.sound.playChestOpen();
            this.sound.playItemGet();

            // Gold / sparkles burst out of chest
            this.particles.spawnBurst(chest.x, 0.8, chest.z, 0xfbbf24, 22, 4.0);

            // Roll loot from lootTable
            const lootItem = chest.lootTable[Math.floor(Math.random() * chest.lootTable.length)];
            if (lootItem.type === 'gold') {
                const amount = Math.floor(Math.random() * (lootItem.max - lootItem.min + 1)) + lootItem.min;
                this.player.gold = (this.player.gold || 0) + amount;
                this.addPopup(`宝箱発見！ ${amount}G 入手！`, '#facc15');
            } else if (lootItem.type === 'heal_potion') {
                const healAmt = lootItem.heal || 40;
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
                this.particles.spawnBurst(this.player.x, 1.0, this.player.z, 0x22c55e, 14, 3.0);
                this.addPopup(`宝箱発見！ HP薬で+${healAmt}回復！`, '#22c55e');
            } else if (lootItem.type === 'mp_potion') {
                const healAmt = lootItem.heal || 30;
                this.player.mp = Math.min(this.player.maxMp, this.player.mp + healAmt);
                this.particles.spawnBurst(this.player.x, 1.0, this.player.z, 0x38bdf8, 14, 3.0);
                this.addPopup(`宝箱発見！ MP薬で+${healAmt}回復！`, '#38bdf8');
            }
        }
    }

    gainExp(amount) {
        this.player.exp += amount;
        const nextLvExp = this.player.level * 40;
        if (this.player.exp >= nextLvExp) {
            this.player.level++;
            this.player.attackPower += 5;
            this.player.maxHp += 20;
            this.player.hp = this.player.maxHp;
            this.sound.playLevelClear();
            this.addPopup(`LEVEL UP! Lv.${this.player.level}`, '#34d399');
        }
    }

    flashDamageScreen() {
        const overlay = document.getElementById('damageFlash');
        if (overlay) {
            overlay.style.backgroundColor = '#ef4444';
            overlay.style.opacity = '0.5';
            setTimeout(() => { overlay.style.opacity = '0'; }, 150);
        }
    }

    flashScreen(colorRgba) {
        const overlay = document.getElementById('damageFlash');
        if (overlay) {
            overlay.style.backgroundColor = colorRgba;
            overlay.style.opacity = '0.6';
            setTimeout(() => { overlay.style.opacity = '0'; }, 120);
        }
    }

    addPopup(text, color, worldX = null, worldZ = null) {
        const el = document.createElement('div');
        el.className = 'damage-popup';
        el.innerText = text;
        el.style.color = color;
        el.style.left = '50%';
        el.style.top = '45%';
        document.getElementById('hudOverlay').appendChild(el);

        setTimeout(() => {
            el.remove();
        }, 800);
    }

    updatePopups(dt) {
        // Simple DOM based popups auto-remove
    }

    updateSignpostBanner(message, icon = '📜') {
        const banner = document.getElementById('signpostBanner');
        if (!banner) return;
        if (message) {
            if (banner.innerText !== `${icon} ${message}`) {
                banner.innerText = `${icon} ${message}`;
            }
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    }

    notifyEnemyEngaged(monster) {
        if (!monster) return;
        this.activeEnemyCards = this.activeEnemyCards || [];

        // If monster already exists, remove it first so we can move it to the bottom (most recent)
        const idx = this.activeEnemyCards.findIndex(c => c.monster === monster);
        let cardData;

        if (idx !== -1) {
            cardData = this.activeEnemyCards.splice(idx, 1)[0];
            cardData.timer = 2.5; // Exactly 2.5 seconds display
            cardData.hp = Math.max(0, monster.hp);
        } else {
            cardData = {
                monster: monster,
                name: monster.name || 'モンスター',
                maxHp: monster.maxHp || 30,
                hp: Math.max(0, monster.hp),
                iconUrl: monster.iconUrl || '/images/enemies/slime/slime.png',
                timer: 2.5 // Exactly 2.5 seconds display
            };
        }

        // Add to the front of the array (bottom of the flex-direction: column-reverse stack)
        this.activeEnemyCards.unshift(cardData);

        // Limit stack to maximum 3 cards
        if (this.activeEnemyCards.length > 3) {
            this.activeEnemyCards.pop();
        }
    }

    updateUI(dt = 0) {
        // 値が変わったときだけ DOM に書く（毎フレームの書き込みは、再計算・再描画を起こすため。要素も一度だけ取得して使い回す）
        const ui = this._uiCache || (this._uiCache = { els: {}, vals: {} });
        const put = (id, prop, val) => {
            if (ui.vals[id] === val) return;
            const el = ui.els[id] || (ui.els[id] = document.getElementById(id));
            if (!el) return;
            ui.vals[id] = val;
            if (prop === 'width') el.style.width = val; else el.innerText = val;
        };
        put('hpBar', 'width', `${(this.player.hp / this.player.maxHp) * 100}%`);
        put('hpText', 'text', `${Math.ceil(this.player.hp)}/${this.player.maxHp}`);
        put('mpBar', 'width', `${(this.player.mp / this.player.maxMp) * 100}%`);
        put('mpText', 'text', `${Math.floor(this.player.mp)}/${this.player.maxMp}`);
        put('levelText', 'text', `Lv.${this.player.level}`);
        put('expText', 'text', `EXP: ${this.player.exp}`);
        put('goldText', 'text', `${this.player.gold || 0} G`);
        const names = { poison: '毒', burn: '火傷', slow: '鈍足', paralysis: '麻痺', silence: '沈黙', curse: '呪い' };
        put('playerStatus', 'text', Object.keys(this.player.status ?? {}).map(k => `${names[k] ?? k}${Math.ceil(this.player.status[k].t)}`).join(' '));
        put('monsterCount', 'text', `敵残数: ${this.monsters.filter(m => m.active).length}`);

        // Update active enemy status cards stacked above player HP/MP (Ys-style Target Info)
        const enemyListEl = document.getElementById('enemyHudList');
        if (enemyListEl && this.activeEnemyCards) {
            // Tick down timers and remove expired or dead enemies
            for (let i = this.activeEnemyCards.length - 1; i >= 0; i--) {
                const card = this.activeEnemyCards[i];
                card.timer -= dt;
                card.hp = Math.max(0, card.monster ? card.monster.hp : 0);

                // Expire when timer runs out (2.5s)
                if (card.timer <= 0) {
                    this.activeEnemyCards.splice(i, 1);
                }
            }

            // Render current active enemy cards with DOM reuse to prevent re-creation flicker
            if (this.activeEnemyCards.length === 0) {
                if (enemyListEl.innerHTML !== '') {
                    enemyListEl.innerHTML = '';
                }
            } else {
                // Generate a key representing the state to only re-render when contents change
                const newHtml = this.activeEnemyCards.map(c => {
                    const hpPercent = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
                    return `
                        <div class="enemy-hud-card">
                            <img class="enemy-hud-icon" src="${c.iconUrl}" alt="${c.name}" onerror="this.src='/images/enemies/slime/slime.png'">
                            <div class="enemy-hud-details">
                                <div class="enemy-hud-header">
                                    <span>${c.name}</span>
                                    <span>${c.hp}/${c.maxHp}</span>
                                </div>
                                <div class="enemy-hud-hp-bg">
                                    <div class="enemy-hud-hp-fill" style="width: ${hpPercent}%;"></div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                if (enemyListEl.innerHTML !== newHtml) {
                    enemyListEl.innerHTML = newHtml;
                }
            }
        }
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        const mapData = this.mapData;
        if (!mapData) return;

        const rows = mapData.layout.length;
        const cols = mapData.layout[0].length;
        const tileSize = mapData.tileSize || 4;
        const scaleX = w / (cols * tileSize);
        const scaleZ = h / (rows * tileSize);

        // Draw walls: 動かない壁は、マップごとに 1 回だけ別の canvas に描いて、使い回す（大森林は、壁（木）が 700〜2000 個あり、毎フレーム描くと、重い）
        const baseKey = `${this.currentMapId}:${this.colliders.length}`;
        if (!this.minimapBase || this.minimapBase.key !== baseKey) {
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const bctx = cv.getContext('2d');
            bctx.fillStyle = '#475569';
            for (const c of this.colliders) {
                bctx.fillRect(c.minX * scaleX, c.minZ * scaleZ,
                    (c.maxX - c.minX) * scaleX, (c.maxZ - c.minZ) * scaleZ);
            }
            this.minimapBase = { key: baseKey, canvas: cv };
        }
        ctx.drawImage(this.minimapBase.canvas, 0, 0);

        // Draw Portal
        for (const portal of this.portals) {
            ctx.fillStyle = portal.link.color ?? '#38bdf8';
            ctx.beginPath();
            ctx.arc(portal.x * scaleX, portal.z * scaleZ, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Chests (Gold square on minimap)
        if (this.chests) {
            for (const ch of this.chests) {
                if (!ch.group.visible) continue;
                ctx.fillStyle = ch.isOpen ? '#94a3b8' : '#facc15';
                ctx.fillRect(ch.x * scaleX - 2, ch.z * scaleZ - 2, 4, 4);
            }
        }

        // Draw Monsters
        for (const m of this.monsters) {
            if (!m.active) continue;
            ctx.fillStyle = (m.type === 'S') ? '#10b981' : '#f97316';
            ctx.beginPath();
            ctx.arc(m.x * scaleX, m.z * scaleZ, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 村人（黄色い点）
        ctx.fillStyle = '#facc15';
        for (const n of this.npcs ?? []) {
            ctx.beginPath();
            ctx.arc(n.x * scaleX, n.z * scaleZ, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Player & View Cone
        const px = this.player.x * scaleX;
        const pz = this.player.z * scaleZ;

        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Direction line
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, pz);
        ctx.lineTo(
            px - Math.sin(this.player.angle) * 12,
            pz - Math.cos(this.player.angle) * 12
        );
        ctx.stroke();
    }

    /**
     * sdServerから取得したテクスチャをゲーム内の壁や床に差し替える
     */
    applyTexture(target, texture) {
        if (target === 'wall') {
            this.textures.brick = texture;
            this.textures.rock = texture;
            // シーン内の壁メッシュのマテリアルを更新
            this.scene.traverse((obj) => {
                if (obj.isMesh && obj.geometry.type === 'BoxGeometry') {
                    obj.material.map = texture;
                    obj.material.needsUpdate = true;
                }
            });
        } else if (target === 'floor') {
            this.textures.floorStone = texture;
            this.textures.grass = texture;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(16, 16);
            this.scene.traverse((obj) => {
                if (obj.isMesh && obj.geometry.type === 'PlaneGeometry') {
                    obj.material.map = texture;
                    obj.material.needsUpdate = true;
                }
            });
        } else if (target === 'slime') {
            this.textures.slime = texture;
            for (const m of this.monsters) {
                if (m.type === 'S') {
                    m.spriteMat.map = texture;
                    m.spriteMat.needsUpdate = true;
                }
            }
        } else if (target === 'goblin') {
            this.textures.goblin = texture;
            for (const m of this.monsters) {
                if (m.type === 'G') {
                    m.spriteMat.map = texture;
                    m.spriteMat.needsUpdate = true;
                }
            }
        }
    }

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
            const dt = Math.min(0.1, this.clock.getDelta());
            this.update(dt);
            this.render();
        };
        requestAnimationFrame(loop);
    }
}
