// Just enough browser to run the non-WebGL parts of the game under Node.
export function installDomStub() {
  const calls = { fillRect: 0, clearRect: 0 };

  function makeContext2D(canvas) {
    return {
      canvas,
      fillStyle: '#000',
      strokeStyle: '#000',
      globalAlpha: 1,
      lineWidth: 1,
      imageSmoothingEnabled: true,
      font: '10px monospace',
      textAlign: 'left',
      textBaseline: 'top',
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      fillRect: (x, y, w, h) => {
        calls.fillRect++;
        if (![x, y, w, h].every(Number.isFinite)) throw new Error(`fillRect got NaN: ${x},${y},${w},${h}`);
      },
      clearRect: () => { calls.clearRect++; },
      drawImage: () => {},
      save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
      beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {},
      stroke: () => {}, fill: () => {}, fillText: () => {},
      measureText: (s) => ({ width: s.length * 6 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    };
  }

  function makeCanvas(w = 300, h = 150) {
    const canvas = { width: w, height: h, style: {} };
    canvas.getContext = (type) => (type === '2d' ? (canvas.__ctx ||= makeContext2D(canvas)) : null);
    return canvas;
  }

  const listeners = new Map();
  const doc = {
    createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
    getElementById: () => null,
    addEventListener: (t, f) => listeners.set(t, f),
    pointerLockElement: null,
  };

  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1600,
    innerHeight: 900,
    addEventListener: (t, f) => listeners.set(t, f),
    devicePixelRatio: 1,
    AudioContext: null,
  };
  globalThis.HTMLCanvasElement = function () {};
  globalThis.localStorage = {
    _d: new Map(),
    getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
    setItem(k, v) { this._d.set(k, String(v)); },
    removeItem(k) { this._d.delete(k); },
  };
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.requestAnimationFrame = () => 0;

  return { makeCanvas, calls };
}
