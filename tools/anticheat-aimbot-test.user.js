// ==UserScript==
// @name         PixelOps Anticheat Aimbot Test
// @namespace    pixelops.local.test
// @version      1.0.0
// @description  Auto-fires and snaps the view yaw/pitch to trip the server-side AnticheatMgr aim-snap detection (⚠ 环境异常 被移出对局). Dev tool only.
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

  const RAD = Math.PI / 180;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // The bundled main.js assigns `window.game = game` at the end of its module
  // body, which runs after the document is parsed. Poll until it appears.
  async function waitForGame(timeoutMs = 20000) {
    const start = performance.now();
    while (!window.game) {
      if (performance.now() - start > timeoutMs) return null;
      await wait(100);
    }
    return window.game;
  }

  function wrapAngle(a) {
    return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  }

  function install(game) {
    if (window.cheat) return window.cheat;

    const cheat = {
      running: false,
      timer: null,
      deg: 90,     // per-snap angle in degrees (> 60 trips the server detector)
      ms: 100,     // snap interval
      autoFire: true,

      // Begin snapping aim (and, by default, holding fire) so the server sees
      // consecutive >60° yaw jumps while trigger=true.
      start(opts = {}) {
        if (cheat.running) return cheat;
        if (!game.player) {
          console.warn('[cheat] game.player not ready — are you deployed in a PVP match?');
          return cheat;
        }
        cheat.deg = Number(opts.deg) || cheat.deg;
        cheat.ms = Number(opts.ms) || cheat.ms;
        cheat.autoFire = opts.autoFire !== false;
        cheat.running = true;

        // Hold fire without dispatching a synthetic click (which would also hit
        // the menu/pointer-lock click handler). input.mouseDown(0) reads this.
        if (cheat.autoFire && game.input) game.input.mouse[0] = true;

        cheat.timer = setInterval(() => {
          const p = game.player;
          if (!p) return;
          p.yaw = wrapAngle(p.yaw + cheat.deg * RAD);
          // Keep pitch inside the server's clamp; yaw alone is enough to trip
          // the detector since it scores max(deltaYaw, deltaPitch).
          p.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, p.pitch));
        }, cheat.ms);

        console.log(`[cheat] snap ON — ${cheat.deg}° every ${cheat.ms}ms, autoFire=${cheat.autoFire}`);
        return cheat;
      },

      stop() {
        if (!cheat.running) return cheat;
        cheat.running = false;
        clearInterval(cheat.timer);
        cheat.timer = null;
        if (cheat.autoFire && game.input) game.input.mouse[0] = false;
        console.log('[cheat] snap OFF');
        return cheat;
      },

      toggle() {
        return cheat.running ? cheat.stop() : cheat.start();
      },
    };

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F8') return;
      e.preventDefault();
      e.stopPropagation();
      cheat.toggle();
    });

    window.cheat = cheat;
    console.log('[cheat] ready — window.cheat.start() / .stop() / .toggle(), or press F8');
    return cheat;
  }

  waitForGame().then((game) => {
    if (!game) {
      console.warn('[cheat] window.game not found — is this the PixelOps page?');
      return;
    }
    install(game);
  });
})();
