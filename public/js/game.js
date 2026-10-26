import * as THREE from '/js/three.module.js';
import { RetroTextureGenerator } from '/js/textures.js';
import { Monster, Projectile } from '/js/entities.js';
import { SoundFX } from '/js/audio.js';
import { SDAssetManager } from '/js/sdAssetManager.js';
import { ParticleSystem } from '/js/particles.js';

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
            runSpeed: 13.0,
            rotSpeed: 2.8,
            radius: 0.6,
            maxHp: 100,
            hp: 100,
            maxMp: 60,
            mp: 60,
            exp: 0,
            level: 1,
            attackPower: 15,
            isInvincible: false,
            invincibleTimer: 0,
            attackCooldown: 0,
            magicCooldown: 0,
            knockback: new THREE.Vector3()
        };

        // Inputs
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            turnLeft: false,
            turnRight: false,
            sprint: false
        };

        this.isPointerLocked = false;
        this.currentMapId = 'dungeon';
        this.mapData = null;
        this.mapCache = {};
        this.objectDefinitions = null;
        this.enemyDefinitions = null;
        this.colliders = [];
        this.monsters = [];
        this.projectiles = [];
        this.portal = null;
        this.waterMeshes = [];
        this.heatHazePlanes = [];
        this.fountains = [];
        this.terrainGrid = [];
        this.doors = [];
        this.signposts = [];
        this.activeEnemyCards = [];
        this.popups = [];

        this.clock = new THREE.Clock();

        this.initThree();
        this.initTextures();
        this.initControls();
    }

    async init() {
        await this.loadDefinitions();
        await this.loadMap(this.currentMapId);
    }

    async loadDefinitions() {
        try {
            const [objRes, enemyRes] = await Promise.all([
                fetch('/data/objects.json'),
                fetch('/data/enemies.json')
            ]);
            this.objectDefinitions = await objRes.json();
            this.enemyDefinitions = await enemyRes.json();
        } catch (e) {
            console.error('Failed to load definitions:', e);
            this.objectDefinitions = this.objectDefinitions || {};
            this.enemyDefinitions = this.enemyDefinitions || {};
        }
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

        this.textures = {
            brick: RetroTextureGenerator.createBrickTexture(),
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
            boulder: RetroTextureGenerator.createBoulderTexture(),
            signpost: RetroTextureGenerator.createSignpostTexture(),
            forestCanopy: forestCanopyTex,
            denseForest: denseForestTex,
            woodWall: RetroTextureGenerator.createWoodWallTexture(),
            woodenFence: RetroTextureGenerator.createWoodenFenceTexture(),
            villageRoof: RetroTextureGenerator.createVillageRoofTexture(),
            dirtRoad: RetroTextureGenerator.createDirtRoadTexture(),
            cityWall: RetroTextureGenerator.createCityWallTexture(),
            shopWall: RetroTextureGenerator.createShopWallTexture(),
            innWall: RetroTextureGenerator.createInnWallTexture(),
            cityRoof: RetroTextureGenerator.createCityRoofTexture(),
            pavedRoad: RetroTextureGenerator.createPavedRoadTexture(),
            fountainWater: RetroTextureGenerator.createFountainWaterTexture()
        };
    }

    initControls() {
        window.addEventListener('keydown', (e) => {
            this.sound.init();
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
                case 'KeyE':
                    this.keys.turnRight = true;
                    e.preventDefault();
                    break;
                case 'Space':
                case 'KeyF':
                    this.castFireball();
                    e.preventDefault();
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.sprint = true;
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
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
            if (!this.isPointerLocked) {
                this.canvas.requestPointerLock?.();
            } else {
                // If pointer already locked, click casts magic
                this.castFireball();
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

    async loadMap(mapId) {
        this.currentMapId = mapId;

        if (!this.objectDefinitions) {
            await this.loadObjectDefinitions();
        }

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

        // Reset scene children (except lights/camera)
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
        this.scene.add(this.ambientLight);
        this.scene.add(this.dirLight);

        this.colliders = [];
        this.monsters = [];
        this.projectiles = [];
        this.portal = null;
        this.waterMeshes = [];
        this.heatHazePlanes = [];
        this.fountains = [];
        this.terrainGrid = [];
        this.doors = [];
        this.signposts = [];
        this.activeEnemyCards = [];
        const enemyListEl = document.getElementById('enemyHudList');
        if (enemyListEl) enemyListEl.innerHTML = '';

        const env = mapData.environment || {};
        // Environment lighting and fog
        this.ambientLight.color.setHex(env.ambientLight || 0x555555);
        this.dirLight.color.setHex(env.directionalLight || 0xffffff);
        this.scene.fog = new THREE.Fog(env.fogColor || 0x000000, env.fogNear || 10, env.fogFar || 50);
        this.scene.background = new THREE.Color(env.skyColor || 0x000000);

        const rows = mapData.layout.length;
        const cols = mapData.layout[0].length;
        const tileSize = mapData.tileSize || 4;
        const wallH = mapData.wallHeight || 4;

        // Pre-build terrain lookup grid
        const waterMap = Array.from({ length: rows }, () => Array(cols).fill(false));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const char = mapData.layout[r][c];
                const objType = mapData.legend ? mapData.legend[char] : null;
                const objDef = objType ? this.objectDefinitions[objType] : null;
                if (objDef && objDef.type === 'liquid_tile') {
                    waterMap[r][c] = true;
                }
            }
        }

        // 1. Grid-based Floor Generation (carving holes for sunken water tiles)
        let baseFloorTex = this.textures.floorStone;
        if (env.floorType === 'grass') baseFloorTex = this.textures.grass;
        else if (env.floorType === 'sand') baseFloorTex = this.textures.sand;
        else if (env.floorType === 'water') baseFloorTex = this.textures.water;

        const baseFloorMat = new THREE.MeshLambertMaterial({ map: baseFloorTex });
        const cellGeo = new THREE.PlaneGeometry(tileSize, tileSize);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (waterMap[r][c]) continue; // Water cell has a hole at Y=0!

                const wx = c * tileSize + tileSize / 2;
                const wz = r * tileSize + tileSize / 2;

                const cellMesh = new THREE.Mesh(cellGeo, baseFloorMat);
                cellMesh.rotation.x = -Math.PI / 2;
                cellMesh.position.set(wx, 0, wz);
                this.scene.add(cellMesh);
            }
        }

        // Ceiling mesh if specified
        if (env.hasCeiling) {
            const ceilGeo = new THREE.PlaneGeometry(cols * tileSize, rows * tileSize);
            let ceilTex = this.textures.brick;
            if (env.ceilingTexture && this.textures[env.ceilingTexture]) {
                ceilTex = this.textures[env.ceilingTexture];
            } else if (env.ceilingTexture === 'rock') {
                ceilTex = this.textures.rock;
            }
            const ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex });
            const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set((cols * tileSize) / 2, wallH, (rows * tileSize) / 2);
            this.scene.add(ceiling);
        }

        // Shared reusable materials & geometries
        const brickMat = new THREE.MeshLambertMaterial({ map: this.textures.brick });
        const rockMat = new THREE.MeshLambertMaterial({ map: this.textures.rock });
        const standardWallGeo = new THREE.BoxGeometry(tileSize, wallH, tileSize);

        // Spawn objects based on map layout & legend
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const char = mapData.layout[r][c];
                if (char === '0' || char === ' ') continue;

                const wx = c * tileSize + tileSize / 2;
                const wz = r * tileSize + tileSize / 2;

                // 1. Check if char represents an enemy
                const enemyType = mapData.enemies ? mapData.enemies[char] : null;
                if (enemyType && this.enemyDefinitions && this.enemyDefinitions[enemyType]) {
                    const enemyDef = this.enemyDefinitions[enemyType];
                    const m = new Monster(enemyType, wx, wz, this.textures, enemyDef);
                    this.monsters.push(m);
                    this.scene.add(m.sprite);
                    continue;
                }

                // 2. Check if char represents an object
                const objType = mapData.legend ? mapData.legend[char] : null;
                const objDef = objType ? this.objectDefinitions[objType] : null;

                if (!objDef) {
                    continue;
                }

                switch (objDef.type) {
                    case 'block': {
                        let blockTex = this.textures.rock;
                        if (objDef.texture === 'brick') blockTex = this.textures.brick;
                        else if (objDef.texture && this.textures[objDef.texture]) blockTex = this.textures[objDef.texture];

                        const mat = new THREE.MeshLambertMaterial({ map: blockTex });
                        if (objDef.jagged || objDef.texture === 'mossyStone') {
                            // Natural craggy rock height variation & slight scale offsets for natural cave look
                            const rockH = wallH * (0.9 + ((r * 7 + c * 13) % 10) * 0.06);
                            const rockGeo = new THREE.BoxGeometry(tileSize * 1.02, rockH, tileSize * 1.02);
                            const rock = new THREE.Mesh(rockGeo, mat);
                            rock.position.set(wx, rockH / 2, wz);
                            this.scene.add(rock);
                        } else if (objDef.hasRoof) {
                            // Buildings with European pitched roofs (Village wood or City brick/stone houses)
                            const houseH = wallH * 0.92;
                            const houseGeo = new THREE.BoxGeometry(tileSize, houseH, tileSize);
                            const house = new THREE.Mesh(houseGeo, mat);
                            house.position.set(wx, houseH / 2, wz);
                            this.scene.add(house);

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
                            this.scene.add(roofMesh);
                        } else {
                            const wall = new THREE.Mesh(standardWallGeo, mat);
                            wall.position.set(wx, wallH / 2, wz);
                            this.scene.add(wall);
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
                        this.scene.add(postMesh);

                        // If it has connections, draw matching fence panels
                        if (isWestFence || isEastFence || (!isNorthFence && !isSouthFence)) {
                            // Horizontal X plane
                            const fGeo = new THREE.PlaneGeometry(fenceW, fenceH);
                            const fMesh = new THREE.Mesh(fGeo, fenceMat);
                            fMesh.position.set(wx, fenceH / 2, wz);
                            this.scene.add(fMesh);
                        }
                        if (isNorthFence || isSouthFence) {
                            // Vertical Z plane
                            const fGeo = new THREE.PlaneGeometry(fenceW, fenceH);
                            const fMesh = new THREE.Mesh(fGeo, fenceMat);
                            fMesh.rotation.y = Math.PI / 2;
                            fMesh.position.set(wx, fenceH / 2, wz);
                            this.scene.add(fMesh);
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
                        const treeMat = new THREE.SpriteMaterial({ map: this.textures.tree });
                        const tree = new THREE.Sprite(treeMat);
                        tree.center.set(0.5, 0.0);
                        const scaleVar = 4.8 + ((r * 5 + c * 3) % 4) * 0.5;
                        tree.scale.set(scaleVar * (899 / 893), scaleVar, 1);
                        // Sink tree base slightly into grass (-0.08) so trunk roots naturally penetrate the terrain
                        tree.position.set(wx, -0.08, wz);
                        this.scene.add(tree);

                        // Ground contact shadow under the tree trunk
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

                        const shadowTex = new THREE.CanvasTexture(shadowCanvas);
                        const shadowMat = new THREE.MeshBasicMaterial({
                            map: shadowTex,
                            transparent: true,
                            depthWrite: false
                        });
                        const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), shadowMat);
                        shadowMesh.rotation.x = -Math.PI / 2;
                        shadowMesh.position.set(wx, 0.012, wz);
                        this.scene.add(shadowMesh);
                        if (objDef.solid) {
                            this.colliders.push({
                                minX: wx - 0.6, maxX: wx + 0.6,
                                minZ: wz - 0.6, maxZ: wz + 0.6
                            });
                        }
                        break;
                    }

                    case 'boulder': {
                        // Mossy natural boulder sprite with ground shadow & projectile blocking
                        const boulderMat = new THREE.SpriteMaterial({ map: this.textures.boulder });
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
                        const signMat = new THREE.SpriteMaterial({ map: this.textures.signpost });
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

                    case 'floor_tile': {
                        // Ground-level custom floor tile
                        const tileMat = new THREE.MeshLambertMaterial({
                            map: this.textures[objDef.texture] || this.textures.sand
                        });
                        const tileGeo = new THREE.PlaneGeometry(tileSize, tileSize);
                        const tileMesh = new THREE.Mesh(tileGeo, tileMat);
                        tileMesh.rotation.x = -Math.PI / 2;
                        // Wood bridge and paths are slightly raised above water/grass
                        const elev = (objDef.texture === 'woodBridge') ? 0.04 : 0.01;
                        tileMesh.position.set(wx, elev, wz);
                        this.scene.add(tileMesh);

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
                        const isWallLeft = (c > 0 && mapData.layout[r][c - 1] === '1');
                        const isWallRight = (c < cols - 1 && mapData.layout[r][c + 1] === '1');
                        const isWallTop = (r > 0 && mapData.layout[r - 1][c] === '1');
                        const isWallBottom = (r < rows - 1 && mapData.layout[r + 1][c] === '1');

                        const isVertical = (isWallTop || isWallBottom) && !(isWallLeft && isWallRight);

                        const doorMat = new THREE.MeshLambertMaterial({ map: this.textures.door });
                        const frameMat = brickMat;
                        const doorThickness = 0.45;
                        const doorW = tileSize * 0.75;
                        const doorGeo = new THREE.BoxGeometry(doorW, wallH, doorThickness);
                        const doorMesh = new THREE.Mesh(doorGeo, doorMat);

                        // Door Frame Pillars on both sides
                        const pillarW = (tileSize - doorW) / 2;
                        const pillarGeo = new THREE.BoxGeometry(pillarW, wallH, tileSize);

                        const doorGroup = new THREE.Group();

                        if (isVertical) {
                            // North-South passage door (oriented along Z)
                            doorMesh.rotation.y = Math.PI / 2;
                            doorMesh.position.set(0, wallH / 2, 0);

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
                            doorMesh.position.set(0, wallH / 2, 0);

                            const pillar1 = new THREE.Mesh(pillarGeo, frameMat);
                            pillar1.position.set(-(doorW / 2 + pillarW / 2), wallH / 2, 0);

                            const pillar2 = new THREE.Mesh(pillarGeo, frameMat);
                            pillar2.position.set((doorW / 2 + pillarW / 2), wallH / 2, 0);

                            doorGroup.add(doorMesh);
                            doorGroup.add(pillar1);
                            doorGroup.add(pillar2);
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
                            targetY: wallH / 2,
                            baseY: wallH / 2,
                            openY: wallH * 1.45,
                            x: wx,
                            z: wz
                        });
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
                            emissive: isLava ? 0xff2200 : (isPoison ? 0x220533 : 0x000000),
                            emissiveIntensity: isLava ? 0.85 : 0.3
                        });
                        const waterGeo = new THREE.PlaneGeometry(tileSize, tileSize);
                        const waterMesh = new THREE.Mesh(waterGeo, waterMat);
                        waterMesh.rotation.x = -Math.PI / 2;
                        waterMesh.position.set(wx, waterSurfaceY, wz);
                        this.scene.add(waterMesh);
                        this.waterMeshes.push(waterMesh);

                        // If lava, add a warm point light and rising 3D heat wisps/smoke
                        if (isLava) {
                            const lavaLight = new THREE.PointLight(0xff4500, 1.4, tileSize * 2.8);
                            lavaLight.position.set(wx, 0.5, wz);
                            this.scene.add(lavaLight);

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
                            isWater: true
                        });
                        break;
                    }

                    case 'portal': {
                        const portalGeo = new THREE.CylinderGeometry(0.8, 0.8, 2.5, 16);
                        const portalMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
                        const portalMesh = new THREE.Mesh(portalGeo, portalMat);
                        portalMesh.position.set(wx, 1.25, wz);
                        this.scene.add(portalMesh);
                        this.portal = { x: wx, z: wz, radius: 1.2, mesh: portalMesh, nextMap: mapData.nextMap };
                        break;
                    }
                }
            }
        }

        // Spawn player
        this.player.x = mapData.spawn.x * tileSize + tileSize / 2;
        this.player.z = mapData.spawn.z * tileSize + tileSize / 2;
        this.player.angle = mapData.spawn.angle || 0;
        this.player.pitch = 0;
        this.player.knockback.set(0, 0, 0);

        // Reset inputs on scene transition to prevent stuck keys
        Object.keys(this.keys).forEach(k => this.keys[k] = false);

        // Check if player spawns inside a collider and push out safely
        for (const c of this.colliders) {
            const r = this.player.radius;
            if (this.player.x >= c.minX - r && this.player.x <= c.maxX + r &&
                this.player.z >= c.minZ - r && this.player.z <= c.maxZ + r) {
                this.player.x = c.maxX + r + 0.5;
            }
        }

        document.getElementById('currentAreaName').innerText = mapData.name || '';
    }

    castFireball() {
        if (this.player.magicCooldown > 0) return;
        if (this.player.mp < 10) {
            this.addPopup('MP不足!', '#38bdf8');
            return;
        }

        this.player.mp -= 10;
        this.player.magicCooldown = 0.35; // 0.35s casting cooldown
        this.sound.playShoot(true);

        // Direction player is facing
        const dirX = -Math.sin(this.player.angle);
        const dirZ = -Math.cos(this.player.angle);

        // Spawn fireball slightly ahead of player
        const spawnX = this.player.x + dirX * 0.8;
        const spawnZ = this.player.z + dirZ * 0.8;

        const fireball = new Projectile(spawnX, spawnZ, dirX, dirZ, true, 14, 25);
        this.projectiles.push(fireball);
        this.scene.add(fireball.mesh);

        // Muzzle flare effect
        this.particles.spawnBurst(spawnX, 1.3, spawnZ, 0xffaa00, 8, 3.0);
    }

    update(dt) {
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
                if (distToPlayer < 2.4 && !d.isOpen) {
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
            }
        }

        // Proximity check for Signposts (Display guidance banner while near, hide immediately when leaving)
        let activeSignMessage = null;
        if (this.signposts && this.signposts.length > 0) {
            for (const s of this.signposts) {
                const distToSign = Math.hypot(this.player.x - s.x, this.player.z - s.z);
                const triggerDist = s.radius || 2.4;
                if (distToSign < triggerDist) {
                    activeSignMessage = s.message;
                    break;
                }
            }
        }
        this.updateSignpostBanner(activeSignMessage);

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

        // Player Move Direction
        const moveDir = new THREE.Vector3();
        if (this.keys.forward) moveDir.z -= 1;
        if (this.keys.backward) moveDir.z += 1;
        if (this.keys.left) moveDir.x -= 1;
        if (this.keys.right) moveDir.x += 1;

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

            // Rotate move direction by player's view angle
            const sin = Math.sin(this.player.angle);
            const cos = Math.cos(this.player.angle);
            const baseSpeed = this.keys.sprint ? this.player.runSpeed : this.player.speed;
            const moveSpeed = baseSpeed * speedMod;
            worldMoveX = (moveDir.x * cos + moveDir.z * sin) * moveSpeed * dt;
            worldMoveZ = (-moveDir.x * sin + moveDir.z * cos) * moveSpeed * dt;

            this.movePlayer(worldMoveX, worldMoveZ);
        }

        // Calculate terrain special effects (Hazards, MP Regen, Spikes)
        let playerFloorDepth = 0;
        let inWater = false;
        if (this.terrainGrid) {
            for (const t of this.terrainGrid) {
                if (this.player.x >= t.minX && this.player.x <= t.maxX &&
                    this.player.z >= t.minZ && this.player.z <= t.maxZ) {
                    playerFloorDepth = Math.max(playerFloorDepth, t.depth || 0);
                    if (t.isWater) inWater = true;

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

        // Camera height with elevation difference (wading in water lowers player's eye height naturally)
        const eyeHeight = 1.8 - playerFloorDepth;
        this.camera.position.set(this.player.x, eyeHeight, this.player.z);
        this.camera.rotation.set(0, 0, 0);
        this.camera.rotateY(this.player.angle);
        this.camera.rotateX(this.player.pitch);

        // Update Portal Animation & Check
        if (this.portal) {
            this.portal.mesh.rotation.y += dt * 2;
            const distPortal = Math.hypot(this.player.x - this.portal.x, this.player.z - this.portal.z);
            if (distPortal < this.portal.radius) {
                this.sound.playLevelClear();
                this.addPopup('ステージクリア！次のエリアへ', '#38bdf8');
                this.loadMap(this.portal.nextMap);
                return;
            }
        }

        // Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt, this.colliders, this.particles);

            if (p.isPlayer) {
                // Check player fireball hit monster
                for (const m of this.monsters) {
                    if (!m.active) continue;
                    const distM = Math.hypot(m.x - p.x, m.z - p.z);
                    if (distM < m.radius + p.radius) {
                        p.active = false;
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xff5500, 16, 5.0);
                        const isDead = m.takeDamage(p.damage, { x: p.dirX, z: p.dirZ });
                        this.addPopup(`ファイア! -${p.damage}`, '#f97316', m.x, m.z);
                        this.notifyEnemyEngaged(m);
                        if (isDead) this.gainExp(m.exp);
                        break;
                    }
                }
            } else {
                // Check enemy projectile (arrow or magic) hit player
                const distP = Math.hypot(this.player.x - p.x, this.player.z - p.z);
                if (distP < this.player.radius + p.radius) {
                    this.playerTakeDamage(p.damage, new THREE.Vector3(p.dirX, 0, p.dirZ));
                    if (p.sourceMonster) {
                        this.notifyEnemyEngaged(p.sourceMonster);
                    }
                    if (p.type === 'arrow') {
                        this.sound.playArrowHit();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xd4d4d8, 8, 2.5);
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

        // Update Monsters and Ys-style "Bump Combat"
        this.updateCombat(dt);

        // Update Popups
        this.updatePopups(dt);

        // Update UI
        this.updateUI(dt);

        // Render Minimap
        this.renderMinimap();
    }

    movePlayer(dx, dz) {
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
        if (canMoveZ) this.player.z = nextZ;
    }

    updateCombat(dt) {
        for (let i = this.monsters.length - 1; i >= 0; i--) {
            const m = this.monsters[i];
            m.update(dt, this.player, this.colliders, this.projectiles, this.sound, this.scene);

            // Check collision with player for Ys-style bump attack
            const dx = m.x - this.player.x;
            const dz = m.z - this.player.z;
            const dist = Math.hypot(dx, dz);
            const bumpThreshold = this.player.radius + m.radius;

            if (dist < bumpThreshold && this.player.attackCooldown <= 0) {
                this.resolveYsBump(m, dx, dz, dist);
            }

            if (!m.active) {
                this.scene.remove(m.sprite);
                this.monsters.splice(i, 1);
            }
        }
    }

    // Classic Ys 1 "Half-Offset" Combat resolution
    resolveYsBump(monster, dx, dz, dist) {
        this.player.attackCooldown = 0.22; // Quick hit intervals for "bokosuka"

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

        // Ys 1 "Half-offset" rule:
        // If player is charging forward (dotFront > 0.4) and offset from dead-center (cross >= 0.25)
        const isHalfOffset = (dotFront > 0.4 && cross >= 0.25);
        const isCharging = (dotFront > 0.6);

        if (isHalfOffset) {
            // CRITICAL HALF-OFFSET HIT: Player takes 0 damage, monster takes full + bonus damage!
            const damage = Math.floor(this.player.attackPower * 1.5 + Math.random() * 5);
            this.sound.playAttack(true);
            const isDead = monster.takeDamage(damage, { x: nx, z: nz });
            this.particles.spawnBurst(monster.x, 1.2, monster.z, 0xfbbf24, 12, 4.0);
            this.addPopup(`半ずらし会心! -${damage}`, '#fbbf24', monster.x, monster.z);
            this.notifyEnemyEngaged(monster);

            if (isDead) this.gainExp(monster.exp);
        } else if (isCharging) {
            // Normal charge: Mutual damage (player takes half, enemy takes standard)
            const pDmg = Math.floor(this.player.attackPower + Math.random() * 3);
            const mDmg = Math.floor(monster.attackPower * 0.5);

            this.sound.playAttack(false);
            const isDead = monster.takeDamage(pDmg, { x: nx, z: nz });
            this.playerTakeDamage(mDmg, new THREE.Vector3(-nx, 0, -nz));
            this.addPopup(`ボコッ! -${pDmg}`, '#ffffff', monster.x, monster.z);
            this.notifyEnemyEngaged(monster);

            if (isDead) this.gainExp(monster.exp);
        } else {
            // Enemy hits player (player was backing away or standing still)
            const mDmg = monster.attackPower;
            this.playerTakeDamage(mDmg, new THREE.Vector3(-nx, 0, -nz));
            this.notifyEnemyEngaged(monster);
        }
    }

    playerTakeDamage(amount, knockDir) {
        if (this.player.isInvincible) return;

        this.player.hp = Math.max(0, this.player.hp - amount);
        this.player.isInvincible = true;
        this.player.invincibleTimer = 0.35;
        this.player.knockback.copy(knockDir).multiplyScalar(8);

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

    updateSignpostBanner(message) {
        const banner = document.getElementById('signpostBanner');
        if (!banner) return;
        if (message) {
            if (banner.innerText !== message) {
                banner.innerText = `📜 ${message}`;
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
                iconUrl: monster.iconUrl || '/images/enemies/slime_char.png',
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
        document.getElementById('hpBar').style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
        document.getElementById('hpText').innerText = `${Math.ceil(this.player.hp)}/${this.player.maxHp}`;
        document.getElementById('mpBar').style.width = `${(this.player.mp / this.player.maxMp) * 100}%`;
        document.getElementById('mpText').innerText = `${Math.floor(this.player.mp)}/${this.player.maxMp}`;
        document.getElementById('levelText').innerText = `Lv.${this.player.level}`;
        document.getElementById('expText').innerText = `EXP: ${this.player.exp}`;
        document.getElementById('monsterCount').innerText = `敵残数: ${this.monsters.length}`;

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
                            <img class="enemy-hud-icon" src="${c.iconUrl}" alt="${c.name}" onerror="this.src='/images/enemies/slime_char.png'">
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

        // Draw walls
        ctx.fillStyle = '#475569';
        for (const c of this.colliders) {
            ctx.fillRect(c.minX * scaleX, c.minZ * scaleZ,
                (c.maxX - c.minX) * scaleX, (c.maxZ - c.minZ) * scaleZ);
        }

        // Draw Portal
        if (this.portal) {
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(this.portal.x * scaleX, this.portal.z * scaleZ, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Monsters
        for (const m of this.monsters) {
            ctx.fillStyle = (m.type === 'S') ? '#10b981' : '#f97316';
            ctx.beginPath();
            ctx.arc(m.x * scaleX, m.z * scaleZ, 2.5, 0, Math.PI * 2);
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
        const loop = () => {
            const dt = Math.min(0.1, this.clock.getDelta());
            this.update(dt);
            this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}
