import * as THREE from '/js/three.module.js';

/**
 * 落下系の魔法（爆発火球など）の演出: 地面の予告の輪 → 着弾（onImpact を 1 回呼ぶ）→ 火柱と衝撃波 → 煙
 * 火柱は fire_pillar の画像（texture）を縦長の板 3 枚で十字に交差させて描く。texture が無い場合は単色
 * 煙は火柱が消え始める頃（火柱の持続の半分）から出る。ふわっとした煙の塊を、シェーダーで描いたカメラを向く板で重ねる:
 *   塊の輪郭はノイズで崩れ、内側に濃淡がつく / 発生直後は炎の色（下側が赤橙）で、冷めるにつれて暗い灰色になる /
 *   ゆっくり立ちのぼりながら膨らみ、薄くなって消える
 */
// ---- 火柱のシェーダー（ソースは ASCII のみ）----
// fire_pillar.png は外周が透明ではなく、暗い赤褐色の背景が付いている。そのまま加算合成すると、板の縁に縦長の長方形の輪郭が見える。
// そこで、(1) 暗い色は足さない（背景を消す）(2) 左右・上端をなめらかに透明にする (3) 根元は地面に溶け込ませる。
// uHasMap が 0（画像が無い）のときは、単色の炎のグラデーションを使う
const PILLAR_VERTEX = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PILLAR_FRAGMENT = `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uOpacity;
varying vec2 vUv;
void main() {
    vec4 tex = texture2D(uMap, vUv);
    vec3 fallback = vec3(1.0, 0.4, 0.05) * (1.0 - 0.5 * vUv.y);
    vec3 c = mix(fallback, tex.rgb, uHasMap);
    float texAlpha = mix(1.0, tex.a, uHasMap);
    float lum = max(c.r, max(c.g, c.b));
    c *= mix(1.0, smoothstep(0.12, 0.45, lum), uHasMap);
    float side = smoothstep(0.0, 0.22, vUv.x) * smoothstep(0.0, 0.22, 1.0 - vUv.x);
    float top = smoothstep(0.0, 0.25, 1.0 - vUv.y);
    float root = smoothstep(0.0, 0.06, vUv.y);
    gl_FragColor = vec4(c, texAlpha * side * top * root * uOpacity);
    #include <colorspace_fragment>
}`;

// ---- 煙のシェーダー（ソースは ASCII のみ。日本語の説明はこの JS 側に書く）----
// ノイズ（fbm）で輪郭を崩したふわっとした塊。uHeat が大きいほど炎の色（下側が赤橙）、小さいほど暗い灰色。
// uAge: 塊の経過（0〜1。ノイズをゆっくり動かす）、uAlpha: 全体の濃さ、uSeed: 塊ごとの模様の違い
const SMOKE_VERTEX = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SMOKE_FRAGMENT = `
uniform float uSeed;
uniform float uAge;
uniform float uHeat;
uniform float uAlpha;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}
void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float n = fbm(vec2(p.x * 2.2 + uSeed * 17.0 + uAge * 0.6, p.y * 2.2 + uSeed * 9.0));
    float edge = 1.0 - smoothstep(0.25, 1.0, r + (n - 0.5) * 0.9);
    float dens = edge * (0.55 + 0.9 * n);
    float lit = p.y * 0.5 + 0.5;
    vec3 gray = mix(vec3(0.10, 0.10, 0.11), vec3(0.42, 0.42, 0.44), clamp(n * 0.8 + lit * 0.4, 0.0, 1.0));
    float m = clamp(uHeat * (1.0 - lit) * 0.9 * n + uHeat * 0.25, 0.0, 1.0);
    vec3 col = mix(gray, vec3(1.0, 0.45, 0.1), m);
    gl_FragColor = vec4(col, clamp(dens * uAlpha, 0.0, 1.0));
    #include <colorspace_fragment>
}`;

const SMOKE_COUNT = 32;          // 煙の塊の数
const SMOKE_START_Q = 0.5;       // 火柱の持続の、この割合を過ぎたら煙が出始める（火柱と煙の間が途切れない）

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class StrikeEffectSystem {
    // camera: 煙の板を常にカメラへ向けるために使う（省略すると向きを更新しない）
    constructor(scene, texture = null, camera = null) {
        this.scene = scene;
        this.texture = texture;
        this.camera = camera;
        this.strikes = [];
    }

    // x, z: 着弾点 / radius: 範囲の半径 / warnTime: 予告の長さ / pillarTime: 火柱の持続 / smokeTime: 火柱が消えてからの煙の長さ（0 なら煙なし）
    // onImpact: 着弾の瞬間に呼ぶ（ダメージ・効果音など）
    schedule(x, z, { radius = 3, warnTime = 0.3, pillarTime = 0.8, smokeTime = 0, onImpact = null } = {}) {
        const warn = new THREE.Group();
        warn.position.set(x, 0.06, z);
        const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
        const ringGeo = new THREE.RingGeometry(radius * 0.9, radius, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const fillGeo = new THREE.CircleGeometry(radius * 0.9, 32);
        fillGeo.rotateX(-Math.PI / 2);
        const fillMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
        warn.add(new THREE.Mesh(ringGeo, warnMat), new THREE.Mesh(fillGeo, fillMat));
        this.scene.add(warn);

        this.strikes.push({
            x, z, radius, warnTime, pillarTime, smokeTime, onImpact,
            t: 0, impacted: false, puffs: null,
            warn, warnMat, fillMat, geometries: [ringGeo, fillGeo],
            pillar: null
        });
    }

    // 着弾の瞬間: 予告を消し、火柱（交差する 3 枚の板）と地面の衝撃波リングを出す
    impact(s) {
        this.scene.remove(s.warn);
        s.warnMat.dispose();
        s.fillMat.dispose();
        s.impacted = true;
        if (s.onImpact) s.onImpact();

        const height = 5;
        const width = s.radius * 1.1;
        const pillar = new THREE.Group();
        pillar.position.set(s.x, 0, s.z);

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: this.texture || null },
                uHasMap: { value: this.texture ? 1 : 0 },
                uOpacity: { value: 1 }
            },
            vertexShader: PILLAR_VERTEX,
            fragmentShader: PILLAR_FRAGMENT,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const planeGeo = new THREE.PlaneGeometry(width, height);
        for (let i = 0; i < 3; i++) {
            const plane = new THREE.Mesh(planeGeo, mat);
            plane.position.y = height / 2;
            plane.rotation.y = i * Math.PI / 3;
            pillar.add(plane);
        }

        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffdd33, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
        const ringGeo = new THREE.RingGeometry(0.6, 0.9, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.08;
        pillar.add(ring);

        this.scene.add(pillar);
        s.pillar = { group: pillar, mat, ringMat, ring, planeGeo, ringGeo, height };
    }

    update(dt) {
        for (let i = this.strikes.length - 1; i >= 0; i--) {
            const s = this.strikes[i];
            s.t += dt;

            if (!s.impacted) {
                // 予告: 輪が点滅しながら濃くなる
                const p = Math.min(1, s.t / s.warnTime);
                s.warnMat.opacity = 0.35 + 0.5 * p * (0.6 + 0.4 * Math.sin(s.t * 40));
                if (s.t >= s.warnTime) this.impact(s);
                else continue;
            }

            // 火柱: 最初の 25% で立ち上がり、最後の 30% で消える。衝撃波リングは広がりながら消える
            const q = Math.min(1, (s.t - s.warnTime) / s.pillarTime);
            const pl = s.pillar;
            if (pl) {
                pl.group.scale.y = Math.min(1, q / 0.25) || 0.01;
                pl.mat.uniforms.uOpacity.value = q > 0.7 ? Math.max(0, 1 - (q - 0.7) / 0.3) : 0.85 + 0.15 * Math.sin(s.t * 50);
                pl.ring.scale.setScalar(1 + q * (s.radius / 0.9) * 1.5);
                pl.ringMat.opacity = 0.9 * (1 - q);

                if (q >= 1) {
                    this.scene.remove(pl.group);
                    pl.mat.dispose();
                    pl.ringMat.dispose();
                    pl.planeGeo.dispose();
                    pl.ringGeo.dispose();
                    for (const g of s.geometries) g.dispose();
                    s.pillar = null;
                }
            }

            // 煙: 火柱が消え始める頃から出る。火柱と並行して動き、すべての塊が消えたら終了
            if (!s.puffs && s.smokeTime > 0 && q >= SMOKE_START_Q) this.startSmoke(s);
            if (s.puffs) this.updateSmoke(s, dt);
            if (!s.pillar && (!s.puffs || s.puffs.length === 0)) this.strikes.splice(i, 1);
        }
    }

    // 煙の塊を、着弾点の周りに時間差で出す。各塊は smokeTime 以内に消える（出し始めから smokeTime 後にすべて消える）
    startSmoke(s) {
        const geo = new THREE.PlaneGeometry(1, 1);
        s.smokeGeo = geo;
        s.puffs = [];
        for (let i = 0; i < SMOKE_COUNT; i++) {
            const delay = (i / SMOKE_COUNT) * Math.min(0.7, s.smokeTime * 0.3) * (0.7 + Math.random() * 0.6);
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * s.radius * 0.6;
            const driftAngle = Math.random() * Math.PI * 2;
            const mat = new THREE.ShaderMaterial({
                uniforms: { uSeed: { value: Math.random() }, uAge: { value: 0 }, uHeat: { value: 1 }, uAlpha: { value: 0 } },
                vertexShader: SMOKE_VERTEX,
                fragmentShader: SMOKE_FRAGMENT,
                transparent: true,
                depthWrite: false,   // 塊どうしが互いを隠さず、重なって濃くなる（壁には隠される）
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            this.scene.add(mesh);
            s.puffs.push({
                mesh, mat, age: 0, delay,
                life: s.smokeTime - delay,
                x0: s.x + Math.cos(angle) * dist, z0: s.z + Math.sin(angle) * dist,
                y0: 0.3 + Math.random() * 0.4,
                rise: 1.6 + Math.random() * 3.4,                       // 立ちのぼる高さ
                driftX: Math.cos(driftAngle) * (Math.random() * 1.2), // 横へ流れる量
                driftZ: Math.sin(driftAngle) * (Math.random() * 1.2),
                size0: s.radius * 0.34 * (0.7 + Math.random() * 0.6),  // 最初の大きさ
                grow: 2.2 + Math.random()                              // 最後に何倍まで膨らむか
            });
        }
    }

    updateSmoke(s, dt) {
        for (let j = s.puffs.length - 1; j >= 0; j--) {
            const f = s.puffs[j];
            f.age += dt;
            if (f.age < f.delay) continue;
            const t = Math.min(1, (f.age - f.delay) / f.life);
            const e = 1 - Math.pow(1 - t, 3);   // 最初は勢いよく、だんだん遅く
            f.mesh.visible = true;
            f.mesh.position.set(f.x0 + f.driftX * t, f.y0 + f.rise * e, f.z0 + f.driftZ * t);
            f.mesh.scale.setScalar(f.size0 * (1 + (f.grow - 1) * e));
            if (this.camera) f.mesh.quaternion.copy(this.camera.quaternion);   // 常にカメラを向く板
            const u = f.mat.uniforms;
            u.uAge.value = t;
            u.uHeat.value = Math.pow(Math.max(0, 1 - t / 0.45), 2);            // 最初の約 45% で炎の色が冷める
            u.uAlpha.value = 0.85 * smoothstep(0, 0.12, t) * (1 - smoothstep(0.4, 1.0, t));
            if (t >= 1) {
                this.scene.remove(f.mesh);
                f.mat.dispose();
                s.puffs.splice(j, 1);
            }
        }
        if (s.puffs.length === 0 && s.smokeGeo) {
            s.smokeGeo.dispose();
            s.smokeGeo = null;
        }
    }
}
