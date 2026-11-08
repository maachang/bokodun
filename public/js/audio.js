import * as THREE from '/js/three.module.js';
import { playerSounds } from '/js/audio/audioPlayer.js';
import { magicSounds } from '/js/audio/audioMagic.js';
import { trapSounds } from '/js/audio/audioTraps.js';

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

}

// 部品（public/js/audio/*.js）のメソッドを、SoundFX に組み込む
Object.assign(SoundFX.prototype, playerSounds, magicSounds, trapSounds);
