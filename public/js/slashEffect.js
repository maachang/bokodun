import * as THREE from '/js/three.module.js';

/**
 * 近接攻撃（突進が当たったとき）の斬撃エフェクト
 *
 * 突進では敵に突っ込むため、ワールド空間のエフェクトはプレイヤーの背後に回って見えない。
 * そこで、エフェクトはカメラに固定した「画面上の表示」にし、敵や壁より手前に常に描画する。
 * 画面内の位置・傾き・向き・大きさは、攻撃のたびに少しランダムに変える。
 * 形・色・大きさ・長さは weaponClasses.json の effect で定義する（shape: slash / thrust / smash / punch）
 */

const SCREEN_DISTANCE = 1.5;   // カメラの正面（ローカル -Z）からの距離。このとき画面は高さ約 1.9・幅約 2.5 の広さになる
const OFFSET_X = 0.6;          // 画面中央からの横のずれの最大
const OFFSET_Y_MIN = -0.35;    // 縦のずれの範囲（少し下寄り）
const OFFSET_Y_MAX = 0.25;
const RENDER_ORDER = 999;      // 透明物の描画順の指定。大きいほど手前（最後）に描かれる

export class SlashEffectSystem {
    // camera: エフェクトを子として取り付けるカメラ（scene に追加されている必要がある）
    constructor(camera) {
        this.camera = camera;
        this.effects = [];
    }

    // range・arcDeg: クラスの攻撃範囲の目安（エフェクトの大きさ・弧の広がりに使う） / effect: クラスの effect 定義
    spawn(range, arcDeg, effect) {
        const shape = effect.shape || 'slash';
        const size = (effect.size ?? 1.0) * (0.9 + Math.random() * 0.3);
        const duration = effect.duration ?? 0.2;
        const flip = Math.random() < 0.5 ? 1 : -1; // 斬る向き（左右）をランダムに反転
        const jitter = (Math.random() - 0.5) * 0.7; // 傾きのランダムなずれ（ラジアン）

        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(effect.color || '#ffffff'),
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthTest: false,   // 敵や壁に隠されず、常に手前に見える
            depthWrite: false
        });

        const group = new THREE.Group();
        group.position.set(
            (Math.random() * 2 - 1) * OFFSET_X,
            OFFSET_Y_MIN + Math.random() * (OFFSET_Y_MAX - OFFSET_Y_MIN),
            -SCREEN_DISTANCE
        );

        let geometry;
        let mesh;
        let apply;

        if (shape === 'thrust') {
            // 突き: 細長い閃光の線が、斜めに走る
            const length = Math.max(0.6, range * 0.35 * size);
            geometry = new THREE.PlaneGeometry(length, 0.05 * size + 0.02);
            mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.z = flip * (0.35 + Math.random() * 0.5) + jitter;
            apply = (p) => { mesh.scale.x = Math.min(1, 0.3 + p * 2.5); };
        } else if (shape === 'smash') {
            // 叩きつけ: 衝撃波のリングが広がる
            geometry = new THREE.RingGeometry(0.28, 0.4, 32);
            mesh = new THREE.Mesh(geometry, material);
            const maxScale = Math.max(1.2, range * 0.45 * size);
            apply = (p) => { mesh.scale.setScalar(0.5 + p * maxScale); };
        } else if (shape === 'punch') {
            // 素手: 小さな閃光
            geometry = new THREE.CircleGeometry(0.18 * size, 20);
            mesh = new THREE.Mesh(geometry, material);
            apply = (p) => { mesh.scale.setScalar(0.6 + p * 1.2); };
        } else {
            // slash: 三日月型の弧。tiltDeg で傾き、sweepDeg だけ回転しながら消える
            const radius = Math.max(0.35, range * 0.22 * size);
            const theta = Math.max(50, arcDeg) * Math.PI / 180;
            geometry = new THREE.RingGeometry(radius * 0.8, radius, 24, 1, Math.PI / 2 - theta / 2, theta);
            mesh = new THREE.Mesh(geometry, material);
            const tilt = flip * (effect.tiltDeg ?? 0) * Math.PI / 180 + jitter;
            const sweep = flip * (effect.sweepDeg ?? 60) * Math.PI / 180;
            apply = (p) => {
                mesh.rotation.z = tilt + sweep * (0.5 - p);
                mesh.scale.setScalar(0.8 + p * 0.4);
            };
        }

        mesh.renderOrder = RENDER_ORDER;
        apply(0);
        group.add(mesh);
        this.camera.add(group);
        this.effects.push({ group, geometry, material, apply, duration, t: 0 });
    }

    update(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.t += dt;
            const p = Math.min(1, e.t / e.duration);
            e.apply(p);
            e.material.opacity = 1 - p;
            if (p >= 1) {
                this.camera.remove(e.group);
                e.geometry.dispose();
                e.material.dispose();
                this.effects.splice(i, 1);
            }
        }
    }
}
