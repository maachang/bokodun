// タイルの種類ごとの描画（壁・建物・木の壁・柵・扉・階段・像・壁の飾りなど、場所に据える構造物）。GameEngine.loadMapBody が、マスの物体の種類（objDef.type）に応じて呼ぶ。
// 各メソッドは `this` が GameEngine（呼び出し側が .call(this, t) で渡す）。t は、そのマスの情報（tileContext: r・c・char・wx・wz・objDef・liftH・mapData・rows・cols・tileSize・wallH ほか）。
// 元は game.js の loadMapBody の switch の case。移しただけで、描画の中身は同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { STAIRS_DIRS, stairsFacing } from '/js/mapNavigator.js';

export const tilesStructure = {
    block(t) {
        const { c, objDef, r, tileSize, visEnv, wx, wz } = t;
        this.visualBlock(objDef, wx, wz, r, c, visEnv);
        if (objDef.solid) {
            this.colliders.push({
                minX: wx - tileSize / 2,
                maxX: wx + tileSize / 2,
                minZ: wz - tileSize / 2,
                maxZ: wz + tileSize / 2,
                blocksProjectiles: objDef.blocksProjectiles !== false
            });
        }
    },

    tree_wall(t) {
        const { c, cols, mapData, objDef, r, rows, tileSize, wallH, wx, wz } = t;
        // 林の壁（画像の木々を、向きの固定した板で壁にする）。画像を普通のスプライトで出すと、常にこちらを向いて、壁にならない。
        // 壁の外側（隣が同じ林の壁でない、マップの中の側）の面に、板を立てる。板は、動かず、向きも変わらない。
        // 1 マスの林の壁は、両側に板が立つ。連なる林の壁は、並んだ板が少し重なって、つながって見える
        const wallTex = this.textures[objDef.texture] || this.textures.forestCanopy;
        this.treeWallMats = this.treeWallMats || new Map();
        let panelMat = this.treeWallMats.get(wallTex);
        if (!panelMat) {
            panelMat = new THREE.MeshLambertMaterial({ map: wallTex, alphaTest: 0.35, side: THREE.DoubleSide });   // 切り抜きだけ（transparent を外す）: 半透明の距離順に頼らず、奥の木が隠れない
            this.treeWallMats.set(wallTex, panelMat);
        }
        const panelH = (objDef.height ?? wallH * 1.4) * (0.9 + ((r * 7 + c * 13) % 5) * 0.05);
        const panelW = Math.max(tileSize * 1.5, panelH * (objDef.aspect ?? 1));
        const wallTypeAt = (cc, rr) => this.objectDefinitions[mapData.legend?.[mapData.layout[rr]?.[cc]]]?.type;
        // [列の差, 行の差, 板の向き（法線）の回転]。板の法線は、標準で +Z（南）向き
        for (const [dx, dz, rotY] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
            const nc = c + dx, nr = r + dz;
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;   // マップの外側には、板を立てない
            if (wallTypeAt(nc, nr) === 'tree_wall') continue;               // 隣も林の壁の面は、内側
            const inset = tileSize / 2 - 0.1 - ((r + c) % 2) * 0.06;         // 隣の板との、重なりのちらつき（z-fighting）を避ける
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), panelMat);
            panel.rotation.y = rotY;
            panel.position.set(wx + dx * inset, panelH / 2, wz + dz * inset);
            this.addStatic(panel);
        }
        // 出っ張りの角（凹んだ角）: 斜め向かいがマップの中で、林の壁でなく、その間の 2 マスが林の壁（かマップの外）のとき、
        //   2 枚の板の間に穴があくので、斜めの板で埋める（マップの四隅など）
        const isWallOrOut = (cc, rr) => cc < 0 || rr < 0 || cc >= cols || rr >= rows || wallTypeAt(cc, rr) === 'tree_wall';
        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const dc = c + dx, dr = r + dz;
            if (dc < 0 || dr < 0 || dc >= cols || dr >= rows || isWallOrOut(dc, dr)) continue;
            if (!isWallOrOut(c + dx, r) || !isWallOrOut(c, r + dz)) continue;
            const diag = new THREE.Mesh(new THREE.PlaneGeometry(tileSize * 1.7, panelH), panelMat);
            diag.rotation.y = Math.atan2(dx, dz);
            diag.position.set(wx + dx * tileSize * 0.2, panelH / 2, wz + dz * tileSize * 0.2);
            this.addStatic(diag);
        }
        if (objDef.solid) {
            this.colliders.push({
                minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                blocksProjectiles: objDef.blocksProjectiles !== false
            });
        }
    },

    dense_forest(t) {
        const { c, cols, objDef, r, rows, tileSize, wallH, wx, wz } = t;
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
    },

    barrier(t) {
        const { objDef, tileSize, wx, wz } = t;
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
    },

    wooden_fence(t) {
        const { c, char, mapData, objDef, r, tileSize, visEnv, wx, wz } = t;
        this.visualWoodenFence(objDef, wx, wz, r, c, char, visEnv);   // 見た目は共通の部品（隣のマップの先読みと同じ）

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
    },

    torch_stand(t) {
        const { c, objDef, r, visEnv, wx, wz } = t;
        this.visualTorch(objDef, wx, wz, r, c, visEnv);
    },

    door(t) {
        const { c, mapData, objDef, r, tileSize, visEnv, wallH, wx, wz } = t;
        const { doorMesh, doorH, isVertical, doorThickness } = this.visualDoor(objDef, wx, wz, r, c, visEnv);
        // 屋内の戸口は、床と天井もつける
        if (objDef.floorTexture) this.addFloorTile(wx, wz, tileSize, objDef.floorTexture);
        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);

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
            targetY: doorH / 2,
            baseY: doorH / 2,
            openY: doorH * 1.45,
            x: wx,
            z: wz,
            link: { ...objDef, ...mapData.links?.[`${c},${r}`] },   // 行き先（nextMap）があれば、開いた扉の中へ入ると、そのマップへ移動する。マスごとの指定は map の links
            half: tileSize / 2
        });
        // 店のアイコン: 扉の外側（戻る先の側）の壁の面に、扉の上のほうへ出す
        const doorLink = this.doors[this.doors.length - 1].link;
        if (doorLink.icon && doorLink.back && this.textures[doorLink.icon]) {
            const dx = doorLink.back.x * tileSize + tileSize / 2 - wx;
            const dz = doorLink.back.z * tileSize + tileSize / 2 - wz;
            const len = Math.hypot(dx, dz) || 1;
            const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures[doorLink.icon] }));
            icon.scale.set(1.5, 1.5, 1);
            icon.position.set(wx + dx / len * (tileSize / 2 + 0.15), wallH * 0.78, wz + dz / len * (tileSize / 2 + 0.15));
            this.scene.add(icon);
        }
    },

    gateway(t) {
        const { c, mapData, objDef, r, tileSize, wx, wz } = t;
        // 壁の切れ目・開いた門: 見えない移動マス。このマスへ入ると nextMap へ移動する
        if (objDef.floorTexture) this.addFloorTile(wx, wz, tileSize, objDef.floorTexture);
        this.portals.push({ x: wx, z: wz, halfSize: tileSize / 2, mesh: null, link: { ...objDef, nextMap: objDef.nextMap ?? mapData.nextMap, ...mapData.links?.[`${c},${r}`] } });
    },

    stairs(t) {
        const { c, cols, mapData, objDef, r, rows, tileSize, wallH, wx, wz } = t;
        // 階段（上り・下り）: 見た目は、段を積んだ箱。踏むと、links の nextMap の spawn の位置へ移動する（別の階・別の建物）。
        //   向き（上る・下りる方向）は、links の dir（n/e/s/w）。なければ、通れる隣マスが1つだけのとき、その反対側（行き止まりの壁へ向かう）
        const key = `${c},${r}`;
        const isSolidChar = (cc, rr) => {
            if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return true;
            const ch = mapData.layout[rr][cc];
            if (ch === '1') return true;
            const t = this.objectDefinitions[mapData.legend?.[ch]];
            return !!t && (t.solid === true || ['block', 'door', 'furniture'].includes(t.type));
        };
        const dirKey = stairsFacing(isSolidChar, c, r, mapData.links?.[key]?.dir);
        const [sdx, sdz] = STAIRS_DIRS[dirKey];

        const stairTex = this.textures[objDef.texture] || this.textures.floorStone;
        const STEPS = 5, total = Math.min(wallH * 0.7, 2.8), riser = total / STEPS;
        const group = new THREE.Group();
        if (objDef.direction === 'down') {
            // 下り階段: 上り階段と同じ作りで、段が、床から下へ降りていく（床に穴を開けて、段を下へ降ろす）。枠や黒い壁は付けない。
            //   段は浅く（1段 0.25）して、床の縁に隠れず、階段に見えるようにする。段ごとに、明暗を交互にして、段を見せる
            const DROP = 0.25, deepTotal = STEPS * DROP;
            for (let i = 0; i < STEPS; i++) {
                const k = (i % 2 === 0 ? 1.0 : 0.72) * (1 - i * 0.04);
                const mat = new THREE.MeshLambertMaterial({ map: stairTex, color: new THREE.Color(0xffffff).multiplyScalar(k) });
                const depth = tileSize / STEPS, top = -(i + 1) * DROP, h = Math.max(deepTotal + top, 0.05);   // 底は、穴の底（-deepTotal）
                const step = new THREE.Mesh(new THREE.BoxGeometry(depth, h, tileSize), mat);
                step.position.set(-tileSize / 2 + (i + 0.5) * depth, -deepTotal + h / 2, 0);
                group.add(step);
            }
            // 穴の壁（左右と奥）。段と同じ材質。壁がないと、浅い角度から見たとき、穴の奥の下から、空の色が透けて見える
            const wallMat = new THREE.MeshLambertMaterial({ map: stairTex, color: new THREE.Color(0xffffff).multiplyScalar(0.75), side: THREE.DoubleSide });
            for (const side of [-1, 1]) {
                const w = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, deepTotal), wallMat);
                w.position.set(0, -deepTotal / 2, side * tileSize / 2);
                group.add(w);
            }
            const far = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, deepTotal), wallMat);
            far.rotation.y = Math.PI / 2;
            far.position.set(tileSize / 2, -deepTotal / 2, 0);
            group.add(far);
            group.position.set(wx, 0, wz);
            group.rotation.y = Math.atan2(-sdz, sdx);   // ローカルの +X（奥）を、dir の向きにする
            this.scene.add(group);
        } else {
            // 上り階段: 段を5つ積んだ箱。上面は (i+1) × riser
            const stairMat = new THREE.MeshLambertMaterial({ map: stairTex });
            for (let i = 0; i < STEPS; i++) {
                const depth = tileSize / STEPS, h = (i + 1) * riser;
                const step = new THREE.Mesh(new THREE.BoxGeometry(depth, h, tileSize), stairMat);
                step.position.set(-tileSize / 2 + (i + 0.5) * depth, h / 2, 0);   // 向き（dir）に沿った位置
                group.add(step);
            }
            group.position.set(wx, 0, wz);
            group.rotation.y = Math.atan2(-sdz, sdx);   // ローカルの +X を、dir の向きにする
            this.scene.add(group);
        }
        if (objDef.floorTexture) this.addFloorTile(wx, wz, tileSize, objDef.floorTexture);
        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
        this.portals.push({ x: wx, z: wz, halfSize: tileSize / 2, mesh: null, link: { ...objDef, nextMap: objDef.nextMap ?? mapData.nextMap, ...mapData.links?.[key] } });
    },

    statue(t) {
        const { mapData, objDef, tileSize, wallH, wx, wz } = t;
        // 像（画像）: 台座の上に、画像の板が、常にこちらを向いて立つ（スプライト）。後ろに、淡い光の輪（glow）をつける
        const pedH = objDef.pedestalHeight ?? 0.6;
        const pedMat = this.makeLitMaterial(objDef.pedestalTexture || 'marbleWall', this.textures[objDef.pedestalTexture || 'marbleWall']);
        const ped = new THREE.Mesh(new THREE.BoxGeometry(objDef.pedestalWidth ?? tileSize * 0.55, pedH, objDef.pedestalWidth ?? tileSize * 0.55), pedMat);   // 台座の幅は、pedestalWidth で指定（特大・小の像用）
        ped.position.set(wx, pedH / 2, wz);
        this.scene.add(ped);
        const imgTex = this.getObjectImageTexture(objDef.imageFile);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: imgTex, transparent: true, alphaTest: 0.05 }));
        sprite.center.set(0.5, 0.0);
        sprite.scale.set(objDef.height * (objDef.aspect || 0.5), objDef.height, 1);
        sprite.position.set(wx, pedH, wz);
        this.scene.add(sprite);
        if (objDef.glow) {
            const cv = document.createElement('canvas');
            cv.width = cv.height = 128;
            const cx = cv.getContext('2d');
            const grad = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255, 244, 200, 0.55)');
            grad.addColorStop(1, 'rgba(255, 244, 200, 0)');
            cx.fillStyle = grad;
            cx.fillRect(0, 0, 128, 128);
            const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            halo.scale.set(objDef.height * 1.3, objDef.height * 1.3, 1);
            halo.position.set(wx, pedH + objDef.height * 0.5, wz - 0.05);
            this.scene.add(halo);
        }
        if (objDef.floorTexture ?? mapData.decorFloor) this.addFloorTile(wx, wz, tileSize, objDef.floorTexture ?? mapData.decorFloor);
        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
        if (objDef.solid) {
            const rad = objDef.radius || 0.8;
            this.colliders.push({
                minX: wx - rad, maxX: wx + rad, minZ: wz - rad, maxZ: wz + rad,
                blocksProjectiles: objDef.blocksProjectiles === true
            });
        }
    },

    wall_image(t) {
        const { c, cols, mapData, objDef, r, rows, standardWallGeo, tileSize, wallH, wx, wz } = t;
        // 壁の画像（ステンドグラスなど）: 壁のブロックの、通れる隣のマスに向いた面に、画像を貼る。画像は自ら光る材質（ガラス越しの光）
        const wallMat = this.makeLitMaterial(objDef.wallTexture || 'marbleWall', this.textures[objDef.wallTexture || 'marbleWall']);
        const body = new THREE.Mesh(standardWallGeo, wallMat);
        body.position.set(wx, wallH / 2, wz);
        this.scene.add(body);
        if (objDef.solid) {
            this.colliders.push({
                minX: wx - tileSize / 2, maxX: wx + tileSize / 2, minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                blocksProjectiles: objDef.blocksProjectiles !== false
            });
        }
        const isOpen = (cc, rr) => {
            if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return false;
            const ch = mapData.layout[rr][cc];
            if (ch === '1') return false;
            const t = this.objectDefinitions[mapData.legend?.[ch]];
            return !t || !['block', 'door', 'wall_image'].includes(t.type);   // 像・家具の後ろの壁にも、画像を貼る
        };
        const imgMat = new THREE.MeshBasicMaterial({ map: this.getObjectImageTexture(objDef.imageFile), transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
        const ih = objDef.height, iw = ih * (objDef.aspect || 0.5), off = tileSize / 2 + 0.02;
        for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            if (!isOpen(c + dx, r + dz)) continue;
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), imgMat);
            plane.position.set(wx + dx * off, (objDef.bottom ?? 1.0) + ih / 2, wz + dz * off);
            plane.rotation.y = Math.atan2(dx, dz);   // 面の向きを、開いた隣のマスのほうへ
            this.scene.add(plane);
        }
    },

    hanging(t) {
        const { mapData, objDef, tileSize, wallH, wx, wz } = t;
        // 天井から吊るす飾り（シャンデリア・吊りランプ）: 箱形のパーツの組み合わせ（家具と同じ parts）。
        //   fromCeiling が true なら、パーツの y は、天井からの相対（下向きは負）。通り抜けられる（当たり判定なし）。
        //   炎などは basic: true（自ら光る材質）で、光らせる。周囲を照らす光源（PointLight）は付けない（見た目のみ）
        const group = new THREE.Group();
        for (const p of objDef.parts || []) {
            const mat = p.basic
                ? new THREE.MeshBasicMaterial({ color: p.color })
                : new THREE.MeshLambertMaterial({ color: p.color });
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]), mat);
            mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
            group.add(mesh);
        }
        group.position.set(wx, objDef.fromCeiling ? wallH : 0, wz);
        this.addStatic(group);
        const hangFloor = objDef.floorTexture ?? mapData.decorFloor;
        if (hangFloor) this.addFloorTile(wx, wz, tileSize, hangFloor);
        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
    },

    wall_deco(t) {
        const { c, cols, mapData, objDef, r, rows, standardWallGeo, tileSize, wallH, wx, wz } = t;
        // 壁の飾り（燭台・旗など）: 壁のブロックの、通れる隣のマスに向いた面に、箱形のパーツを付ける。
        //   パーツの座標は、面の中心からの相対（x: 横、y: 床からの高さ、z: 壁から手前へ）
        const wallMat = this.makeLitMaterial(objDef.wallTexture || 'brick', this.textures[objDef.wallTexture || 'brick']);
        const body = new THREE.Mesh(standardWallGeo, wallMat);
        body.position.set(wx, wallH / 2, wz);
        this.addStatic(body);
        this.colliders.push({
            minX: wx - tileSize / 2, maxX: wx + tileSize / 2, minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
            blocksProjectiles: true
        });
        const isOpenDeco = (cc, rr) => {
            if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return false;
            const ch = mapData.layout[rr][cc];
            if (ch === '1') return false;
            const t = this.objectDefinitions[mapData.legend?.[ch]];
            return !t || !['block', 'door', 'wall_image', 'wall_deco'].includes(t.type);
        };
        for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            if (!isOpenDeco(c + dx, r + dz)) continue;
            const face = new THREE.Group();
            for (const p of objDef.parts || []) {
                const mat = p.basic
                    ? new THREE.MeshBasicMaterial({ color: p.color })
                    : new THREE.MeshLambertMaterial({ color: p.color });
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]), mat);
                mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
                face.add(mesh);
            }
            face.position.set(wx + dx * tileSize / 2, 0, wz + dz * tileSize / 2);
            face.rotation.y = Math.atan2(dx, dz);   // ローカルの +Z（手前）を、開いた隣のマスのほうへ
            this.addStatic(face);
        }
    },

    portal(t) {
        const { c, mapData, objDef, r, wx, wz } = t;
        const portalGeo = new THREE.CylinderGeometry(0.8, 0.8, 2.5, 16);
        const portalMat = new THREE.MeshBasicMaterial({ color: objDef.color ? parseInt(objDef.color.slice(1), 16) : 0x38bdf8, wireframe: true });
        const portalMesh = new THREE.Mesh(portalGeo, portalMat);
        portalMesh.position.set(wx, 1.25, wz);
        this.scene.add(portalMesh);
        this.portals.push({ x: wx, z: wz, radius: 1.2, mesh: portalMesh, link: { ...objDef, nextMap: objDef.nextMap ?? mapData.nextMap, ...mapData.links?.[`${c},${r}`] } });
    },
};
