// タイルの種類ごとの描画（罠・仕掛け（噛みつく花・針・崩れる床・矢・炎・丸のこなど））。GameEngine.loadMapBody が、マスの物体の種類（objDef.type）に応じて呼ぶ。
// 各メソッドは `this` が GameEngine（呼び出し側が .call(this, t) で渡す）。t は、そのマスの情報（tileContext: r・c・char・wx・wz・objDef・liftH・mapData・rows・cols・tileSize・wallH ほか）。
// 元は game.js の loadMapBody の switch の case。移しただけで、描画の中身は同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

export const tilesTraps = {
    chomper(t) {
        const { c, cols, mapData, objDef, r, rows, tileSize, wx, wz } = t;
        // Prince of Persia Chomper / Steel Guillotine Clamp Trap
        // Detect corridor orientation:
        // East-West corridor has walls at North (r-1) and South (r+1) -> Blades emerge from North & South walls (Z-movement)
        // North-South corridor has walls at West (c-1) and East (c+1) -> Blades emerge from West & East walls (X-movement)
        const isWallLeft = (c > 0 && mapData.layout[r][c - 1] === '1');
        const isWallRight = (c < cols - 1 && mapData.layout[r][c + 1] === '1');
        const isWallTop = (r > 0 && mapData.layout[r - 1][c] === '1');
        const isWallBottom = (r < rows - 1 && mapData.layout[r + 1][c] === '1');

        // In a hallway running East-West (between top & bottom walls), passage is horizontal -> blades come from North/South walls
        const isEastWestPassage = (isWallTop || isWallBottom) && !(isWallLeft && isWallRight);

        const chomperGroup = new THREE.Group();
        const bladeMat = new THREE.MeshLambertMaterial({
            map: this.textures.chomperBlade,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide
        });

        const bladeW = tileSize * 0.52;
        const bladeH = 2.4;
        const bladeGeo = new THREE.PlaneGeometry(bladeW, bladeH);

        const leftBlade = new THREE.Mesh(bladeGeo, bladeMat);
        const rightBlade = new THREE.Mesh(bladeGeo, bladeMat);

        const chomperCycle = objDef.cycleDuration || 2.2;
        const chomperOffset = (objDef.timeOffset !== undefined) ? objDef.timeOffset : ((r * 7 + c * 3) % chomperCycle);

        const chomperObj = {
            group: chomperGroup,
            leftBlade: leftBlade,
            rightBlade: rightBlade,
            isEastWestPassage: isEastWestPassage,
            x: wx,
            z: wz,
            timer: chomperOffset, // Staggered or custom offset
            cycleDuration: chomperCycle, // Period between chomp snaps
            damage: objDef.damage || 45,
            isCurrentlyDangerous: false,
            bladeWidth: bladeW
        };

        if (isEastWestPassage) {
            // Player walks along X (East-West corridor).
            // The two guillotine blades lie in the X=0 plane across the hallway (width along Z).
            // Left blade slides from North wall (z = -half) towards center (z = 0) with cutting edge pointing South (+Z).
            // Right blade slides from South wall (z = +half) towards center (z = 0) with cutting edge pointing North (-Z).
            // A PlaneGeometry in local space is in XY plane. Rotating around Y by 90deg (PI/2) puts its face along X, spanning Z!
            leftBlade.rotation.y = Math.PI / 2;
            // Right blade flipped around Y so its cutting edge faces the opposite way (-Z)
            rightBlade.rotation.y = -Math.PI / 2;
        } else {
            // Player walks along Z (North-South corridor).
            // The two guillotine blades lie in the Z=0 plane across the hallway (width along X).
            // Left blade slides from West wall (x = -half) towards center (x = 0) with cutting edge pointing East (+X).
            // Right blade slides from East wall (x = +half) towards center (x = 0) with cutting edge pointing West (-X).
            leftBlade.rotation.y = 0; // Flat along X
            rightBlade.rotation.y = Math.PI; // Flipped along X
        }

        chomperGroup.add(leftBlade);
        chomperGroup.add(rightBlade);
        chomperGroup.position.set(wx, 0, wz);
        this.scene.add(chomperGroup);

        this.chompers.push(chomperObj);
    },

    pop_spikes(t) {
        const { c, objDef, r, tileSize, wx, wz } = t;
        // Prince of Persia hidden spikes that thrust out violently when stepped on (especially when running)
        const plateMat = new THREE.MeshLambertMaterial({ map: this.textures.popSpikePlate });
        const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), plateMat);
        plateMesh.rotation.x = -Math.PI / 2;
        plateMesh.position.set(wx, 0.015, wz);
        this.scene.add(plateMesh);

        // Group holding 8 sharp 3D metal spikes (conical spikes that thrust up out of floor holes)
        const spikesGroup = new THREE.Group();
        const spikeH = 1.8;
        const spikeGeo = new THREE.ConeGeometry(0.09, spikeH, 6);
        const spikeMat = new THREE.MeshLambertMaterial({ color: 0xd4d4d8 });

        const holeOffsets = [
            [-1.1, -1.1], [0, -1.1], [1.1, -1.1],
            [-0.55, 0], [0.55, 0],
            [-1.1, 1.1], [0, 1.1], [1.1, 1.1]
        ];

        holeOffsets.forEach(([ox, oz]) => {
            const spike = new THREE.Mesh(spikeGeo, spikeMat);
            // Set spike cone center so base is at y = 0 inside the group
            spike.position.set(ox, spikeH / 2, oz);
            spikesGroup.add(spike);
        });

        // Initially hidden retracted below floor
        const retractedY = -spikeH;
        spikesGroup.position.set(wx, retractedY, wz);
        this.scene.add(spikesGroup);

        const spikeCycle = objDef.cycleDuration || 2.4;
        const spikeOffset = (objDef.timeOffset !== undefined) ? objDef.timeOffset : ((r * 5 + c * 3) % spikeCycle);

        const popSpikeObj = {
            mesh: spikesGroup,
            x: wx,
            z: wz,
            isThrust: false,
            retractedY: retractedY,
            thrustY: 0.0, // Base at 0.0 -> spike tips reach y = +1.8 above floor!
            targetY: retractedY,
            currentY: retractedY,
            damage: objDef.damage || 35,
            timer: spikeOffset, // Periodic cycle with staggered or custom offset
            cycleDuration: spikeCycle, // Period between spike thrust cycles
            thrustSoundPlayed: false,
            bounds: {
                minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2
            }
        };
        this.popSpikes.push(popSpikeObj);
    },

    crumbling_floor(t) {
        const { objDef, tileSize, wx, wz } = t;
        // Prince of Persia Loose / Crumbling Floor Tile
        // Deep 3D pit shaft (dark dungeon rock cavity with bottomless void)
        const pitDepth = 8.0;
        const pitGroup = new THREE.Group();

        // 4 side walls of the deep pit cavity
        const pitWallMat = new THREE.MeshLambertMaterial({ map: this.textures.rock });
        const pitWallGeo = new THREE.PlaneGeometry(tileSize, pitDepth);

        // North pit wall
        const pWallN = new THREE.Mesh(pitWallGeo, pitWallMat);
        pWallN.position.set(0, -pitDepth / 2, -tileSize / 2);
        pitGroup.add(pWallN);

        // South pit wall
        const pWallS = new THREE.Mesh(pitWallGeo, pitWallMat);
        pWallS.rotation.y = Math.PI;
        pWallS.position.set(0, -pitDepth / 2, tileSize / 2);
        pitGroup.add(pWallS);

        // West pit wall
        const pWallW = new THREE.Mesh(pitWallGeo, pitWallMat);
        pWallW.rotation.y = Math.PI / 2;
        pWallW.position.set(-tileSize / 2, -pitDepth / 2, 0);
        pitGroup.add(pWallW);

        // East pit wall
        const pWallE = new THREE.Mesh(pitWallGeo, pitWallMat);
        pWallE.rotation.y = -Math.PI / 2;
        pWallE.position.set(tileSize / 2, -pitDepth / 2, 0);
        pitGroup.add(pWallE);

        // Pitch-black bottom abyss
        const abyssGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        const abyssMat = new THREE.MeshBasicMaterial({ color: 0x020202 });
        const abyssMesh = new THREE.Mesh(abyssGeo, abyssMat);
        abyssMesh.rotation.x = -Math.PI / 2;
        abyssMesh.position.set(0, -pitDepth, 0);
        pitGroup.add(abyssMesh);

        // Sharp iron spikes at the bottom of the pit cavity!
        const pitSpikeGeo = new THREE.ConeGeometry(0.12, 1.4, 5);
        const pitSpikeMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
        const bottomSpikes = [
            [-1.0, -1.0], [0, -1.0], [1.0, -1.0],
            [-0.5, 0], [0.5, 0],
            [-1.0, 1.0], [0, 1.0], [1.0, 1.0]
        ];
        bottomSpikes.forEach(([ox, oz]) => {
            const pSpike = new THREE.Mesh(pitSpikeGeo, pitSpikeMat);
            pSpike.position.set(ox, -pitDepth + 0.7, oz);
            pitGroup.add(pSpike);
        });

        pitGroup.position.set(wx, 0, wz);
        this.scene.add(pitGroup);

        // The fragile crumbling stone slab covering the pit
        const slabMat = new THREE.MeshLambertMaterial({
            map: this.textures.crumblingFloor
        });
        const slabGeo = new THREE.BoxGeometry(tileSize * 0.98, 0.16, tileSize * 0.98);
        const slabMesh = new THREE.Mesh(slabGeo, slabMat);
        slabMesh.position.set(wx, 0.08, wz);
        this.scene.add(slabMesh);

        const crumbleObj = {
            mesh: slabMesh,
            pitGroup: pitGroup,
            x: wx,
            z: wz,
            baseX: wx,
            baseZ: wz,
            state: 'intact', // 'intact' -> 'shaking' -> 'falling' -> 'fallen' -> (respawns)
            timer: 0,
            shakeDuration: objDef.shakeDuration || 0.85, // 0.85s warning rattle
            respawnTime: objDef.respawnTime || 4.5, // Respawns after 4.5s
            velocityY: 0,
            damage: objDef.damage || 35,
            bounds: {
                minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
                minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2
            }
        };
        this.crumblingFloors.push(crumbleObj);
    },

    dart_trap(t) {
        const { c, cols, mapData, objDef, r, rows, tileSize, wx, wz } = t;
        // Wall Dart Trap linked with floor Pressure Plate
        // 1. Floor pressure plate switch at (wx, wz)
        const plateMat = new THREE.MeshLambertMaterial({ map: this.textures.pressurePlate });
        const plateGeo = new THREE.BoxGeometry(tileSize * 0.7, 0.05, tileSize * 0.7);
        const plateMesh = new THREE.Mesh(plateGeo, plateMat);
        plateMesh.position.set(wx, 0.025, wz);
        this.scene.add(plateMesh);

        // 2. Find closest adjacent wall in North/South/West/East to mount the dart dispenser block
        const checkDirs = [
            { dir: 'north', dr: -1, dc: 0, fwdX: 0, fwdZ: 1 },  // Wall is north -> shoots South (+Z)
            { dir: 'south', dr: 1, dc: 0, fwdX: 0, fwdZ: -1 }, // Wall is south -> shoots North (-Z)
            { dir: 'west', dr: 0, dc: -1, fwdX: 1, fwdZ: 0 },  // Wall is west -> shoots East (+X)
            { dir: 'east', dr: 0, dc: 1, fwdX: -1, fwdZ: 0 }   // Wall is east -> shoots West (-X)
        ];

        let chosenWall = null;
        for (const cd of checkDirs) {
            const nr = r + cd.dr;
            const nc = c + cd.dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                if (mapData.layout[nr][nc] === '1') {
                    chosenWall = {
                        wx: nc * tileSize + tileSize / 2,
                        wz: nr * tileSize + tileSize / 2,
                        shootDirX: cd.fwdX,
                        shootDirZ: cd.fwdZ
                    };
                    break;
                }
            }
        }

        // If no direct adjacent wall, shoot from North by default
        if (!chosenWall) {
            chosenWall = {
                wx: wx,
                wz: wz - tileSize,
                shootDirX: 0,
                shootDirZ: 1
            };
        }

        // Mount dart dispenser decoration on wall surface
        const dispenserMat = new THREE.MeshLambertMaterial({ map: this.textures.dartDispenser });
        const dispenserGeo = new THREE.PlaneGeometry(1.4, 1.4);
        const dispenserMesh = new THREE.Mesh(dispenserGeo, dispenserMat);
        // Offset slightly out of wall face towards plate
        dispenserMesh.position.set(
            chosenWall.wx + chosenWall.shootDirX * (tileSize / 2 + 0.02),
            1.3, // Eye-level dart height
            chosenWall.wz + chosenWall.shootDirZ * (tileSize / 2 + 0.02)
        );
        // Face outwards along shooting direction
        const dispenserYaw = Math.atan2(chosenWall.shootDirX, chosenWall.shootDirZ);
        dispenserMesh.rotation.y = dispenserYaw;
        this.scene.add(dispenserMesh);

        const dartTrapObj = {
            plateMesh: plateMesh,
            plateBaseY: 0.025,
            platePressedY: 0.008,
            x: wx,
            z: wz,
            isStepped: false,
            cooldown: 0,
            damage: objDef.damage || 25,
            speed: objDef.speed || 18, // Swift whistling dart speed
            shootOriginX: chosenWall.wx + chosenWall.shootDirX * (tileSize / 2 + 0.1),
            shootOriginZ: chosenWall.wz + chosenWall.shootDirZ * (tileSize / 2 + 0.1),
            dirX: chosenWall.shootDirX,
            dirZ: chosenWall.shootDirZ,
            bounds: {
                minX: wx - tileSize * 0.35, maxX: wx + tileSize * 0.35,
                minZ: wz - tileSize * 0.35, maxZ: wz + tileSize * 0.35
            }
        };
        this.dartTraps.push(dartTrapObj);
    },

    fire_jet(t) {
        const { c, objDef, r, tileSize, wx, wz } = t;
        // Periodic Flamethrower / Fire Jet Floor Grate Trap
        const ventMat = new THREE.MeshLambertMaterial({ map: this.textures.fireVent });
        const ventMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), ventMat);
        ventMesh.rotation.x = -Math.PI / 2;
        ventMesh.position.set(wx, 0.015, wz);
        this.scene.add(ventMesh);

        // Flame Pillar Group: Cross-plane volumetric sprite + billboard flame effect
        const flameGroup = new THREE.Group();
        const flameW = tileSize * 0.95;
        const flameH = 4.8; // Tall towering vortex of fire

        const firePillarMat = new THREE.MeshBasicMaterial({
            map: this.textures.firePillar,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const firePlaneGeo = new THREE.PlaneGeometry(flameW, flameH);

        // 4 Cross-planes (0°, 45°, 90°, 135°) for thick 3D cylindrical flame column
        const planes = [];
        for (let i = 0; i < 4; i++) {
            const p = new THREE.Mesh(firePlaneGeo, firePillarMat);
            p.rotation.y = (i * Math.PI) / 4;
            p.position.y = flameH / 2;
            flameGroup.add(p);
            planes.push(p);
        }

        // Dynamic point light for roaring flame
        const flameLight = new THREE.PointLight(0xff4500, 0, tileSize * 2.8);
        flameLight.position.set(0, 1.8, 0);
        flameGroup.add(flameLight);

        flameGroup.position.set(wx, 0, wz);
        flameGroup.visible = false;
        this.scene.add(flameGroup);

        const jetCycle = objDef.cycleDuration || 3.0;
        const jetOffset = (objDef.timeOffset !== undefined) ? objDef.timeOffset : ((r * 7 + c * 5) % jetCycle);

        const fireJetObj = {
            group: flameGroup,
            flamePlanes: planes,
            flameLight: flameLight,
            x: wx,
            z: wz,
            timer: jetOffset,
            cycleDuration: jetCycle,
            flameActiveDuration: objDef.activeDuration || 1.2, // 1.2s of roaring fire
            isErupting: false,
            soundPlayed: false,
            damage: objDef.damage || 40,
            bounds: {
                minX: wx - tileSize * 0.45, maxX: wx + tileSize * 0.45,
                minZ: wz - tileSize * 0.45, maxZ: wz + tileSize * 0.45
            }
        };
        this.fireJets.push(fireJetObj);
    },

    buzzsaw(t) {
        const { c, cols, mapData, objDef, r, rows, tileSize, wx, wz } = t;
        // Rail-mounted Rotating Buzzsaw / Sawblade Trap
        // Detect corridor orientation to sweep ACROSS the hallway (left wall <-> right wall)
        // If walls are Top and Bottom (East-West passage), saw travels North-South (Z axis)
        // If walls are Left and Right (North-South passage), saw travels East-West (X axis)
        const isWallLeft = (c > 0 && mapData.layout[r][c - 1] === '1');
        const isWallRight = (c < cols - 1 && mapData.layout[r][c + 1] === '1');
        const isWallTop = (r > 0 && mapData.layout[r - 1][c] === '1');
        const isWallBottom = (r < rows - 1 && mapData.layout[r + 1][c] === '1');

        const isEastWestPassage = (isWallTop || isWallBottom) && !(isWallLeft && isWallRight);

        // Floor rail track (crosswise across corridor)
        const railMat = new THREE.MeshLambertMaterial({ map: this.textures.buzzsawRail });
        const railMesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), railMat);
        railMesh.rotation.x = -Math.PI / 2;
        if (!isEastWestPassage) {
            // If corridor runs North-South, rail groove runs East-West across corridor
            railMesh.rotation.z = Math.PI / 2;
        }
        railMesh.position.set(wx, 0.015, wz);
        this.scene.add(railMesh);

        // 3D Saw Blade Group (stands upright and sweeps from left wall to right wall)
        const sawGroup = new THREE.Group();
        const sawRadius = 1.35;
        const sawMat = new THREE.MeshLambertMaterial({
            map: this.textures.buzzsawBlade,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide
        });
        const sawGeo = new THREE.PlaneGeometry(sawRadius * 2, sawRadius * 2);
        const sawMesh = new THREE.Mesh(sawGeo, sawMat);

        // Upright orientation aligned across the track
        if (isEastWestPassage) {
            // Corridor runs East-West: blade moves along Z (North-South).
            // Face blade towards X so player walking down the corridor sees the saw disk head-on!
            sawMesh.rotation.y = Math.PI / 2;
        } else {
            // Corridor runs North-South: blade moves along X (East-West).
            // Face blade towards Z so player walking along corridor sees the saw disk head-on!
            sawMesh.rotation.y = 0;
        }
        sawMesh.position.y = sawRadius * 0.85;
        sawGroup.add(sawMesh);

        sawGroup.position.set(wx, 0, wz);
        this.scene.add(sawGroup);

        const sawObj = {
            group: sawGroup,
            sawMesh: sawMesh,
            baseX: wx,
            baseZ: wz,
            isEastWest: isEastWestPassage, // East-West corridor means sweep along Z (crosswise)!
            travelDist: objDef.travelDistance || (tileSize * 0.35), // Sweeps between left and right walls (safe timing window)
            speed: objDef.speed || 3.0,
            timer: (r * 3 + c * 7) % 3.0,
            damage: objDef.damage || 35,
            radius: 1.05
        };
        this.buzzsaws.push(sawObj);
    },

    trap_tile(t) {
        const { objDef, tileSize, wx, wz } = t;
        // Hazard traps (spike traps)
        const trapMat = new THREE.MeshLambertMaterial({ map: this.textures[objDef.texture] });
        const trapGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        const trapMesh = new THREE.Mesh(trapGeo, trapMat);
        trapMesh.rotation.x = -Math.PI / 2;
        trapMesh.position.set(wx, 0.015, wz);
        this.scene.add(trapMesh);

        this.terrainGrid.push({
            minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
            minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
            depth: 0,
            trapDamage: objDef.damage || 15,
            isTrap: true
        });
    },

    barrier_floor(t) {
        const { objDef, tileSize, wx, wz } = t;
        // Dragon Quest style electric barrier floor
        const barrierMat = new THREE.MeshLambertMaterial({
            map: this.textures[objDef.texture] || this.textures.electricBarrier,
            emissive: 0x0284c7, // Vibrant cyan/blue electric glow
            emissiveIntensity: 0.35
        });
        const barrierGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
        barrierMesh.rotation.x = -Math.PI / 2;
        barrierMesh.position.set(wx, 0.02, wz);
        this.scene.add(barrierMesh);

        this.terrainGrid.push({
            minX: wx - tileSize / 2, maxX: wx + tileSize / 2,
            minZ: wz - tileSize / 2, maxZ: wz + tileSize / 2,
            depth: 0,
            isBarrier: true,
            damagePerStep: objDef.damagePerStep || 15
        });
    },
};
