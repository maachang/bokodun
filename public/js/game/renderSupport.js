// 描画の補助（材質・テクスチャ・床と天井・影・遠くの隠し・静止物のまとめ・環境の切り替え）。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { TREE_SHADOW_OPACITY, CULL_CHUNK } from '/js/game/constants.js';

export const renderSupportMethods = {
    // シーンの子をすべて取り除き、照明とカメラだけを入れ直す。
    // カメラは、カメラに取り付けた画面上のエフェクト（斬撃）を描画するために、シーンに入っている必要がある
    resetScene() {
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
        this.scene.add(this.ambientLight);
        this.scene.add(this.dirLight);
        this.scene.add(this.camera);
    },

    // 地面の種類から、地面のテクスチャを返す
    floorTextureOf(floorType) {
        if (floorType === 'grass') return this.textures.grass;
        if (floorType === 'sand') return this.textures.sand;
        if (floorType === 'desert') return this.textures.desertSand;
        if (floorType === 'water') return this.textures.water;
        if (floorType === 'swamp') return this.textures.swampGround;
        if (floorType === 'snow') return this.textures.snowGround;
        if (floorType === 'forest') return this.textures.forestGround;
        if (floorType === 'rock') return this.textures.rockGround;
        if (floorType === 'whiteSand') return this.textures.whiteSand;
        if (floorType === 'dryGrass') return this.textures.dryGrassGround;
        if (floorType === 'tundra') return this.textures.tundraGround;
        if (floorType === 'redEarth') return this.textures.redEarthGround;
        if (floorType === 'ash') return this.textures.ashGround;
        if (floorType === 'ice') return this.textures.ice;
        return this.textures.floorStone;
    },

    // 今の空・霧・光の色を控える（端の移動で、色を滑らかに切り替えるため）
    snapshotEnv() {
        const fog = this.scene.fog;
        return {
            ambient: this.ambientLight.color.clone(),
            dir: this.dirLight.color.clone(),
            fogColor: fog ? fog.color.clone() : new THREE.Color(0),
            fogNear: fog ? fog.near : 10,
            fogFar: fog ? fog.far : 50,
            sky: this.scene.background?.isColor ? this.scene.background.clone() : new THREE.Color(0)
        };
    },

    // 色の切り替えを、k（0〜1）の分だけ進める
    applyEnvBlend(k) {
        const b = this.envBlend;
        if (!b) return;
        this.ambientLight.color.copy(b.from.ambient).lerp(b.to.ambient, k);
        this.dirLight.color.copy(b.from.dir).lerp(b.to.dir, k);
        this.scene.fog.color.copy(b.from.fogColor).lerp(b.to.fogColor, k);
        this.scene.fog.near = b.from.fogNear + (b.to.fogNear - b.from.fogNear) * k;
        this.scene.fog.far = b.from.fogFar + (b.to.fogFar - b.from.fogFar) * k;
        this.scene.background = b.from.sky.clone().lerp(b.to.sky, k);
        this.fitCameraFar();
    },

    // 霧で見えなくなる距離より先は描画しない（カメラの描画距離を霧の終わりに合わせる。CPU 負荷の軽減）
    fitCameraFar() {
        // 高い所（山の上）では、低い地面（下に見える海・低地）が、霧の終わりより遠くにあり、描画距離で切れて、空が見える（地面に穴が空いたように見える）。
        //   そこで、目の高さ（地面からの高さ）ぶんだけ、描画距離をのばす（霧は同じなので、遠くは霧の色に溶ける）
        const boost = Math.min(450, Math.max(0, (this.camera.position.y - 6) * 50));
        const far = Math.min(100, (this.scene.fog?.far ?? 96) + 4) + boost;
        if (Math.abs(this.camera.far - far) < 3) return;
        this.camera.far = far;
        this.camera.updateProjectionMatrix();
    },

    // 屋内の床（板張りなど）を 1 マス分敷く
    // 大理石（marble〜）のテクスチャは、白く見えるように、少し自ら光らせる（照明が弱い面・影の面でも灰色にならない）
    makeLitMaterial(textureKey, texture) {
        const glow = typeof textureKey === 'string' && textureKey.startsWith('marble');
        return new THREE.MeshLambertMaterial(glow ? { map: texture, emissive: 0x92928c } : { map: texture });
    },

    // 丸いぼかしの光（中心が明るく、外へ消える）のテクスチャ。松明の光だまり・光の輪に使う（1 回だけ作る）
    getGlowTexture() {
        if (!this.glowTexture) {
            const cv = document.createElement('canvas');
            cv.width = cv.height = 128;
            const g = cv.getContext('2d');
            const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grad;
            g.fillRect(0, 0, 128, 128);
            this.glowTexture = new THREE.CanvasTexture(cv);
        }
        return this.glowTexture;
    },

    // オブジェクトの画像（objects.json の imageFile。/images/objects/ 以下）のテクスチャ。同じ画像は1回だけ読み込む
    getObjectImageTexture(file) {
        this.objectImageTextures = this.objectImageTextures || {};
        if (!this.objectImageTextures[file]) {
            const tex = new THREE.TextureLoader().load(`/images/objects/${file}`);
            tex.colorSpace = THREE.SRGBColorSpace;   // 写実的な絵なので、色をそのまま出す
            this.objectImageTextures[file] = tex;
        }
        return this.objectImageTextures[file];
    },

    addFloorTile(wx, wz, tileSize, textureKey) {
        const mat = this.makeLitMaterial(textureKey, this.textures[textureKey] || this.textures.sand);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(wx, 0.03, wz);   // 全体の床（0）と同じ平面だと、ちらつく（z-fighting）ので、少し上げる
        this.addStatic(mesh);
    },

    // 動かない部品として、シーンに足す（あとで mergeStaticMeshes が、材質ごとにまとめる）。
    //   動くもの（扉・罠・水・敵・宝箱など）には使わない
    addStatic(obj) {
        obj.userData.static = true;
        this.scene.add(obj);
    },

    // 屋内の天井を 1 マス分張る（壁の高さ。下から見える向き）
    addCeilingTile(wx, wz, tileSize, wallH, textureKey) {
        const mat = this.makeLitMaterial(textureKey, this.textures[textureKey] || this.textures.brick);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), mat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(wx, wallH - 0.05, wz);   // 全体の天井（wallH）と同じ平面だと、動くたびにちらつく（z-fighting）ので、少し下げる
        this.addStatic(mesh);
    },

    // addStatic で足した部品（グループの中の部品も）を、同じ材質ごとに、1つのメッシュにまとめる。
    //   1マスごとに別々のメッシュだと、描画の命令が1フレームに数百〜千回を超え、CPU が重くなる。見た目は変わらない。
    //   半透明な材質・配列の材質は、描画の順番が崩れるので、まとめずに、そのまま残す
    // 地面の影（groundShadowItems）を、InstancedMesh にまとめる（描画の命令は、丸い影 1 回・壁の足元の帯 1 回）。
    //   濃さは、木の影と同じく、地面の種類（TREE_SHADOW_OPACITY）で変える。マップを作り終えたあとに呼ぶ
    buildGroundShadows(tileSize) {
        const { round, edges } = this.groundShadowItems || { round: [], edges: [] };
        if (!round.length && !edges.length) return;
        const opacity = TREE_SHADOW_OPACITY[this.mapData?.environment?.floorType] ?? 1;
        const dummy = new THREE.Object3D();
        dummy.rotation.order = 'YXZ';
        const make = (geo, tex, items, place) => {
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
            const inst = new THREE.InstancedMesh(geo, mat, items.length);
            items.forEach((it, i) => { place(it); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
            inst.instanceMatrix.needsUpdate = true;
            inst.matrixAutoUpdate = false;
            inst.frustumCulled = false;   // マップ全体で 1 つ（範囲が広い）。数が少ないので、常に描く
            this.scene.add(inst);
        };
        const gradTex = (draw) => {
            const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
            draw(cv.getContext('2d'));
            return new THREE.CanvasTexture(cv);
        };
        if (round.length) {
            const tex = gradTex(ctx => {
                const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
                g.addColorStop(0, 'rgba(0, 0, 0, 0.9)'); g.addColorStop(0.55, 'rgba(0, 0, 0, 0.6)'); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
            });
            make(new THREE.PlaneGeometry(1, 1), tex, round, (it) => {
                dummy.position.set(it.x, it.y + 0.012, it.z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(it.d, it.d, 1);
            });
        }
        if (edges.length) {
            // 壁に接する側（画像の上）が濃く、外へ向かって薄くなる帯
            const tex = gradTex(ctx => {
                const g = ctx.createLinearGradient(0, 0, 0, 32);
                g.addColorStop(0, 'rgba(0, 0, 0, 0.65)'); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
            });
            const depth = tileSize * 0.7;
            make(new THREE.PlaneGeometry(1, 1), tex, edges, (it) => {
                dummy.position.set(it.x + it.ox * depth / 2, it.y + 0.02, it.z + it.oz * depth / 2);
                dummy.rotation.set(-Math.PI / 2, Math.atan2(it.ox, it.oz), 0);   // 画像の上（濃い側）を、壁へ向ける
                dummy.scale.set(tileSize, depth, 1);
            });
        }
    },

    // 木・草・花の板を、区画（CULL_CHUNK）ごとの Group にまとめる。マップを作り終えたあとに呼ぶ
    buildCullChunks() {
        const CH = CULL_CHUNK, chunks = new Map();
        const chunkAt = (x, z) => {
            const kx = Math.floor(x / CH), kz = Math.floor(z / CH), key = kx * 4096 + kz;
            let c = chunks.get(key);
            if (!c) {
                c = { group: new THREE.Group(), mx: (kx + 0.5) * CH, mz: (kz + 0.5) * CH, sprites: [], trees: [], mode: -1, hasNear: false };
                this.scene.add(c.group); chunks.set(key, c);
            }
            return c;
        };
        for (const t of this.treeSprites || []) {
            const c = chunkAt(t.sprite.position.x, t.sprite.position.z);
            c.group.add(t.sprite);
            c.trees.push(t);
        }
        // 木の影: 区画ごとに、1 つの InstancedMesh にまとめる（1 枚ずつ別メッシュだと、影の枚数だけ描画の命令が増える）。
        //   影の板（t.shadow）は、位置・大きさを持つだけの部品として使い、シーンには置かない。霧の境の 1 枚ずつの表示切替はしない（区画ごと）
        for (const c of chunks.values()) {
            const withShadow = c.trees.filter(t => t.shadow);
            if (!withShadow.length) continue;
            const inst = new THREE.InstancedMesh(this.treeShadowGeo, this.treeShadowMat, withShadow.length);
            withShadow.forEach((t, i) => inst.setMatrixAt(i, t.shadow.matrix));
            inst.instanceMatrix.needsUpdate = true;
            inst.matrixAutoUpdate = false;
            c.group.add(inst);
        }
        for (const sp of this.cullSprites || []) {
            const c = chunkAt(sp.position.x, sp.position.z);
            c.group.add(sp); c.sprites.push(sp);
        }
        this.cullChunks = [...chunks.values()];
        this._cullDirty = true;
    },

    // 区画ごとに、遠い区画は隠し、近い区画は見せる。境の区画だけ、1 枚ずつ距離を測る。近い木は、材質を切り替える（ヒステリシスつき）。プレイヤーが 1 以上動いたとき・霧が変わったときだけ
    updateCullChunks() {
        const chunks = this.cullChunks; if (!chunks?.length) return;
        const p = this.player;
        const cullD2 = this.scene.fog ? (this.scene.fog.far * 1.1) ** 2 : Infinity;
        if (!this._cullDirty && Math.abs(p.x - this._cullX) + Math.abs(p.z - this._cullZ) < 1 && cullD2 === this._cullD2) return;
        this._cullX = p.x; this._cullZ = p.z; this._cullD2 = cullD2; this._cullDirty = false;
        const RR = CULL_CHUNK * 0.7072;
        for (const c of chunks) {
            const d = Math.hypot(c.mx - p.x, c.mz - p.z), dmin = Math.max(0, d - RR), dmax = d + RR;
            if (dmin * dmin >= cullD2) {   // 区画ぜんぶが、霧の向こう
                if (c.group.visible) c.group.visible = false;
                c.mode = 0;
            } else {
                if (!c.group.visible) c.group.visible = true;
                if (dmax * dmax < cullD2) {   // 区画ぜんぶが、見える
                    if (c.mode !== 2) {
                        for (const t of c.trees) { t.vis = true; t.sprite.visible = true; if (t.shadow) t.shadow.visible = true; }
                        for (const sp of c.sprites) sp.visible = true;
                        c.mode = 2;
                    }
                } else {   // 霧の境にかかる区画: 1 枚ずつ
                    for (const t of c.trees) {
                        const dx = t.sprite.position.x - p.x, dz = t.sprite.position.z - p.z, vis = dx * dx + dz * dz < cullD2;
                        if (vis !== t.vis) { t.vis = vis; t.sprite.visible = vis; if (t.shadow) t.shadow.visible = vis; }
                    }
                    for (const sp of c.sprites) {
                        const dx = sp.position.x - p.x, dz = sp.position.z - p.z, vis = dx * dx + dz * dz < cullD2;
                        if (vis !== sp.visible) sp.visible = vis;
                    }
                    c.mode = 1;
                }
            }
            // 近い木は従来の（なめらかな）材質、遠い木は切り抜き（遠景で、壁の木と重なると四角く欠けるため）。境目で、ちらつかないよう、ヒステリシスをつける（距離は暫定）
            if (dmin < 44) {
                for (const t of c.trees) {
                    const dx = t.sprite.position.x - p.x, dz = t.sprite.position.z - p.z, d2 = dx * dx + dz * dz;
                    const wantNear = t.isNear ? d2 < 42 * 42 : d2 < 40 * 40;
                    if (wantNear !== t.isNear) { t.isNear = wantNear; t.sprite.material = wantNear ? t.near : t.far; }
                }
                c.hasNear = true;
            } else if (c.hasNear) {   // 遠くへ出た区画: 木を遠い材質に戻す
                for (const t of c.trees) if (t.isNear) { t.isNear = false; t.sprite.material = t.far; }
                c.hasNear = false;
            }
        }
    },

    mergeStaticMeshes() {
        const meshes = [];
        const groups = [];
        for (const obj of [...this.scene.children]) {
            if (!obj.userData?.static) continue;
            if (obj.isMesh) meshes.push(obj);
            else if (obj.isGroup) { groups.push(obj); obj.traverse(o => { if (o.isMesh) meshes.push(o); }); }
        }
        const buckets = new Map();
        for (const mesh of meshes) {
            const m = mesh.material;
            if (!m || Array.isArray(m) || (m.transparent && !(m.alphaTest > 0))) continue;   // 半透明は、描画の順番が崩れるので、まとめない（切り抜き: alphaTest つきは、まとめてよい）
            const key = [m.type, m.map?.uuid, m.color?.getHex(), m.emissive?.getHex?.(), m.side, m.opacity, m.alphaTest, m.depthWrite, m.wireframe].join('|');
            if (!buckets.has(key)) buckets.set(key, { material: m, items: [] });
            buckets.get(key).items.push(mesh);
        }
        for (const { material, items } of buckets.values()) {
            const pos = [], nor = [], uv = [];
            for (const mesh of items) {
                mesh.updateWorldMatrix(true, false);
                let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
                g.applyMatrix4(mesh.matrixWorld);
                pos.push(g.attributes.position.array);
                nor.push(g.attributes.normal.array);
                uv.push(g.attributes.uv.array);
                g.dispose();
            }
            const cat = (arrs) => { const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(cat(pos), 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(cat(nor), 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(cat(uv), 2));
            const merged = new THREE.Mesh(geo, material);
            this.scene.add(merged);
            for (const mesh of items) mesh.removeFromParent();
        }
        for (const g of groups) if (g.children.length === 0) g.removeFromParent();
    },

    applyTexture(target, texture) {
        if (target === 'wall') {
            this.textures.brick = texture;
            this.textures.rock = texture;
            // シーン内の壁メッシュのマテリアルを更新
            this.scene.traverse((obj) => {
                if (obj.isMesh && obj.geometry.type === 'BoxGeometry') {
                    obj.material.map = texture;
                    obj.material.needsUpdate = true;
                }
            });
        } else if (target === 'floor') {
            this.textures.floorStone = texture;
            this.textures.grass = texture;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(16, 16);
            this.scene.traverse((obj) => {
                if (obj.isMesh && obj.geometry.type === 'PlaneGeometry') {
                    obj.material.map = texture;
                    obj.material.needsUpdate = true;
                }
            });
        } else if (target === 'slime') {
            this.textures.slime = texture;
            for (const m of this.monsters) {
                if (m.type === 'S') {
                    m.spriteMat.map = texture;
                    m.spriteMat.needsUpdate = true;
                }
            }
        } else if (target === 'goblin') {
            this.textures.goblin = texture;
            for (const m of this.monsters) {
                if (m.type === 'G') {
                    m.spriteMat.map = texture;
                    m.spriteMat.needsUpdate = true;
                }
            }
        }
    },
};
