import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1114);

export let camera;

export function initScene() {
  const container = document.getElementById('viewport');
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);
  camera.position.set(45, 40, 45);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0x334455, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x4488ff, 0.3);
  fill.position.set(-20, 30, -30);
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(0x87CEEB, 0x444444, 0.4);
  scene.add(hemi);

  const groundGeo = new THREE.PlaneGeometry(160, 132);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2024, roughness: 0.9, metalness: 0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(160, 40, 0x2a3036, 0x1a2024);
  gridHelper.position.y = 0;
  scene.add(gridHelper);

  const boundGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(160, 0.1, 132));
  const boundMat = new THREE.LineBasicMaterial({ color: 0x4a5056, transparent: true, opacity: 0.3 });
  const boundLine = new THREE.LineSegments(boundGeo, boundMat);
  boundLine.position.y = 0;
  scene.add(boundLine);
}