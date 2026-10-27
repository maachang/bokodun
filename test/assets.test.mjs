import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

// コードや HTML が参照する画像（'/images/...' の文字列）が、実際に public/ に存在するか
test('参照している画像ファイルの存在', async (t) => {
    const sources = [
        'public/index.html',
        ...fs.readdirSync(path.join(projectRoot, 'public/js')).filter(f => f.endsWith('.js') && f !== 'three.module.js').map(f => `public/js/${f}`)
    ];

    await t.test('/images/... として直接書かれた画像パスが、すべて存在する', () => {
        const missing = [];
        for (const file of sources) {
            const text = fs.readFileSync(path.join(projectRoot, file), 'utf-8');
            for (const m of text.matchAll(/['"`](\/images\/[A-Za-z0-9_\-\/]+\.(?:png|jpg|jpeg|gif|webp))(?:\?[^'"`]*)?['"`]/g)) {
                if (!fs.existsSync(path.join(projectRoot, 'public', m[1]))) missing.push(`${file}: ${m[1]}`);
            }
        }
        assert.deepEqual(missing, []);
    });

    await t.test('エフェクト系の画像（火柱）は public/images/effects/ にある（objects/ には置かない）', () => {
        assert.ok(fs.existsSync(path.join(projectRoot, 'public/images/effects/fire_pillar.png')));
        assert.equal(fs.existsSync(path.join(projectRoot, 'public/images/objects/fire_pillar.png')), false);
        const game = fs.readFileSync(path.join(projectRoot, 'public/js/game.js'), 'utf-8');
        assert.ok(game.includes('/images/effects/fire_pillar.png'));
    });
});

test('湿地の木: 湿地マップの T は専用の木（swamp_tree）で、画像が存在し、透過している', () => {
    const swamp = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/maps/swamp.json'), 'utf-8'));
    assert.equal(swamp.legend.T, 'swamp_tree');
    const objects = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/objects.json'), 'utf-8'));
    assert.equal(objects.swamp_tree.type, 'tree');
    assert.equal(objects.swamp_tree.texture, 'swampTree');
    assert.ok(objects.swamp_tree.aspect > 0);
    const png = fs.readFileSync(path.join(projectRoot, 'public/images/objects/swamp_tree.png'));
    assert.equal(png.readUInt8(25), 6, 'RGBA（アルファ付き）の PNG');
    const tex = fs.readFileSync(path.join(projectRoot, 'public/js/textures.js'), 'utf-8');
    assert.match(tex.slice(tex.indexOf('createSwampTreeTexture')), /colorSpace = THREE\.SRGBColorSpace/, '色空間の指定（二重変換で白っぽくならない）');
    // 草原など他のマップの木は従来のまま
    const grass = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/maps/grassland.json'), 'utf-8'));
    assert.equal(grass.legend.T, 'tree');
});
