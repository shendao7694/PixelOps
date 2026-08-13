import { deflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.ProgressEvent ??= class ProgressEvent {};
globalThis.self ??= globalThis;

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'assets/ui/loadout-silhouettes');
const WIDTH = 1024;
const HEIGHT = 512;
const COLOR = '#DCE7EA';

const TARGETS = [
  {
    id: 'desert_eagle',
    model: resolve(ROOT, 'low-poly_desert_eagle.glb'),
    // Exact broadside projection of TastyTony's attributed Desert Eagle
    // reference. The model's thin axis is Z; X is the barrel and Y carries the
    // sights, trigger guard and grip profile.
    project(point) {
      return [-point.x, -point.y];
    },
    widthCoverage: 0.86,
    heightCoverage: 0.76,
  },
  {
    id: 'firebomb',
    model: resolve(ROOT, 'b-2_spirit_bomber.glb'),
    // Top-down B-2 profile: its real wingspan stays horizontal and the nose
    // points upward, matching the tactical-aircraft silhouettes in the UI.
    project(point) {
      return [point.x, -point.z];
    },
    widthCoverage: 0.86,
    heightCoverage: 0.76,
  },
  {
    id: 'attack_helicopter',
    model: resolve(ROOT, 'boeing_ah-64d_apache_combat_helicopter.glb'),
    // Right-facing side profile. The supplied Apache's nose is +X.
    project(point) {
      return [point.x, -point.y];
    },
    widthCoverage: 0.86,
    heightCoverage: 0.70,
  },
];

async function loadModel(path) {
  const bytes = await readFile(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolvePromise, reject) => {
    new GLTFLoader().parse(buffer, '', resolvePromise, reject);
  });
}

function collectTriangles(scene, project) {
  scene.updateMatrixWorld(true);
  const triangles = [];
  const point = new THREE.Vector3();
  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const positions = object.geometry.attributes.position;
    const indices = object.geometry.index;
    const vertexCount = indices?.count ?? positions.count;
    for (let offset = 0; offset + 2 < vertexCount; offset += 3) {
      const triangle = [];
      for (let corner = 0; corner < 3; corner++) {
        const index = indices ? indices.getX(offset + corner) : offset + corner;
        // Skinned reference files (the Desert Eagle included) keep their raw
        // accessor vertices in bind pose. getVertexPosition applies bones and
        // morph targets before the ordinary world transform; plain Mesh uses
        // the same method as a zero-cost raw-position read.
        if (typeof object.getVertexPosition === 'function') {
          object.getVertexPosition(index, point);
        } else {
          point.fromBufferAttribute(positions, index);
        }
        point.applyMatrix4(object.matrixWorld);
        triangle.push(project(point));
      }
      triangles.push(triangle);
    }
  });
  return triangles;
}

function fitTriangles(triangles, widthCoverage, heightCoverage) {
  const points = triangles.flat();
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min(
    WIDTH * widthCoverage / spanX,
    HEIGHT * heightCoverage / spanY
  );
  const centreX = (minX + maxX) * 0.5;
  const centreY = (minY + maxY) * 0.5;
  return triangles.map((triangle) => triangle.map(([x, y]) => [
    WIDTH * 0.5 + (x - centreX) * scale,
    HEIGHT * 0.5 + (y - centreY) * scale,
  ]));
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[n] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function encodePng(alpha) {
  const [red, green, blue] = COLOR.slice(1).match(/../g).map((hex) =>
    Number.parseInt(hex, 16));
  const stride = 1 + WIDTH * 4;
  const raw = Buffer.alloc(stride * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < WIDTH; x++) {
      const at = row + 1 + x * 4;
      raw[at] = red;
      raw[at + 1] = green;
      raw[at + 2] = blue;
      raw[at + 3] = alpha[y * WIDTH + x];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function rasterizeTriangles(triangles) {
  const supersample = 3;
  const width = WIDTH * supersample;
  const height = HEIGHT * supersample;
  const mask = new Uint8Array(width * height);
  for (const triangle of triangles) {
    const points = triangle.map(([x, y]) => [x * supersample, y * supersample]);
    const minY = Math.max(0, Math.floor(Math.min(...points.map((p) => p[1]))));
    const maxY = Math.min(
      height - 1,
      Math.ceil(Math.max(...points.map((p) => p[1])))
    );
    for (let y = minY; y <= maxY; y++) {
      const scanY = y + 0.5;
      const intersections = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = points[edge];
        const b = points[(edge + 1) % 3];
        if (!((a[1] <= scanY && b[1] > scanY)
          || (b[1] <= scanY && a[1] > scanY))) {
          continue;
        }
        const t = (scanY - a[1]) / (b[1] - a[1]);
        intersections.push(a[0] + (b[0] - a[0]) * t);
      }
      if (intersections.length < 2) continue;
      intersections.sort((a, b) => a - b);
      const start = Math.max(0, Math.ceil(intersections[0] - 0.5));
      const end = Math.min(width - 1, Math.floor(intersections.at(-1) - 0.5));
      mask.fill(1, y * width + start, y * width + end + 1);
    }
  }

  const alpha = new Uint8Array(WIDTH * HEIGHT);
  const samples = supersample * supersample;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let covered = 0;
      for (let sy = 0; sy < supersample; sy++) {
        const row = (y * supersample + sy) * width + x * supersample;
        for (let sx = 0; sx < supersample; sx++) covered += mask[row + sx];
      }
      alpha[y * WIDTH + x] = Math.round(covered / samples * 255);
    }
  }
  return alpha;
}

await mkdir(OUTPUT, { recursive: true });
for (const target of TARGETS) {
  const gltf = await loadModel(target.model);
  const fitted = fitTriangles(
    collectTriangles(gltf.scene, target.project),
    target.widthCoverage,
    target.heightCoverage
  );
  const pngPath = resolve(OUTPUT, `${target.id}.png`);
  await writeFile(pngPath, encodePng(rasterizeTriangles(fitted)));
  console.log(
    `Rendered ${target.id} from ${basename(target.model)} -> ${pngPath}`
  );
}
