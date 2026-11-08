// マップの地形・外のマップ・隣のマップの見た目（高低差の地形・海・端の外の地面・隣のマップの先読み・壁や扉などの共通の見た目）。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { worldNeighbor } from '/js/world.js';
import { fetchMap } from '/js/mapFormat.js';
import { NEIGHBOR_TERRAIN_RANGE, NEIGHBOR_OBJECT_RANGE, NEIGHBOR_PLANT_RANGE } from '/js/game/constants.js';

// ---- 見た目の共通部品 ----
//   今のマップの描画（タイルのループ）と、隣のマップの先読み描画（buildNeighborDecor）が、同じ関数で見た目を作る。
//   新しい種類は、ここに見た目を書けば、両方に出る。当たり判定・対話の登録は、今のマップの側だけ。
//   env: { rows, cols, wallH, tileSize, brickMat, standardWallGeo, charAt(列, 行)（範囲外は undefined）, defOf(文字)（物体の定義）, add(obj, isStatic) }
export const mapSceneryMethods = {
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
    },

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

    },

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
    },

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
    },

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
    },

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
            wall(drop >= 2 ? cliffMat : matFor(sideMats, hi, mapData.sideShade ?? 0.78, ft), wx + dx * ts / 2, lo * step + faceH / 2, wz + dz * ts / 2, faceH, toward);
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
