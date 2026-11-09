// マップの読み込みの段階（データの取得・状態のリセット・環境・床と地面・天井・タイルの物体・村人・プレイヤーの出現）。GameEngine のメソッド（this は GameEngine。public/js/game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は GameEngine.loadMapBody の中の段階。移しただけで、動きは同じ（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { fetchMap } from '/js/mapFormat.js';
import { Monster } from '/js/entities.js';
import { tileBuilders } from '/js/game/tiles.js';
import { Npc } from '/js/npc.js';

export const mapLoadMethods = {
    async loadMapData(opts, mapId) {
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
                return null;   // 読めなかった（呼び出し側が、読み込みを打ち切る）
            }
        }
        this.mapData = mapData;
        return { prevEnv, mapData };
    },

    resetMapState() {
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
    },

    applyEnvironment(mapData, prevEnv) {
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
        return { env };
    },

    scanMapCells(rows, cols, mapData) {
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
        return { waterMap, holeFloorMap };
    },

    async buildFloorAndGround(mapData, env, tileSize, rows, cols, waterMap, holeFloorMap, mapId) {
        const floorMats = new Map();
        const floorMatOf = (ft) => {
            if (!floorMats.has(ft)) floorMats.set(ft, new THREE.MeshLambertMaterial({ map: ft.startsWith('road:') ? this.textures[ft.slice(5)] : this.floorTextureOf(ft) }));   // 'road:<画像>': 石畳の道の段差の側面
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
    },

    buildCeiling(env, wallH, cols, tileSize, rows) {
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
    },

    async buildTileObjects(tileSize, wallH, rows, cols, mapData, waterMap) {
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
    },

    spawnNpcs(mapData, tileSize) {
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
        return { shop };
    },

    placePlayer(opts, fromMapId, mapId, mapData, tileSize) {
        const spawn = opts.spawn || (fromMapId !== mapId && mapData.spawnFrom?.[fromMapId]) || mapData.spawn;
        this.player.x = spawn.x * tileSize + tileSize / 2;
        this.player.z = spawn.z * tileSize + tileSize / 2;
        if (opts.edgeBlend) this.pushPlayerOutOfWalls();   // 端を越えて、隣のマップの木・岩の中に出たら、近くの空きへ出す
        this.player.lastSafePos = { x: this.player.x, z: this.player.z };
        this.player.angle = spawn.angle || 0;
        this.player.pitch = 0;
        this.player.lookDown = false; this.player.debugLift = 0;   // デバッグ（Shift+B・U・D）の状態も、リセット
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
    },
};
