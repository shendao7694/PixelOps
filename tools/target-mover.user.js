// ==UserScript==
// @name         PixelOps Target Mover (anticheat test helper)
// @namespace    pixelops.local.test
// @version      1.0.0
// @description  Makes the LOCAL player strafe left/right automatically so the anti-cheat "moving target" test needs only one human. Install on the VICTIM/target client, keep the aimbot/silent-aim on the other client. Toggle with F9.
// @author       PixelOps
// @match        http://127.0.0.1:18123/*
// @match        http://localhost:18123/*
// @match        http://127.0.0.1:7694/*
// @match        http://localhost:7694/*
// @match        http://127.0.0.1:7695/*
// @match        http://localhost:7695/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitForGame(timeoutMs = 20000) {
    const start = performance.now();
    while (!window.game) {
      if (performance.now() - start > timeoutMs) return null;
      await wait(100);
    }
    return window.game;
  }

  function install(game) {
    if (window.targetMover) return window.targetMover;

    const mover = {
      running: false,
      timer: null,
      dir: 1,          // 1 = strafe right (KeyD), -1 = strafe left (KeyA)
      ms: 1400,        // switch direction every 1.4s

      start() {
        if (mover.running) return mover;
        if (!game.input || !(game.input.keys instanceof Set)) {
          console.warn('[mover] game.input.keys not found — are you deployed in a match?');
          return mover;
        }
        mover.running = true;
        mover.dir = 1;
        mover.timer = setInterval(() => {
          const keys = game.input.keys;
          keys.delete('KeyA');
          keys.delete('KeyD');
          keys.add(mover.dir > 0 ? 'KeyD' : 'KeyA');
          mover.dir = -mover.dir;
        }, mover.ms);
        console.log('[mover] moving target ON (strafe left/right)');
        return mover;
      },

      stop() {
        if (!mover.running) return mover;
        mover.running = false;
        clearInterval(mover.timer);
        mover.timer = null;
        if (game.input && game.input.keys) {
          game.input.keys.delete('KeyA');
          game.input.keys.delete('KeyD');
        }
        console.log('[mover] moving target OFF');
        return mover;
      },

      toggle() {
        return mover.running ? mover.stop() : mover.start();
      },
    };

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F9') return;
      e.preventDefault();
      e.stopPropagation();
      mover.toggle();
    });

    window.targetMover = mover;
    console.log('[mover] ready — window.targetMover.start()/stop()/toggle(), or press F9');
    return mover;
  }

  waitForGame().then((game) => {
    if (!game) {
      console.warn('[mover] window.game not found — is this the PixelOps page?');
      return;
    }
    install(game);
  });
})();
