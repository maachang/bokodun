import * as THREE from '/js/three.module.js';

/**
 * 近接攻撃（突進が当たったとき）の斬撃エフェクト
 *
 * 突進では敵に突っ込むため、ワールド空間のエフェクトはプレイヤーの背後に回って見えない。
 * そこで、エフェクトはカメラに固定した「画面上の表示」にし、敵や壁より手前に常に描画する。
 * 画面内の位置・傾き・斬る向き・大きさは、攻撃のたびに少しランダムに変える。会心・撃破は power で強くする。
 *
 * 見た目はシェーダー（加算合成）で描く:
 *   - 斬撃(slash): 両端が尖った三日月型の弧。先端が白熱して走り、尾が色づいて流れ消える。2 本目の細い弧と、切り終わりの星形の閃光つき
 *   - 突き(thrust): 先端の尖った光の筋が走り抜け、細い筋が 2 本添う。先端に星形の閃光
 *   - 叩きつけ(smash): 二重の衝撃波リングが広がり、外側に短い光線が放射状に走る
 *   - 素手(punch): 星形の閃光とリング
 *   - 共通: 当たった点から飛び散る、尾を引く線状の火花 / 画面全体の短いフラッシュ
 * 形・色・大きさ・長さは weaponClasses.json の effect で定義する（shape: slash / thrust / smash / punch）
 */

const SCREEN_DISTANCE = 1.5;   // カメラの正面（ローカル -Z）からの距離。このとき画面は高さ約 1.9・幅約 2.5 の広さになる
const OFFSET_X = 0.35;         // 画面中央からの横のずれの最大
const OFFSET_Y_MIN = -0.2;     // 縦のずれの範囲
const OFFSET_Y_MAX = 0.2;
const RENDER_ORDER = 999;      // 透明物の描画順の指定。大きいほど手前（最後）に描かれる
const DURATION_SCALE = 2.2;    // クラスの effect.duration に掛ける倍率（短いと一瞬で見逃すため）
const SPARK_COUNT = 14;        // 火花の数（power で増える）
const FLASH_OPACITY = 0.14;    // 画面全体フラッシュの最大の濃さ

// ---- シェーダー ----
// uv.x = 弧・筋に沿った位置 t（0〜1）、uv.y = 幅方向（-1〜1）。円盤は uv が円に内接する 0〜1 の座標
const VERTEX = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// uKind: 0=走る光（先端が白熱し、尾を引く） 1=静止した筋・リング（フェードのみ） 2=円盤（中心が明るい）
// ・tip: 先端（uHead 付近）の幅を細くして尖らせる
// ・colorspace_fragment: three.js の色管理（リニア→画面の sRGB）。これが無いとプレビューより暗く見える
// ・シェーダーのソース内は、ドライバーの互換性のため ASCII のみにする（日本語の説明はこの JS 側に書く）
const FRAGMENT = `
uniform float uKind;
uniform float uHead;   // head position along the strip (t); above 1 the tail slides off
uniform float uTail;   // tail length (t)
uniform float uFade;   // overall opacity
uniform vec3 uColor;
uniform vec3 uCore;
varying vec2 vUv;
void main() {
    float across;
    float trail = 1.0;
    float lead = 0.0;
    if (uKind > 1.5) {
        float r = length(vUv - 0.5) * 2.0;
        across = clamp(1.0 - r, 0.0, 1.0);
        across = pow(across, 1.8);
    } else if (uKind > 0.5) {
        across = clamp(1.0 - abs(vUv.y), 0.0, 1.0);
    } else {
        float d = uHead - vUv.x;
        float tip = 0.25 + 0.75 * smoothstep(0.0, 0.14, d);
        across = clamp(1.0 - abs(vUv.y / tip), 0.0, 1.0);
        trail = d >= 0.0 ? pow(clamp(1.0 - d / uTail, 0.0, 1.0), 1.5) : 0.0;
        lead = d >= 0.0 ? 1.0 - smoothstep(0.0, 0.06, d) : 0.0;
    }
    float core = clamp(pow(across, 4.0) * trail + lead * across * across, 0.0, 1.0);
    float a = pow(across, 1.2) * trail * uFade;
    vec3 col = mix(uColor, uCore, core) * (0.75 + 1.6 * core);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
}`;

const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);   // easeOutCubic
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// 光の先端の位置: sweepEnd までに端まで走り、その後は尾が流れ去る
const headOf = (p, sweepEnd, tail) => (p < sweepEnd ? ease(p / sweepEnd) : 1 + tail * (p - sweepEnd) / (1 - sweepEnd));
const fadeOf = (p, hold) => (p < hold ? 1 : Math.max(0, 1 - (p - hold) / (1 - hold)));

/**
 * 中心線 center(t)・法線 normal(t)・幅 width(t) から、帯状のメッシュを作る（uv.x = t、uv.y = 幅方向 -1〜1）
 * 幅 width(t) が両端で 0 に近づくと、尖った形（三日月・筋）になる
 */
function stripGeometry(segments, center, normal, width) {
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const [cx, cy] = center(t);
        const [nx, ny] = normal(t);
        const w = width(t);
        positions.push(cx - nx * w, cy - ny * w, 0, cx + nx * w, cy + ny * w, 0);
        uvs.push(t, -1, t, 1);
        if (i < segments) {
            const k = i * 2;
            indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return geometry;
}

// 三日月型の弧（原点中心・半径 R・厚み T・開始角 a0・角度 theta）。両端が尖る
function arcGeometry(R, T, a0, theta) {
    return stripGeometry(
        48,
        (t) => [R * Math.cos(a0 + theta * t), R * Math.sin(a0 + theta * t)],
        (t) => [Math.cos(a0 + theta * t), Math.sin(a0 + theta * t)],
        (t) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.8) * T / 2
    );
}

// 水平な光の筋（長さ L・厚み T、中心が原点）。両端が尖る（taper が大きいほど細く鋭い）
function lineGeometry(L, T, taper) {
    return stripGeometry(
        24,
        (t) => [L * (t - 0.5), 0],
        () => [0, 1],
        (t) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), taper) * T / 2
    );
}

// 円環（原点中心・半径 R・厚み T）。scale で半径を変えると厚みも比例して変わる（T は半径に対する比率にする）
function ringGeometry(R, T) {
    return stripGeometry(
        64,
        (t) => [R * Math.cos(Math.PI * 2 * t), R * Math.sin(Math.PI * 2 * t)],
        (t) => [Math.cos(Math.PI * 2 * t), Math.sin(Math.PI * 2 * t)],
        () => T / 2
    );
}

export class SlashEffectSystem {
    // camera: エフェクトを子として取り付けるカメラ（scene に追加されている必要がある）
    constructor(camera) {
        this.camera = camera;
        this.effects = [];
    }

    // 加算合成のシェーダー材質（深度テストなしで、敵や壁に隠されず、常に手前に見える）
    material(kind, color, core) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uKind: { value: kind },
                uHead: { value: 0 },
                uTail: { value: 0.6 },
                uFade: { value: 1 },
                uColor: { value: color },
                uCore: { value: core }
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
    }

    // range・arcDeg: クラスの攻撃範囲の目安（大きさ・弧の広がりに使う） / effect: クラスの effect 定義 / power: 強さの倍率（会心・撃破で 1 より大きい）
    spawn(range, arcDeg, effect, power = 1.0) {
        const shape = effect.shape || 'slash';
        // 大きさ: クラスの size とランダムなばらつき。会心・撃破は少しだけ大きく（画面からはみ出さないよう控えめ）
        const size = (effect.size ?? 1.0) * (0.92 + Math.random() * 0.16) * (1 + 0.3 * (power - 1));
        const duration = (effect.duration ?? 0.2) * DURATION_SCALE;
        const flip = Math.random() < 0.5 ? 1 : -1;      // 斬る向き（左右）をランダムに反転
        const jitter = (Math.random() - 0.5) * 0.4;     // 傾きのランダムなずれ（ラジアン）
        const base = new THREE.Color(effect.color || '#ffffff');
        const core = base.clone().lerp(new THREE.Color(0xffffff), 0.75); // 芯は白に近い明るい色

        const root = new THREE.Group();
        root.position.set(
            (Math.random() * 2 - 1) * OFFSET_X,
            OFFSET_Y_MIN + Math.random() * (OFFSET_Y_MAX - OFFSET_Y_MIN),
            -SCREEN_DISTANCE
        );
        root.rotation.z = jitter;
        root.scale.x = flip;

        const geometries = [];
        const materials = [];
        const meshes = [];
        const animators = [];                           // (p) => void。進行度 p（0〜1）に応じて動かす

        const add = (geometry, kind, parent = root) => {
            const mat = this.material(kind, base, core);
            const mesh = new THREE.Mesh(geometry, mat);
            mesh.renderOrder = RENDER_ORDER;
            geometries.push(geometry);
            materials.push(mat);
            meshes.push(mesh);
            parent.add(mesh);
            return mesh;
        };
        const setFade = (mesh, v) => { mesh.material.uniforms.uFade.value = v; mesh.visible = v > 0.001; };

        // 星形の閃光: 中心の円盤 + 4 本の筋（8 方向に尖る）。setState(size, fade) で大きさと濃さを決める
        const unitLine = lineGeometry(1, 1, 1.8);
        geometries.push(unitLine);
        const unitDisc = new THREE.CircleGeometry(1, 32);
        geometries.push(unitDisc);
        const makeStar = (rot) => {
            const holder = new THREE.Group();
            root.add(holder);
            const disc = add(unitDisc, 2, holder);
            const rays = [0, 1, 2, 3].map((k) => {
                const r = add(unitLine, 1, holder);
                r.rotation.z = rot + k * Math.PI / 4;
                return r;
            });
            holder.visible = false;
            return {
                holder,
                setState(x, y, s, fade) {
                    holder.visible = fade > 0.001;
                    holder.position.set(x, y, 0.01);
                    disc.scale.setScalar(s * 0.55);
                    for (const r of rays) r.scale.set(s * 1.8, s * 0.16, 1);
                    setFade(disc, fade);
                    for (const r of rays) setFade(r, fade);
                }
            };
        };

        // 切り終わり・突き終わり・着弾の位置（火花の発生点。形ごとに決める）
        let tip = { x: 0, y: 0 };

        if (shape === 'thrust') {
            // 突き: 先端の尖った光の筋が走り抜け、細い筋が 2 本添う。先端に星形の閃光
            const L = Math.max(1.4, range * 1.05 * size);
            const rot = -(0.35 + Math.random() * 0.2);
            const tail = 0.6;
            const mainGeo = lineGeometry(L, 0.3 * size, 1.5);
            const sideGeoA = lineGeometry(L * 0.8, 0.08, 1.5);
            const sideGeoB = lineGeometry(L * 0.7, 0.06, 1.5);
            const main = add(mainGeo, 0);
            const sideA = add(sideGeoA, 0);
            const sideB = add(sideGeoB, 0);
            main.rotation.z = rot;
            sideA.rotation.z = sideB.rotation.z = rot;
            sideA.position.set(-Math.sin(rot) * -0.13, Math.cos(rot) * 0.13, 0);
            sideB.position.set(-Math.sin(rot) * 0.13, Math.cos(rot) * -0.13, 0);
            const star = makeStar(0.2);
            tip = { x: L / 2 * Math.cos(rot), y: L / 2 * Math.sin(rot) };
            animators.push((p) => {
                const fade = fadeOf(p, 0.6);
                for (const [m, delay, f, tl] of [[main, 0, 1, tail], [sideA, 0.04, 0.75, tail * 0.8], [sideB, 0.07, 0.6, tail * 0.7]]) {
                    m.material.uniforms.uHead.value = headOf(Math.max(0, p - delay), 0.3, tail);
                    m.material.uniforms.uTail.value = tl;
                    setFade(m, fade * f);
                }
                const q = clamp01((p - 0.22) / 0.78);
                star.setState(tip.x, tip.y, 0.3 * size * (1 - 0.4 * q), p > 0.22 ? Math.max(0, 1 - q * 1.2) : 0);
            });
        } else if (shape === 'smash') {
            // 叩きつけ: 二重の衝撃波リングが広がり、外側に短い光線が放射状に走る。中心に光る円盤
            const Rm = range * 0.3 * size;
            const ringGeo = ringGeometry(1, 0.28);
            geometries.push(ringGeo);
            const ringA = add(ringGeo, 1);
            const ringB = add(ringGeo, 1);
            const disc = add(unitDisc, 2);
            const rayCount = 14;
            const rays = Array.from({ length: rayCount }, () => add(unitLine, 1));
            const cy = -0.1;
            animators.push((p) => {
                const f = ease(p / 0.5);
                const ringR = 0.12 + Rm * f;
                ringA.position.set(0, cy, 0);
                ringA.scale.set(ringR, ringR, 1);
                ringB.position.set(0, cy, 0);
                ringB.scale.setScalar(ringR * 0.7);
                setFade(ringA, fadeOf(p, 0.3));
                setFade(ringB, fadeOf(p, 0.3) * 0.55);
                disc.position.set(0, cy, 0);
                disc.scale.setScalar(Math.max(0.01, 0.75 * size * (1 - p) + 0.01));
                setFade(disc, Math.max(0, 1 - p / 0.55));
                rays.forEach((r, k) => {
                    const a = k * 2 * Math.PI / rayCount + 0.2;
                    const len = 0.38 * (1 - 0.5 * p) * size;
                    const dist = ringR + len * 0.35;
                    r.position.set(Math.cos(a) * dist, cy + Math.sin(a) * dist, 0);
                    r.rotation.z = a;
                    r.scale.set(len, 0.09, 1);
                    setFade(r, Math.max(0, 1 - p / 0.5));
                });
            });
            tip = { x: 0, y: cy };
        } else if (shape === 'punch') {
            // 素手: 星形の閃光を二重に重ね、リングを広げる
            const starA = makeStar(0.15);
            const starB = makeStar(0.15 + Math.PI / 8);
            const ringGeo = ringGeometry(1, 0.28);
            geometries.push(ringGeo);
            const ring = add(ringGeo, 1);
            const R = range * 0.4 * size;
            animators.push((p) => {
                const fade = fadeOf(p, 0.3);
                const grow = ease(p / 0.5);
                starA.setState(0, 0, 0.55 * R * (0.6 + 0.7 * grow), fade);
                starB.setState(0, 0, 0.4 * R * (0.5 + 0.8 * grow), fade * 0.8);
                const rr = (0.1 + 0.55 * ease(p / 0.6)) * R / 0.55;
                ring.scale.set(rr, rr, 1);
                setFade(ring, fade);
            });
        } else {
            // slash: 両端が尖った三日月型の弧。先端が白熱して走り、尾が流れ消える。2 本目の細い弧と、切り終わりの星形の閃光つき
            const R = Math.max(0.7, range * 0.4 * size);
            const theta = Math.min(150, arcDeg + 48) * Math.PI / 180;
            const a0 = Math.PI / 2 - theta / 2;
            const tilt = (effect.tiltDeg ?? -32) * Math.PI / 180;
            const tail = 0.7;
            const arc = new THREE.Group();
            arc.position.set(0, -R * 0.6, 0);
            arc.rotation.z = tilt;
            root.add(arc);
            const main = add(arcGeometry(R, R * 0.6, a0, theta), 0, arc);
            const second = add(arcGeometry(R * 0.84, R * 0.24, a0 + theta * 0.05, theta * 0.9), 0, arc);
            const star = makeStar(0.35);
            const endAngle = a0 + theta + tilt;
            tip = { x: R * Math.cos(endAngle), y: -R * 0.6 + R * Math.sin(endAngle) };
            animators.push((p) => {
                const fade = fadeOf(p, 0.62);
                main.material.uniforms.uHead.value = headOf(p, 0.38, tail);
                main.material.uniforms.uTail.value = tail;
                setFade(main, fade);
                second.material.uniforms.uHead.value = headOf(Math.max(0, p - 0.03), 0.38, tail);
                second.material.uniforms.uTail.value = tail * 0.85;
                setFade(second, fade * 0.85);
                const q = clamp01((p - 0.3) / 0.7);
                star.setState(tip.x, tip.y, 0.34 * size * (1 - 0.5 * q), p > 0.3 ? Math.max(0, 1 - q * 1.3) : 0);
            });
        }

        // ---- 火花: 当たった点から飛び散る、尾を引く線 ----
        const sparkCount = Math.round(SPARK_COUNT * power);
        const sparkGeo = lineGeometry(1, 1, 1.0);
        geometries.push(sparkGeo);
        const sparkMat = this.material(1, base, core);
        materials.push(sparkMat);
        const sparks = Array.from({ length: sparkCount }, () => {
            const mesh = new THREE.Mesh(sparkGeo, sparkMat);
            mesh.renderOrder = RENDER_ORDER;
            root.add(mesh);
            meshes.push(mesh);
            const a = Math.random() * Math.PI * 2;
            return { mesh, a, speed: 1.0 + Math.random() * 1.8, len: 0.07 + Math.random() * 0.16 };
        });
        animators.push((p) => {
            const t = Math.max(0, p - 0.15) * 0.5;
            const visible = p > 0.12;
            sparkMat.uniforms.uFade.value = Math.max(0, 1 - p / 0.85);
            for (const s of sparks) {
                s.mesh.visible = visible && sparkMat.uniforms.uFade.value > 0.001;
                s.mesh.position.set(tip.x + Math.cos(s.a) * s.speed * t, tip.y + Math.sin(s.a) * s.speed * t - 0.4 * t * t, 0.02);
                s.mesh.rotation.z = s.a;
                s.mesh.scale.set((s.len + 0.02) * (1 - p) * size, 0.014, 1);
            }
        });

        // ---- 画面全体のフラッシュ（ヒットの瞬間に、画面がエフェクトの色で短く光る）----
        const flashGeometry = new THREE.PlaneGeometry(4, 3);
        const flashMat = new THREE.MeshBasicMaterial({
            color: base, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending
        });
        const flashBase = Math.min(0.3, FLASH_OPACITY * power);
        flashMat.opacity = flashBase;
        const flash = new THREE.Mesh(flashGeometry, flashMat);
        flash.renderOrder = RENDER_ORDER - 1;
        flash.position.set(0, 0, -SCREEN_DISTANCE + 0.05);

        const apply = (p) => { for (const a of animators) a(p); };
        apply(0);
        this.camera.add(root);
        this.camera.add(flash);
        this.effects.push({
            shape, group: root, meshes, flash, flashMat, flashBase, flashGeometry,
            geometries, materials, apply, duration, t: 0, fade: 1, sparkCount
        });
    }

    update(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.t += dt;
            const p = Math.min(1, e.t / e.duration);
            e.apply(p);
            e.fade = 1 - p;   // 進行の目安（0 で終了）
            e.flashMat.opacity = e.flashBase * Math.max(0, 1 - p / 0.25);
            if (p >= 1) {
                this.camera.remove(e.group);
                this.camera.remove(e.flash);
                for (const g of e.geometries) g.dispose();
                for (const m of e.materials) m.dispose();
                e.flashGeometry.dispose();
                e.flashMat.dispose();
                this.effects.splice(i, 1);
            }
        }
    }
}
