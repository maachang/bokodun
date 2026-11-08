// プレイヤー・敵・道具の効果音（攻撃・足音・扉・被弾・敵の死亡と被弾・宝箱など）。SoundFX のメソッド（public/js/audio.js が、クラスの定義のあとで、SoundFX へ組み込む）。
// 元は public/js/audio.js の SoundFX。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）


export const playerSounds = {
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
    },

    /**
     * 足音。マップ（空間）ごとの種類（environment.footstep）で音色を変える
     * stone=コツ / cave=コォン（低く響く） / grass=サクッ / sand=ザッ / swamp=ピチャ / water=パシャ
     */
    playFootstep(floorType = 'stone') {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // 毎回同じ音に聞こえないよう、音程と音量を少しだけ揺らす
        const jitter = 0.9 + Math.random() * 0.2;
        const FOOTSTEPS = {
            stone: { noise: 'bandpass', freq: 1800, q: 1.5, dur: 0.06, vol: 0.10, tone: 'triangle', toneFreq: 260, toneVol: 0.06 },
            cave:  { noise: 'bandpass', freq: 900,  q: 2.0, dur: 0.12, vol: 0.10, tone: 'sine', toneFreq: 140, toneVol: 0.08 },
            grass: { noise: 'bandpass', freq: 3200, q: 0.7, dur: 0.09, vol: 0.09, tone: null },
            sand:  { noise: 'lowpass',  freq: 1500, q: 0.5, dur: 0.12, vol: 0.10, tone: null },
            swamp: { noise: 'bandpass', freq: 700,  q: 2.5, dur: 0.14, vol: 0.12, tone: 'sine', toneFreq: 190, toneVol: 0.07, toneSlide: 2.2 },
            water: { noise: 'bandpass', freq: 1400, q: 3.0, dur: 0.12, vol: 0.12, tone: 'sine', toneFreq: 520, toneVol: 0.05, toneSlide: 1.6 }
        };
        const f = FOOTSTEPS[floorType] || FOOTSTEPS.stone;

        const bufferSize = Math.floor(this.ctx.sampleRate * f.dur);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = f.noise;
        filter.frequency.setValueAtTime(f.freq * jitter, now);
        filter.Q.setValueAtTime(f.q, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(f.vol * jitter, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + f.dur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);

        // 芯になる短い音（石の硬さ、泥や水のはねる音）
        if (f.tone) {
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = f.tone;
            osc.frequency.setValueAtTime(f.toneFreq * jitter, now);
            if (f.toneSlide) osc.frequency.exponentialRampToValueAtTime(f.toneFreq * jitter * f.toneSlide, now + f.dur);
            oscGain.gain.setValueAtTime(f.toneVol, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + f.dur);
            osc.connect(oscGain);
            oscGain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + f.dur);
        }
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    // 敵の撃破音: 下降する音 + 「ぷしゅっ」というノイズ
    playEnemyDeath() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);
        oscGain.gain.setValueAtTime(0.18, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);

        const bufferSize = Math.floor(this.ctx.sampleRate * 0.3);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2400, now);
        filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.22, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    },

    // 敵への打撃音「ドスッ」: 低い打撃音 + 短いノイズ。heavy（大剣・メイス・会心）はより重く長い
    playEnemyHit(heavy = false) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const len = heavy ? 0.18 : 0.1;

        const thump = this.ctx.createOscillator();
        const thumpGain = this.ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(heavy ? 120 : 170, now);
        thump.frequency.exponentialRampToValueAtTime(heavy ? 40 : 60, now + len);
        thumpGain.gain.setValueAtTime(heavy ? 0.45 : 0.32, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + len);
        thump.connect(thumpGain);
        thumpGain.connect(this.ctx.destination);
        thump.start(now);
        thump.stop(now + len);

        const bufferSize = Math.floor(this.ctx.sampleRate * 0.06);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(heavy ? 1500 : 2200, now);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(heavy ? 0.3 : 0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    },
};
