// タイルの種類ごとの描画（床・水・橋など、地面の種類）。GameEngine.loadMapBody が、マスの物体の種類（objDef.type）に応じて呼ぶ。
// 各メソッドは `this` が GameEngine（呼び出し側が .call(this, t) で渡す）。t は、そのマスの情報（tileContext: r・c・char・wx・wz・objDef・liftH・mapData・rows・cols・tileSize・wallH ほか）。
// 元は game.js の loadMapBody の switch の case。移しただけで、描画の中身は同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

export const tilesFloors = {
    floor_tile(t) {
        const { objDef, tileSize, wallH, wx, wz } = t;
        // Ground-level custom floor tile
        const tileMat = this.makeLitMaterial(objDef.texture, this.textures[objDef.texture] || this.textures.sand);
        if (objDef.elevation > 0) {
            // 高さのある床（階段状の高台）: 上面の高さが elevation の箱。歩いて上れる（壁ではない）
            const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(tileSize, objDef.elevation, tileSize), tileMat);
            stepMesh.position.set(wx, objDef.elevation / 2, wz);
            this.addStatic(stepMesh);
            this.raisedFloors.push({
                minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
                height: objDef.elevation
            });
        } else {
        const tileGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        const tileMesh = new THREE.Mesh(tileGeo, tileMat);
        tileMesh.rotation.x = -Math.PI / 2;
        // Wood bridge and paths are slightly raised above water/grass
        const elev = (objDef.texture === 'woodBridge') ? 0.04 : 0.01;
        tileMesh.position.set(wx, elev, wz);
        this.addStatic(tileMesh);
        }
        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);   // 屋内の床は天井もつける

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
    },

    sea_tile(t) {
        const { c, r } = t;
        // 海: 1 マスずつは描かない（大量になるため）。buildSea が、水面 1 枚と、当たり判定を作る
        this.seaCells.push([r, c]);
    },

    bridge_deck(t) {
        const { c, objDef, r, tileSize, waterMap, wx, wz } = t;
        // 吊橋: 薄い板の床（側面も、下の面もない。下に、谷の底が見える）と、橋の縁に沿った、ロープの手すり・支柱。
        //   床の高さは、heights（objDef.lift で、このマスの高さまで持ち上がる）。歩く・段差の判定は、高さの仕組みのまま
        const deckMat = this.makeLitMaterial(objDef.texture, this.textures[objDef.texture] || this.textures.sand);
        const thick = 0.16;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(tileSize, thick, tileSize), deckMat);
        deck.position.set(wx, 0.02 - thick / 2, wz);
        this.addStatic(deck);
        const isBridge = (rr, cc) => this.bridgeCells.has(`${rr},${cc}`);
        const ropeMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3b });
        const postMat = new THREE.MeshLambertMaterial({ map: this.textures.woodWall });
        // 手すり（ロープ 2 本）と支柱は、橋の脇（隣が、橋の床より 2 段以上低い谷）の縁だけに立てる。
        //   橋の端（隣が、同じ高さの地面）は、出入り口なので、塞がない
        const deckLv = this.heightLevelAtTile(r, c);
        // waterBelow: 橋の下に水の面（川）を置く。railOnWater: 手すりは、隣が水のマス（橋の脇）だけ
        if (objDef.waterBelow) {
            const under = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), new THREE.MeshLambertMaterial({ map: this.textures.water }));
            under.rotation.x = -Math.PI / 2;
            under.position.set(wx, -0.2, wz);
            this.scene.add(under);
            this.waterMeshes.push(under);
        }
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (isBridge(r + dr, c + dc)) continue;
            if (objDef.railOnWater) { if (!waterMap[r + dr]?.[c + dc]) continue; }
            else if (this.heightLevelAtTile(r + dr, c + dc) > deckLv - 2) continue;
            const ex = wx + dc * tileSize / 2, ez = wz + dr * tileSize / 2;
            const alongX = dr !== 0;   // 北・南の縁は、x 方向に伸びる
            if (objDef.railStyle === 'stone') {   // 石の橋: ロープと支柱の代わりに、石の欄干（低い壁）を縁に沿って置く
                const parapet = new THREE.Mesh(new THREE.BoxGeometry(alongX ? tileSize : 0.34, 0.8, alongX ? 0.34 : tileSize), this.makeLitMaterial('cityWall', this.textures.cityWall));
                parapet.position.set(ex, 0.4, ez);
                this.addStatic(parapet);
                continue;
            }
            for (const y of [1.05, 0.55]) {
                const rope = new THREE.Mesh(new THREE.BoxGeometry(alongX ? tileSize : 0.07, 0.07, alongX ? 0.07 : tileSize), ropeMat);
                rope.position.set(ex, y, ez);
                this.addStatic(rope);
            }
            // 支柱: 縁の始まり（西・北）に必ず。終わり（東・南）は、縁が続かないときだけ（隣のマスの始まりと、重ねない）
            const nextCell = alongX ? isBridge(r, c + 1) && !isBridge(r + dr, c + 1) : isBridge(r + 1, c) && !isBridge(r + 1, c + dc);
            for (const end of nextCell ? [-1] : [-1, 1]) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.16), postMat);
                post.position.set(alongX ? ex + end * tileSize / 2 : ex, 0.65, alongX ? ez : ez + end * tileSize / 2);
                this.addStatic(post);
            }
        }
        this.terrainGrid.push({
            minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
            minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
            depth: 0, slowdown: 1.0, speedBonus: 1.0, friction: objDef.friction, mpRegenBonus: 0, isWater: false
        });
    },

    liquid_tile(t) {
        const { c, cols, objDef, r, rows, tileSize, waterMap, wx, wz } = t;
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
            const isNeighborWater = (nr >= 0 && nr < rows && nc >= 0 && nc < cols) ? waterMap[nr][nc] : this.waterAcrossEdge(nr, nc, rows, cols);   // マップの外の隣は、隣のマップのマスで判定する（水が境をこえて続くとき、境に土手を立てない）
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
            emissive: isLava ? 0xff2200 : (isPoison ? 0x220533 : (objDef.glow ? new THREE.Color(objDef.glow).getHex() : 0x000000)),
            emissiveIntensity: isLava ? 0.85 : (objDef.glow ? 0.9 : 0.3)   // glow: 水面が、自ら光る（洞窟の地底湖）
        });
        const waterGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        const waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterMesh.rotation.x = -Math.PI / 2;
        waterMesh.position.set(wx, waterSurfaceY, wz);
        this.scene.add(waterMesh);
        this.waterMeshes.push(waterMesh);

        // If lava, add rising 3D heat wisps/smoke
        // （溶岩 1 マスごとの点光源は置かない: 火山では 566 個になり、GPU の上限を超えて、地面などの材質が描画されなくなるため）
        if (isLava) {

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
            current: objDef.current ? { x: objDef.current[0], z: objDef.current[1], speed: objDef.currentSpeed ?? 3 } : null,   // 急流: 乗ると、この向きへ流される
            isWater: true
        });
    },
};
