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
    this.pointer = { x: 0, y: 0 };
    this.clickEdge = false;
    this.onLockChange = null;
    this.onPress = null;
    this.enabled = true;
    this._lockRequested = false;

    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this.joystickX = 0;
    this.joystickY = 0;
    this.touchActive = false;
    this.touchId = null;
    this.touchStartX = 0;
    this.touchStartY = 0;

    this.aimToggled = false;
    this.tabToggled = false;
    this.sprintToggled = false;
    this.chatToggled = false;

    this.touchButtons = {
      jump: false, crouch: false, reload: false, tab: false,
      weapon1: false, weapon2: false, weapon3: false, weapon4: false,
      weapon5: false, weapon6: false, weapon7: false,
      escape: false, fire: false, aim: false, sprint: false, chat: false
    };
    this.touchButtonEdges = {
      jump: false, crouch: false, reload: false, tab: false,
      weapon1: false, weapon2: false, weapon3: false, weapon4: false,
      weapon5: false, weapon6: false, weapon7: false,
      escape: false, fire: false, aim: false, sprint: false, chat: false
    };

    this.touchUIVisible = false;
    this.touchContainer = null;
    this.touchControlsCreated = false;

    this._bind();
    if (this.isMobile) {
      this._createToggleButton();
    }
  }

  _bind() {
    const stop = (e) => {
      if (['ControlLeft','ControlRight','Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Slash','Quote','KeyR','Escape','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Enter','ShiftLeft','ShiftRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      stop(e);
      if (e.repeat) return;
      this.keys.add(e.code);
      this.keyEdges.add(e.code);
      if (e.code === 'Tab') this.tabToggled = !this.tabToggled;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprintToggled = !this.sprintToggled;
      if (e.code === 'Enter') this.chatToggled = !this.chatToggled;
    });

    window.addEventListener('keyup', (e) => {
      if (this.keys.has(e.code)) this.keyUpEdges.add(e.code);
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.reset();
    });

    window.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      if (this.onPress) {
        this.onPress(touch.clientX / window.innerWidth, touch.clientY / window.innerHeight, 0);
      }
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

  _createToggleButton() {
    if (this.toggleBtn) return;
    const btn = document.createElement('div');
    btn.id = 'touch-toggle';
    btn.textContent = '☰';
    btn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      border: 2px solid rgba(255,255,255,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 28px;
      font-weight: bold;
      pointer-events: auto;
      touch-action: none;
      text-shadow: 0 2px 6px rgba(0,0,0,0.6);
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      user-select: none;
      cursor: pointer;
      z-index: 99999;
      backdrop-filter: blur(6px);
    `;
    document.body.appendChild(btn);
    this.toggleBtn = btn;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._toggleTouchUI();
    }, { passive: false });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      this._toggleTouchUI();
    });
  }

  _toggleTouchUI() {
    this.touchUIVisible = !this.touchUIVisible;
    if (this.touchUIVisible) {
      if (!this.touchControlsCreated) {
        this._createTouchUI();
        this.touchControlsCreated = true;
        setTimeout(() => this._bindTouch(), 50);
      }
      if (this.toggleBtn) {
        this.toggleBtn.textContent = '✕';
        this.toggleBtn.style.background = 'rgba(255,50,50,0.4)';
      }
    } else {
      this._removeTouchUI();
      if (this.toggleBtn) {
        this.toggleBtn.textContent = '☰';
        this.toggleBtn.style.background = 'rgba(255,255,255,0.2)';
      }
    }
  }

  _removeTouchUI() {
    if (this.touchContainer) {
      this.touchContainer.remove();
      this.touchContainer = null;
      this.touchControlsCreated = false;
    }
    this.touchActive = false;
    this.joystickX = 0;
    this.joystickY = 0;
    this.touchId = null;
    for (let key in this.touchButtons) {
      this.touchButtons[key] = false;
      this.touchButtonEdges[key] = false;
    }
    this.aimToggled = false;
    this.tabToggled = false;
    this.sprintToggled = false;
    this.chatToggled = false;
  }

  _unbindTouch() {
    const joystickZone = document.getElementById('joystick-zone');
    if (joystickZone) {
      const clone = joystickZone.cloneNode(true);
      joystickZone.parentNode.replaceChild(clone, joystickZone);
    }
    const elements = document.querySelectorAll('#touch-controls [id^="touch-"]');
    elements.forEach(el => {
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
    });
  }

  _bindTouch() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickKnob = document.querySelector('#joystick-zone > div');

    if (joystickZone) {
      joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.changedTouches[0];
        if (!touch) return;
        this.touchId = touch.identifier;
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchActive = true;
        this.locked = true;
      }, { passive: false });

      joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.touchId);
        if (!touch) return;
        const dx = touch.clientX - this.touchStartX;
        const dy = touch.clientY - this.touchStartY;
        const maxDist = 60;
        const dist = Math.hypot(dx, dy);
        let clampedX, clampedY;
        if (dist > maxDist) {
          clampedX = (dx / dist) * maxDist;
          clampedY = (dy / dist) * maxDist;
        } else {
          clampedX = dx;
          clampedY = dy;
        }
        const norm = Math.hypot(clampedX, clampedY);
        if (norm > 0) {
          this.joystickX = clampedX / norm;
          this.joystickY = clampedY / norm;
        } else {
          this.joystickX = 0;
          this.joystickY = 0;
        }
        if (joystickKnob) {
          joystickKnob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
        }
        this.locked = true;
      }, { passive: false });

      joystickZone.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchActive = false;
        this.joystickX = 0;
        this.joystickY = 0;
        this.touchId = null;
        if (joystickKnob) {
          joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
        setTimeout(() => {
          if (!this.touchButtons.fire && !this.touchButtons.jump && !this.touchButtons.crouch) {
            this.locked = false;
          }
        }, 200);
      }, { passive: false });
    }

    document.addEventListener('touchstart', (e) => {
      const target = e.target;
      if (target.closest('#touch-controls')) return;
      if (target.closest('#hud')) return;
      if (target.closest('#boot')) return;
      this.locked = true;
    }, { passive: false });

    let lastTouchX = 0;
    let lastTouchY = 0;
    let hasLastTouch = false;

    document.addEventListener('touchmove', (e) => {
      const target = e.target;
      if (target.closest('#touch-controls')) return;
      if (target.closest('#hud')) return;
      if (target.closest('#boot')) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      if (!hasLastTouch) {
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
        hasLastTouch = true;
        return;
      }

      const dx = touch.clientX - lastTouchX;
      const dy = touch.clientY - lastTouchY;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.dx += dx;
        this.dy += dy;
        this.locked = true;
      }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
      hasLastTouch = false;
      setTimeout(() => {
        if (!this.touchButtons.fire && !this.touchButtons.jump && !this.touchButtons.crouch && !this.touchActive) {
          this.locked = false;
        }
      }, 200);
    }, { passive: false });

    document.addEventListener('touchcancel', () => {
      hasLastTouch = false;
      setTimeout(() => {
        if (!this.touchButtons.fire && !this.touchButtons.jump && !this.touchButtons.crouch && !this.touchActive) {
          this.locked = false;
        }
      }, 200);
    }, { passive: false });

    const fireBtn = document.getElementById('touch-fire');
    if (fireBtn) {
      fireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        if (!this.touchButtons.fire) this.touchButtonEdges.fire = true;
        this.touchButtons.fire = true;
      }, { passive: false });
      fireBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchButtons.fire = false;
        setTimeout(() => {
          if (!this.touchButtons.jump && !this.touchButtons.crouch && !this.touchActive) {
            this.locked = false;
          }
        }, 200);
      }, { passive: false });
    }

    const aimBtn = document.getElementById('touch-aim');
    if (aimBtn) {
      aimBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        this.aimToggled = !this.aimToggled;
        this.touchButtonEdges.aim = true;
      }, { passive: false });
    }

    const jumpBtn = document.getElementById('touch-jump');
    if (jumpBtn) {
      jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        if (!this.touchButtons.jump) this.touchButtonEdges.jump = true;
        this.touchButtons.jump = true;
      }, { passive: false });
      jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchButtons.jump = false;
        setTimeout(() => {
          if (!this.touchButtons.fire && !this.touchButtons.crouch && !this.touchActive) {
            this.locked = false;
          }
        }, 200);
      }, { passive: false });
    }

    const crouchBtn = document.getElementById('touch-crouch');
    if (crouchBtn) {
      crouchBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        if (!this.touchButtons.crouch) this.touchButtonEdges.crouch = true;
        this.touchButtons.crouch = true;
      }, { passive: false });
      crouchBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchButtons.crouch = false;
        setTimeout(() => {
          if (!this.touchButtons.fire && !this.touchButtons.jump && !this.touchActive) {
            this.locked = false;
          }
        }, 200);
      }, { passive: false });
    }

    const reloadBtn = document.getElementById('touch-reload');
    if (reloadBtn) {
      reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        this.touchButtonEdges.reload = true;
        this.touchButtons.reload = true;
        setTimeout(() => { this.touchButtonEdges.reload = false; }, 300);
      }, { passive: false });
      reloadBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchButtons.reload = false;
      }, { passive: false });
    }

    const tabBtn = document.getElementById('touch-tab');
    if (tabBtn) {
      tabBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        this.tabToggled = !this.tabToggled;
        this.touchButtonEdges.tab = true;
      }, { passive: false });
    }

    const escapeBtn = document.getElementById('touch-escape');
    if (escapeBtn) {
      escapeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        if (!this.touchButtons.escape) this.touchButtonEdges.escape = true;
        this.touchButtons.escape = true;
      }, { passive: false });
      escapeBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchButtons.escape = false;
      }, { passive: false });
    }

    const sprintBtn = document.getElementById('touch-sprint');
    if (sprintBtn) {
      sprintBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        this.sprintToggled = !this.sprintToggled;
        this.touchButtonEdges.sprint = true;
      }, { passive: false });
    }

    const chatBtn = document.getElementById('touch-chat');
    if (chatBtn) {
      chatBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.locked = true;
        this.chatToggled = !this.chatToggled;
        this.touchButtonEdges.chat = true;
      }, { passive: false });
    }

    for (let i = 1; i <= 7; i++) {
      const btn = document.getElementById(`touch-weapon${i}`);
      if (btn) {
        const key = `weapon${i}`;
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.locked = true;
          if (!this.touchButtons[key]) this.touchButtonEdges[key] = true;
          this.touchButtons[key] = true;
          setTimeout(() => { this.touchButtonEdges[key] = false; }, 300);
        }, { passive: false });
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.touchButtons[key] = false;
        }, { passive: false });
      }
    }
  }

  _createTouchUI() {
    if (this.touchContainer) return;

    const container = document.createElement('div');
    container.id = 'touch-controls';
    container.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      top: 0;
      pointer-events: none;
      z-index: 9999;
      touch-action: none;
      user-select: none;
    `;

    const createBtn = (id, label, size, color = 'rgba(255,255,255,0.2)', fontSize = null) => {
      const btn = document.createElement('div');
      btn.id = id;
      btn.textContent = label;
      btn.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${color};
        border: 2px solid rgba(255,255,255,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: ${fontSize || size * 0.28}px;
        font-weight: bold;
        pointer-events: auto;
        touch-action: none;
        text-shadow: 0 2px 6px rgba(0,0,0,0.6);
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        user-select: none;
        cursor: pointer;
        z-index: 10000;
      `;
      return btn;
    };

    const topLeft = document.createElement('div');
    topLeft.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      touch-action: none;
    `;
    const escapeBtn = createBtn('touch-escape', '✕', 44, 'rgba(255,255,255,0.15)', 16);
    escapeBtn.style.fontSize = '16px';
    topLeft.appendChild(escapeBtn);
    const chatBtn = createBtn('touch-chat', '聊天', 44, 'rgba(100,200,255,0.2)', 12);
    chatBtn.style.fontSize = '12px';
    topLeft.appendChild(chatBtn);
    container.appendChild(topLeft);

    const leftSide = document.createElement('div');
    leftSide.style.cssText = `
      position: absolute;
      bottom: 30px;
      left: 30px;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: rgba(255,255,255,0.12);
      border: 2px solid rgba(255,255,255,0.2);
      pointer-events: auto;
      touch-action: none;
      z-index: 10000;
    `;
    leftSide.id = 'joystick-zone';
    const joystickKnob = document.createElement('div');
    joystickKnob.style.cssText = `
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: rgba(255,255,255,0.3);
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    `;
    leftSide.appendChild(joystickKnob);
    container.appendChild(leftSide);

    const tabBtn = createBtn('touch-tab', 'Tab', 50, 'rgba(100,200,255,0.25)', 18);
    tabBtn.style.cssText = `
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: rgba(100,200,255,0.25);
      border: 2px solid rgba(255,255,255,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 16px;
      font-weight: bold;
      pointer-events: auto;
      touch-action: none;
      text-shadow: 0 2px 6px rgba(0,0,0,0.6);
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      user-select: none;
      cursor: pointer;
      position: absolute;
      bottom: 210px;
      left: 30px;
      z-index: 10000;
    `;
    tabBtn.id = 'touch-tab';
    tabBtn.textContent = 'Tab';
    container.appendChild(tabBtn);

    const bottomRight = document.createElement('div');
    bottomRight.style.cssText = `
      position: absolute;
      bottom: 30px;
      right: 30px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
      pointer-events: none;
      touch-action: none;
    `;

    const row1 = document.createElement('div');
    row1.style.cssText = `display:flex;flex-direction:row;align-items:center;gap:12px;pointer-events:none;touch-action:none;`;
    const crouchBtn = createBtn('touch-crouch', '蹲', 55, 'rgba(255,200,0,0.3)', 20);
    row1.appendChild(crouchBtn);
    const fireBtn = createBtn('touch-fire', '开火', 90, 'rgba(255,50,50,0.5)', 36);
    fireBtn.style.borderColor = 'rgba(255,50,50,0.7)';
    row1.appendChild(fireBtn);
    const aimBtn = createBtn('touch-aim', '开镜', 60, 'rgba(50,150,255,0.3)', 24);
    row1.appendChild(aimBtn);
    bottomRight.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.cssText = `display:flex;flex-direction:row;align-items:flex-end;gap:12px;pointer-events:none;touch-action:none;`;
    const sprintBtn = createBtn('touch-sprint', '冲刺', 55, 'rgba(0,255,200,0.3)', 20);
    row2.appendChild(sprintBtn);
    const reloadBtn = createBtn('touch-reload', 'R', 50, 'rgba(255,100,100,0.3)', 18);
    row2.appendChild(reloadBtn);
    const jumpBtn = createBtn('touch-jump', '跳', 75, 'rgba(0,200,255,0.3)', 34);
    row2.appendChild(jumpBtn);
    bottomRight.appendChild(row2);
    container.appendChild(bottomRight);

    const weaponBar = document.createElement('div');
    weaponBar.style.cssText = `
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      pointer-events: auto;
      touch-action: none;
      background: rgba(0,0,0,0.5);
      padding: 6px 10px;
      border-radius: 12px;
      backdrop-filter: blur(6px);
      z-index: 10000;
    `;
    for (let i = 1; i <= 7; i++) {
      const btn = createBtn(`touch-weapon${i}`, `${i}`, 36, 'rgba(255,255,255,0.12)', 14);
      btn.style.fontSize = '14px';
      btn.style.width = '36px';
      btn.style.height = '36px';
      btn.style.border = '1px solid rgba(255,255,255,0.2)';
      weaponBar.appendChild(btn);
    }
    container.appendChild(weaponBar);

    document.body.appendChild(container);
    this.touchContainer = container;

    document.querySelectorAll('#touch-controls [id^="touch-"]').forEach(el => {
      el.addEventListener('touchstart', () => {
        el.style.transform = 'scale(0.82)';
        el.style.transition = 'transform 0.05s';
      }, { passive: true });
      el.addEventListener('touchend', () => {
        el.style.transform = 'scale(1)';
        el.style.transition = 'transform 0.1s';
      }, { passive: true });
    });
  }

  requestLock() {
    if (this.locked) return;
    if (this._lockRequested) return;
    this._lockRequested = true;
    const p = this.el.requestPointerLock?.({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        this._lockRequested = false;
        this.el.requestPointerLock();
      });
    }
    setTimeout(() => { this._lockRequested = false; }, 1000);
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
    this.joystickX = 0;
    this.joystickY = 0;
    this.touchActive = false;
    this.aimToggled = false;
    this.tabToggled = false;
    this.sprintToggled = false;
    this.chatToggled = false;
    for (let key in this.touchButtons) {
      this.touchButtons[key] = false;
      this.touchButtonEdges[key] = false;
    }
  }

  down(code) {
    if (this.keys.has(code)) return true;
    if (this.isMobile && this.touchUIVisible) {
      if (code === 'Space') return this.touchButtons.jump;
      if (code === 'KeyR') return this.touchButtons.reload;
      if (code === 'Tab') return this.tabToggled;
      if (code === 'Escape') return this.touchButtons.escape;
      if (code === 'Enter') return this.chatToggled;
      if (code === 'ShiftLeft' || code === 'ShiftRight') return this.sprintToggled;
      if (code === 'ControlLeft' || code === 'ControlRight') return this.aimToggled || this.touchButtons.crouch;
      if (code === 'Digit1') return this.touchButtons.weapon1;
      if (code === 'Digit2') return this.touchButtons.weapon2;
      if (code === 'Digit3') return this.touchButtons.weapon3;
      if (code === 'Digit4') return this.touchButtons.weapon4;
      if (code === 'Digit5') return this.touchButtons.weapon5;
      if (code === 'Digit6') return this.touchButtons.weapon6;
      if (code === 'Digit7') return this.touchButtons.weapon7;
      if (code === 'Mouse0') return this.touchButtons.fire;
      if (code === 'Mouse2') return this.aimToggled || this.touchButtons.aim;
      if (code === 'KeyW' || code === 'ArrowUp') return this.touchActive && this.joystickY < -0.1;
      if (code === 'KeyS' || code === 'ArrowDown') return this.touchActive && this.joystickY > 0.1;
      if (code === 'KeyA' || code === 'ArrowLeft') return this.touchActive && this.joystickX < -0.1;
      if (code === 'KeyD' || code === 'ArrowRight') return this.touchActive && this.joystickX > 0.1;
    }
    return false;
  }

  pressed(code) {
    if (this.keyEdges.has(code)) return true;
    if (this.isMobile && this.touchUIVisible) {
      if (code === 'Space') return this.touchButtonEdges.jump || this.touchButtons.jump;
      if (code === 'KeyR') return this.touchButtonEdges.reload || this.touchButtons.reload;
      if (code === 'Tab') return this.touchButtonEdges.tab;
      if (code === 'Escape') return this.touchButtonEdges.escape || this.touchButtons.escape;
      if (code === 'Enter') return this.touchButtonEdges.chat || this.chatToggled;
      if (code === 'ShiftLeft' || code === 'ShiftRight') return this.touchButtonEdges.sprint || this.sprintToggled;
      if (code === 'ControlLeft' || code === 'ControlRight') return this.touchButtonEdges.aim || this.touchButtonEdges.crouch || this.aimToggled || this.touchButtons.crouch;
      if (code === 'Digit1') return this.touchButtonEdges.weapon1 || this.touchButtons.weapon1;
      if (code === 'Digit2') return this.touchButtonEdges.weapon2 || this.touchButtons.weapon2;
      if (code === 'Digit3') return this.touchButtonEdges.weapon3 || this.touchButtons.weapon3;
      if (code === 'Digit4') return this.touchButtonEdges.weapon4 || this.touchButtons.weapon4;
      if (code === 'Digit5') return this.touchButtonEdges.weapon5 || this.touchButtons.weapon5;
      if (code === 'Digit6') return this.touchButtonEdges.weapon6 || this.touchButtons.weapon6;
      if (code === 'Digit7') return this.touchButtonEdges.weapon7 || this.touchButtons.weapon7;
      if (code === 'Mouse0') return this.touchButtonEdges.fire || this.touchButtons.fire;
      if (code === 'Mouse2') return this.touchButtonEdges.aim || this.touchButtons.aim;
    }
    return false;
  }

  released(code) {
    return this.keyUpEdges.has(code);
  }

  mouseDown(b) {
    if (this.isMobile && this.touchUIVisible) {
      if (b === 0) return this.touchButtons.fire || false;
      if (b === 2) return this.aimToggled || this.touchButtons.aim || false;
    }
    return this.mouse[b] || false;
  }

  mousePressed(b) {
    if (this.isMobile && this.touchUIVisible) {
      if (b === 0) return this.touchButtonEdges.fire || this.touchButtons.fire || false;
      if (b === 2) return this.touchButtonEdges.aim || this.aimToggled || this.touchButtons.aim || false;
    }
    return this.mouseEdges[b] || false;
  }

  mouseReleased(b) {
    if (this.isMobile && this.touchUIVisible) {
      if (b === 0 || b === 2) {
        setTimeout(() => {
          if (!this.touchButtons.fire && !this.touchButtons.jump && !this.touchButtons.crouch && !this.touchActive) {
            this.locked = false;
          }
        }, 200);
      }
    }
    return this.mouseUpEdges[b] || false;
  }

  moveAxis() {
    let x = 0, z = 0;
    if (this.isMobile && this.touchUIVisible && this.touchActive) {
      x = this.joystickX;
      z = this.joystickY;
      this.locked = true;
    } else {
      if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
      if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
      if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
      if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    }
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  isSprinting() {
    if (this.isMobile && this.touchUIVisible) return this.sprintToggled || false;
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }

  isChat() {
    if (this.isMobile && this.touchUIVisible) return this.chatToggled || false;
    return this.down('Enter');
  }

  isFiring() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtons.fire || false;
    return this.mouse[0] || false;
  }

  isAiming() {
    if (this.isMobile && this.touchUIVisible) return this.aimToggled || this.touchButtons.aim || false;
    return this.mouse[2] || false;
  }

  isTab() {
    if (this.isMobile && this.touchUIVisible) return this.tabToggled || false;
    return this.down('Tab');
  }

  tabPressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.tab || false;
    return this.pressed('Tab');
  }

  firePressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.fire || this.touchButtons.fire || false;
    return this.mouseEdges[0] || false;
  }

  aimPressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.aim || this.touchButtons.aim || false;
    return this.mouseEdges[2] || false;
  }

  isJumping() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtons.jump || false;
    return this.down('Space');
  }

  isCrouching() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtons.crouch || false;
    return this.down('ControlLeft') || this.down('ControlRight');
  }

  isReloading() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtons.reload || false;
    return this.down('KeyR');
  }

  isEscape() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtons.escape || false;
    return this.down('Escape');
  }

  getWeaponSlot() {
    if (this.isMobile && this.touchUIVisible) {
      if (this.touchButtons.weapon1 || this.touchButtonEdges.weapon1) return 1;
      if (this.touchButtons.weapon2 || this.touchButtonEdges.weapon2) return 2;
      if (this.touchButtons.weapon3 || this.touchButtonEdges.weapon3) return 3;
      if (this.touchButtons.weapon4 || this.touchButtonEdges.weapon4) return 4;
      if (this.touchButtons.weapon5 || this.touchButtonEdges.weapon5) return 5;
      if (this.touchButtons.weapon6 || this.touchButtonEdges.weapon6) return 6;
      if (this.touchButtons.weapon7 || this.touchButtonEdges.weapon7) return 7;
      return 0;
    }
    if (this.down('Digit1')) return 1;
    if (this.down('Digit2')) return 2;
    if (this.down('Digit3')) return 3;
    if (this.down('Digit4')) return 4;
    if (this.down('Digit5')) return 5;
    if (this.down('Digit6')) return 6;
    if (this.down('Digit7')) return 7;
    return 0;
  }

  jumpPressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.jump || this.touchButtons.jump || false;
    return this.pressed('Space');
  }

  crouchPressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.crouch || this.touchButtons.crouch || false;
    return this.pressed('ControlLeft') || this.pressed('ControlRight');
  }

  reloadPressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.reload || this.touchButtons.reload || false;
    return this.pressed('KeyR');
  }

  escapePressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.escape || this.touchButtons.escape || false;
    return this.pressed('Escape');
  }

  sprintPressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.sprint || this.sprintToggled || false;
    return this.pressed('ShiftLeft') || this.pressed('ShiftRight');
  }

  chatPressed() {
    if (this.isMobile && this.touchUIVisible) return this.touchButtonEdges.chat || this.chatToggled || false;
    return this.pressed('Enter');
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
    for (let key in this.touchButtonEdges) {
      this.touchButtonEdges[key] = false;
    }
  }
}