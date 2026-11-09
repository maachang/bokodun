// 隣のマップの、先読みの描画（地形の板・水・崖・木・草・岩・壁や家）。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game/mapScenery.js（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { fetchMap } from '/js/mapFormat.js';
import { NEIGHBOR_TERRAIN_RANGE, NEIGHBOR_OBJECT_RANGE, NEIGHBOR_PLANT_RANGE } from '/js/game/constants.js';

export const mapNeighborMethods = {
    // 隣のマップ（8 方向）を、今のマップの外側に、本物のマスで描く。
    //   地形: 端から NEIGHBOR_TERRAIN_RANGE マスまで（高さの段・崖の面・地面の種類・水）。物体: 端から NEIGHBOR_OBJECT_RANGE マスまでの、木・草・岩（距離で隠す仕組みは、今のマップと同じ）。
    //   境（マップのつなぎ目）は、今のマップの端のマスの高さと、段差があれば、崖の面で埋める（隙間から空が見えない）
    async buildNeighborDecor(mapId, cols, rows, ts, mapData, floorMatOf) {
        const n = this.neighborContext(mapId, cols, rows, ts, mapData, floorMatOf);
        if (!n) return;
        const { world, pj, pi } = n;
        for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
                if (!dj && !di) continue;
                const nid = world.grid[pj + dj]?.[pi + di];
                if (!nid) continue;
                let nd = this.mapCache[nid];
                if (!nd) { try { nd = await fetchMap(nid); this.mapCache[nid] = nd; } catch { continue; } }
                if (!nd?.heights || !nd.layout) continue;
                await this.drawNeighborMap(n, nd, dj, di);
            }
        }
        this.flushNeighborGroups(n);
    },

    neighborContext(mapId, cols, rows, ts, mapData, floorMatOf) {
        const world = this.world;
        let pj = -1, pi = -1;
        world.grid.forEach((row, j) => { const i = row.indexOf(mapId); if (i >= 0) { pj = j; pi = i; } });
        if (pj < 0) return null;
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
        return { world, pj, pi, step, R, RO, tintOf, cliffMat, topMats, sideMats, matFor, waterMats, glowMats, glowMatOf, visBrickMat, visWallGeos, groups, quad, flat, wall, dirs, lvOf, isWaterDef, ts, rows, cols, mapData, floorMatOf, mapId };
    },

    drawNeighborMap(n, nd, dj, di) {
        const { visBrickMat, visWallGeos, ts, rows, cols, mapData } = n;
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
            for (let c = 0; c < ncols; c++) this.neighborTile(n, nEnv, nd, r, c, rowOff, colOff);
        }
    },

    neighborTile(n, nEnv, nd, r, c, rowOff, colOff) {
        const { R, isWaterDef, ts, rows, cols } = n;
        const gr = rowOff + r, gc = colOff + c;
        if (gr < -R || gr >= rows + R || gc < -R || gc >= cols + R) return;
        const wx = gc * ts + ts / 2, wz = gr * ts + ts / 2;
        const ch = nd.layout[r][c];
        const def = ch !== '0' ? this.objectDefinitions?.[nd.legend?.[ch]] : null;
        if (isWaterDef(def)) { this.neighborWater(n, nd, def, r, c, wx, wz); return; }
        const lv = this.neighborLand(n, nd, def, r, c, gr, gc, wx, wz);
        this.neighborObject(n, nEnv, def, r, c, gr, gc, wx, wz, lv);
    },

    neighborWater(n, nd, def, r, c, wx, wz) {
        const { step, waterMats, glowMatOf, flat, wall, dirs, isWaterDef, ts } = n;
        const nrows = nd.layout.length, ncols = nd.layout[0].length;   // この隣のマップの大きさ（drawNeighborMap と同じ）
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
    },

    neighborLand(n, nd, def, r, c, gr, gc, wx, wz) {
        const { step, cliffMat, topMats, sideMats, matFor, waterMats, flat, wall, dirs, lvOf, ts, rows, cols, mapData } = n;
        const nrows = nd.layout.length, ncols = nd.layout[0].length;   // この隣のマップの大きさ（drawNeighborMap と同じ）
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
            wall(drop >= 2 ? cliffMat : matFor(sideMats, hi, mapData.sideShade ?? 0.78, this.roadSideKey(nd, r, c) || (!reversed && this.roadSideKey(nd, rr, cc, true)) || ft), wx + dx * ts / 2, lo * step + faceH / 2, wz + dz * ts / 2, faceH, toward);
        }
        return lv;
    },

    neighborObject(n, nEnv, def, r, c, gr, gc, wx, wz, lv) {
        const { step, RO, ts, rows, cols } = n;
        // 物体（木・草・岩）: 端から NEIGHBOR_OBJECT_RANGE マスまで
        if (!def || gr < -RO || gr >= rows + RO || gc < -RO || gc >= cols + RO) return;
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
    },

    flushNeighborGroups(n) {
        const { waterMats, glowMats, groups } = n;
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
    },
};
