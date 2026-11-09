// 入力（キー・マウス・ボタン）の登録。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）


export const controlsMethods = {
    initControls() {
        this.initKeyDown();
        this.initKeyUp();
        this.initPointer();
    },

    // キーを押したとき（移動・攻撃・魔法・調べる・スロットの選択など）
    initKeyDown() {
        window.addEventListener('keydown', (e) => {
            this.sound.init();
            // 店のメニューを開いている間は、メニューの操作だけを受け付ける
            if (this.shopMenu) {
                this.shopMenuKey(e);
                return;
            }
            // カメラ操作: Ctrl+↑↓ で視点の上下、Ctrl+←→ で微調整の旋回（移動・旋回の矢印キーとは別）、Ctrl+0 で視点を水平に戻す
            if (e.ctrlKey) {
                const camKey = { ArrowUp: 'camUp', ArrowDown: 'camDown', ArrowLeft: 'camLeft', ArrowRight: 'camRight' }[e.code];
                if (camKey) {
                    this.keys[camKey] = true;
                    e.preventDefault();
                    return;
                }
                if (e.code === 'Digit0' || e.code === 'Numpad0') {
                    this.player.pitch = 0;
                    e.preventDefault();
                    return;
                }
            }
            // デバッグ（上から地形を確認する）: Shift+B 真下を見る（もう一度で戻す）・Shift+U 浮き上がる（上限あり。離しても、その高さのまま）・Shift+D 沈む（地面より下へは行かない）・Shift+0 カメラと浮きをリセット。旋回は、そのまま
            if (e.shiftKey && ['KeyB', 'KeyU', 'KeyD', 'Digit0', 'Numpad0'].includes(e.code)) {
                if (e.code === 'KeyB') this.player.lookDown = !this.player.lookDown;
                else if (e.code === 'KeyU') this.keys.dbgUp = true;
                else if (e.code === 'KeyD') this.keys.dbgDown = true;
                else { this.player.lookDown = false; this.player.debugLift = 0; this.player.pitch = 0; }
                e.preventDefault();
                return;
            }
            switch (e.code) {
                case 'KeyW': case 'ArrowUp':
                    this.keys.forward = true;
                    e.preventDefault();
                    break;
                case 'KeyS': case 'ArrowDown':
                    this.keys.backward = true;
                    e.preventDefault();
                    break;
                case 'KeyA':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                    this.keys.right = true;
                    break;
                case 'ArrowLeft':
                case 'KeyQ':
                    this.keys.turnLeft = true;
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                    this.keys.turnRight = true;
                    e.preventDefault();
                    break;
                case 'KeyE':
                    // E Key: Interact with nearest Chest or Door, or Turn Right if no object near
                    if (!this.interactNearestObject()) {
                        this.keys.turnRight = true;
                    }
                    e.preventDefault();
                    break;
                case 'Space':
                case 'KeyF':
                    this.useMagic();
                    e.preventDefault();
                    break;
                case 'Tab':
                    this.cycleMagic();
                    e.preventDefault();
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.sprint = true;
                    break;
            }
            // 数字キー 1〜4: 魔法スロットの直接選択
            const magicKey = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
            if (magicKey) this.selectMagic(Number(magicKey[1]) - 1);
        });
    },

    // キーを離したとき
    initKeyUp() {
        window.addEventListener('keyup', (e) => {
            // Ctrl を離したときや、矢印キーを離したときは、カメラ操作も止める
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
                this.keys.camUp = this.keys.camDown = this.keys.camLeft = this.keys.camRight = false;
            }
            const camRelease = { ArrowUp: 'camUp', ArrowDown: 'camDown', ArrowLeft: 'camLeft', ArrowRight: 'camRight' }[e.code];
            if (camRelease) this.keys[camRelease] = false;
            if (e.code === 'KeyU') this.keys.dbgUp = false;
            if (e.code === 'KeyD') this.keys.dbgDown = false;
            switch (e.code) {
                case 'KeyW': case 'ArrowUp':
                    this.keys.forward = false;
                    break;
                case 'KeyS': case 'ArrowDown':
                    this.keys.backward = false;
                    break;
                case 'KeyA':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                    this.keys.right = false;
                    break;
                case 'ArrowLeft':
                case 'KeyQ':
                    this.keys.turnLeft = false;
                    break;
                case 'ArrowRight':
                case 'KeyE':
                    this.keys.turnRight = false;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.sprint = false;
                    break;
            }
        });
    },

    // マウス（クリック・ポインターロック・視点の移動）
    initPointer() {
        this.canvas.addEventListener('click', (e) => {
            this.sound.init();
            // マウスモードOFFのときは、クリックでは何もしない（魔法は Space / F）
            if (!this.mouseMode) return;
            if (!this.isPointerLocked) {
                this.canvas.requestPointerLock?.();
            } else {
                // ロック済みのクリックで、選択中の魔法を撃つ
                this.useMagic();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === this.canvas);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isPointerLocked) return;
            const sens = 0.0026;
            this.player.angle -= e.movementX * sens;
            this.player.pitch -= e.movementY * sens;
            this.player.pitch = Math.max(-0.6, Math.min(0.6, this.player.pitch));
        });
    },
};
