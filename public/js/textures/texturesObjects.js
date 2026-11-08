// 罠・仕掛け・宝箱・岩・立て札のテクスチャ。RetroTextureGenerator の静的メソッド（public/js/textures.js が、クラスの定義のあとで、RetroTextureGenerator へ組み込む）。
// 元は public/js/textures.js の RetroTextureGenerator。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

export const objectTextures = {
    // 7. Spike Trap Tile
    createSpikeTrapTexture() {
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
    },

    // 8. Pitfall / Cracked Floor
    createPitfallTexture() {
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
    },

    // 9. Dragon Quest 2/3 style Electric Barrier Floor (ファミコン・ドラクエ風バリア床)
    createElectricBarrierTexture() {
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
    },

    // 21. Prince of Persia Steel Chomper Blade Texture
    createChomperBladeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, 64, 64);

        // Razor-sharp crescent steel blade (PoP iconic guillotine teeth)
        ctx.fillStyle = '#64748b'; // Dark steel base
        ctx.beginPath();
        ctx.moveTo(4, 32);
        ctx.lineTo(60, 4);
        ctx.lineTo(54, 32);
        ctx.lineTo(60, 60);
        ctx.closePath();
        ctx.fill();

        // Gleaming razor silver edge
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(4, 32);
        ctx.lineTo(60, 6);
        ctx.lineTo(56, 12);
        ctx.lineTo(16, 32);
        ctx.lineTo(56, 52);
        ctx.lineTo(60, 58);
        ctx.closePath();
        ctx.fill();

        // Blood stains on blade edge (PoP gruesome touch)
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(8, 30, 8, 4);
        ctx.fillRect(18, 22, 6, 3);
        ctx.fillRect(18, 39, 6, 3);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(10, 31, 4, 2);

        // Heavy iron reinforcement spine
        ctx.fillStyle = '#334155';
        ctx.fillRect(52, 6, 8, 52);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(56, 8, 3, 48);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 22. PoP Floor Spike Pit Hole Plate Texture
    createPoPSpikePlateTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Weathered dungeon flagstone
        ctx.fillStyle = '#3a3532';
        ctx.fillRect(0, 0, 64, 64);

        // Deep black square holes where long steel spikes shoot out
        const holes = [
            [12, 12], [32, 12], [52, 12],
            [22, 32], [42, 32],
            [12, 52], [32, 52], [52, 52]
        ];

        holes.forEach(([hx, hy]) => {
            // Recessed hole cavity
            ctx.fillStyle = '#0a0908';
            ctx.fillRect(hx - 5, hy - 5, 10, 10);
            ctx.strokeStyle = '#1f1b18';
            ctx.strokeRect(hx - 5, hy - 5, 10, 10);

            // Glimmer of retracted spike tip resting deep inside
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(hx - 1, hy - 1, 2, 2);
        });

        // Dried blood marks on stone surface
        ctx.fillStyle = 'rgba(127, 29, 29, 0.6)';
        ctx.fillRect(18, 24, 7, 5);
        ctx.fillRect(38, 44, 9, 4);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 23. PoP Crumbling / Falling Floor Stone Texture (Severely fractured flagstone)
    createCrumblingFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark aged slate tile
        ctx.fillStyle = '#47433f';
        ctx.fillRect(0, 0, 64, 64);

        // Grid border grooves
        ctx.strokeStyle = '#272320';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 62, 62);

        // Deep jagged cracks spreading across the stone
        ctx.strokeStyle = '#141210';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Main fracture from top-left to bottom-right
        ctx.moveTo(8, 6);
        ctx.lineTo(20, 18);
        ctx.lineTo(16, 28);
        ctx.lineTo(34, 38);
        ctx.lineTo(46, 34);
        ctx.lineTo(58, 54);
        // Secondary fracture
        ctx.moveTo(34, 38);
        ctx.lineTo(28, 56);
        // Third fracture
        ctx.moveTo(20, 18);
        ctx.lineTo(42, 14);
        ctx.lineTo(56, 22);
        ctx.stroke();

        // White/Grey chipped edges along cracks
        ctx.strokeStyle = '#78716c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(9, 7);
        ctx.lineTo(21, 19);
        ctx.moveTo(35, 39);
        ctx.lineTo(47, 35);
        ctx.stroke();

        // Crumbly loose pebble specs
        ctx.fillStyle = '#1c1917';
        for (let i = 0; i < 24; i++) {
            const rx = 4 + Math.floor(Math.random() * 56);
            const ry = 4 + Math.floor(Math.random() * 56);
            ctx.fillRect(rx, ry, 2, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 24. Pressure Plate Trap Floor Texture (Slightly raised metal/stone trigger switch)
    createPressurePlateTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Outer floor stone
        ctx.fillStyle = '#3a3532';
        ctx.fillRect(0, 0, 64, 64);

        // Recessed shadow border around plate
        ctx.fillStyle = '#141210';
        ctx.fillRect(10, 10, 44, 44);

        // Center raised pressure plate
        ctx.fillStyle = '#64748b'; // Slate metal plate
        ctx.fillRect(13, 13, 38, 38);

        // Plate highlight and bevel
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(13, 13, 38, 3);
        ctx.fillRect(13, 13, 3, 38);

        ctx.fillStyle = '#334155';
        ctx.fillRect(13, 48, 38, 3);
        ctx.fillRect(48, 13, 3, 38);

        // Rivets at four corners of the trigger plate
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(16, 16, 3, 3);
        ctx.fillRect(45, 16, 3, 3);
        ctx.fillRect(16, 45, 3, 3);
        ctx.fillRect(45, 45, 3, 3);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 25. Wall Dart Trap Dispenser Texture (Brick with ominous arrow hole)
    createDartDispenserTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Base dungeon brick background
        ctx.fillStyle = '#222026';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#73332b';
        ctx.fillRect(2, 2, 60, 60);

        // Stone carved demon / gargoyle slit face
        ctx.fillStyle = '#1e1b18';
        ctx.fillRect(16, 16, 32, 32);
        ctx.strokeStyle = '#47433f';
        ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, 32, 32);

        // Ominous circular barrel hole where poison dart shoots from
        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.arc(32, 32, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#292524';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Poison green residue around the barrel nozzle
        ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
        ctx.fillRect(29, 39, 6, 4);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 26. Antique Wooden Chest (with iron bands, lock & golden rivets)
    createChestTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark aged oak wood planks
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(0, 0, 64, 64);

        // Wood grain stripes
        ctx.fillStyle = '#54331d';
        for (let y = 0; y < 64; y += 16) {
            ctx.fillRect(0, y, 64, 2);
            for (let x = 0; x < 64; x += 4) {
                if (Math.random() < 0.3) {
                    ctx.fillStyle = '#452917';
                    ctx.fillRect(x, y + 2 + Math.floor(Math.random() * 12), 3, 1);
                }
            }
        }

        // Heavy dark iron reinforced bands (top, bottom, left, right)
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 8, 64);
        ctx.fillRect(56, 0, 8, 64);
        ctx.fillRect(0, 0, 64, 6);
        ctx.fillRect(0, 58, 64, 6);

        // Center vertical band
        ctx.fillRect(28, 0, 8, 64);

        // Golden lock plate at center
        ctx.fillStyle = '#eab308';
        ctx.fillRect(26, 24, 12, 16);
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(27, 25, 10, 14);

        // Black keyhole
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(32, 29, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(31, 29, 2, 6);

        // Golden studs / rivets on iron bands
        ctx.fillStyle = '#facc15';
        const rivets = [
            [4, 3], [32, 3], [60, 3],
            [4, 20], [60, 20],
            [4, 44], [60, 44],
            [4, 61], [32, 61], [60, 61]
        ];
        rivets.forEach(([rx, ry]) => {
            ctx.fillRect(rx - 1, ry - 1, 2, 2);
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // Mossy Boulder sprite
    createBoulderTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/objects/mossy_boulder.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // Wooden Signpost sprite（板の文字は、世の中に存在しない創作の文字。読めない。scripts/images/make_road_sign.py で作った絵）
    createSignpostTexture() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/images/objects/signpost.png?v=' + Date.now());
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 28. Fire Vent Floor Grate Texture (Dark cast iron furnace grill)
    createFireVentTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark charred cast-iron rim
        ctx.fillStyle = '#1e1c1b';
        ctx.fillRect(0, 0, 64, 64);
        ctx.strokeStyle = '#38322e';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, 60, 60);

        // Vent slot grill (deep orange-red glowing furnace below)
        for (let y = 8; y <= 52; y += 8) {
            // Glowing fiery interior pit beneath grate
            ctx.fillStyle = '#ea580c';
            ctx.fillRect(6, y + 1, 52, 4);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(12, y + 2, 40, 2);

            // Heavy dark iron grate bars
            ctx.fillStyle = '#292524';
            ctx.fillRect(6, y, 52, 3);
            ctx.fillStyle = '#44403c';
            ctx.fillRect(6, y, 52, 1);
        }

        // Cross bracing iron struts
        ctx.fillStyle = '#292524';
        ctx.fillRect(20, 4, 5, 56);
        ctx.fillRect(39, 4, 5, 56);

        // Bolt rivets
        ctx.fillStyle = '#78716c';
        const bolts = [[4, 4], [58, 4], [4, 58], [58, 58], [22, 4], [41, 4], [22, 58], [41, 58]];
        bolts.forEach(([bx, by]) => ctx.fillRect(bx, by, 2, 2));

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 29. Buzzsaw Blade Texture (Round saw disc with sharp serrated teeth)
    createBuzzsawBladeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const cx = 64;
        const cy = 64;
        const numTeeth = 20;
        const outerR = 60;
        const innerR = 48;

        // Serrated saw teeth circle
        ctx.beginPath();
        for (let i = 0; i < numTeeth; i++) {
            const angle1 = (i * 2 * Math.PI) / numTeeth;
            const angle2 = ((i + 0.65) * 2 * Math.PI) / numTeeth;
            const angle3 = ((i + 1.0) * 2 * Math.PI) / numTeeth;

            const x1 = cx + Math.cos(angle1) * outerR;
            const y1 = cy + Math.sin(angle1) * outerR;
            const x2 = cx + Math.cos(angle2) * innerR;
            const y2 = cy + Math.sin(angle2) * innerR;

            if (i === 0) ctx.moveTo(x1, y1);
            else ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.closePath();

        // Metallic steel gradient / radial fill
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 60);
        grad.addColorStop(0, '#f1f5f9');
        grad.addColorStop(0.4, '#94a3b8');
        grad.addColorStop(0.85, '#cbd5e1');
        grad.addColorStop(1, '#475569');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Inner circular blade cutout vents
        const ventRadius = 26;
        for (let i = 0; i < 4; i++) {
            const va = (i * Math.PI) / 2;
            const vx = cx + Math.cos(va) * ventRadius;
            const vy = cy + Math.sin(va) * ventRadius;
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(vx, vy, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Center hub spindle / axle
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();

        // Blood splatters along the cutting edge
        ctx.fillStyle = 'rgba(185, 28, 28, 0.75)';
        for (let i = 0; i < 7; i++) {
            const ba = i * 0.95;
            const bx = cx + Math.cos(ba) * 52;
            const by = cy + Math.sin(ba) * 52;
            ctx.beginPath();
            ctx.arc(bx, by, 3 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        return texture;
    },

    // 30. Buzzsaw Floor Track / Rail Texture
    createBuzzsawRailTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark weathered floor stone base
        ctx.fillStyle = '#2f2b28';
        ctx.fillRect(0, 0, 64, 64);

        // Center deep guide groove / slot where saw blade arm travels
        ctx.fillStyle = '#0a0908';
        ctx.fillRect(0, 26, 64, 12);

        // Steel rail runners on both sides of the trench
        ctx.fillStyle = '#64748b';
        ctx.fillRect(0, 24, 64, 2);
        ctx.fillRect(0, 38, 64, 2);

        // Rail highlights
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 24, 64, 1);
        ctx.fillRect(0, 39, 64, 1);

        // Greased metallic floor track plates & ties
        for (let x = 4; x < 64; x += 16) {
            ctx.fillStyle = '#1e2229';
            ctx.fillRect(x, 18, 8, 28);
            // Tie bolts
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(x + 2, 20, 2, 2);
            ctx.fillRect(x + 2, 42, 2, 2);
        }

        // Metal grind sparks / scratches
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(14, 29); ctx.lineTo(24, 30);
        ctx.moveTo(42, 33); ctx.lineTo(54, 34);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },
};
