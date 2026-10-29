import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = process.cwd();

test('1. JSON Schema & Integrity Validation', async (t) => {
    await t.test('All configuration JSON files exist and are valid JSON', () => {
        const jsonFiles = [
            'public/data/objects.json',
            'public/data/enemies.json',
            'public/data/maps/dungeon.json',
            'public/data/maps/grassland.json',
            'public/data/maps/village.json',
            'public/data/maps/city.json',
            'public/data/maps/rockymountain.json',
            'public/data/maps/cave.json',
            'public/data/maps/swamp.json'
        ];

        for (const file of jsonFiles) {
            const filePath = path.join(projectRoot, file);
            assert.ok(fs.existsSync(filePath), `File exists: ${file}`);
            const content = fs.readFileSync(filePath, 'utf-8');
            assert.doesNotThrow(() => JSON.parse(content), `Valid JSON: ${file}`);
        }
    });

    await t.test('Object definitions are properly referenced in maps', () => {
        const objects = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/objects.json'), 'utf-8'));
        const enemies = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/enemies.json'), 'utf-8'));
        
        const mapFiles = ['dungeon.json', 'grassland.json', 'village.json', 'city.json', 'rockymountain.json', 'cave.json', 'swamp.json'];
        for (const mapFile of mapFiles) {
            const map = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/maps', mapFile), 'utf-8'));
            
            // Check legend
            if (map.legend) {
                for (const [char, objId] of Object.entries(map.legend)) {
                    assert.ok(objects[objId], `Map ${mapFile} legend '${char}' -> '${objId}' exists in objects.json`);
                }
            }

            // Check enemies
            if (map.enemies) {
                for (const [char, enemyId] of Object.entries(map.enemies)) {
                    assert.ok(enemies[enemyId], `Map ${mapFile} enemies '${char}' -> '${enemyId}' exists in enemies.json`);
                }
            }

            // Check all layout chars are accounted for
            const rows = map.layout.length;
            const cols = map.layout[0].length;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const char = map.layout[r][c];
                    if (char === '0' || char === ' ') continue;
                    const hasObj = map.legend && map.legend[char];
                    const hasEnemy = map.enemies && map.enemies[char];
                    assert.ok(hasObj || hasEnemy, `Unregistered char '${char}' at row ${r}, col ${c} in ${mapFile}`);
                }
            }
        }
    });

    await t.test('Static images referenced in code and json exist on disk', () => {
        const imageFiles = [
            'public/images/objects/dense_forest.jpg',
            'public/images/objects/forest_canopy_treeline.png',
            'public/images/objects/tree_pixel.png',
            'public/images/objects/mossy_boulder.png',
            'public/images/objects/signpost.png',
            'public/images/objects/barrier_dq.png',
            'public/images/objects/mossy_cave_rock.jpg',
            'public/images/enemies/slime/slime.png',
            'public/images/enemies/undead/skeleton.png',
            'public/images/enemies/demihuman/goblin_mage.png',
            'public/images/enemies/demihuman/goblin_archer.png',
            'public/images/enemies/insect/tarantula_swamp.png',
            'public/images/enemies/insect/parasite_wasp.png',
            'public/images/enemies/insect/maria_mosquito.png',
            'public/images/enemies/insect/acid_worm.png',
            'public/images/enemies/insect/poison_moth.png',
            'public/images/enemies/reptile/poison_toad.png'
        ];

        for (const img of imageFiles) {
            const imgPath = path.join(projectRoot, img);
            assert.ok(fs.existsSync(imgPath), `Image file exists: ${img}`);
        }
    });
});

test('2. Audio Method Integrity Check (prevents TypeError: this.sound.xxx)', async (t) => {
    const audioJs = fs.readFileSync(path.join(projectRoot, 'public/js/audio.js'), 'utf-8');
    const gameJs = fs.readFileSync(path.join(projectRoot, 'public/js/game.js'), 'utf-8');
    const entitiesJs = fs.readFileSync(path.join(projectRoot, 'public/js/entities.js'), 'utf-8');

    // Extract all methods defined in SoundFX class
    const methodMatches = audioJs.matchAll(/^\s*([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/gm);
    const definedMethods = new Set();
    for (const m of methodMatches) {
        definedMethods.add(m[1]);
    }

    // Extract all this.sound.xxx() or soundFx.xxx() calls
    const soundCalls = new Set();
    const callMatches = (gameJs + '\n' + entitiesJs).matchAll(/(?:this\.sound|soundFx)\.([a-zA-Z0-9_]+)\s*\(/g);
    for (const c of callMatches) {
        soundCalls.add(c[1]);
    }

    for (const method of soundCalls) {
        assert.ok(
            definedMethods.has(method),
            `Sound method '${method}' called in game/entities is defined in SoundFX (found: ${Array.from(definedMethods).join(', ')})`
        );
    }
});

test('3. Texture Method & Property Integrity Check', async (t) => {
    const texturesJs = fs.readFileSync(path.join(projectRoot, 'public/js/textures.js'), 'utf-8');
    const gameJs = fs.readFileSync(path.join(projectRoot, 'public/js/game.js'), 'utf-8');
    const objects = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/objects.json'), 'utf-8'));

    // Extract static createXxx methods in textures.js
    const methodMatches = texturesJs.matchAll(/static\s+([a-zA-Z0-9_]+)\s*\(/g);
    const textureGenerators = new Set();
    for (const m of methodMatches) {
        textureGenerators.add(m[1]);
    }

    // Check game.js calls
    const generatorCalls = gameJs.matchAll(/RetroTextureGenerator\.([a-zA-Z0-9_]+)\s*\(/g);
    for (const call of generatorCalls) {
        assert.ok(
            textureGenerators.has(call[1]),
            `RetroTextureGenerator.${call[1]} called in game.js is defined in textures.js`
        );
    }

    // Check all textures configured in objects.json exist in this.textures
    const texturesInitMatch = gameJs.match(/this\.textures\s*=\s*\{([^}]+)\}/s);
    assert.ok(texturesInitMatch, 'this.textures initialization found in game.js');
    const initText = texturesInitMatch[1];
    
    for (const [objId, def] of Object.entries(objects)) {
        if (def.texture) {
            // camelCase variant: e.g. dense_forest -> denseForest
            const camelKey = def.texture.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            const hasTex = initText.includes(`${def.texture}:`) || initText.includes(`${camelKey}:`) || def.texture === 'brick' || def.texture === 'rock';
            assert.ok(
                hasTex,
                `Texture key '${def.texture}' (or '${camelKey}') for object '${objId}' is initialized in game.js textures`
            );
        }
    }
});

test('4. Variable Scope & Syntax Static Analysis', async (t) => {
    const jsFiles = [
        'public/js/game.js',
        'public/js/textures.js',
        'public/js/entities.js',
        'public/js/npc.js',
        'public/js/audio.js',
        'public/js/particles.js',
        'public/js/sdAssetManager.js'
    ];

    for (const file of jsFiles) {
        const filePath = path.join(projectRoot, file);

        // 1. Rigorous Node.js compiler syntax check on every JS file
        // (Bun の --check は import を解決しようとして '/js/three.module.js' で失敗するため、Bun 実行時は構文のみ検査する)
        assert.doesNotThrow(() => {
            if (typeof Bun !== 'undefined') {
                new Bun.Transpiler({ loader: 'js' }).transformSync(fs.readFileSync(filePath, 'utf-8'));
            } else {
                execFileSync(process.execPath, ['--check', filePath], { encoding: 'utf-8' });
            }
        }, `JavaScript syntax check failed for: ${file}`);

        const code = fs.readFileSync(filePath, 'utf-8');

        // 2. Ensure worldMoveX is declared before being used in hypot
        const hypotMatches = [...code.matchAll(/Math\.hypot\([^)]*worldMoveX[^)]*\)/g)];
        for (const m of hypotMatches) {
            const declIdx = code.indexOf('let worldMoveX');
            assert.ok(declIdx !== -1 && declIdx < m.index, 'worldMoveX must be declared before use');
        }
    }
});
