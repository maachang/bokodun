import * as THREE from '/js/three.module.js';
import { playerSounds } from '/js/audio/audioPlayer.js';
import { magicSounds } from '/js/audio/audioMagic.js';
import { trapSounds } from '/js/audio/audioTraps.js';
import { spellFxSounds } from '/js/audio/audioSpellFx.js';
import { bgmSounds } from '/js/audio/audioBgm.js';
import { talkSounds } from '/js/audio/audioTalk.js';
import { ambienceSounds } from '/js/audio/audioAmbience.js';

export class SoundFX {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume?.();
        if (this._bgmWant && !this._bgm) this.playBgm(this._bgmWant);   // 最初の操作で音が使えるようになったら、待たせていた BGM を鳴らす
        if (this._ambWant && !this._amb) this.playAmbience(this._ambWant);   // 環境音も同じ
    }

}

// 部品（public/js/audio/*.js）のメソッドを、SoundFX に組み込む
Object.assign(SoundFX.prototype, playerSounds, magicSounds, trapSounds, spellFxSounds, bgmSounds, talkSounds, ambienceSounds);
