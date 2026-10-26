import * as THREE from '/js/three.module.js';

export class SoundFX {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
    }

    playAttack(isHalfOffset = false) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Half-offset critical hit sound vs normal bump
        osc.type = isHalfOffset ? 'triangle' : 'square';
        osc.frequency.setValueAtTime(isHalfOffset ? 340 : 180, now);
        osc.frequency.exponentialRampToValueAtTime(isHalfOffset ? 680 : 80, now + 0.12);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playDoorOpen() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Heavy creaking door opening sound
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(120, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
    }

    playBarrierDamage() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Famicom / NES Noise channel crunch buzz (Classic DQ Barrier sound)
        const bufferSize = this.ctx.sampleRate * 0.12;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        // Periodic short-cycle noise for 8-bit crunchy buzz
        let last = 0;
        for (let i = 0; i < bufferSize; i++) {
            if (i % 16 === 0) {
                last = (Math.random() * 2 - 1);
            }
            data[i] = last;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320, now);
        filter.Q.setValueAtTime(3.0, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
    }

    playHurt() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playShoot(isPlayer = false) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        if (isPlayer) {
            // High energy retro fireball shoot
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.18);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        } else {
            // Eerie enemy magic projectile
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        }

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
    }

    playBowShoot() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // 1. Bowstring release twang: high triangle snap quickly descending
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);

        // 2. High-speed arrow whoosh
        const bufferSize = this.ctx.sampleRate * 0.14;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.frequency.exponentialRampToValueAtTime(600, now + 0.14);
        filter.Q.value = 3.0;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    }

    playArrowHit() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // Solid wooden thud / impact sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.09);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
    }

    playExplosion() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // White noise burst for impact / blast
        const bufferSize = this.ctx.sampleRate * 0.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 0.2);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
    }

    playLevelClear() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.0, 523.25];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.1);
            gain.gain.setValueAtTime(0.2, now + idx * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.1);
            osc.stop(now + idx * 0.1 + 0.25);
        });
    }

    /**
     * プリンス・オブ・ペルシャ風 チョッパー（ギロチン挟み刃）の開閉・切断音
     * @param {number} volume 音量倍率 (0.0 ~ 1.0)
     */
    playChomperSnap(volume = 1.0) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const v = Math.max(0, Math.min(1.0, volume));
        if (v <= 0.001) return;

        // Heavy metallic razor snap impact (sharp high metal clash + deep mechanical clank)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

        gain.gain.setValueAtTime(0.4 * v, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);

        // Metal blade screech noise
        const bufferSize = this.ctx.sampleRate * 0.14;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2200, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.35 * v, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    }

    /**
     * チョッパーで真っ二つに切断された時の血飛沫＆骨断ち音
     */
    playChomperSlice() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Low heavy gut crunch + high blade slice
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.22);
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);

        this.playChomperSnap();
    }

    /**
     * 飛び出す鉄串スパイクのズシャッ！音
     * @param {number} volume 音量倍率 (0.0 ~ 1.0)
     */
    playSpikeThrust(volume = 1.0) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const v = Math.max(0, Math.min(1.0, volume));
        if (v <= 0.001) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);
        gain.gain.setValueAtTime(0.35 * v, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    /**
     * 噴水に触れた時・水しぶきのシャバシャバ音 (清涼感のある水音)
     */
    playWaterSplash() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Band-pass filtered white noise with quick frequency modulations for liquid splashing
        const bufferSize = this.ctx.sampleRate * 0.16;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.linearRampToValueAtTime(800, now + 0.08);
        filter.frequency.exponentialRampToValueAtTime(1600, now + 0.16);
        filter.Q.setValueAtTime(3.0, now);

        // Gentle bubble drop pitch
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520 + Math.random() * 120, now);
        osc.frequency.exponentialRampToValueAtTime(880 + Math.random() * 140, now + 0.12);
        oscGain.gain.setValueAtTime(0.12, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
    }

    /**
     * 崩れる床（グラグラ・石のひび割れ振動音）
     */
    playCrumbleRumble() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.35);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
    }

    /**
     * 床がガラガラと崩落して底へ落下した時の音
     */
    playFloorCollapse() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Low heavy impact + rubble crumbling noise
        const bufferSize = this.ctx.sampleRate * 0.4;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now);
        filter.frequency.linearRampToValueAtTime(120, now + 0.4);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
    }

    /**
     * 壁の仕掛け・プレッシャープレートを踏んだ時の「カチッ！」音
     */
    playPlateClick() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    /**
     * 壁から高速の毒矢・ダーツが射出される「シュパッ！」音
     */
    playDartShoot() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);

        gain.gain.setValueAtTime(0.38, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
    }

    /**
     * 奈落・落とし穴へヒューンと滑落していく叫び/落下風音
     */
    playFallingScream() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Descending whistling wind + echo plunge
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.55);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.55);
    }

    /**
     * 宝箱を開ける「ギギィ…」という木と蝶番の軋み音
     */
    playChestOpen() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Creaking antique iron hinge sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(320, now + 0.18);
        osc.frequency.linearRampToValueAtTime(260, now + 0.35);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.38);
    }

    /**
     * 宝箱からアイテム・ゴールドを獲得した時のファンファーレ音
     */
    playItemGet() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Bright arpeggio chime (C5 -> E5 -> G5 -> C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.07);

            gain.gain.setValueAtTime(0.25, now + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.07);
            osc.stop(now + idx * 0.07 + 0.25);
        });
    }

    /**
     * ミミックがガバッと口を開けて噛みついてくる恐怖のモンスター叫び音
     */
    playMimicGrowl() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Low growl + sharp metallic snap
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(360, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.35);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);

        // Snap teeth together
        this.playChomperSnap(0.8);
    }

    /**
     * 火炎放射バーナーがゴオオオッと激しく噴出する音
     * @param {number} volume 距離減衰ボリューム (0.0 ~ 1.0)
     */
    playFlameJet(volume = 1.0) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const v = Math.max(0, Math.min(1.0, volume));
        if (v <= 0.001) return;

        // Band-pass noise for roaring flame combustion
        const bufferSize = this.ctx.sampleRate * 0.45;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320, now);
        filter.frequency.linearRampToValueAtTime(750, now + 0.15);
        filter.frequency.exponentialRampToValueAtTime(240, now + 0.45);
        filter.Q.setValueAtTime(1.5, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.42 * v, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
    }

    /**
     * 回転ノコギリ刃が高速回転・レール移動する金属切削ノイズ
     * @param {number} volume 距離減衰ボリューム (0.0 ~ 1.0)
     */
    playBuzzsawWhirr(volume = 1.0) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const v = Math.max(0, Math.min(1.0, volume));
        if (v <= 0.001) return;

        // High buzzing saw tone + metal scrape
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(520, now + 0.1);
        osc.frequency.linearRampToValueAtTime(420, now + 0.2);

        gain.gain.setValueAtTime(0.18 * v, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
    }
}
