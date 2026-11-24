import * as THREE from '/js/three.module.js';

// 飛び道具（魔法）の、特別な形。projectile.js の buildMeshMagic から呼ぶ（関数が長くなりすぎないように分けた）。p は Projectile、v は呪文の visual、hex は色の文字列を数値にする関数

// 前方へ伸びるジグザグの雷: 先頭から後ろへ長い折れ線が、またたく
export function buildLightning(p, v, hex) {
    const N = 14, L = 4.5;
    const mk = (color, opacity) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3));
        const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending }));
        line.frustumCulled = false;
        p.mesh.add(line);
        return g;
    };
    const geos = [mk(hex(v.core, '#ffffff'), 1), mk(hex(v.aura, '#facc15'), 0.8), mk(hex(v.aura, '#facc15'), 0.8)];
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    p.mesh.add(head);
    const regen = () => geos.forEach((g, gi) => {
        const a = g.attributes.position.array, off = gi === 0 ? 0 : 0.1;
        for (let i = 0; i <= N; i++) {
            const k = i / N, j = (i === 0 ? 0 : 1) * (0.1 + k * 0.28);   // 先頭は軸の上。後ろほど、ふれる
            a[i * 3] = (Math.random() - 0.5) * 2 * j + (gi === 1 ? off : gi === 2 ? -off : 0);
            a[i * 3 + 1] = (Math.random() - 0.5) * 2 * j;
            a[i * 3 + 2] = -0.3 + k * L;   // -Z が前。先頭が前、後ろへ伸びる
        }
        g.attributes.position.needsUpdate = true;
    });
    regen();
    let acc = 0;
    p.flicker = (dt) => { acc += dt; if (acc > 0.035) { acc = 0; regen(); } };
    p.mesh.rotation.y = Math.atan2(-p.dirX, -p.dirZ);
    p.noSpin = true;
    p.color = hex(v.aura, '#facc15'); p.trailColor = hex(v.trail, '#fef08a');
    if (v.size) p.mesh.scale.setScalar(v.size);
}

// 風の刃の連なり「((((」: 進む向きにふくらんだ、平たい弧が、後ろへ重なる
export function buildArcs(p, v, hex) {
    // 斬撃波：先の尖った三日月形の刃が、斜めに傾いて飛んでいく（後ろに薄い残像）
    const R = 1.1, a = Math.PI * 0.42, R2 = 2.2;
    const ex = R * Math.cos(a), ey = R * Math.sin(a);
    const cx2 = ex - Math.sqrt(R2 * R2 - ey * ey);          // 内側の弧の中心（膨らみが浅い）
    const b = Math.asin(ey / R2);
    const sh = new THREE.Shape();
    for (let i = 0; i <= 16; i++) { const t = -a + (2 * a * i) / 16; i ? sh.lineTo(R * Math.cos(t), R * Math.sin(t)) : sh.moveTo(R * Math.cos(t), R * Math.sin(t)); }
    for (let i = 16; i >= 0; i--) { const t = -b + (2 * b * i) / 16; sh.lineTo(cx2 + R2 * Math.cos(t), R2 * Math.sin(t)); }
    for (let i = 0; i < 3; i++) {
        const geo = new THREE.ShapeGeometry(sh);
        geo.rotateY(Math.PI / 2);                            // 膨らみが進む向き（-Z）
        geo.rotateZ(Math.PI / 2);                            // 刃が左右に広がる（地面と平行な面）
        const mat = i === 0 ? new THREE.MeshBasicMaterial({ color: hex(v.core, '#ffffff'), side: THREE.DoubleSide })
            : new THREE.MeshBasicMaterial({ color: hex(v.aura, '#86efac'), transparent: true, opacity: 0.6 - i * 0.2, side: THREE.DoubleSide });
        const m = new THREE.Mesh(geo, mat);
        m.position.z = i * 0.5;
        m.scale.setScalar(1 - i * 0.12);
        p.mesh.add(m);
    }
    p.mesh.rotation.order = 'YXZ';
    p.mesh.rotation.y = Math.atan2(-p.dirX, -p.dirZ);
    p.mesh.rotation.z = 0.5;                                 // 斜めに傾ける
    p.noSpin = true;
    if (v.size) p.mesh.scale.setScalar(v.size);
}
