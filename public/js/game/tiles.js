// タイルの種類 → 描画する関数（種類ごとの定義は、tilesStructure・tilesNature・tilesTraps・tilesFloors）
import { tilesStructure } from '/js/game/tilesStructure.js';
import { tilesNature } from '/js/game/tilesNature.js';
import { tilesTraps } from '/js/game/tilesTraps.js';
import { tilesFloors } from '/js/game/tilesFloors.js';

export const tileBuilders = { ...tilesStructure, ...tilesNature, ...tilesTraps, ...tilesFloors };
