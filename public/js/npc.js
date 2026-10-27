import * as THREE from '/js/three.module.js';

// 村人（NPC）: 敵と違い、攻撃も被弾もしない。ふだんは立っていて、ときどき生まれた位置の近くを、ゆっくり歩き回る
const IDLE_MIN = 2.0;        // 立ち止まっている時間の範囲（秒）
const IDLE_MAX = 6.0;
const ARRIVE_DIST = 0.1;     // 目的地にこの距離まで近づいたら到着
const BOB_AMP = 0.05;        // 歩いている間の上下の揺れの大きさ
const BOB_FREQ = 6.0;        // 歩いている間の上下の揺れの速さ
const SPEECH_RADIUS = 2.8;   // この距離以内に近づくと、セリフが出る

export class Npc {
    // def: npcs.json の 1 件 / texture: 画像のテクスチャ（同じ種類の NPC で共有）
    constructor(npcId, x, z, texture, def) {
        this.type = npcId;
        this.name = def.name;
        this.lines = def.lines || [];
        this.radius = def.radius ?? 0.45;
        this.speed = def.speed ?? 0.8;
        this.wanderRadius = def.wanderRadius ?? 0;
        this.speechRadius = def.speechRadius ?? SPEECH_RADIUS;
        this.x = x;
        this.z = z;
        this.homeX = x;
        this.homeZ = z;
        this.active = true;   // プレイヤーの移動で、敵と同じく障害物として扱うための印
        this.state = 'idle';
        this.timer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
        this.targetX = x;
        this.targetZ = z;
        this.walkTime = 0;
        this.currentLine = null;   // 近づいたときに選んだセリフ（離れるまで同じ）

        const height = def.height ?? 2.2;
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
        this.sprite.center.set(0.5, 0.0);   // 足元を地面に合わせる
        this.sprite.scale.set(height * (def.aspect ?? 0.4), height, 1);
        this.sprite.position.set(x, 0, z);
    }

    // isBlocked(x, z, radius): その位置に立てない（壁・家具・水・プレイヤー・ほかの村人）なら true
    update(dt, isBlocked) {
        if (this.state === 'idle') {
            this.timer -= dt;
            if (this.timer <= 0 && this.wanderRadius > 0) this.pickTarget(isBlocked);
            else if (this.timer <= 0) this.timer = IDLE_MIN;
        } else {
            const dx = this.targetX - this.x;
            const dz = this.targetZ - this.z;
            const dist = Math.hypot(dx, dz);
            if (dist < ARRIVE_DIST) {
                this.startIdle();
            } else {
                const step = Math.min(dist, this.speed * dt);
                const nx = this.x + dx / dist * step;
                const nz = this.z + dz / dist * step;
                if (isBlocked(nx, nz, this.radius)) {
                    this.startIdle();   // 行く手をふさがれたら、その場で止まる
                } else {
                    this.x = nx;
                    this.z = nz;
                    this.walkTime += dt;
                }
            }
        }
        const bob = this.state === 'walk' ? Math.abs(Math.sin(this.walkTime * BOB_FREQ)) * BOB_AMP : 0;
        this.sprite.position.set(this.x, bob, this.z);
    }

    startIdle() {
        this.state = 'idle';
        this.timer = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
    }

    // 生まれた位置から wanderRadius 以内で、立てる場所を目的地にする（何度か試して、なければ立ったまま）
    pickTarget(isBlocked) {
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 0.8 + Math.random() * Math.max(0, this.wanderRadius - 0.8);
            const tx = this.homeX + Math.cos(angle) * dist;
            const tz = this.homeZ + Math.sin(angle) * dist;
            if (!isBlocked(tx, tz, this.radius)) {
                this.targetX = tx;
                this.targetZ = tz;
                this.state = 'walk';
                return;
            }
        }
        this.startIdle();
    }

    // プレイヤーが近いときのセリフ（遠いときは null）。近づいた瞬間に 1 つ選び、離れるまで同じセリフを返す
    speechFor(player) {
        if (this.lines.length === 0 || Math.hypot(player.x - this.x, player.z - this.z) >= this.speechRadius) {
            this.currentLine = null;
            return null;
        }
        if (this.currentLine === null) this.currentLine = this.lines[Math.floor(Math.random() * this.lines.length)];
        return `${this.name}「${this.currentLine}」`;
    }
}
