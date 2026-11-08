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
import { mapTerrainMethods } from '/js/game/mapTerrain.js';
import { mapVisualMethods } from '/js/game/mapVisuals.js';
import { mapNeighborMethods } from '/js/game/mapNeighbors.js';
import { renderSupportMethods } from '/js/game/renderSupport.js';
import { movementMethods } from '/js/game/movement.js';
import { TREE_SHADOWS, TREE_SHADOW_OPACITY, TEST_RUN_SPEED_SCALE, CLIMB_RISE, CLIMB_SEC, CLIMB_HOLD_SEC, compassDirection, NEIGHBOR_TERRAIN_RANGE, NEIGHBOR_OBJECT_RANGE, NEIGHBOR_PLANT_RANGE, CULL_CHUNK, FOOTSTEP_STRIDE, effectPower, HIT_FEEDBACK, SHOP_PAGE_SIZE } from '/js/game/constants.js';
import { mapLoadMethods } from '/js/game/mapLoad.js';
import { stateInitMethods } from '/js/game/stateInit.js';
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
        this.initPlayerState();

        this.initWorldState();

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

        const loaded = await this.loadMapData(opts, mapId);
        if (!loaded) return;   // マップのデータが読めなかったら、読み込みを打ち切る
        const { prevEnv, mapData } = loaded;

        this.resetMapState();

        const { env } = this.applyEnvironment(mapData, prevEnv);

        const rows = mapData.layout.length;
        const cols = mapData.layout[0].length;
        const tileSize = mapData.tileSize || 4;
        const wallH = mapData.wallHeight || 4;

        // Pre-build terrain lookup grid
        const { waterMap, holeFloorMap } = this.scanMapCells(rows, cols, mapData);

        // 1. Grid-based Floor Generation (carving holes for sunken water tiles and crumbling pitfall cavities)
        // 地面の種類: 既定は environment.floorType。マップの floorLayer（行ごとの文字列）と floorLegend（文字 → 地面の種類）で、マスごとに変えられる
        //   （広い世界で、草原・砂地・雪などが、同じマップの中に混ざる。物体（木・草）を置いても、地面は変わらない）
        await this.buildFloorAndGround(mapData, env, tileSize, rows, cols, waterMap, holeFloorMap, mapId);

        // Ceiling mesh if specified
        this.buildCeiling(env, wallH, cols, tileSize, rows);

        // Shared reusable materials & geometries
        await this.buildTileObjects(tileSize, wallH, rows, cols, mapData, waterMap);
        if (this.seaCells.length) this.buildSea(rows, cols, tileSize);

        // 動かない部品（床・天井・壁・家具など）を、材質ごとに1つにまとめる（描画の回数を減らして、CPU の負荷を下げる）
        this.mergeStaticMeshes();
        this.buildGroundShadows(tileSize);   // 立て札・像・噴水などの丸い影と、建物・壁の足元の影（それぞれ 1 つの InstancedMesh）
        this.buildCullChunks();   // 木・草・花の板を、区画ごとにまとめる（遠い区画は、まとめて隠す。毎フレームの走査・判定を減らして、CPU の負荷を下げる）

        // 村人（NPC）: マップの npcs（{ id: npcs.json の ID, x, z: マスの位置 }）。マスの上の床や家具とは独立に置く
        const { shop } = this.spawnNpcs(mapData, tileSize);

        // Spawn player
        // 別のマップから来たときの出現位置は、マップの spawnFrom（{ 元のマップID: {x, z, angle} }）があればそれを使う
        this.placePlayer(opts, fromMapId, mapId, mapData, tileSize);

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
Object.assign(GameEngine.prototype, updateWorldMethods, updatePlayerMethods, mapTerrainMethods, mapVisualMethods, mapNeighborMethods, renderSupportMethods, movementMethods, equipmentMethods, combatMethods, hudMethods, interactMethods, controlsMethods, textureSetupMethods, mapLoadMethods, stateInitMethods);
