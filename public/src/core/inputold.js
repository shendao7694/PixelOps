// Keyboard + pointer-lock mouse. Keeps per-frame "pressed" edges so game
// code can ask `input.pressed('KeyR')` without wiring listeners everywhere.
export class Input {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.keyEdges = new Set();
    this.keyUpEdges = new Set();
    this.mouse = [false, false, false];
    this.mouseEdges = [false, false, false];
    this.mouseUpEdges = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.pointer = { x: 0, y: 0 }; // normalised 0..1 over the viewport, for menus
    this.clickEdge = false;
    this.onLockChange = null;
    this.enabled = true;

    this._bind();
  }

  _bind() {
    const stop = (e) => {
      // keep browser shortcuts like F5/F12 alive, swallow game keys
      if (['ControlLeft','ControlRight','Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote'].includes(e.code)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      stop(e);
      if (e.repeat) return;
      this.keys.add(e.code);
      this.keyEdges.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      if (this.keys.has(e.code)) this.keyUpEdges.add(e.code);
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.reset();
    });

    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      } else {
        this.pointer.x = e.clientX / window.innerWidth;
        this.pointer.y = e.clientY / window.innerHeight;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      const b = e.button;
      if (b < 3) {
        this.mouse[b] = true;
        this.mouseEdges[b] = true;
      }
      if (b === 0) this.clickEdge = true;
      // fired synchronously so pointer lock / audio still see a user gesture
      if (this.onPress) {
        this.onPress(e.clientX / window.innerWidth, e.clientY / window.innerHeight, b);
      }
    });

    window.addEventListener('mouseup', (e) => {
      const b = e.button;
      if (b < 3) {
        this.mouse[b] = false;
        this.mouseUpEdges[b] = true;
      }
    });

    window.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this.dx = this.dy = 0;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    if (this.locked) return;
    const p = this.el.requestPointerLock?.({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') p.catch(() => this.el.requestPointerLock());
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  reset() {
    this.keys.clear();
    this.keyEdges.clear();
    this.keyUpEdges.clear();
    this.mouse = [false, false, false];
    this.mouseEdges = [false, false, false];
    this.mouseUpEdges = [false, false, false];
    this.dx = this.dy = this.wheel = 0;
    this.clickEdge = false;
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.keyEdges.has(code); }
  released(code) { return this.keyUpEdges.has(code); }
  mouseDown(b) { return this.mouse[b]; }
  mousePressed(b) { return this.mouseEdges[b]; }
  mouseReleased(b) { return this.mouseUpEdges[b]; }

  /** Movement axes from WASD / arrows. */
  moveAxis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  endFrame() {
    this.keyEdges.clear();
    this.keyUpEdges.clear();
    this.mouseEdges[0] = this.mouseEdges[1] = this.mouseEdges[2] = false;
    this.mouseUpEdges[0] = this.mouseUpEdges[1] = this.mouseUpEdges[2] = false;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.clickEdge = false;
  }
}
