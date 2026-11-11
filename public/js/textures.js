import * as THREE from '/js/three.module.js';
import { terrainTextures } from '/js/textures/texturesTerrain.js';
import { liquidTextures } from '/js/textures/texturesLiquids.js';
import { wallTextures } from '/js/textures/texturesWalls.js';
import { edoTextures } from '/js/textures/texturesEdo.js';
import { gateTextures } from '/js/textures/texturesGates.js';
import { roofDoorTextures } from '/js/textures/texturesRoofsDoors.js';
import { objectTextures } from '/js/textures/texturesObjects.js';
import { spriteTextures } from '/js/textures/texturesSprites.js';

// Procedural 16x16 / 32x32 retro pixel texture generator
export class RetroTextureGenerator {
    // スプライト用の、透明な背景のキャンバスから、テクスチャを作る
    static spriteTexture(canvas) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }






}

// 部品（public/js/textures/*.js）の静的メソッドを、RetroTextureGenerator に組み込む
Object.assign(RetroTextureGenerator, terrainTextures, liquidTextures, wallTextures, edoTextures, roofDoorTextures, gateTextures, objectTextures, spriteTextures);
