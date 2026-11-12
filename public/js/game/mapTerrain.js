// マップの地形（高低差の地形・海・端の外の地面・隣のマップの先読み）。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game/mapScenery.js（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { worldNeighbor } from '/js/world.js';
import { fetchMap } from '/js/mapFormat.js';

export const mapTerrainMethods = {
    // 石畳の道（paved_road・paved_road_snow）・土の道（dirt_road）のマスなら、段差 1 の側面に貼る画像の鍵 'road:<画像>'。そうでなければ null（地面の模様のまま）
    //   bridge=true: 石の橋（stone_bridge）のマスも、石畳として数える（橋の脇の、高くなった地面の側面。低い隣が橋のとき）
    roadSideKey(mapData, r, c, bridge = false) {
        const ch = mapData.layout?.[r]?.[c];
        const name = ch && ch !== '0' ? mapData.legend?.[ch] : null;
        return (name === 'paved_road' || name === 'paved_road_snow' || name === 'dirt_road' || (bridge && name === 'stone_bridge')) ? 'road:' + this.objectDefinitions?.[name]?.texture : null;
    },

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
                    const face = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, faceH), drop >= 2 ? cliffMatFor(h) : matFor(sideMats, h, mapData.sideShade ?? 0.78, this.roadSideKey(mapData, r, c) || this.roadSideKey(mapData, r + dz, c + dx, true) || ft));   // 段差 1: 石畳の道のマスは、側面も石畳の色
                    face.rotation.y = rotY;
                    face.position.set(wx + dx * tileSize / 2, nh * step + faceH / 2, wz + dz * tileSize / 2);
                    this.addStatic(face);
                }
            }
        }
    },

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
    },

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
    },

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
    },

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
    },
};
