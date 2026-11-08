// 敵・木・飾りなどの画像（スプライト）の読み込み。RetroTextureGenerator の静的メソッド（public/js/textures.js が、クラスの定義のあとで、RetroTextureGenerator へ組み込む）。
// 元は public/js/textures.js の RetroTextureGenerator。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

export const spriteTextures = {
    // ---- 雪国（A キュラビッド帝国）の、雪をかぶったテクスチャ（毎回同じ絵になるよう、乱数は固定） ----
    snowRng(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; },

    // 27. Mimic Face / Open Jaws with Sharp Teeth (sdServer id=121 transparent texture)
    createMimicTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/golem/mimic.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // Slime sprite: loads real character artwork from sdServer
    createSlimeTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/slime/slime.png?v2=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // Skeleton warrior sprite
    createSkeletonTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/undead/skeleton.png?v2=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // Goblin Shaman / Mage sprite
    createGoblinTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/demihuman/goblin_mage.png?v2=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // Goblin Archer sprite
    createGoblinArcherTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/demihuman/goblin_archer.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // Tree billboard: loads clean pre-processed transparent PNG
    createTreeTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/objects/tree_pixel.png?t=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 湿地の木: 枝が長く垂れ下がる柳
    createSwampTreeTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/objects/swamp_tree.png');
        // sRGB として扱う（指定がないとリニア扱いで二重に変換され、暗い色が持ち上がって白っぽく見える）
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // sdServer から取り込んだ、外のマップ用の画像（/images/objects/field/）。写実的な絵なので、色をそのまま出し、縮小は滑らかにする
    createFieldImageTexture(name) {
        const texture = new THREE.TextureLoader().load(`/images/objects/field/${name}.png`);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    },

    // 草むら・生い茂る草・野の花の共通ヘルパー: 透明な canvas に、ドットの草の葉や花を描く
    _plantCanvas(w, h, draw) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        draw(canvas.getContext('2d'), w, h);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // Swamp Enemy sprite textures (real artwork from sdServer)
    createTarantulaSwampTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/insect/tarantula_swamp.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    createParasiteWaspTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/insect/parasite_wasp.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    createMariaMosquitoTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/insect/maria_mosquito.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    createAcidWormTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/insect/acid_worm.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    createPoisonMothTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/insect/poison_moth.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    createPoisonToadTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/reptile/poison_toad.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },
};
