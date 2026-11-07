import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
async function load() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-'));
    for (const f of ['game', 'textures', 'entities', 'npc', 'mapNavigator', 'world', 'mapFormat', 'enemyBehavior', 'audio', 'particles', 'slashEffect', 'strikeEffect', 'sdAssetManager', 'three.module']) {
        fs.writeFileSync(path.join(dir, `${f}.js`), fs.readFileSync(path.join(projectRoot, `public/js/${f}.js`), 'utf-8').replaceAll("'/js/", "'./"));
    }
    return { ...(await import(path.join(dir, 'game.js'))), THREE: await import(path.join(dir, 'three.module.js')) };
}

test('描画の負荷: 動かない部品は、同じ材質ごとに1つのメッシュにまとまり、位置・向き・頂点数は変わらない', async () => {
    const { GameEngine, THREE } = await load();
    const g = Object.create(GameEngine.prototype);
    g.scene = new THREE.Scene();
    g.addStatic = GameEngine.prototype.addStatic;
    const matA = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const matA2 = new THREE.MeshLambertMaterial({ color: 0xff0000 });   // 別のインスタンスでも、同じ見た目ならまとまる
    const matB = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
    const glass = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });   // 半透明は、まとめない
    const tile = (m, x) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), m); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0, 0); g.addStatic(mesh); return mesh; };
    for (let i = 0; i < 10; i++) tile(i % 2 ? matA : matA2, i * 4);
    tile(matB, 100);
    tile(glass, 200);
    const grp = new THREE.Group(); grp.position.set(50, 0, 0);   // グループの中の部品も、まとまる
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matB));
    g.addStatic(grp);
    const moving = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matA);   // addStatic していない（扉・罠など）は、そのまま
    g.scene.add(moving);
    g.mergeStaticMeshes();
    const meshes = g.scene.children.filter(o => o.isMesh);
    assert.equal(meshes.length, 4, 'まとめたもの2つ（赤・緑）＋半透明＋動くもの');
    assert.ok(g.scene.children.includes(moving));
    assert.ok(!g.scene.children.includes(grp), '空になったグループは消える');
    const red = meshes.find(m => m.material === matA || m.material === matA2 && m !== moving);
    const redMerged = meshes.find(m => m !== moving && m.geometry.attributes.position.count === 10 * 6);
    assert.ok(redMerged, '赤: 10枚（1枚6頂点）');
    const green = meshes.find(m => m !== moving && m.geometry.attributes.position.count === 6 + 36);
    assert.ok(green, '緑: 板1枚＋箱1個');
    redMerged.geometry.computeBoundingBox();
    assert.equal(redMerged.geometry.boundingBox.min.x, -2);
    assert.equal(redMerged.geometry.boundingBox.max.x, 9 * 4 + 2, '位置が、そのまま反映されている');
    assert.ok(red);
});

test('描画の負荷: 床・天井・壁・家具などの追加は addStatic を通す（まとめる対象）。扉・罠・水・宝箱は通さない', () => {
    const src = fs.readFileSync(path.join(projectRoot, 'public/js/game.js'), 'utf-8');
    assert.match(src, /this\.mergeStaticMeshes\(\);/);
    for (const name of ['cellMesh', 'tileMesh', 'wall', 'house', 'roofMesh', 'stepMesh', 'postMesh']) assert.match(src, new RegExp(`this\\.addStatic\\(${name}\\)`), name);
    const doorBlock = src.slice(src.indexOf("case 'door': {"), src.indexOf("case 'door': {") + 3500);
    assert.ok(!doorBlock.includes('addStatic(doorMesh)') && !/this\.doors\.push\([\s\S]*addStatic/.test(doorBlock), '扉は、動くので、まとめない');
});
