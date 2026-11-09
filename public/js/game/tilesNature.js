// タイルの種類ごとの描画（木・岩・草・立て札・噴水・家具・宝箱など、置き物）。GameEngine.loadMapBody が、マスの物体の種類（objDef.type）に応じて呼ぶ。
// 各メソッドは `this` が GameEngine（呼び出し側が .call(this, t) で渡す）。t は、そのマスの情報（tileContext: r・c・char・wx・wz・objDef・liftH・mapData・rows・cols・tileSize・wallH ほか）。
// 元は game.js の loadMapBody の switch の case。移しただけで、描画の中身は同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { Monster } from '/js/entities.js';
import { TREE_SHADOWS, TREE_SHADOW_OPACITY, TREE_SHADOW_SCALE } from '/js/game/constants.js';

export const tilesNature = {
    tree(t) {
        const { c, liftH, mapData, objDef, r, wx, wz } = t;
        // 木のスプライト。同じ画像の材質（遠い木＝切り抜き・近い木＝なめらか）と、足元の影は、全部の木で共有する（森は、木が大量になるため）
        this.treeMats = this.treeMats || new Map();
        const texKey = objDef.texture;
        if (!this.treeMats.has(texKey)) {
            const tx = this.textures[texKey] || this.textures.tree;
            this.treeMats.set(texKey, {
                far: new THREE.SpriteMaterial({ map: tx, transparent: false, alphaTest: 0.4 }),   // 遠い木: 切り抜き。透明な画素が奥行きを書いて、奥の壁の木を四角く隠すのを防ぐ
                near: new THREE.SpriteMaterial({ map: tx, alphaTest: 0.05 })                                   // 近い木: 従来の（なめらかな）描画
            });
        }
        const { far: treeMat, near: treeMatNear } = this.treeMats.get(texKey);
        const tree = new THREE.Sprite(treeMat);
        tree.center.set(0.5, 0.0);
        const baseH = objDef.height ?? 4.8;   // 木の高さ（省略時は標準の木）。ばらつきは、高さに比例
        const scaleVar = objDef.fixedHeight ? baseH : baseH + ((r * 5 + c * 3) % 4) * 0.5 * (baseH / 4.8);   // fixedHeight: 1 本だけの特別な木（世界樹）は、高さをばらつかせない
        tree.scale.set(scaleVar * (objDef.aspect ?? (899 / 893)), scaleVar, 1);   // aspect: 画像の幅/高さ（省略時は標準の木）
        // Sink tree base slightly into grass (-0.08) so trunk roots naturally penetrate the terrain
        tree.position.set(wx, -0.08, wz);
        this.scene.add(tree);
        tree.updateMatrix(); tree.matrixAutoUpdate = false;   // 動かない: 毎フレームの行列の計算をしない

        // Ground contact shadow under the tree trunk（1 つの影の材質・形を共有）。
        //   noShadow: true の木（2 倍・3 倍の大きな木）は、影を置かない（起伏のある地面で、大きな影の板が、隣の高いマスに埋まって、三角形などの欠けた形に見えるため。木の数が多い森が、軽くなる）
        let shadowMesh = null;
        if (TREE_SHADOWS && !objDef.noShadow) {
            if (!this.treeShadowMat) {
                const shadowCanvas = document.createElement('canvas');
                shadowCanvas.width = 32;
                shadowCanvas.height = 32;
                const sCtx = shadowCanvas.getContext('2d');
                const grad = sCtx.createRadialGradient(16, 16, 2, 16, 16, 16);
                grad.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
                grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.6)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                sCtx.fillStyle = grad;
                sCtx.fillRect(0, 0, 32, 32);
                this.treeShadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false });
                this.treeShadowGeo = new THREE.PlaneGeometry(3.2, 3.2);
            }
            this.treeShadowMat.opacity = (TREE_SHADOW_OPACITY[mapData.environment?.floorType] ?? 1) * TREE_SHADOW_SCALE;   // 全部の木で共有する材質: 開いたマップの地面に合わせる
            shadowMesh = new THREE.Mesh(this.treeShadowGeo, this.treeShadowMat);
            shadowMesh.rotation.x = -Math.PI / 2;
            const shadowK = Math.min(3, Math.max(1, baseH / 5.2));
            shadowMesh.scale.set(shadowK, shadowK, 1);
            shadowMesh.position.set(wx, 0.012, wz);
            shadowMesh.updateMatrix();   // シーンには置かない（buildCullChunks が、区画ごとの InstancedMesh にまとめる）。マップの高さの持ち上げ（scene.add の差し替え）は、ここで自分で反映する
            shadowMesh.position.y += liftH;   // 木（tree）は、LIFT_TYPES なので、高低差のあるマスで持ち上げる
            shadowMesh.updateMatrix();
        }
        this.treeSprites.push({ sprite: tree, shadow: shadowMesh, far: treeMat, near: treeMatNear, vis: true });
        if (objDef.solid) {
            const half = objDef.colliderHalf ?? 0.6;   // 幹の当たり判定の半幅（大きな木ほど、太い）
            this.colliders.push({
                minX: wx - half, maxX: wx + half,
                minZ: wz - half, maxZ: wz + half
            });
        }
    },

    boulder(t) {
        const { objDef, wx, wz } = t;
        // Mossy natural boulder sprite with ground shadow & projectile blocking
        const boulderMat = new THREE.SpriteMaterial({ map: this.textures[objDef.texture] || this.textures.boulder });
        const boulder = new THREE.Sprite(boulderMat);
        boulder.center.set(0.5, 0.0);
        const bScale = objDef.scale || [2.6, 2.0, 1.0];
        boulder.scale.set(bScale[0], bScale[1], bScale[2]);
        boulder.position.set(wx, -0.05, wz);
        this.scene.add(boulder);

        // Ground contact shadow
        const shadowCanvas = document.createElement('canvas');
        shadowCanvas.width = 32; shadowCanvas.height = 32;
        const sCtx = shadowCanvas.getContext('2d');
        const grad = sCtx.createRadialGradient(16, 16, 3, 16, 16, 16);
        grad.addColorStop(0, 'rgba(15, 25, 15, 0.65)');
        grad.addColorStop(0.6, 'rgba(10, 20, 10, 0.3)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sCtx.fillStyle = grad;
        sCtx.fillRect(0, 0, 32, 32);

        const shadowTex = new THREE.CanvasTexture(shadowCanvas);
        const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
        const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), shadowMat);
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.position.set(wx, 0.012, wz);
        this.scene.add(shadowMesh);

        if (objDef.solid) {
            const rad = objDef.radius || 0.85;
            this.colliders.push({
                minX: wx - rad, maxX: wx + rad,
                minZ: wz - rad, maxZ: wz + rad,
                blocksProjectiles: objDef.blocksProjectiles !== false
            });
        }
    },

    signpost(t) {
        const { c, mapData, objDef, r, visEnv, wx, wz } = t;
        this.visualSignpost(objDef, wx, wz, visEnv);

        if (objDef.solid) {
            const rad = objDef.radius || 0.5;
            this.colliders.push({
                minX: wx - rad, maxX: wx + rad,
                minZ: wz - rad, maxZ: wz + rad,
                blocksProjectiles: false
            });
        }

        // Store signpost interaction
        const signMsg = mapData.signs?.[`${c},${r}`] ?? objDef.message;   // マスごとの文章（マップの signs。街道の道しるべ）があれば、そちら
        if (signMsg) {
            this.signposts = this.signposts || [];
            this.signposts.push({
                x: wx, z: wz, message: signMsg, radius: 2.2, triggered: false
            });
        }
    },

    monster(t) {
        const { objDef, wx, wz } = t;
        const m = new Monster(objDef.monsterId || 'S', wx, wz, this.textures);
        this.monsters.push(m);
        this.scene.add(m.sprite);
    },

    fountain(t) {
        const { objDef, tileSize, wx, wz } = t;
        // European Plaza Fountain: stone basin with sparkling water & center water spire
        const basinMat = new THREE.MeshLambertMaterial({ map: this.textures.cityWall });
        const waterMat = new THREE.MeshLambertMaterial({
            map: this.textures.fountainWater,
            transparent: true,
            opacity: 0.88
        });

        // Hexagonal/Cylindrical stone pool rim
        const rimGeo = new THREE.CylinderGeometry(tileSize * 0.44, tileSize * 0.46, 0.5, 12, 1, true);
        const rimMesh = new THREE.Mesh(rimGeo, basinMat);
        rimMesh.position.set(wx, 0.25, wz);
        this.scene.add(rimMesh);

        // Water surface inside fountain
        const poolWaterGeo = new THREE.CircleGeometry(tileSize * 0.43, 12);
        const poolWater = new THREE.Mesh(poolWaterGeo, waterMat);
        poolWater.rotation.x = -Math.PI / 2;
        poolWater.position.set(wx, 0.38, wz);
        this.scene.add(poolWater);
        this.waterMeshes.push(poolWater);

        // Center ornamental stone spout pillar
        const centerGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.3, 8);
        const centerMesh = new THREE.Mesh(centerGeo, basinMat);
        centerMesh.position.set(wx, 0.65, wz);
        this.scene.add(centerMesh);

        // Track active fountain for water spurting particles & player splash interaction
        this.fountains.push({
            x: wx,
            z: wz,
            topY: 1.3,
            surfaceY: 0.38,
            radius: tileSize * 0.45,
            splashCooldown: 0
        });

        if (objDef.solid) {
            const rad = tileSize * 0.45;
            this.colliders.push({
                minX: wx - rad, maxX: wx + rad,
                minZ: wz - rad, maxZ: wz + rad,
                blocksProjectiles: false
            });
        }
    },

    chest(t) {
        const { c, objDef, r, wx, wz } = t;
        // Antique Treasure Chest (or Mimic Monster in disguise)
        const chestGroup = new THREE.Group();
        const chestMat = new THREE.MeshLambertMaterial({ map: this.textures.chest });

        const chestW = 1.3;
        const chestH = 0.85;
        const chestD = 0.95;

        // Chest Lower Base Box
        const baseGeo = new THREE.BoxGeometry(chestW, chestH * 0.6, chestD);
        const baseMesh = new THREE.Mesh(baseGeo, chestMat);
        baseMesh.position.set(0, (chestH * 0.6) / 2, 0);
        chestGroup.add(baseMesh);

        // Chest Lid with Hinge Pivot at Back (-Z)
        const lidPivot = new THREE.Group();
        lidPivot.position.set(0, chestH * 0.6, -chestD / 2); // Hinge line

        const lidGeo = new THREE.BoxGeometry(chestW * 1.02, chestH * 0.42, chestD * 1.02);
        const lidMesh = new THREE.Mesh(lidGeo, chestMat);
        lidMesh.position.set(0, (chestH * 0.42) / 2, chestD / 2); // Center lid on pivot
        lidPivot.add(lidMesh);
        chestGroup.add(lidPivot);

        // Subtle gold lock cube on front
        const lockGeo = new THREE.BoxGeometry(0.22, 0.22, 0.08);
        const lockMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
        const lockMesh = new THREE.Mesh(lockGeo, lockMat);
        lockMesh.position.set(0, (chestH * 0.6) / 2, chestD / 2 + 0.04);
        chestGroup.add(lockMesh);

        // Chest subtle ground shadow
        const cShadowMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55 });
        const cShadow = new THREE.Mesh(new THREE.PlaneGeometry(chestW * 1.3, chestD * 1.3), cShadowMat);
        cShadow.rotation.x = -Math.PI / 2;
        cShadow.position.set(0, 0.015, 0);
        chestGroup.add(cShadow);

        chestGroup.position.set(wx, 0, wz);
        this.scene.add(chestGroup);

        const chestObj = {
            floorY: this.heightLevelAtTile(r, c) * this.heightStep,   // 置かれている床の高さ（高台の宝箱を、下から開けないように）
            group: chestGroup,
            lidPivot: lidPivot,
            baseMesh: baseMesh,
            x: wx,
            z: wz,
            isMimic: !!objDef.isMimic,
            isOpen: false,
            targetLidAngle: 0, // 0 = closed, -Math.PI * 0.55 = open
            currentLidAngle: 0,
            respawnTimer: 0,
            respawnDuration: objDef.respawnTime || 120, // default 120s
            lootTable: objDef.lootTable || [
                { type: 'gold', min: 30, max: 80, name: 'ゴールド' }
            ],
            radius: objDef.radius || 1.4
        };
        this.chests.push(chestObj);

        if (objDef.solid) {
            const rad = 0.7;
            const collider = {
                minX: wx - rad, maxX: wx + rad,
                minZ: wz - rad, maxZ: wz + rad,
                blocksProjectiles: true
            };
            chestObj.collider = collider;
            this.colliders.push(collider);
        }
    },

    furniture(t) {
        const { c, mapData, objDef, r, tileSize, visEnv, wallH, wx, wz } = t;
        const { fOffX, fOffZ, fCw, fCd } = this.visualFurniture(objDef, wx, wz, r, c, visEnv);
        const furnitureFloor = objDef.floorTexture ?? mapData.decorFloor;   // 屋外の街では、飾りの下も石畳（map の decorFloor）
        if (furnitureFloor && !objDef.waterBelow) this.addFloorTile(wx, wz, tileSize, furnitureFloor);
        if (objDef.ceilingTexture) this.addCeilingTile(wx, wz, tileSize, wallH, objDef.ceilingTexture);
        if (objDef.collider) {
            const cw = fCw, cd = fCd;
            const ox = fOffX, oz = fOffZ;
            this.colliders.push({
                minX: wx + ox - cw / 2, maxX: wx + ox + cw / 2,
                minZ: wz + oz - cd / 2, maxZ: wz + oz + cd / 2,
                blocksProjectiles: objDef.blocksProjectiles === true
            });
        }
    },

    plant(t) {
        const { c, mapData, objDef, r, tileSize, wx, wz } = t;
        // 草むら・生い茂る草・野の花: 当たり判定のない見た目だけの飾り。
        // 1 マスに count 枚のスプライトを、マスの位置から決まる配置（毎回同じ）で散らす
        if (mapData.decorFloor) this.addFloorTile(wx, wz, tileSize, mapData.decorFloor);
        const plantTex = this.textures[objDef.texture] || this.textures.fMeadowGrass;
        const count = objDef.count || 4;
        const spread = objDef.spread || tileSize * 0.8;
        const [pw, ph] = objDef.scale || [1.2, 1.0];
        for (let i = 0; i < count; i++) {
            const h1 = Math.sin((r * 12.9898 + c * 78.233 + i * 37.719) * 43758.5453) * 43758.5453;
            const h2 = Math.sin((r * 39.346 + c * 11.135 + i * 83.155) * 24634.6345) * 24634.6345;
            const fx = h1 - Math.floor(h1);
            const fz = h2 - Math.floor(h2);
            // 同じ画像の草は、材質を共有する（草が大量になるため。1 枚ごとに作ると、重い）
            this.plantMats = this.plantMats || new Map();
            if (!this.plantMats.has(plantTex)) this.plantMats.set(plantTex, new THREE.SpriteMaterial({ map: plantTex }));
            const sprite = new THREE.Sprite(this.plantMats.get(plantTex));
            sprite.center.set(0.5, 0.0);
            const k = 0.8 + fx * 0.5;   // 大きさのばらつき
            sprite.scale.set(pw * k, ph * k, 1);
            sprite.position.set(wx + (fx - 0.5) * spread, -0.02, wz + (fz - 0.5) * spread);
            this.scene.add(sprite);
            sprite.updateMatrix(); sprite.matrixAutoUpdate = false;   // 動かない
            this.cullSprites.push(sprite);
        }
    },
};
