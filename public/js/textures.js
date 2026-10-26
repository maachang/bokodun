import * as THREE from '/js/three.module.js';

// Procedural 16x16 / 32x32 retro pixel texture generator
export class RetroTextureGenerator {
    static createBrickTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark mortar
        ctx.fillStyle = '#222026';
        ctx.fillRect(0, 0, 64, 64);

        // Brick color palette
        const brickColors = ['#8f4035', '#a64a3e', '#73332b', '#5c2923'];

        const rows = 8;
        const rowH = 8;
        for (let r = 0; r < rows; r++) {
            const cols = 4;
            const colW = 16;
            const offset = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c <= cols; c++) {
                const color = brickColors[Math.floor(Math.random() * brickColors.length)];
                ctx.fillStyle = color;
                ctx.fillRect(c * colW + offset + 1, r * rowH + 1, colW - 2, rowH - 2);

                // Add pixel noise
                for (let px = 0; px < 10; px++) {
                    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)';
                    ctx.fillRect(
                        c * colW + offset + 2 + Math.floor(Math.random() * (colW - 4)),
                        r * rowH + 2 + Math.floor(Math.random() * (rowH - 4)),
                        1, 1
                    );
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }

    static createStoneFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#2d2e33';
        ctx.fillRect(0, 0, 64, 64);

        for (let x = 0; x < 64; x += 16) {
            for (let y = 0; y < 64; y += 16) {
                ctx.strokeStyle = '#1a1b1e';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, 16, 16);

                const tone = Math.floor(Math.random() * 20);
                ctx.fillStyle = `rgb(${45 + tone}, ${46 + tone}, ${51 + tone})`;
                ctx.fillRect(x + 1, y + 1, 14, 14);

                for (let i = 0; i < 8; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? '#4b4d54' : '#222326';
                    ctx.fillRect(x + 2 + Math.floor(Math.random() * 12), y + 2 + Math.floor(Math.random() * 12), 1, 1);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    static createGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const greens = ['#2b5c2a', '#346d32', '#3e823b', '#254e24', '#499b45'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }

        // Little flowers or light grass blades
        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = Math.random() > 0.3 ? '#74d66f' : '#ffd54f';
            const rx = Math.floor(Math.random() * 62);
            const ry = Math.floor(Math.random() * 62);
            ctx.fillRect(rx, ry, 2, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    static createSandTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Warm sand base
        const sandTones = ['#d4b26f', '#c9a55e', '#deb878', '#bfa054', '#ecd295'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = sandTones[Math.floor(Math.random() * sandTones.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }

        // Dune ripple lines & coarse sand grains
        for (let y = 8; y < 64; y += 16) {
            ctx.fillStyle = 'rgba(139, 105, 45, 0.25)';
            ctx.fillRect(0, y, 64, 2);
            ctx.fillStyle = 'rgba(255, 245, 200, 0.3)';
            ctx.fillRect(0, y - 1, 64, 1);
        }

        for (let i = 0; i < 30; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#9e7939' : '#fff3cd';
            const rx = Math.floor(Math.random() * 63);
            const ry = Math.floor(Math.random() * 63);
            ctx.fillRect(rx, ry, 1, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    static createShallowWaterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Light emerald aqua / turquoise for shallow water
        const shallowTones = ['#48cae4', '#56cfe1', '#38bdf8', '#72efdd', '#2acbda'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = shallowTones[Math.floor(Math.random() * shallowTones.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }

        // Sandy bottom visible through clear shallow water
        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = 'rgba(212, 178, 111, 0.4)';
            const rx = Math.floor(Math.random() * 60);
            const ry = Math.floor(Math.random() * 60);
            ctx.fillRect(rx, ry, 3, 3);
        }

        // Gentle rippling highlights
        const waveRows = [10, 26, 42, 54];
        waveRows.forEach((wy, idx) => {
            const offset = (idx % 2 === 0) ? 0 : 8;
            for (let x = 0; x < 64; x += 16) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                ctx.fillRect(x + offset, wy, 6, 2);
            }
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    static createWaterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Deep navy/abyssal blue for deep pool
        const deepBlues = ['#0c2d48', '#145da0', '#0f3a60', '#1b4965', '#0e3854'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = deepBlues[Math.floor(Math.random() * deepBlues.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }

        // Heavy dark currents and whitecaps
        const waveRows = [8, 24, 40, 56];
        waveRows.forEach((wy, idx) => {
            const offset = (idx % 2 === 0) ? 4 : 12;
            for (let x = 0; x < 64; x += 16) {
                ctx.fillStyle = 'rgba(40, 140, 200, 0.6)';
                ctx.fillRect(x + offset, wy, 8, 2);
                ctx.fillStyle = 'rgba(220, 245, 255, 0.9)';
                ctx.fillRect(x + offset + 2, wy, 4, 1);
            }
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 1. Lava / Magma
    static createLavaTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Intense glowing molten lava: deep crimson, vivid magma red, and fiery orange
        const lavaColors = ['#ff1e00', '#ff3700', '#ff5a00', '#dc2626', '#b91c1c', '#ea580c'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = lavaColors[Math.floor(Math.random() * lavaColors.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }
        // Floating craggy obsidian crust plates
        for (let i = 0; i < 14; i++) {
            ctx.fillStyle = '#1c0804';
            const cx = Math.floor(Math.random() * 54);
            const cy = Math.floor(Math.random() * 54);
            ctx.fillRect(cx, cy, 6 + Math.floor(Math.random() * 6), 4 + Math.floor(Math.random() * 4));
        }
        // Glowing hot magma cracks & veins (intense searing yellow & white cores)
        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = (i % 3 === 0) ? '#ffffff' : '#fef08a';
            const vx = Math.floor(Math.random() * 60);
            const vy = Math.floor(Math.random() * 60);
            ctx.fillRect(vx, vy, 2, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 1b. Heat Haze / Magma Heat Shimmer (subtle scorching air distortion, horizontally flat and hot)
    static createHeatHazeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 64, 64);

        // Horizontally stretched scorching heat air pockets originating directly from the bottom edge
        const puffs = [
            { x: 32, y: 56, rx: 28, ry: 12, color: 'rgba(255, 110, 30, ' },
            { x: 18, y: 52, rx: 20, ry: 10, color: 'rgba(255, 150, 45, ' },
            { x: 46, y: 50, rx: 22, ry: 11, color: 'rgba(255, 180, 60, ' },
            { x: 32, y: 36, rx: 24, ry: 9, color: 'rgba(255, 210, 100, ' }
        ];

        for (const p of puffs) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(p.rx / p.ry, 1);
            const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, p.ry);
            grad.addColorStop(0, p.color + '0.50)');
            grad.addColorStop(0.5, p.color + '0.30)');
            grad.addColorStop(0.85, p.color + '0.10)');
            grad.addColorStop(1, p.color + '0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, p.ry, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Tiny glowing embers in the blistering heat
        ctx.fillStyle = 'rgba(255, 245, 180, 0.75)';
        ctx.fillRect(24, 52, 2, 1);
        ctx.fillRect(38, 50, 2, 1);
        ctx.fillRect(30, 40, 2, 1);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        return texture;
    }

    // 2. Poison Swamp
    static createPoisonSwampTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Toxic dark purple / murky green mire
        const swampColors = ['#3b184f', '#4d1e66', '#2a1238', '#2d4726', '#416335', '#571861'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = swampColors[Math.floor(Math.random() * swampColors.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }
        // Toxic bubbling rings
        const bubbles = [[16, 16], [44, 20], [28, 44], [52, 48]];
        bubbles.forEach(([bx, by]) => {
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx - 4, by - 4, 8, 8);
            ctx.fillStyle = '#c084fc';
            ctx.fillRect(bx - 1, by - 1, 2, 2);
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(bx + 1, by + 1, 1, 1);
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 3. Ice / Frozen Surface
    static createIceTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Pale crystalline whites and icy cyans
        const iceColors = ['#dbeafe', '#bfdbfe', '#93c5fd', '#e0f2fe', '#bae6fd'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = iceColors[Math.floor(Math.random() * iceColors.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }
        // Sharp frozen surface fractures / cracks
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, 12); ctx.lineTo(24, 28); ctx.lineTo(20, 48);
        ctx.moveTo(38, 4); ctx.lineTo(44, 24); ctx.lineTo(58, 36);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.strokeRect(4, 4, 56, 56);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 4. Wood Bridge / Planks
    static createWoodBridgeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark spacing between planks
        ctx.fillStyle = '#1c130c';
        ctx.fillRect(0, 0, 64, 64);

        // Horizontal wooden planks
        const plankH = 14;
        const woodTones = ['#784c28', '#8a572f', '#663f20', '#9c6436'];
        for (let y = 1; y < 64; y += 16) {
            ctx.fillStyle = woodTones[Math.floor(Math.random() * woodTones.length)];
            ctx.fillRect(0, y, 64, plankH);

            // Wood grain streaks
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.fillRect(0, y + 4, 64, 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(0, y + 1, 64, 1);

            // Nail rivets on plank ends
            ctx.fillStyle = '#222';
            ctx.fillRect(4, y + 6, 2, 2);
            ctx.fillRect(58, y + 6, 2, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 5. Cobblestone Path
    static createCobblestonePathTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Earth / dirt grout
        ctx.fillStyle = '#3f362a';
        ctx.fillRect(0, 0, 64, 64);

        // Smooth cobblestones
        const stoneTones = ['#75716b', '#8a857e', '#615d57', '#9c968d', '#54504a'];
        for (let r = 0; r < 4; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                const sx = c * 16 + shift;
                const sy = r * 16;
                ctx.fillStyle = stoneTones[Math.floor(Math.random() * stoneTones.length)];
                ctx.fillRect(sx + 2, sy + 2, 12, 12);

                // Top highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fillRect(sx + 3, sy + 3, 10, 2);
                // Bottom shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(sx + 3, sy + 11, 10, 2);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 6. Magic Circle Floor
    static createMagicCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark obsidian stone slab
        ctx.fillStyle = '#110e1c';
        ctx.fillRect(0, 0, 64, 64);

        // Glowing runic arcane circle
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(32, 32, 26, 0, Math.PI * 2);
        ctx.arc(32, 32, 18, 0, Math.PI * 2);
        ctx.stroke();

        // Hexagram / Star
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const x = 32 + Math.cos(angle) * 16;
            const y = 32 + Math.sin(angle) * 16;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Glowing Core
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(30, 30, 4, 4);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 7. Spike Trap Tile
    static createSpikeTrapTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Iron plate base
        ctx.fillStyle = '#33383f';
        ctx.fillRect(0, 0, 64, 64);
        ctx.strokeStyle = '#1e2227';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 62, 62);

        // Hole grid with sharp spike tips
        for (let x = 12; x <= 52; x += 14) {
            for (let y = 12; y <= 52; y += 14) {
                // Holes
                ctx.fillStyle = '#0f1115';
                ctx.fillRect(x - 3, y - 3, 6, 6);
                // Silver spike points
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(x - 1, y - 1, 2, 2);
                ctx.fillStyle = '#ef4444'; // Blood-stained spike tip
                ctx.fillRect(x, y, 1, 1);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 8. Pitfall / Cracked Floor
    static createPitfallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Aged weathered stone
        ctx.fillStyle = '#47433b';
        ctx.fillRect(0, 0, 64, 64);

        // Deep black abyss cracks
        ctx.strokeStyle = '#0a0907';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(32, 4); ctx.lineTo(26, 24); ctx.lineTo(38, 38); ctx.lineTo(30, 60);
        ctx.moveTo(4, 30); ctx.lineTo(26, 24);
        ctx.moveTo(60, 34); ctx.lineTo(38, 38);
        ctx.stroke();

        // Crumbling rock edges
        ctx.fillStyle = '#22201c';
        ctx.fillRect(24, 22, 6, 6);
        ctx.fillRect(36, 36, 5, 5);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 9. Dragon Quest 2/3 style Electric Barrier Floor (ファミコン・ドラクエ風バリア床)
    static createElectricBarrierTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');

        // Classic FC DQ Barrier: Searing Red base with bright yellow/white crackling electric lightning
        ctx.fillStyle = '#b91c1c'; // Deep danger red
        ctx.fillRect(0, 0, 16, 16);

        // Dark red border grid
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, 16, 16);

        // Center electric diamond pattern (FC DQ2/3 iconic diamond motif)
        ctx.fillStyle = '#fef08a'; // Bright electric yellow
        const pts = [
            [7, 2], [8, 2],
            [5, 4], [6, 4], [9, 4], [10, 4],
            [3, 6], [4, 6], [11, 6], [12, 6],
            [1, 7], [2, 7], [13, 7], [14, 7],
            [1, 8], [2, 8], [13, 8], [14, 8],
            [3, 9], [4, 9], [11, 9], [12, 9],
            [5, 11], [6, 11], [9, 11], [10, 11],
            [7, 13], [8, 13]
        ];
        pts.forEach(([px, py]) => ctx.fillRect(px, py, 1, 1));

        // Blinding white inner lightning spark nodes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(7, 7, 2, 2);
        ctx.fillRect(4, 7, 1, 1);
        ctx.fillRect(11, 7, 1, 1);
        ctx.fillRect(7, 4, 1, 1);
        ctx.fillRect(7, 11, 1, 1);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 10. Heavy Dungeon Iron/Wood Door
    static createDoorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark aged oak background
        ctx.fillStyle = '#452b16';
        ctx.fillRect(0, 0, 64, 64);

        // Stone/Iron Frame Border
        ctx.strokeStyle = '#27190d';
        ctx.lineWidth = 3;
        ctx.strokeRect(1, 1, 62, 62);

        // Vertical wood planks
        ctx.strokeStyle = '#2b1b0e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, 0); ctx.lineTo(16, 64);
        ctx.moveTo(32, 0); ctx.lineTo(32, 64);
        ctx.moveTo(48, 0); ctx.lineTo(48, 64);
        ctx.stroke();

        // Horizontal Iron reinforcement bands
        const bands = [12, 34, 52];
        bands.forEach(by => {
            ctx.fillStyle = '#1e2229';
            ctx.fillRect(2, by, 60, 6);
            ctx.fillStyle = '#64748b'; // Highlight
            ctx.fillRect(2, by, 60, 1);
            // Iron rivets / bolts
            for (let rx = 8; rx <= 56; rx += 12) {
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(rx, by + 2, 2, 2);
            }
        });

        // Golden Brass Keyhole / Door Knocker Ring in center
        ctx.fillStyle = '#d97706';
        ctx.fillRect(44, 28, 4, 8);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(44, 28, 4, 2);
        ctx.fillStyle = '#0f0a05';
        ctx.fillRect(45, 31, 2, 3); // Keyhole

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }

    // Mossy stacked natural stone wall for Caverns / Caves (緑色の石積み壁)
    static createMossyStoneWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark earthy moss mortar base
        ctx.fillStyle = '#1c281e';
        ctx.fillRect(0, 0, 64, 64);

        // Stacked irregular natural fieldstones with mossy greens and slate tones
        const stonePalette = [
            '#3a5338', '#2e442d', '#496544', '#3d4f3b', // Deep moss greens
            '#526b4f', '#627f5e', '#344933', '#253825', // Olive / lichen greens
            '#4a544b', '#576258'                         // Grayish weathered stone tones
        ];

        // Layer irregular stone courses
        const rows = [
            { y: 0, h: 12, stones: [16, 22, 14, 18] },
            { y: 13, h: 10, stones: [20, 16, 20, 14] },
            { y: 24, h: 14, stones: [14, 24, 18, 16] },
            { y: 39, h: 11, stones: [18, 16, 22, 14] },
            { y: 51, h: 13, stones: [22, 18, 16, 16] }
        ];

        rows.forEach(row => {
            let curX = 0;
            row.stones.forEach(sw => {
                const color = stonePalette[Math.floor(Math.random() * stonePalette.length)];
                ctx.fillStyle = color;
                // Rounded natural stone shape (not rectangular brick)
                ctx.fillRect(curX + 1, row.y + 1, sw - 2, row.h - 2);

                // Top highlight (mossy light glint)
                ctx.fillStyle = 'rgba(167, 243, 137, 0.22)';
                ctx.fillRect(curX + 2, row.y + 1, sw - 4, 2);

                // Bottom shadow
                ctx.fillStyle = 'rgba(10, 20, 12, 0.45)';
                ctx.fillRect(curX + 2, row.y + row.h - 2, sw - 4, 1);

                // Natural stone speckle / moss flecks
                for (let k = 0; k < 4; k++) {
                    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(110, 231, 137, 0.3)' : 'rgba(15, 30, 18, 0.4)';
                    ctx.fillRect(curX + 2 + Math.floor(Math.random() * (sw - 4)), row.y + 2 + Math.floor(Math.random() * (row.h - 4)), 1, 1);
                }

                curX += sw;
            });
        });

        // Dangling / creeping vine moss tendrils across gaps
        ctx.fillStyle = '#4ade80';
        for (let i = 0; i < 24; i++) {
            const vx = Math.floor(Math.random() * 62);
            const vy = Math.floor(Math.random() * 62);
            ctx.fillRect(vx, vy, 1, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    static createRockWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Dark volcanic rock base
        ctx.fillStyle = '#262327';
        ctx.fillRect(0, 0, 128, 128);

        // Craggy rock blocks with layered shading
        const rockHues = ['#3d393d', '#4a444c', '#575059', '#322d33', '#68606b'];
        for (let y = 0; y < 128; y += 16) {
            const shift = (y % 32 === 0) ? 0 : 8;
            for (let x = -8; x < 136; x += 24) {
                const w = 22 + (Math.random() * 4 - 2);
                const h = 14;
                ctx.fillStyle = rockHues[Math.floor(Math.random() * rockHues.length)];
                ctx.fillRect(x + shift + 1, y + 1, w - 2, h - 2);

                // Highlight top edge
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.fillRect(x + shift + 1, y + 1, w - 2, 2);

                // Shadow bottom edge
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(x + shift + 1, y + h - 2, w - 2, 2);

                // Internal rock crack grain
                for (let k = 0; k < 6; k++) {
                    ctx.fillStyle = Math.random() > 0.5 ? '#1f1b20' : '#7d7480';
                    ctx.fillRect(
                        x + shift + 2 + Math.floor(Math.random() * (w - 4)),
                        y + 2 + Math.floor(Math.random() * (h - 4)),
                        2, 2
                    );
                }
            }
        }

        // Deep jagged vertical crevices
        ctx.strokeStyle = '#141216';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(25, 0); ctx.lineTo(32, 40); ctx.lineTo(20, 80); ctx.lineTo(35, 128);
        ctx.moveTo(85, 0); ctx.lineTo(75, 45); ctx.lineTo(90, 95); ctx.lineTo(80, 128);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 11. Village Wooden Wall Texture (for rustic timber houses)
    static createWoodWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark mortar / timber shadow base
        ctx.fillStyle = '#27170c';
        ctx.fillRect(0, 0, 64, 64);

        // Horizontal rustic wood logs / timber planks
        const logH = 14;
        const colors = ['#8d5b32', '#a0683b', '#7a4e2b', '#946135'];
        for (let y = 1; y < 64; y += 16) {
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(0, y, 64, logH);

            // Wood grain streaks
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(0, y + 4, 64, 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(0, y + 1, 64, 2);

            // Timber end joints / nails
            ctx.fillStyle = '#1e1108';
            ctx.fillRect(6, y + 6, 2, 2);
            ctx.fillRect(56, y + 6, 2, 2);
        }

        // Vertical support studs at intervals
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, 4, 64);
        ctx.fillRect(60, 0, 4, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 12. Wooden Fence Texture (for village boundaries & pastures)
    static createWoodenFenceTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Transparent background between fence rails
        ctx.clearRect(0, 0, 64, 64);

        // Vertical fence posts (wooden stakes with pointed tips)
        const postPositions = [6, 26, 46];
        const postW = 10;
        const postColor = '#8c5930';
        const shadowColor = '#5e381b';
        const highlightColor = '#b57843';

        postPositions.forEach(px => {
            // Shadow side
            ctx.fillStyle = shadowColor;
            ctx.fillRect(px, 12, postW, 52);

            // Main post body
            ctx.fillStyle = postColor;
            ctx.fillRect(px + 2, 12, postW - 3, 52);

            // Highlight side
            ctx.fillStyle = highlightColor;
            ctx.fillRect(px + 1, 12, 2, 52);

            // Pointed picket top
            ctx.fillStyle = postColor;
            ctx.beginPath();
            ctx.moveTo(px + postW / 2, 4);
            ctx.lineTo(px, 12);
            ctx.lineTo(px + postW, 12);
            ctx.closePath();
            ctx.fill();

            // Tip highlight & shadow
            ctx.fillStyle = highlightColor;
            ctx.beginPath();
            ctx.moveTo(px + postW / 2, 4);
            ctx.lineTo(px, 12);
            ctx.lineTo(px + postW / 2, 12);
            ctx.closePath();
            ctx.fill();
        });

        // Horizontal wooden cross rails
        const railYs = [22, 44];
        const railH = 7;
        railYs.forEach(ry => {
            // Shadow
            ctx.fillStyle = shadowColor;
            ctx.fillRect(0, ry + railH - 2, 64, 2);

            // Rail body
            ctx.fillStyle = '#9e6738';
            ctx.fillRect(0, ry, 64, railH - 2);

            // Rail highlight
            ctx.fillStyle = '#c58a52';
            ctx.fillRect(0, ry, 64, 2);

            // Fastener nails on each post intersection
            postPositions.forEach(px => {
                ctx.fillStyle = '#22140a';
                ctx.fillRect(px + postW / 2 - 1, ry + railH / 2 - 1, 2, 2);
            });
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 13. Village Roof Texture (thatched / red-brown tile roof)
    static createVillageRoofTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Terracotta / Cedar shingle tiles
        ctx.fillStyle = '#5c2c16';
        ctx.fillRect(0, 0, 64, 64);

        const rowH = 10;
        const tileColors = ['#9c4927', '#b55831', '#853e20', '#a84e2a'];
        for (let y = 0; y < 64; y += rowH) {
            const shift = ((y / rowH) % 2 === 0) ? 0 : 8;
            for (let x = -8; x < 64; x += 16) {
                ctx.fillStyle = tileColors[Math.floor(Math.random() * tileColors.length)];
                ctx.fillRect(x + shift + 1, y + 1, 14, rowH - 2);

                // Shingle highlights & shadow
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fillRect(x + shift + 1, y + 1, 14, 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.fillRect(x + shift + 1, y + rowH - 2, 14, 1);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 14. Village Dirt Road Texture
    static createDirtRoadTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Warm earthy brown base
        ctx.fillStyle = '#6e543c';
        ctx.fillRect(0, 0, 64, 64);

        // Earth noise & small stones
        const dirtTones = ['#5a432e', '#7c6147', '#4d3926', '#876c52'];
        for (let i = 0; i < 90; i++) {
            ctx.fillStyle = dirtTones[Math.floor(Math.random() * dirtTones.length)];
            const rx = Math.floor(Math.random() * 63);
            const ry = Math.floor(Math.random() * 63);
            ctx.fillRect(rx, ry, 2, 2);
        }

        // Pebble stones scattered on dirt road
        for (let i = 0; i < 18; i++) {
            ctx.fillStyle = '#9e9182';
            const px = Math.floor(Math.random() * 62);
            const py = Math.floor(Math.random() * 62);
            ctx.fillRect(px, py, 2, 2);
            ctx.fillStyle = '#3a2d22';
            ctx.fillRect(px, py + 2, 2, 1);
        }

        // Wagon wheel rut impressions
        ctx.fillStyle = 'rgba(40, 28, 18, 0.45)';
        ctx.fillRect(14, 0, 6, 64);
        ctx.fillRect(44, 0, 6, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 15. City Stone Wall (European fortified city wall / rampart with stone blocks)
    static createCityWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark grey mortar
        ctx.fillStyle = '#262930';
        ctx.fillRect(0, 0, 64, 64);

        // Ashlar dressed stone blocks (clean European castle/city wall stones)
        const stoneColors = ['#6e7682', '#7b8391', '#5a616d', '#8a93a3', '#646c78'];
        const rowH = 16;
        for (let r = 0; r < 4; r++) {
            const shift = (r % 2 === 0) ? 0 : 16;
            for (let c = -1; c < 3; c++) {
                const sx = c * 32 + shift;
                const sy = r * 16;
                ctx.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
                ctx.fillRect(sx + 2, sy + 2, 28, 12);

                // Top & left bevel highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fillRect(sx + 2, sy + 2, 28, 2);
                ctx.fillRect(sx + 2, sy + 2, 2, 12);

                // Bottom & right shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.fillRect(sx + 2, sy + 12, 28, 2);
                ctx.fillRect(sx + 28, sy + 2, 2, 12);

                // Micro texture noise
                for (let i = 0; i < 8; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
                    ctx.fillRect(sx + 4 + Math.random() * 22, sy + 4 + Math.random() * 7, 2, 2);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 16. Shop Brick House Wall (with decorative timber beam & storefront window)
    static createShopWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Warm European red/ochre brick base
        ctx.fillStyle = '#221915';
        ctx.fillRect(0, 0, 64, 64);
        const brickColors = ['#a24a38', '#b4533e', '#883e2f', '#964434'];
        for (let r = 0; r < 8; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                ctx.fillStyle = brickColors[Math.floor(Math.random() * brickColors.length)];
                ctx.fillRect(c * 16 + shift + 1, r * 8 + 1, 14, 6);
            }
        }

        // Shop display window (bay window with glass panes & awning)
        // Dark window frame
        ctx.fillStyle = '#2d1b0d';
        ctx.fillRect(12, 22, 40, 32);

        // Glass pane (warm golden interior light reflection)
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(15, 25, 34, 26);

        // Shop items on display silhouette
        ctx.fillStyle = '#7a3b12';
        ctx.fillRect(18, 38, 8, 10); // potion bottle / vase
        ctx.fillRect(30, 40, 14, 8); // bread / goods box
        ctx.fillStyle = '#38bdf8'; // blue magic flask
        ctx.fillRect(20, 34, 4, 6);

        // Window muntin grid bars
        ctx.fillStyle = '#2d1b0d';
        ctx.fillRect(31, 25, 2, 26);
        ctx.fillRect(15, 37, 34, 2);

        // Striped shop awning on top (red and white European canvas)
        for (let x = 8; x < 56; x += 8) {
            ctx.fillStyle = ((x / 8) % 2 === 0) ? '#e11d48' : '#f8fafc';
            ctx.fillRect(x, 14, 8, 8);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 17. Inn Brick House Wall (comfortable tavern/inn with lantern sign)
    static createInnWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Sturdy brown-red brick wall base
        ctx.fillStyle = '#1c1613';
        ctx.fillRect(0, 0, 64, 64);
        const brickColors = ['#8d4633', '#9c4d38', '#773b2c', '#aa543e'];
        for (let r = 0; r < 8; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                ctx.fillStyle = brickColors[Math.floor(Math.random() * brickColors.length)];
                ctx.fillRect(c * 16 + shift + 1, r * 8 + 1, 14, 6);
            }
        }

        // Half-timbered cross beams (European fachwerk)
        ctx.fillStyle = '#3f2512';
        ctx.fillRect(0, 0, 64, 4);
        ctx.fillRect(0, 60, 64, 4);
        ctx.fillRect(0, 0, 4, 64);
        ctx.fillRect(60, 0, 4, 64);

        // Inn double windows with cosy warm yellow tavern light
        ctx.fillStyle = '#28170b';
        ctx.fillRect(10, 20, 20, 24);
        ctx.fillRect(34, 20, 20, 24);

        ctx.fillStyle = '#fbbf24'; // Warm tavern lantern light
        ctx.fillRect(12, 22, 16, 20);
        ctx.fillRect(36, 22, 16, 20);

        // Window curtains & frame
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(12, 22, 4, 20);
        ctx.fillRect(24, 22, 4, 20);
        ctx.fillRect(36, 22, 4, 20);
        ctx.fillRect(48, 22, 4, 20);

        // Window grid
        ctx.fillStyle = '#28170b';
        ctx.fillRect(19, 22, 2, 20);
        ctx.fillRect(12, 31, 16, 2);
        ctx.fillRect(43, 22, 2, 20);
        ctx.fillRect(36, 31, 16, 2);

        // Hanging wooden tavern sign banner (bed symbol)
        ctx.fillStyle = '#5c3317';
        ctx.fillRect(24, 6, 16, 10);
        ctx.strokeStyle = '#222';
        ctx.strokeRect(24, 6, 16, 10);
        // Moon / star emblem on inn sign
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(30, 8, 4, 4);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 18. City Slate Blue Roof Texture (French/German Parisian blue slate roofs)
    static createCityRoofTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark navy slate base
        ctx.fillStyle = '#1e2430';
        ctx.fillRect(0, 0, 64, 64);

        // Blue-grey slate shingles
        const rowH = 8;
        const slateColors = ['#334155', '#3f4f66', '#2b384a', '#475569'];
        for (let y = 0; y < 64; y += rowH) {
            const shift = ((y / rowH) % 2 === 0) ? 0 : 8;
            for (let x = -8; x < 64; x += 16) {
                ctx.fillStyle = slateColors[Math.floor(Math.random() * slateColors.length)];
                ctx.fillRect(x + shift + 1, y + 1, 14, rowH - 2);

                // Top highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
                ctx.fillRect(x + shift + 1, y + 1, 14, 1);
                // Bottom shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(x + shift + 1, y + rowH - 2, 14, 1);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 19. European Paver Road (Paved stone plaza / street)
    static createPavedRoadTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark stone mortar
        ctx.fillStyle = '#2d3339';
        ctx.fillRect(0, 0, 64, 64);

        // Elegant European interlocking paver stones (fan / herringbone style blocks)
        const paverColors = ['#88929e', '#9ba5b2', '#76808c', '#a6b0bd', '#6d7782'];
        const blockW = 16;
        const blockH = 8;

        for (let r = 0; r < 8; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                const sx = c * blockW + shift;
                const sy = r * blockH;
                ctx.fillStyle = paverColors[Math.floor(Math.random() * paverColors.length)];
                ctx.fillRect(sx + 1, sy + 1, blockW - 2, blockH - 2);

                // Sunlit bevel edge
                ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.fillRect(sx + 1, sy + 1, blockW - 2, 1);
                ctx.fillRect(sx + 1, sy + 1, 1, blockH - 2);

                // Shadow bevel edge
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(sx + 1, sy + blockH - 2, blockW - 2, 1);
                ctx.fillRect(sx + blockW - 2, sy + 1, 1, blockH - 2);
            }
        }

        // Center drainage curb line (European street gutter)
        ctx.fillStyle = 'rgba(20, 24, 30, 0.35)';
        ctx.fillRect(30, 0, 4, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // 20. Town Fountain Texture (for central plaza water basin)
    static createFountainWaterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Sparkling azure blue fountain water
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(0, 0, 64, 64);

        // Rippling water highlights
        const waveColors = ['#38bdf8', '#7dd3fc', '#bae6fd', '#0369a1'];
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = waveColors[Math.floor(Math.random() * waveColors.length)];
            const rx = Math.floor(Math.random() * 60);
            const ry = Math.floor(Math.random() * 60);
            ctx.fillRect(rx, ry, 3 + Math.floor(Math.random() * 4), 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // Slime sprite: loads real character artwork from sdServer
    static createSlimeTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/slime_char.png?v2=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }

    // Skeleton warrior sprite
    static createSkeletonTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/skeleton_char.png?v2=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }

    // Goblin Shaman / Mage sprite
    static createGoblinTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/goblin_mage.png?v2=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }

    // Goblin Archer sprite
    static createGoblinArcherTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/enemies/goblin_archer.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }

    // Tree billboard: loads clean pre-processed transparent PNG
    static createTreeTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/objects/tree_pixel.png?t=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }

    // Mossy Boulder sprite
    static createBoulderTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/objects/mossy_boulder.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }

    // Wooden Signpost sprite
    static createSignpostTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/objects/signpost.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }
}
