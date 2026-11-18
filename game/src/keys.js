// keys.js — keyboard + mouse input, with edge-triggered presses so a tap of
// E or F fires exactly once no matter how slow the frame rate gets.

export class KeyPad {
  constructor() {
    this.down = new Set();
    this.pressed = new Set(); // edge set, cleared by endFrame()
    this.dragX = 0;           // accumulated mouse-drag yaw
    this.dragY = 0;           // accumulated mouse-drag pitch
    this.dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.down.delete(e.code); };
    this._onBlur = () => { this.down.clear(); this.dragging = false; };
  }

  bind(canvas) {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.dragX += e.clientX - this._lastX;
      this.dragY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
  }

  isDown(code) { return this.down.has(code); }

  wasPressed(code) { return this.pressed.has(code); }

  // -1..1 forward/back, -1..1 left/right, from WASD or arrows.
  moveAxes() {
    let f = 0, s = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) f += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) f -= 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) s -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) s += 1;
    return { f, s };
  }

  sprinting() { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }

  consumeDrag() {
    const d = { x: this.dragX, y: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }

  endFrame() { this.pressed.clear(); }
}
