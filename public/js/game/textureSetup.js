// テクスチャの登録（this.textures の表）。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { RetroTextureGenerator } from '/js/textures.js';

export const textureSetupMethods = {
    initTextures() {
        // テクスチャの表（名前 → 画像・生成した絵）。表は、3 つのメソッドに分けて、まとめる（1 つの関数が長くならないように）
        this.textures = { ...this.imageTextureTable(), ...this.proceduralTextureTableA(), ...this.proceduralTextureTableB() };
    },

    imageTextureTable() {
        // 画像ファイルを読み込むテクスチャ（密林・バリア・苔の洞窟・森の樹冠・炎の柱）
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
        return {
            electricBarrier: barrierTex,
            mossyStone: mossyCaveTex,
            forestCanopy: forestCanopyTex,
            denseForest: denseForestTex,
            firePillar: firePillarTex,
        };
    },

    proceduralTextureTableA() {
        // 生成した絵のテクスチャ（前半）
        return {
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
            spikeTrap: RetroTextureGenerator.createSpikeTrapTexture(),
            pitfall: RetroTextureGenerator.createPitfallTexture(),
            door: RetroTextureGenerator.createDoorTexture(),
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
            fPineK: RetroTextureGenerator.createFieldImageTexture('pine_k'),   // 松（マカヒキ国の城の中庭）
            fUmeK: RetroTextureGenerator.createFieldImageTexture('ume_k'),   // 梅（同上）
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
        };
    },

    proceduralTextureTableB() {
        // 生成した絵のテクスチャ（後半）
        return {
            cliffDark: RetroTextureGenerator.createCliffTexture(['#4a4344', '#3b3536', '#574f50', '#2f2a2b', '#625858'], '#120f10', 77),
            snowGround: RetroTextureGenerator.createSpeckleFloorTexture('#f4f8ff', ['#ffffff', '#e2eaf4', '#eaf0f8']),
            forestGround: RetroTextureGenerator.createSpeckleFloorTexture('#667744', ['#566a38', '#788a50', '#876c46', '#6c5838']),   // 森の地面: 普通の、緑と茶の落ち葉の色（暗さは、環境の光と霧で出す。床自体を黒くしない）
            edoGround: RetroTextureGenerator.createSpeckleFloorTexture('#9a7a52', ['#876a46', '#ab8c62', '#7c6240', '#b09a72']),   // K（マカヒキ国）の広場・飾りの下: 踏み固めた土（茶色に、砂利のまだら）
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
            whiteWall: RetroTextureGenerator.createCityWallTexture('#9aa3b2', ['#f2f4f8', '#e6eaf1', '#fafbfd', '#dde3ed', '#eef1f6']),   // フランケル聖国（B）: 白亜の壁・家
            holyRoof: RetroTextureGenerator.createCityRoofTexture('#23407a', ['#3b6ac0', '#2f58a8', '#4b7ad0', '#3560b4']),   // 聖国の青い屋根
            edoPlaster: RetroTextureGenerator.createEdoPlasterTexture(),   // マカヒキ国（K。江戸風）: 白い漆喰の壁・黒い板張りの町家・灰黒の瓦屋根
            tatami: RetroTextureGenerator.createTatamiTexture(),   // 畳（K の部屋の床）
            edoWood: RetroTextureGenerator.createEdoWoodTexture(),
            edoMachiya: RetroTextureGenerator.createEdoMachiyaTexture(),
            edoShrine: RetroTextureGenerator.createEdoShrineTexture(),
            fusuma: RetroTextureGenerator.createFusumaTexture(),
            fusumaGold: RetroTextureGenerator.createFusumaGoldTexture(),
            wallGoldPine: RetroTextureGenerator.createWallGoldPineTexture(),
            shoji: RetroTextureGenerator.createShojiTexture(),
            edoRoof: RetroTextureGenerator.createCityRoofTexture('#14171b', ['#262b32', '#2f353d', '#20252b', '#383f48']),
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
            tarantulaSwamp: RetroTextureGenerator.createTarantulaSwampTexture(),
            parasiteWasp: RetroTextureGenerator.createParasiteWaspTexture(),
            mariaMosquito: RetroTextureGenerator.createMariaMosquitoTexture(),
            acidWorm: RetroTextureGenerator.createAcidWormTexture(),
            poisonMoth: RetroTextureGenerator.createPoisonMothTexture(),
            poisonToad: RetroTextureGenerator.createPoisonToadTexture(),
        };
    },
};
