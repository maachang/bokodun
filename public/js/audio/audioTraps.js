// 罠・仕掛け・水・崩落の効果音。SoundFX のメソッド（public/js/audio.js が、クラスの定義のあとで、SoundFX へ組み込む）。
// 元は public/js/audio.js の SoundFX。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）


export const trapSounds = {
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },
};
