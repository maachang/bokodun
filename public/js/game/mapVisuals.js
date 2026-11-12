// 壁・家・立て札・松明・扉・家具の見た目の共通部品。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game/mapScenery.js（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

// ---- 見た目の共通部品 ----
//   今のマップの描画（タイルのループ）と、隣のマップの先読み描画（buildNeighborDecor）が、同じ関数で見た目を作る。
//   新しい種類は、ここに見た目を書けば、両方に出る。当たり判定・対話の登録は、今のマップの側だけ。
//   env: { rows, cols, wallH, tileSize, brickMat, standardWallGeo, charAt(列, 行)（範囲外は undefined）, defOf(文字)（物体の定義）, add(obj, isStatic) }
export const mapVisualMethods = {
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

        this.visualGateRoof(objDef, doorGroup, env, { c, r, isVertical, doorThickness, frameMat, isWallChar });
        this.visualGateCrest(objDef, doorGroup, env, { c, r, isVertical, doorThickness });

        doorGroup.position.set(wx, 0, wz);
        env.add(doorGroup);

        return { doorMesh, doorH, isVertical, doorThickness };
    },

    // 門の屋根（visualDoor から呼ぶ。元は visualDoor の一部）。q: 門の向き・位置・枠の材質・壁の判定
    visualGateRoof(objDef, doorGroup, env, q) {
        const { c, r, isVertical, doorThickness, frameMat, isWallChar } = q;
        // 門の屋根（街の門。objects.json の gateRoof: { texture, overhang }）: 壁より上に、通り抜ける方向へ広く出る屋根を 2 段に重ねる。遠くからも、門の位置と国の違いが分かる
        // style: 'gable'（街の大門）は、切妻の大屋根・棟・両端の袖屋根（壁の上の小屋根）。省略は、今までの平らな 2 段屋根（町の小さな門）。layers: 1 で 1 段だけ
        const gateRoofTex = objDef.gateRoof && this.textures[objDef.gateRoof.texture];
        if (gateRoofTex) {
            const roofMat = this.makeLitMaterial(objDef.gateRoof.texture, gateRoofTex).clone();
            roofMat.side = THREE.DoubleSide;   // 上から見ても、屋根の裏が透けない
            const gr = objDef.gateRoof;
            const depth = env.tileSize + (gr.overhang ?? 0.8) * 2;
            if (gr.style === 'gable') {
                // 壁の向きを X・通り抜ける向きを Z とした局所座標で組み、縦向きの門は、まとめて回す（局所 +X = 壁の向き）
                const roofGroup = new THREE.Group();
                roofGroup.rotation.y = isVertical ? -Math.PI / 2 : 0;
                const prism = (len, dep, rise, x, y) => {   // 棟が X 向きの切妻屋根（断面は三角形）。x, y は、底の中心
                    const hd = dep / 2, hl = len / 2, pos = [], uv = [];
                    const quad = (p0, p1, p2, p3) => { for (const q of [p0, p1, p2, p0, p2, p3]) pos.push(...q); uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); };
                    quad([-hl, 0, -hd], [hl, 0, -hd], [hl, rise, 0], [-hl, rise, 0]);   // 手前の斜面
                    quad([hl, 0, hd], [-hl, 0, hd], [-hl, rise, 0], [hl, rise, 0]);     // 奥の斜面
                    for (const q of [[-hl, 0, hd], [-hl, 0, -hd], [-hl, rise, 0], [hl, 0, -hd], [hl, 0, hd], [hl, rise, 0]]) pos.push(...q);   // 両端の三角（切妻の妻）
                    uv.push(0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1);
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
                    geo.computeVertexNormals();
                    const m = new THREE.Mesh(geo, roofMat);
                    m.position.set(x, y, 0);
                    roofGroup.add(m);
                    const soffit = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, dep), frameMat);   // 軒裏（屋根の裏の板。これがないと、裏が空いて、張りぼてに見える）
                    soffit.position.set(x, y + 0.075, 0);
                    roofGroup.add(soffit);
                };
                const ts = env.tileSize, rise = gr.rise ?? 2.0;
                const isDoorChar = (ch) => env.defOf(ch)?.type === 'door';
                const endA = isVertical ? env.charAt(c, r - 1) : env.charAt(c - 1, r);   // 壁の向きの両隣
                const endB = isVertical ? env.charAt(c, r + 1) : env.charAt(c + 1, r);
                // 大屋根: 壁より上の、まぐさの上に、厚みのある台（冠木）をのせ、その上に切妻の屋根
                const beam = new THREE.Mesh(new THREE.BoxGeometry(ts, 0.5, doorThickness + 0.5), frameMat);
                beam.position.set(0, env.wallH + 0.25, 0);
                roofGroup.add(beam);
                prism(ts, depth, rise, 0, env.wallH + 0.5);
                if (gr.ridge !== false) {   // 棟（屋根のてっぺんの黒い帯）
                    const ridge = new THREE.Mesh(new THREE.BoxGeometry(ts, 0.3, 0.45), frameMat);
                    ridge.position.set(0, env.wallH + 0.5 + rise + 0.1, 0);
                    roofGroup.add(ridge);
                }
                if (gr.side) {   // 袖屋根: 門の両端の隣が、門ではない壁なら、その壁の上に、低い小屋根をかける
                    const sideDep = ts + 0.8, sideRise = rise * 0.45;
                    for (const [ch, dir] of [[endA, -1], [endB, 1]]) {
                        if (!ch || isDoorChar(ch) || !isWallChar(ch)) continue;
                        prism(ts, sideDep, sideRise, dir * ts, env.wallH - 0.4);
                    }
                }
                doorGroup.add(roofGroup);
            } else {
                const layer = (len, dep, h, y) => {
                    const m = new THREE.Mesh(new THREE.BoxGeometry(isVertical ? dep : len, h, isVertical ? len : dep), roofMat);
                    m.position.set(0, y + h / 2, 0);
                    doorGroup.add(m);
                };
                layer(env.tileSize, depth, 0.35, env.wallH);
                if ((gr.layers ?? 2) >= 2) layer(env.tileSize, depth * 0.6, 0.4, env.wallH + 0.35);
            }
        }
    },

    // 国の紋章の盾（objects.json の crest: テクスチャ名）。門が 2 マスならんだ、その継ぎ目の真上（表と裏）に掲げる（visualDoor から呼ぶ）
    visualGateCrest(objDef, doorGroup, env, q) {
        const tex = objDef.crest && this.textures[objDef.crest];
        if (!tex) return;
        const { c, r, isVertical } = q;
        if (env.defOf(isVertical ? env.charAt(c, r + 1) : env.charAt(c + 1, r)) !== objDef) return;   // 継ぎ目は、右（下）隣が同じ門のときだけ。門の端のマスは、付けない
        const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: objDef.crestGlow ?? 0.6, transparent: true, alphaTest: 0.5, fog: objDef.crestFog !== false });   // crestGlow: 光り方・crestFog: false で霧に隠れない（A の吹雪など）   // 盾は、少し自ら光る（G の森のような暗い所でも、紋章が読める）
        const w = 2.4, h = w * 1.25, off = env.tileSize / 2 + 0.05;   // 柱の奥行きは、マスいっぱい。柱の手前の面から、少し出す
        for (const side of [1, -1]) {
            const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            if (isVertical) { plate.position.set(side * off, 2.4, env.tileSize / 2); plate.rotation.y = side * Math.PI / 2; }
            else { plate.position.set(env.tileSize / 2, 2.4, side * off); plate.rotation.y = side === 1 ? 0 : Math.PI; }
            doorGroup.add(plate);
        }
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
};
