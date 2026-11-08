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
            fWorldTree: RetroTextureGenerator.createFieldImageTexture('world_tree'),   // 世界樹（G の街の中心。5 倍）
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
            woodenFence: RetroTextureGenerator.createWoodenFenceTexture(),
            villageRoof: RetroTextureGenerator.createVillageRoofTexture(),
            dirtRoad: RetroTextureGenerator.createDirtRoadTexture(),
            cityWall: RetroTextureGenerator.createCityWallTexture(),
            shopWall: RetroTextureGenerator.createShopWallTexture(),
            innWall: RetroTextureGenerator.createInnWallTexture(),
            cityRoof: RetroTextureGenerator.createCityRoofTexture(),
            pavedRoad: RetroTextureGenerator.createPavedRoadTexture(),
            snowRoof: RetroTextureGenerator.createSnowRoofTexture(),       // 雪国（A）: 雪をかぶった屋根・雪の積もった石畳・大通り
            snowCobble: RetroTextureGenerator.createSnowCobbleTexture(),
            adobeWall: RetroTextureGenerator.createAdobeWallTexture('#d9bd8c', '#b8683a', 5150),   // 中東風（C）: 砂色の漆喰の壁・赤土色の壁（商店）・平らな屋根・青緑のドーム
            adobeWallOchre: RetroTextureGenerator.createAdobeWallTexture('#cf9f62', '#2a6f8a', 6262),
            adobeRoof: RetroTextureGenerator.createAdobeRoofTexture(),
            domeTile: RetroTextureGenerator.createDomeTileTexture(),
            packedEarth: RetroTextureGenerator.createPackedEarthTexture(false),   // 砂漠の街（C）の地面: 踏み固めた土（広場）・わだちのある土の大通り
            packedEarthRoad: RetroTextureGenerator.createPackedEarthTexture(true),
            snowPaved: RetroTextureGenerator.createSnowPavedTexture(),
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
        const boost = Math.min(450, Math.max(0, (this.camera.position.y - 6) * 50));
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
                        setTimeout(() => { this.player.hp = this.player.maxHp; this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false; this.loadMap(this.currentMapId); }, 1000);
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
                this.player.hp = this.player.maxHp; this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false;
                this.loadMap(this.currentMapId);
            }, 1500);
        }
    }

    // 世界の並びの中のマップなら、隣のマップがある方向の外側に、隣の地面を遠くまで敷く。隣がない方向は、何も描かない（空だけ）
    async buildOutsideGround(mapId, cols, rows, tileSize, mapData, floorMatOf) {
        const world = this.world;
        if (!world || !world.grid?.some(r => r.includes(mapId))) return;
        const W = cols * tileSize, D = rows * tileSize, FAR = 400;
        // 4 方向の隣のマップを、同時に読み込む（順に待つと、読み込みが遅くなる）
        await Promise.all(['north', 'south', 'west', 'east'].map(async (dir) => {
            const nid = worldNeighbor(world, mapId, dir);
            if (!nid || this.mapCache[nid]) return;
            try { this.mapCache[nid] = await fetchMap(nid); } catch { /* 読めなければ、隣の地形は描かない */ }
        }));
        const floorOf = async (dir) => {
            const nid = worldNeighbor(world, mapId, dir);
            if (!nid) return null;
            let nd = this.mapCache[nid];
            if (!nd) {
                try { nd = await fetchMap(nid); this.mapCache[nid] = nd; } catch { return null; }
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
            mesh.position.set(cx, -0.3, cz);   // 隣のマップの水の面（-0.15）・海の面（-0.2）より下（上だと、水が、模様のある地面におおわれる）
            this.scene.add(mesh);
        }
        // 端の向こうの、隣のマップ（斜めの角を含む 8 方向）を、本物のマス（高さ・地面・崖・水・木・草・岩）で描く（見た目だけ。当たり判定は、今のマップだけ）
        await this.buildNeighborDecor(mapId, cols, rows, tileSize, mapData, floorMatOf);
        this.prefetchNearbyMaps(mapId);   // 端を越えて切り替わるとき、読み込みを待たない（隣の隣までの、マップのデータを、先に読んでおく）
    }

    // マップの外の隣のマス（行 nr・列 nc。どちらか一方だけが、範囲の外）が、隣のマップの水か。隣のマップが読み込めていない・世界の外は、水でない
    waterAcrossEdge(nr, nc, rows, cols) {
        if (!this.world || (nr < 0 || nr >= rows) === (nc < 0 || nc >= cols)) return false;
        const dir = nr < 0 ? 'north' : nr >= rows ? 'south' : nc < 0 ? 'west' : 'east';
        const nid = worldNeighbor(this.world, this.currentMapId, dir);
        const nd = nid && this.mapCache[nid];
        if (!nd?.layout) return false;
        const ch = nd.layout[(nr + rows) % rows]?.[(nc + cols) % cols];
        const def = ch && ch !== '0' ? this.objectDefinitions?.[nd.legend?.[ch]] : null;
        return !!def && (def.type === 'liquid_tile' || def.type === 'sea_tile' || !!def.waterBelow);
    }

    // 今のマップから、2 マス先までのマップ（5×5）のデータを、先に読んでおく（切り替え先の、隣のマップの読み込みを待たなくする）。
    //   マップが切り替わったら、古い予約は、やめる（番号で判定）。1 枚ずつ、少し間をあけて読む（今の描画を邪魔しない）
    prefetchNearbyMaps(mapId) {
        const world = this.world;
        if (!world?.grid) return;
        let pj = -1, pi = -1;
        world.grid.forEach((row, j) => { const i = row.indexOf(mapId); if (i >= 0) { pj = j; pi = i; } });
        if (pj < 0) return;
        const token = this.prefetchToken = (this.prefetchToken || 0) + 1;
        const ids = [];
        for (let d = 1; d <= 2; d++) for (let dj = -d; dj <= d; dj++) for (let di = -d; di <= d; di++) {
            if (Math.max(Math.abs(dj), Math.abs(di)) !== d) continue;
            const nid = world.grid[pj + dj]?.[pi + di];
            if (nid && !this.mapCache[nid]) ids.push(nid);
        }
        (async () => {
            for (const nid of ids) {
                await new Promise(r => setTimeout(r, 150));
                if (token !== this.prefetchToken) return;
                if (this.mapCache[nid]) continue;
                try { this.mapCache[nid] = await fetchMap(nid); } catch { /* 読めなければ、あとで、必要なときに読む */ }
            }
        })();
    }

    // ---- 見た目の共通部品 ----
    //   今のマップの描画（タイルのループ）と、隣のマップの先読み描画（buildNeighborDecor）が、同じ関数で見た目を作る。
    //   新しい種類は、ここに見た目を書けば、両方に出る。当たり判定・対話の登録は、今のマップの側だけ。
    //   env: { rows, cols, wallH, tileSize, brickMat, standardWallGeo, charAt(列, 行)（範囲外は undefined）, defOf(文字)（物体の定義）, add(obj, isStatic) }

    // 壁・家（block）
    visualBlock(objDef, wx, wz, r, c, env) {
        let blockTex = this.textures.rock;
        if (objDef.texture === 'brick') blockTex = this.textures.brick;
        else if (objDef.texture && this.textures[objDef.texture]) blockTex = this.textures[objDef.texture];

        const mat = this.makeLitMaterial(objDef.texture, blockTex);
        if (objDef.jagged || objDef.texture === 'mossyStone') {
            // Natural craggy rock height variation & slight scale offsets for natural cave look
            const rockH = env.wallH * (0.9 + ((r * 7 + c * 13) % 10) * 0.06);
            const rockGeo = new THREE.BoxGeometry(env.tileSize * 1.02, rockH, env.tileSize * 1.02);
            const rock = new THREE.Mesh(rockGeo, mat);
            rock.position.set(wx, rockH / 2, wz);
            env.add(rock, true);
        } else if (objDef.hasRoof) {
            // Buildings with European pitched roofs (Village wood or City brick/stone houses)
            const houseH = env.wallH * 0.92;
            const houseGeo = new THREE.BoxGeometry(env.tileSize, houseH, env.tileSize);
            const house = new THREE.Mesh(houseGeo, mat);
            house.position.set(wx, houseH / 2, wz);
            env.add(house, true);

            if (objDef.roofStyle === 'flat') {
                // 中東風: 平らな屋根と、低い縁（パラペット）。ドーム（dome）・尖塔（spire）は、あれば載せる
                const ts = env.tileSize;
                const flatTex = (objDef.roofTexture && this.textures[objDef.roofTexture]) || this.textures.adobeRoof;
                const flatMat = new THREE.MeshLambertMaterial({ map: flatTex });
                const slab = new THREE.Mesh(new THREE.BoxGeometry(ts * 1.0, 0.12, ts * 1.0), flatMat);
                slab.position.set(wx, houseH + 0.06, wz);
                env.add(slab, true);
                const rimH = 0.38, rimT = 0.2;
                for (const [sx, sz, ax, az] of [[0, -1, ts, rimT], [0, 1, ts, rimT], [-1, 0, rimT, ts], [1, 0, rimT, ts]]) {
                    const rim = new THREE.Mesh(new THREE.BoxGeometry(ax, rimH, az), flatMat);
                    rim.position.set(wx + sx * (ts - rimT) / 2, houseH + 0.12 + rimH / 2, wz + sz * (ts - rimT) / 2);
                    env.add(rim, true);
                }
                if (objDef.dome) {
                    const rad = ts * 0.4;
                    const domeMat = new THREE.MeshLambertMaterial({ map: this.textures[objDef.domeTexture] || this.textures.domeTile });
                    const dome = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
                    dome.position.set(wx, houseH + 0.12, wz);
                    env.add(dome, true);
                    if (objDef.spire) {
                        const gold = new THREE.MeshLambertMaterial({ color: 0xd9a92e });
                        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, rad * 0.9, 6), gold);
                        spire.position.set(wx, houseH + 0.12 + rad + rad * 0.4, wz);
                        env.add(spire, true);
                        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), gold);
                        ball.position.set(wx, houseH + 0.12 + rad + rad * 0.35, wz);
                        env.add(ball, true);
                    }
                }
            } else {
            // Triangular pitched roof capping the building (Slate blue for city or terracotta for village)
            const roofH = env.tileSize * 0.48;
            const roofGeo = new THREE.ConeGeometry(env.tileSize * 0.78, roofH, 4);
            const roofTex = (objDef.roofTexture && this.textures[objDef.roofTexture])
                ? this.textures[objDef.roofTexture]
                : (this.textures.villageRoof || this.textures.brick);
            const roofMat = new THREE.MeshLambertMaterial({ map: roofTex });
            const roofMesh = new THREE.Mesh(roofGeo, roofMat);
            roofMesh.rotation.y = Math.PI / 4;
            roofMesh.position.set(wx, houseH + roofH / 2, wz);
            env.add(roofMesh, true);
            }

            // 外に向いた壁の面に付く部品（窓・鎧戸など。objects.json の faceParts。座標は wall_deco と同じ）
            //   faceEvery（n）があれば、(列+行) が n で割り切れるマスだけに付ける（外壁に、1マスおきに窓が並ぶ）。
            //   隣に、位置を決めて置いた窓（faceEvery のない faceParts）があるマスには、自動では付けない
            const faceDefAt = (cc, rr) => env.defOf(env.charAt(cc, rr));
            const nearFixedWindow = objDef.faceEvery && [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([ex, ez]) => { const nd = faceDefAt(c + ex, r + ez); return nd && nd.faceParts && !nd.faceEvery; });
            if (objDef.faceParts && (!objDef.faceEvery || (c + r) % objDef.faceEvery === 0) && !nearFixedWindow) {
                for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                    const cc = c + dx, rr = r + dz;
                    if (env.charAt(cc, rr) === undefined) continue;
                    const nt = env.defOf(env.charAt(cc, rr));
                    if (nt && ['block', 'door', 'wall_image', 'wall_deco'].includes(nt.type)) continue;
                    const face = new THREE.Group();
                    for (const p of objDef.faceParts) {
                        const pm = p.basic ? new THREE.MeshBasicMaterial({ color: p.color }) : new THREE.MeshLambertMaterial({ color: p.color });
                        const pmesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]), pm);
                        pmesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
                        face.add(pmesh);
                    }
                    face.position.set(wx + dx * env.tileSize / 2, 0, wz + dz * env.tileSize / 2);
                    face.rotation.y = Math.atan2(dx, dz);
                    env.add(face, true);
                }
            }
        } else {
            const wall = new THREE.Mesh(env.standardWallGeo, mat);
            wall.position.set(wx, env.wallH / 2, wz);
            env.add(wall, true);
        }
    }

    // 立て札（signpost）
    visualSignpost(objDef, wx, wz, env) {
        // Rustic wooden signpost sprite
        const signMat = new THREE.SpriteMaterial({ map: this.textures[objDef.texture] || this.textures.signpost });
        const sign = new THREE.Sprite(signMat);
        sign.center.set(0.5, 0.0);
        const sScale = objDef.scale || [1.9, 2.0, 1.0];
        sign.scale.set(sScale[0], sScale[1], sScale[2]);
        sign.position.set(wx, 0.0, wz);
        env.add(sign);

    }

    // 松明（torch_stand）
    visualTorch(objDef, wx, wz, r, c, env) {
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
        env.add(group, true);
        const glowTex = this.getGlowTexture();
        const lightColor = new THREE.Color(objDef.lightColor ?? '#ffa040');
        const poolR = (objDef.lightRadius ?? 3.2) * env.tileSize / 2;
        const poolOpacity = objDef.poolOpacity ?? 0.5, haloOpacity = objDef.haloOpacity ?? 0.8;
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(poolR * 2, poolR * 2), new THREE.MeshBasicMaterial({ map: glowTex, color: lightColor, transparent: true, opacity: poolOpacity, blending: THREE.AdditiveBlending, depthWrite: false }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(wx, 0.05, wz);
        env.add(pool);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lightColor, transparent: true, opacity: haloOpacity, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.set(2.6, 2.6, 1);
        halo.position.set(wx, 1.9, wz);
        env.add(halo);
        // 炎: ゆらぐので、静的な部品（addStatic で結合される）ではなく、シーンに直接追加する
        const liveFlame = new THREE.Group();
        const lo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0xff8a1f }));
        lo.position.set(0, 1.9, 0);
        const li = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), new THREE.MeshBasicMaterial({ color: 0xffe58a }));
        li.position.set(0, 1.86, 0);
        liveFlame.add(lo, li);
        liveFlame.position.set(wx, 0, wz);
        env.add(liveFlame);
        this.torchGlows.push({ pool, halo, flame: liveFlame, poolOpacity, haloOpacity, phase: (r * 7 + c * 13) % 10 });
    }

    // 扉・門（door）の見た目。戻り値は、動かす扉の板と寸法（今のマップは、これで当たり判定と開閉を作る）
    visualDoor(objDef, wx, wz, r, c, env) {
        // Wall-mounted interactive door
        // Detect wall orientation: check if walls are on Left/Right (horizontal door) or Top/Bottom (vertical door)
        // 壁は '1'、または凡例が壁ブロック（type: block）の文字
        const isWallChar = (ch) => ch === '1' || ['block', 'door', 'wall_deco', 'wall_image'].includes(env.defOf(ch)?.type);   // 並んだ扉は、隣の扉も壁として数える
        const isWallLeft = isWallChar(env.charAt(c - 1, r));
        const isWallRight = isWallChar(env.charAt(c + 1, r));
        const isWallTop = isWallChar(env.charAt(c, r - 1));
        const isWallBottom = isWallChar(env.charAt(c, r + 1));

        const isVertical = (isWallTop || isWallBottom) && !(isWallLeft && isWallRight);

        const doorMat = new THREE.MeshLambertMaterial({ map: this.textures[objDef.texture] || this.textures.door });
        const frameMat = objDef.frameTexture && this.textures[objDef.frameTexture]
            ? this.makeLitMaterial(objDef.frameTexture, this.textures[objDef.frameTexture])
            : env.brickMat;
        const doorThickness = 0.45;
        const doorW = env.tileSize * 0.75;
        // 扉の高さ: 壁が高い建物（大神殿など）で、扉が細長くならないよう、標準の高さで頭打ちにする。
        //   objects.json の doorHeight で個別に指定もできる。扉の上から天井までは、枠と同じ材質のまぐさでふさぐ
        const doorH = Math.min(env.wallH, objDef.doorHeight ?? (env.wallH <= 5 ? env.wallH : 4.5));
        const doorGeo = new THREE.BoxGeometry(doorW, doorH, doorThickness);
        const doorMesh = new THREE.Mesh(doorGeo, doorMat);

        // Door Frame Pillars on both sides
        const pillarW = (env.tileSize - doorW) / 2;
        const pillarGeo = new THREE.BoxGeometry(pillarW, env.wallH, env.tileSize);

        const doorGroup = new THREE.Group();

        if (isVertical) {
            // North-South passage door (oriented along Z)
            doorMesh.rotation.y = Math.PI / 2;
            doorMesh.position.set(0, doorH / 2, 0);

            const pillar1 = new THREE.Mesh(pillarGeo, frameMat);
            pillar1.rotation.y = Math.PI / 2;
            pillar1.position.set(0, env.wallH / 2, -(doorW / 2 + pillarW / 2));

            const pillar2 = new THREE.Mesh(pillarGeo, frameMat);
            pillar2.rotation.y = Math.PI / 2;
            pillar2.position.set(0, env.wallH / 2, (doorW / 2 + pillarW / 2));

            doorGroup.add(doorMesh);
            doorGroup.add(pillar1);
            doorGroup.add(pillar2);
        } else {
            // East-West passage door (oriented along X)
            doorMesh.position.set(0, doorH / 2, 0);

            const pillar1 = new THREE.Mesh(pillarGeo, frameMat);
            pillar1.position.set(-(doorW / 2 + pillarW / 2), env.wallH / 2, 0);

            const pillar2 = new THREE.Mesh(pillarGeo, frameMat);
            pillar2.position.set((doorW / 2 + pillarW / 2), env.wallH / 2, 0);

            doorGroup.add(doorMesh);
            doorGroup.add(pillar1);
            doorGroup.add(pillar2);
        }

        // まぐさ（扉の上から天井まで）
        if (env.wallH > doorH + 1e-6) {
            const lintelH = env.wallH - doorH;
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, lintelH, doorThickness), frameMat);
            if (isVertical) lintel.rotation.y = Math.PI / 2;
            lintel.position.set(0, doorH + lintelH / 2, 0);
            doorGroup.add(lintel);
        }

        doorGroup.position.set(wx, 0, wz);
        env.add(doorGroup);

        return { doorMesh, doorH, isVertical, doorThickness };
    }

    // 家具（furniture）の見た目。戻り値は、当たり判定の位置と大きさ
    visualFurniture(objDef, wx, wz, r, c, env) {
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
                if (env.charAt(cc, rr) === undefined) return false;
                const wt = env.defOf(env.charAt(cc, rr));
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
        env.add(group, true);
        // waterBelow（水の上の置物: 港の船）: 下に水の面を置く（床は敷かない）
        if (objDef.waterBelow) {
            const under = new THREE.Mesh(new THREE.PlaneGeometry(env.tileSize, env.tileSize), new THREE.MeshLambertMaterial({ map: this.textures.water }));
            under.rotation.x = -Math.PI / 2;
            under.position.set(wx, -0.2, wz);
            env.add(under);
            this.waterMeshes.push(under);
        }
        // 家具の上に、花などの画像（plants: 花壇の花）を植える。マスの位置から決まる配置（毎回同じ）
        if (objDef.plants) {
            const pl = objDef.plants;
            const tex = this.textures[pl.texture] || this.textures.fMeadowGrass;
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
                env.add(sp);
            }
        }
        return { fOffX, fOffZ, fCw, fCd };
    }

    // 隣のマップ（8 方向）を、今のマップの外側に、本物のマスで描く。
    //   地形: 端から NEIGHBOR_TERRAIN_RANGE マスまで（高さの段・崖の面・地面の種類・水）。物体: 端から NEIGHBOR_OBJECT_RANGE マスまでの、木・草・岩（距離で隠す仕組みは、今のマップと同じ）。
    //   境（マップのつなぎ目）は、今のマップの端のマスの高さと、段差があれば、崖の面で埋める（隙間から空が見えない）
    async buildNeighborDecor(mapId, cols, rows, ts, mapData, floorMatOf) {
        const world = this.world;
        let pj = -1, pi = -1;
        world.grid.forEach((row, j) => { const i = row.indexOf(mapId); if (i >= 0) { pj = j; pi = i; } });
        if (pj < 0) return;
        const step = this.heightStep;
        const R = NEIGHBOR_TERRAIN_RANGE, RO = NEIGHBOR_OBJECT_RANGE;
        // 高さごとの地面の明るさ（今のマップと同じ。境で、色が変わらない）
        let maxLv = 1;
        for (const row of this.heightMap || []) for (const v of row) if (v > maxLv) maxLv = v;
        const [tintLo, tintHi] = mapData.heightTint ?? [0.82, 1.0];
        const tintOf = (lv) => tintLo + (tintHi - tintLo) * Math.min(1, lv / maxLv);
        const cliffMat = new THREE.MeshLambertMaterial({ map: this.textures[mapData.cliffTexture] || this.textures.cliffGray });
        const topMats = new Map(), sideMats = new Map();
        const matFor = (cache, lv, k, ft) => {
            const key = `${ft}|${lv}`;
            if (!cache.has(key)) { const m = floorMatOf(ft).clone(); m.color.setScalar(tintOf(lv) * k); cache.set(key, m); }
            return cache.get(key);
        };
        // 水は、今のマップの水と同じ模様の画像（動く: 水の模様のアニメーションは、画像の位置をずらして動かす）
        const waterMats = { deep: new THREE.MeshLambertMaterial({ map: this.textures.water, transparent: true, opacity: 0.92 }), shallow: new THREE.MeshLambertMaterial({ map: this.textures.shallowWater, transparent: true, opacity: 0.72 }), sand: new THREE.MeshLambertMaterial({ map: this.textures.sand }), deck: new THREE.MeshLambertMaterial({ color: 0x8a6a40 }) };
        // 光る水（glow を持つ浅瀬。南国の海岸の、青緑に光る浅瀬）: 今のマップと同じく、水面が自ら光る（emissive）
        const glowMats = new Map();
        const glowMatOf = (def) => {
            if (!glowMats.has(def.glow)) glowMats.set(def.glow, new THREE.MeshLambertMaterial({ map: this.textures[def.texture] || this.textures.shallowWater, transparent: true, opacity: 0.72, emissive: new THREE.Color(def.glow).getHex(), emissiveIntensity: 0.9 }));
            return glowMats.get(def.glow);
        };
        // 地形の板は、1 マスごとにメッシュを作らず、材質ごとの頂点の配列にためて、最後に 1 つのメッシュにする（板が約 2 万枚になり、まとめる処理が数秒かかるため）
        const visBrickMat = new THREE.MeshLambertMaterial({ map: this.textures.brick }), visWallGeos = new Map();   // 見た目の共通部品の、共有の材質・形
        const groups = new Map();
        const quad = (mat, TL, TR, BL, BR, n) => {
            let g = groups.get(mat);
            if (!g) { g = { pos: [], nor: [], uv: [], idx: [] }; groups.set(mat, g); }
            const o = g.pos.length / 3;
            for (const P of [TL, TR, BL, BR]) { g.pos.push(P[0], P[1], P[2]); g.nor.push(n[0], n[1], n[2]); }
            g.uv.push(0, 1, 1, 1, 0, 0, 1, 0);
            g.idx.push(o, o + 2, o + 1, o + 2, o + 3, o + 1);
        };
        const flat = (mat, wx, y, wz) => quad(mat, [wx - ts / 2, y, wz - ts / 2], [wx + ts / 2, y, wz - ts / 2], [wx - ts / 2, y, wz + ts / 2], [wx + ts / 2, y, wz + ts / 2], [0, 1, 0]);
        const wall = (mat, cx, cy, cz, fh, rotY) => {
            const ax = Math.cos(rotY), az = -Math.sin(rotY), nx = Math.sin(rotY), nz = Math.cos(rotY), hw = ts / 2, hh = fh / 2;
            const at = (sx, sy) => [cx + sx * hw * ax, cy + sy * hh, cz + sx * hw * az];
            quad(mat, at(-1, 1), at(1, 1), at(-1, -1), at(1, -1), [nx, 0, nz]);
        };
        const dirs = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]];   // [dx(列), dz(行), 向き]
        const lvOf = (nd, r, c) => {
            const ch = nd.layout[r]?.[c];
            const def = ch && ch !== '0' ? this.objectDefinitions?.[nd.legend?.[ch]] : null;
            if (def?.type === 'bridge_deck') return nd.bridgeUnder ?? 0;
            return parseInt(nd.heights?.[r]?.[c] ?? '0', 36) || 0;
        };
        const isWaterDef = (def) => !!def && (def.type === 'liquid_tile' || def.type === 'sea_tile' || !!def.waterBelow);
        for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
                if (!dj && !di) continue;
                const nid = world.grid[pj + dj]?.[pi + di];
                if (!nid) continue;
                let nd = this.mapCache[nid];
                if (!nd) { try { nd = await fetchMap(nid); this.mapCache[nid] = nd; } catch { continue; } }
                if (!nd?.heights || !nd.layout) continue;
                const nrows = nd.layout.length, ncols = nd.layout[0].length;
                const rowOff = dj * rows, colOff = di * cols;
                // 見た目の共通部品（visualBlock など。今のマップと同じ関数）が使う環境。y は、描くマスの高さ（add が、その分だけ持ち上げる）
                const nWallH = nd.wallHeight || mapData.wallHeight || 4;
                const nEnv = {
                    rows: nrows, cols: ncols, wallH: nWallH, tileSize: ts, y: 0,
                    brickMat: visBrickMat, standardWallGeo: visWallGeos.get(nWallH) || visWallGeos.set(nWallH, new THREE.BoxGeometry(ts, nWallH, ts)).get(nWallH),
                    charAt: (cc, rr) => nd.layout[rr]?.[cc],
                    defOf: (ch) => this.objectDefinitions?.[nd.legend?.[ch]],
                    add: (o, isStatic) => { o.position.y += nEnv.y; if (isStatic) o.userData.static = true; this.scene.add(o); }
                };
                for (let r = 0; r < nrows; r++) {
                    for (let c = 0; c < ncols; c++) {
                        const gr = rowOff + r, gc = colOff + c;
                        if (gr < -R || gr >= rows + R || gc < -R || gc >= cols + R) continue;
                        const wx = gc * ts + ts / 2, wz = gr * ts + ts / 2;
                        const ch = nd.layout[r][c];
                        const def = ch !== '0' ? this.objectDefinitions?.[nd.legend?.[ch]] : null;
                        if (isWaterDef(def)) {   // 水（川・湖・海）: 低い所の、色つきの面
                            const shallow = def.texture === 'shallowWater' || !!def.waterBelow;
                            // 今のマップの水（liquid_tile）と同じ作り: 砂の底・陸との境の砂の土手・半透明の水面（浅瀬は底 -0.25・水面 -0.12、深い所は底 -0.55・水面 -0.2）
                            const bedY = shallow ? -0.25 : -0.55;
                            flat(waterMats.sand, wx, bedY, wz);
                            for (const [dx, dz, rotY] of dirs) {
                                const rr = r + dz, cc = c + dx;
                                if (rr < 0 || rr >= nrows || cc < 0 || cc >= ncols) continue;   // マップの外の隣は、水として扱う（土手なし）
                                const nch = nd.layout[rr][cc];
                                if (isWaterDef(nch !== '0' ? this.objectDefinitions?.[nd.legend?.[nch]] : null)) continue;
                                wall(waterMats.sand, wx + dx * ts / 2, bedY / 2, wz + dz * ts / 2, Math.abs(bedY), rotY + Math.PI);   // 陸の側の縁に、水のほうを向けて立てる
                            }
                            flat(def.glow ? glowMatOf(def) : (shallow ? waterMats.shallow : waterMats.deep), wx, shallow ? -0.12 : -0.2, wz);
                            if (def.type === 'bridge_deck') {   // 川の木の橋（下に水がある）: 水の上に、橋の板（高さは heights。手すりは描かない）
                                if (!waterMats.planks) waterMats.planks = new Map();   // 橋の床の材質は、画像ごと（木の橋・石の橋で、材質を使い回さない）
                                if (!waterMats.planks.has(def.texture)) waterMats.planks.set(def.texture, new THREE.MeshLambertMaterial({ map: this.textures[def.texture] || this.textures.woodBridge }));
                                flat(waterMats.planks.get(def.texture), wx, (parseInt(nd.heights[r][c], 36) || 0) * step + 0.06, wz);
                            }
                            continue;
                        }
                        const lv = lvOf(nd, r, c);
                        const fch = nd.floorLayer?.[r]?.[c];
                        const ft = (fch !== undefined && nd.floorLegend?.[fch]) || nd.environment?.floorType;
                        flat(matFor(topMats, lv, 1.0, ft), wx, lv * step, wz);
                        if (def?.type === 'bridge_deck') {   // 吊橋: 床の板（高さは heights）
                            flat(waterMats.deck, wx, (parseInt(nd.heights[r][c], 36) || 0) * step + 0.02, wz);
                        }
                        if (def?.type === 'floor_tile' && !(def.elevation > 0)) {   // 床（石畳の街道・街の門前の石畳）: その物体の画像で、地面の上に平らに敷く（切り替えの前から、道が見える）
                            if (!waterMats.floors) waterMats.floors = new Map();
                            if (!waterMats.floors.has(def.texture)) waterMats.floors.set(def.texture, new THREE.MeshLambertMaterial({ map: this.textures[def.texture] || this.textures.sand }));
                            flat(waterMats.floors.get(def.texture), wx, lv * step + 0.01, wz);
                        }
                        // 崖・段の側面: 低い隣へ（隣が、このマップの中の、今のマップの端のマスなら、高いほうから、低いほうへ）
                        for (const [dx, dz, rotY] of dirs) {
                            const rr = r + dz, cc = c + dx;
                            let nh = null, reversed = false;
                            if (rr >= 0 && rr < nrows && cc >= 0 && cc < ncols) nh = lvOf(nd, rr, cc);
                            else {
                                const ogr = gr + dz, ogc = gc + dx;   // 今のマップの、隣のマス
                                if (ogr >= 0 && ogr < rows && ogc >= 0 && ogc < cols) { nh = this.terrainLevelAtTile(ogr, ogc); reversed = true; }
                            }
                            if (nh === null) continue;
                            if (!reversed && nh >= lv) continue;
                            if (reversed && nh === lv) continue;
                            const hi = Math.max(lv, nh), lo = Math.min(lv, nh), drop = hi - lo;
                            const faceH = drop * step;
                            // 面の向きは、低いほうへ。reversed で、今のマップのほうが高いとき（nh > lv）は、このマス（低い側）へ向ける
                            const toward = (!reversed || nh < lv) ? rotY : rotY + Math.PI;
                            wall(drop >= 2 ? cliffMat : matFor(sideMats, hi, mapData.sideShade ?? 0.78, ft), wx + dx * ts / 2, lo * step + faceH / 2, wz + dz * ts / 2, faceH, toward);
                        }
                        // 物体（木・草・岩）: 端から NEIGHBOR_OBJECT_RANGE マスまで
                        if (!def || gr < -RO || gr >= rows + RO || gc < -RO || gc >= cols + RO) continue;
                        const y0 = lv * step;
                        if (def.type === 'tree') {
                            this.treeMats = this.treeMats || new Map();
                            const texKey = def.texture;
                            if (!this.treeMats.has(texKey)) {
                                const tx = this.textures[texKey] || this.textures.tree;
                                this.treeMats.set(texKey, { far: new THREE.SpriteMaterial({ map: tx, transparent: false, alphaTest: 0.4 }), near: new THREE.SpriteMaterial({ map: tx, alphaTest: 0.05 }) });
                            }
                            const { far: treeMat, near: treeMatNear } = this.treeMats.get(texKey);
                            const tree = new THREE.Sprite(treeMat);
                            tree.center.set(0.5, 0.0);
                            const baseH = def.height ?? 4.8;
                            const sv = baseH + ((gr * 5 + gc * 3) % 4 + 4) % 4 * 0.5 * (baseH / 4.8);
                            tree.scale.set(sv * (def.aspect ?? (899 / 893)), sv, 1);
                            tree.position.set(wx, y0 - 0.08, wz);
                            this.scene.add(tree);
                            tree.updateMatrix(); tree.matrixAutoUpdate = false;
                            this.treeSprites.push({ sprite: tree, shadow: null, far: treeMat, near: treeMatNear, vis: true });
                        } else if (def.type === 'plant' && gr >= -NEIGHBOR_PLANT_RANGE && gr < rows + NEIGHBOR_PLANT_RANGE && gc >= -NEIGHBOR_PLANT_RANGE && gc < cols + NEIGHBOR_PLANT_RANGE) {
                            const plantTex = this.textures[def.texture] || this.textures.fMeadowGrass;
                            this.plantMats = this.plantMats || new Map();
                            if (!this.plantMats.has(plantTex)) this.plantMats.set(plantTex, new THREE.SpriteMaterial({ map: plantTex }));
                            const [pw, ph] = def.scale || [1.2, 1.0];
                            const count = Math.min(def.count || 4, 2);   // 遠くは、枚数を減らす
                            for (let i = 0; i < count; i++) {
                                const h1 = Math.sin((gr * 12.9898 + gc * 78.233 + i * 37.719) * 43758.5453) * 43758.5453;
                                const h2 = Math.sin((gr * 39.346 + gc * 11.135 + i * 83.155) * 24634.6345) * 24634.6345;
                                const fx = h1 - Math.floor(h1), fz = h2 - Math.floor(h2);
                                const sprite = new THREE.Sprite(this.plantMats.get(plantTex));
                                sprite.center.set(0.5, 0.0);
                                const k = 0.8 + fx * 0.5;
                                sprite.scale.set(pw * k, ph * k, 1);
                                sprite.position.set(wx + (fx - 0.5) * (def.spread || ts * 0.8), y0 - 0.02, wz + (fz - 0.5) * (def.spread || ts * 0.8));
                                this.scene.add(sprite);
                                sprite.updateMatrix(); sprite.matrixAutoUpdate = false;
                                this.cullSprites.push(sprite);
                            }
                        } else if (def.type === 'block') { nEnv.y = y0; this.visualBlock(def, wx, wz, r, c, nEnv);   // 壁・家（街の外観など）: 今のマップと同じ見た目
                        } else if (def.type === 'signpost') { nEnv.y = y0; this.visualSignpost(def, wx, wz, nEnv);
                        } else if (def.type === 'torch_stand') { nEnv.y = y0; this.visualTorch(def, wx, wz, r, c, nEnv);
                        } else if (def.type === 'door') { nEnv.y = y0; this.visualDoor(def, wx, wz, r, c, nEnv);   // 扉・門: 閉じたまま（開閉・当たり判定は今のマップだけ）
                        } else if (def.type === 'furniture') { nEnv.y = y0; this.visualFurniture(def, wx, wz, r, c, nEnv);
                        } else if (def.type === 'boulder') {
                            const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures[def.texture] || this.textures.boulder }));
                            b.center.set(0.5, 0.0);
                            const bs = def.scale || [2.6, 2.0, 1.0];
                            b.scale.set(bs[0], bs[1], bs[2]);
                            b.position.set(wx, y0 - 0.05, wz);
                            this.scene.add(b);
                            b.updateMatrix(); b.matrixAutoUpdate = false;
                            this.cullSprites.push(b);
                        }
                    }
                }
            }
        }
        for (const [mat, g] of groups) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
            geo.setIndex(g.idx);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.matrixAutoUpdate = false;
            this.scene.add(mesh);
            if (mat === waterMats.deep || mat === waterMats.shallow || [...glowMats.values()].includes(mat)) this.waterMeshes.push(mesh);   // 水の模様のアニメーションを動かす
        }
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
    // 崖（ちょうど 2 段高い所）をよじ登る: 崖に向かって前を押し続けて CLIMB_HOLD_SEC 秒で始まり、CLIMB_SEC 秒かかる。
    //   ①ジャンプして崖の縁に手をかける ②手で体を引き上げる ③足をひっかけて、よっこいしょと上がる ④縁の上に立つ。
    //   登っている間は歩けない。敵の攻撃で、ダメージを受けると、中断して下に落ちる（落下のダメージは、なし）。3 段以上の崖は、登れない
    // ---- スタミナ（character-spec 8.2e）。能力値・重量がまだないので、重量比 0.8・持久力 14・Lv1 の仮の値で計算する ----
    staminaMul() { const r = 0.8, d = this.staminaDef; return r <= 1 ? d.loadMulUnder.base + d.loadMulUnder.slope * r : Math.min(d.loadMulOver.max, 1 + (r - 1) * d.loadMulOver.slope); }
    staminaCost(kind, weaponWeight = 0) {
        const d = this.staminaDef; if (!d) return 0;
        const base = kind === 'dash' ? d.dashCost : weaponWeight * d.attackCoef;
        return base * this.staminaMul() / (1 + 14 * d.enduranceDivisor);
    }
    // 消費する。足りないとき（切れている・0 になる）は、false（ダッシュなどを止める）
    useStamina(amount) {
        const p = this.player;
        if (!this.staminaDef || p.staminaExhausted) return !this.staminaDef;
        p.stamina = Math.max(0, p.stamina - amount);
        p.staminaPause = this.staminaDef.regenPause;
        if (p.stamina <= 0) p.staminaExhausted = true;
        return true;
    }
    updateStamina(dt) {
        const p = this.player, d = this.staminaDef; if (!d) return;
        if (p.staminaPause > 0) { p.staminaPause -= dt; return; }
        p.stamina = Math.min(p.maxStamina, p.stamina + (14 * d.regenEnd + 1 * d.regenLevel) * dt);
        if (p.staminaExhausted && p.stamina >= p.maxStamina * d.resumeRatio) p.staminaExhausted = false;
    }

    tryStartClimb(dirX, dirZ) {
        const now = performance.now();
        const h = this.climbHold;
        if (!h || now - h.last > 150 || h.dirX !== dirX || h.dirZ !== dirZ) this.climbHold = { since: now, last: now, dirX, dirZ };
        else h.last = now;
        if (now - this.climbHold.since < CLIMB_HOLD_SEC * 1000) return;
        if (this.player.staminaExhausted) return;   // スタミナ切れは、登れない
        const cur = this.player.heightLevel ?? this.heightLevelAt(this.player.x, this.player.z);
        const r = this.player.radius;
        // 崖の縁（2 段高くなる所）を探し、その先の、上に立つ位置を決める
        let d = 0, found = false;
        for (; d <= 3; d += 0.1) {
            if (this.heightLevelAt(this.player.x + dirX * (r + d), this.player.z + dirZ * (r + d), cur) - cur === CLIMB_RISE) { found = true; break; }
        }
        if (!found) return;
        const tx = this.player.x + dirX * (r + d + r + 0.5), tz = this.player.z + dirZ * (r + d + r + 0.5);
        if (this.heightLevelAt(tx, tz, cur) - cur !== CLIMB_RISE || this.isInsideWall(tx, tz)) return;   // 上に立てない（壁・木・段が、続く）ときは、登らない
        this.player.climb = { t: 0, sx: this.player.x, sz: this.player.z, tx, tz, fromLv: cur, toLv: cur + CLIMB_RISE, fromY: cur * this.heightStep, toY: (cur + CLIMB_RISE) * this.heightStep };
        this.climbHold = null;
        this.useStamina(this.staminaDef?.climbCost ?? 15);   // 登りの消費（仮）
    }

    updateClimb(dt) {
        const c = this.player.climb;
        c.t += dt;
        const T = c.t, rise = c.toY - c.fromY;
        // 高さの進み方（0〜1）: ①0〜0.35 秒: ジャンプして縁に手をかける（0 → 0.55）②0.35〜1.0 秒: 腕で引き上げる（0.55 → 0.75。ゆっくり）③1.0〜1.6 秒: 足をひっかけて、体を縁の上へ（0.75 → 1.0）④1.6〜2.0 秒: 縁の上に立つ（前へ進む）
        const ease = (x) => x * x * (3 - 2 * x);
        let p;
        if (T < 0.35) p = 0.55 * (1 - (1 - T / 0.35) ** 2);
        else if (T < 1.0) p = 0.55 + 0.2 * ease((T - 0.35) / 0.65);
        else if (T < 1.6) p = 0.75 + 0.25 * ease((T - 1.0) / 0.6);
        else p = 1;
        const sway = (T > 0.35 && T < 1.6) ? Math.sin(T * 14) * 0.03 : 0;   // 腕で引き上げる間の、わずかな揺れ
        this.player.floorY = c.fromY + rise * p + sway;
        if (T >= 1.6) {   // 縁の上に立つ位置へ、なめらかに進む
            const k = Math.min(1, (T - 1.6) / (CLIMB_SEC - 1.6));
            this.player.x = c.sx + (c.tx - c.sx) * ease(k);
            this.player.z = c.sz + (c.tz - c.sz) * ease(k);
        }
        if (T >= CLIMB_SEC) {
            this.player.x = c.tx; this.player.z = c.tz;
            this.player.heightLevel = c.toLv;
            this.player.floorY = c.toY;
            this.player.climb = null;
        }
    }

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
    // 地面の影（groundShadowItems）を、InstancedMesh にまとめる（描画の命令は、丸い影 1 回・壁の足元の帯 1 回）。
    //   濃さは、木の影と同じく、地面の種類（TREE_SHADOW_OPACITY）で変える。マップを作り終えたあとに呼ぶ
    buildGroundShadows(tileSize) {
        const { round, edges } = this.groundShadowItems || { round: [], edges: [] };
        if (!round.length && !edges.length) return;
        const opacity = TREE_SHADOW_OPACITY[this.mapData?.environment?.floorType] ?? 1;
        const dummy = new THREE.Object3D();
        dummy.rotation.order = 'YXZ';
        const make = (geo, tex, items, place) => {
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
            const inst = new THREE.InstancedMesh(geo, mat, items.length);
            items.forEach((it, i) => { place(it); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
            inst.instanceMatrix.needsUpdate = true;
            inst.matrixAutoUpdate = false;
            inst.frustumCulled = false;   // マップ全体で 1 つ（範囲が広い）。数が少ないので、常に描く
            this.scene.add(inst);
        };
        const gradTex = (draw) => {
            const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
            draw(cv.getContext('2d'));
            return new THREE.CanvasTexture(cv);
        };
        if (round.length) {
            const tex = gradTex(ctx => {
                const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
                g.addColorStop(0, 'rgba(0, 0, 0, 0.9)'); g.addColorStop(0.55, 'rgba(0, 0, 0, 0.6)'); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
            });
            make(new THREE.PlaneGeometry(1, 1), tex, round, (it) => {
                dummy.position.set(it.x, it.y + 0.012, it.z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(it.d, it.d, 1);
            });
        }
        if (edges.length) {
            // 壁に接する側（画像の上）が濃く、外へ向かって薄くなる帯
            const tex = gradTex(ctx => {
                const g = ctx.createLinearGradient(0, 0, 0, 32);
                g.addColorStop(0, 'rgba(0, 0, 0, 0.65)'); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
            });
            const depth = tileSize * 0.7;
            make(new THREE.PlaneGeometry(1, 1), tex, edges, (it) => {
                dummy.position.set(it.x + it.ox * depth / 2, it.y + 0.02, it.z + it.oz * depth / 2);
                dummy.rotation.set(-Math.PI / 2, Math.atan2(it.ox, it.oz), 0);   // 画像の上（濃い側）を、壁へ向ける
                dummy.scale.set(tileSize, depth, 1);
            });
        }
    }

    // 木・草・花の板を、区画（CULL_CHUNK）ごとの Group にまとめる。マップを作り終えたあとに呼ぶ
    buildCullChunks() {
        const CH = CULL_CHUNK, chunks = new Map();
        const chunkAt = (x, z) => {
            const kx = Math.floor(x / CH), kz = Math.floor(z / CH), key = kx * 4096 + kz;
            let c = chunks.get(key);
            if (!c) {
                c = { group: new THREE.Group(), mx: (kx + 0.5) * CH, mz: (kz + 0.5) * CH, sprites: [], trees: [], mode: -1, hasNear: false };
                this.scene.add(c.group); chunks.set(key, c);
            }
            return c;
        };
        for (const t of this.treeSprites || []) {
            const c = chunkAt(t.sprite.position.x, t.sprite.position.z);
            c.group.add(t.sprite);
            c.trees.push(t);
        }
        // 木の影: 区画ごとに、1 つの InstancedMesh にまとめる（1 枚ずつ別メッシュだと、影の枚数だけ描画の命令が増える）。
        //   影の板（t.shadow）は、位置・大きさを持つだけの部品として使い、シーンには置かない。霧の境の 1 枚ずつの表示切替はしない（区画ごと）
        for (const c of chunks.values()) {
            const withShadow = c.trees.filter(t => t.shadow);
            if (!withShadow.length) continue;
            const inst = new THREE.InstancedMesh(this.treeShadowGeo, this.treeShadowMat, withShadow.length);
            withShadow.forEach((t, i) => inst.setMatrixAt(i, t.shadow.matrix));
            inst.instanceMatrix.needsUpdate = true;
            inst.matrixAutoUpdate = false;
            c.group.add(inst);
        }
        for (const sp of this.cullSprites || []) {
            const c = chunkAt(sp.position.x, sp.position.z);
            c.group.add(sp); c.sprites.push(sp);
        }
        this.cullChunks = [...chunks.values()];
        this._cullDirty = true;
    }

    // 区画ごとに、遠い区画は隠し、近い区画は見せる。境の区画だけ、1 枚ずつ距離を測る。近い木は、材質を切り替える（ヒステリシスつき）。プレイヤーが 1 以上動いたとき・霧が変わったときだけ
    updateCullChunks() {
        const chunks = this.cullChunks; if (!chunks?.length) return;
        const p = this.player;
        const cullD2 = this.scene.fog ? (this.scene.fog.far * 1.1) ** 2 : Infinity;
        if (!this._cullDirty && Math.abs(p.x - this._cullX) + Math.abs(p.z - this._cullZ) < 1 && cullD2 === this._cullD2) return;
        this._cullX = p.x; this._cullZ = p.z; this._cullD2 = cullD2; this._cullDirty = false;
        const RR = CULL_CHUNK * 0.7072;
        for (const c of chunks) {
            const d = Math.hypot(c.mx - p.x, c.mz - p.z), dmin = Math.max(0, d - RR), dmax = d + RR;
            if (dmin * dmin >= cullD2) {   // 区画ぜんぶが、霧の向こう
                if (c.group.visible) c.group.visible = false;
                c.mode = 0;
            } else {
                if (!c.group.visible) c.group.visible = true;
                if (dmax * dmax < cullD2) {   // 区画ぜんぶが、見える
                    if (c.mode !== 2) {
                        for (const t of c.trees) { t.vis = true; t.sprite.visible = true; if (t.shadow) t.shadow.visible = true; }
                        for (const sp of c.sprites) sp.visible = true;
                        c.mode = 2;
                    }
                } else {   // 霧の境にかかる区画: 1 枚ずつ
                    for (const t of c.trees) {
                        const dx = t.sprite.position.x - p.x, dz = t.sprite.position.z - p.z, vis = dx * dx + dz * dz < cullD2;
                        if (vis !== t.vis) { t.vis = vis; t.sprite.visible = vis; if (t.shadow) t.shadow.visible = vis; }
                    }
                    for (const sp of c.sprites) {
                        const dx = sp.position.x - p.x, dz = sp.position.z - p.z, vis = dx * dx + dz * dz < cullD2;
                        if (vis !== sp.visible) sp.visible = vis;
                    }
                    c.mode = 1;
                }
            }
            // 近い木は従来の（なめらかな）材質、遠い木は切り抜き（遠景で、壁の木と重なると四角く欠けるため）。境目で、ちらつかないよう、ヒステリシスをつける（距離は暫定）
            if (dmin < 44) {
                for (const t of c.trees) {
                    const dx = t.sprite.position.x - p.x, dz = t.sprite.position.z - p.z, d2 = dx * dx + dz * dz;
                    const wantNear = t.isNear ? d2 < 42 * 42 : d2 < 40 * 40;
                    if (wantNear !== t.isNear) { t.isNear = wantNear; t.sprite.material = wantNear ? t.near : t.far; }
                }
                c.hasNear = true;
            } else if (c.hasNear) {   // 遠くへ出た区画: 木を遠い材質に戻す
                for (const t of c.trees) if (t.isNear) { t.isNear = false; t.sprite.material = t.far; }
                c.hasNear = false;
            }
        }
    }

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
        if (this.player.climb) return;   // 崖をよじ登っている間は、歩けない
        this._climbBump = null;
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
            if (diff === CLIMB_RISE) this._climbBump = { dirX, dirZ };   // ちょうど 2 段高い崖: 前へ押し続けると、よじ登れる
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

        if (this._climbBump && !this.player.climb) this.tryStartClimb(this._climbBump.dirX, this._climbBump.dirZ);
        else if (!this._climbBump) this.climbHold = null;

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
        const isPlayerMovingForward = (this.keys.forward && !this.player.isFalling && !this.player.staminaExhausted);   // スタミナ切れは、攻撃できない（歩行・防御は可）

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

        if ((isHalfOffset || isCharging)) this.useStamina(this.staminaCost('attack', weapon?.weight ?? 10));   // 攻撃 1 回の消費（当たっても外れても）

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
        if (this.player.climb) { this.player.climb = null; this.addPopup('手が離れた！', '#fbbf24'); }   // 登っている間に攻撃を受けたら、中断して、下に落ちる（目線の高さは、なめらかに下がる。落下のダメージはなし）

        this.player.hp = Math.max(0, this.player.hp - amount);
        this.player.isInvincible = true;
        this.player.invincibleTimer = 0.35;
        this.player.knockback.copy(knockDir).multiplyScalar(8 * knockScale);

        this.sound.playHurt();
        this.flashDamageScreen();

        if (this.player.hp <= 0) {
            this.addPopup('GAME OVER! リスポーンします', '#ef4444');
            setTimeout(() => {
                this.player.hp = this.player.maxHp; this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false;
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
                this.player.hp = this.player.maxHp; this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false;
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

    // 方角の表示（ゲーム画面の右上）: 向きが変わって、大体の方向が変わったときだけ、書き換える
    updateCompass() {
        const name = compassDirection(this.player.angle);
        if (name === this.compassName) return;
        this.compassName = name;
        const el = document.getElementById('compassText');
        if (el) el.innerText = name;
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
        put('staminaBar', 'width', `${(this.player.stamina / this.player.maxStamina) * 100}%`);
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
            if (this.loadingMap) return;   // マップの読み込み中は、更新も描画もしない（前の画面のまま）
            const dt = Math.min(0.1, this.clock.getDelta());
            this.update(dt);
            if (!this.loadingMap) this.render();   // この更新で、マップの読み込みが始まったとき（端を越えたとき）は、作りかけの画面を描かない（読み込みの最初の部分は、同じフレームの中で、すぐ実行され、床の一部だけ作られる）
        };
        requestAnimationFrame(loop);
    }
}

// 部品（public/js/game/*.js）のメソッドを、GameEngine に組み込む
Object.assign(GameEngine.prototype, updateWorldMethods, updatePlayerMethods);
