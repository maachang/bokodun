// 水・溶岩・沼・橋・魔法陣・噴水のテクスチャ。RetroTextureGenerator の静的メソッド（public/js/textures.js が、クラスの定義のあとで、RetroTextureGenerator へ組み込む）。
// 元は public/js/textures.js の RetroTextureGenerator。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

export const liquidTextures = {
    createShallowWaterTexture() {
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
    },

    createWaterTexture() {
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
    },

    // 1. Lava / Magma
    createLavaTexture() {
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
    },

    // 1b. Heat Haze / Magma Heat Shimmer (subtle scorching air distortion, horizontally flat and hot)
    createHeatHazeTexture() {
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
    },

    // 2. Poison Swamp
    createPoisonSwampTexture() {
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
    },

    // 4. Wood Bridge / Planks
    createWoodBridgeTexture() {
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
    },

    // 6. Magic Circle Floor
    createMagicCircleTexture() {
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
    },

    // 20. Town Fountain Texture (for central plaza water basin)
    createFountainWaterTexture() {
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
    },
};
