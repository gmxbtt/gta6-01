// input.js — keyboard + mouse state, pointer-lock camera look, action edges.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed by endFrame()
    this.lookDX = 0;
    this.lookDY = 0;
    this.dragging = false;
    this.locked = false;
    this.onPause = null;
    this.onAnyKey = null;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.onAnyKey) this.onAnyKey();
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.onPause) this.onPause();
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.locked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      } else if (this.dragging) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    };
    this._onMouseDown = (e) => {
      if (e.target === this.canvas) {
        this.dragging = true;
        // Clicking the canvas grabs the pointer for camera look.
        if (!this.locked && document.pointerLockElement !== this.canvas) {
          this.canvas.requestPointerLock();
        }
      }
    };
    this._onMouseUp = () => { this.dragging = false; };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
    };
    this._onBlur = () => { this.keys.clear(); this.dragging = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  down(code) { return this.keys.has(code); }
  // True only on the frame the key went down.
  hit(code) { return this.pressed.has(code); }

  moveAxis() {
    let x = 0;
    let z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }

  consumeLook() {
    const dx = this.lookDX;
    const dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return { dx, dy };
  }

  endFrame() { this.pressed.clear(); }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
