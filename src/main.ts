import * as THREE from 'three';
import { DualSense } from './dualsense';
import { AudioHaptics } from './haptics';
import { TiltEstimator } from './tilt';
import { cellCenter, generateMaze, type Cell } from './maze';
import { buildLevel, disposeLevel, HOLE_RADIUS, type Level } from './level';

// Controller config
const PITCH_SIGN = -1;
const ROLL_SIGN = 1;
const MAX_TILT = THREE.MathUtils.degToRad(45);

const TRAY_SIZE = 10;
const GRID = 6;
const BALL_RADIUS = 0.4;
const GRAVITY = 9.8;
const ROLL_DAMPING = 0.6;
const WALL_BOUNCE = 0.4;
const SUBSTEPS = 4;

const LEVEL_GAP = 14;
const FALL_GRAVITY = 30;
const SWOOP_DEPTH = 20;
const SWOOP_TIME = 0.7; // must finish before the ball falls LEVEL_GAP
const CAMERA_HEIGHT = 14;
const CAMERA_BACK = 10;

// Haptic configs
const BUMP_MIN_SPEED = 0.5; // ignore resting contact against a wall
const BUMP_FULL_SPEED = 6;
const BUMP_DECAY = 18; // per second
const ROLL_HAPTICS = false; // continuous rolling vibration; bumps are unaffected
const ROLL_MIN_SPEED = 0.2;
const ROLL_FULL_SPEED = 6;
const ROLL_MAX = 0.35; // intensity at ROLL_FULL_SPEED
const ROLL_RANGE_DB = 30; // how much quieter the slowest roll is than the fastest
const ROLL_SMOOTHING = 6; // per second; keeps the rumble motor from jittering

// --- Scene -----------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0f13);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, CAMERA_HEIGHT, CAMERA_BACK);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
sun.shadow.camera.right = sun.shadow.camera.top = 8;
scene.add(sun, sun.target);

const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0xebcb8b, metalness: 0.6, roughness: 0.3 }),
);
ball.castShadow = true;

// Board-local XZ velocity while rolling.
const ballVel = new THREE.Vector2();
// World velocity while falling.
const fallVel = new THREE.Vector3();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Levels ----------------------------------------------------------------

let levelIndex = 0;
let current = spawnLevel(0, { c: 0, r: 0 });
let next: Level | null = null;
let swoopT = 0;
let mode: 'rolling' | 'falling' = 'rolling';
const holeWorld = new THREE.Vector3();

const start = cellCenter(current.maze, current.maze.start);
current.board.add(ball);
ball.position.set(start.x, BALL_RADIUS, start.z);

function spawnLevel(index: number, startCell: Cell) {
  const level = buildLevel(generateMaze(GRID, TRAY_SIZE, startCell), index);
  level.group.position.y = -index * LEVEL_GAP;
  scene.add(level.group);
  return level;
}

function startFall() {
  mode = 'falling';
  current.board.localToWorld(holeWorld.set(current.hole.x, 0, current.hole.z));
  scene.attach(ball);
  fallVel.set(0, 0, 0);

  next = spawnLevel(levelIndex + 1, current.maze.hole);
  next.group.position.y -= SWOOP_DEPTH;
  next.group.rotation.y = Math.PI;
  next.group.scale.setScalar(0.5);
  swoopT = 0;
}

function updateSwoop(dt: number) {
  if (!next || swoopT >= 1) return;
  swoopT = Math.min(swoopT + dt / SWOOP_TIME, 1);
  const e = 1 - Math.pow(1 - swoopT, 3); // ease-out cubic
  next.group.position.y = -(levelIndex + 1) * LEVEL_GAP - SWOOP_DEPTH * (1 - e);
  next.group.rotation.y = Math.PI * (1 - e);
  next.group.scale.setScalar(0.5 + 0.5 * e);
}

function land() {
  if (!next) return;
  disposeLevel(current);
  current = next;
  next = null;
  levelIndex++;

  const s = cellCenter(current.maze, current.maze.start);
  current.board.add(ball);
  ball.position.set(s.x, BALL_RADIUS, s.z);
  ballVel.set(0, 0);
  mode = 'rolling';
  addBump(1);
  if (levelIndex === CODE_AFTER_MAZES) revealCode();
}

// --- Secret ----------------------------------------------------------------

const CODE_AFTER_MAZES = 3;
// v v basic, stored reversed + base64 so it isn't sitting in the source as plain text.
const SECRET = 'codehere=';
const GLYPHS = '▓▒░█◆◇□■⌬⟁ΣΞΨ#*+?';

function revealCode() {
  const code = [...atob(SECRET)].reverse().join('');
  const overlay = document.getElementById('secret')!;
  const codeEl = overlay.querySelector<HTMLElement>('.code')!;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('show'));

  // Each character cycles through noise, then locks in left to right.
  const t0 = performance.now();
  const LOCK_START = 300;
  const LOCK_STEP = 80;
  const scramble = () => {
    const t = performance.now() - t0;
    let out = '';
    let done = true;
    for (let i = 0; i < code.length; i++) {
      if (code[i] === '-' || t > LOCK_START + i * LOCK_STEP) out += code[i];
      else {
        out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        done = false;
      }
    }
    codeEl.textContent = out;
    if (!done) requestAnimationFrame(scramble);
    else codeEl.classList.add('locked');
  };
  scramble();

  overlay.addEventListener(
    'click',
    () => {
      overlay.classList.remove('show'); // also drops pointer-events at once
      setTimeout(() => (overlay.hidden = true), 600);
    },
    { once: true },
  );
}

// --- Input -----------------------------------------------------------------

const statusEl = document.getElementById('status')!;
const debugEl = document.getElementById('debug')!;
const connectBtn = document.getElementById('connect') as HTMLButtonElement;
const calibrateBtn = document.getElementById('calibrate') as HTMLButtonElement;
const hapticsBtn = document.getElementById('haptics') as HTMLButtonElement;

const pad = new DualSense();
const tilt = new TiltEstimator();
let crossWasDown = false;

pad.onReport = (s, dt) => {
  tilt.update(s.accel, s.gyro, dt);
  if (s.cross && !crossWasDown) tilt.calibrate();
  crossWasDown = s.cross;
};

statusEl.textContent = DualSense.supported()
  ? 'Arrow keys work as a fallback. Connect a DualSense (USB recommended).'
  : 'WebHID not supported here: use Chrome or Edge. Arrow keys still work.';
connectBtn.disabled = !DualSense.supported();

connectBtn.addEventListener('click', async () => {
  try {
    await pad.connect();
    connectBtn.textContent = 'Connected';
    connectBtn.disabled = true;
    statusEl.textContent = 'Hold the controller level and press ✕ to calibrate.';
    setTimeout(() => tilt.calibrate(), 300);
  } catch (err) {
    statusEl.textContent = `Connect failed: ${(err as Error).message}`;
  }
});
calibrateBtn.addEventListener('click', () => tilt.calibrate());

hapticsBtn.disabled = !AudioHaptics.supported();
hapticsBtn.addEventListener('click', async () => {
  try {
    hd = await AudioHaptics.connect();
    pad.setRumble(0, 0);
    hapticsBtn.textContent = 'HD haptics on';
    hapticsBtn.disabled = true;
  } catch (err) {
    statusEl.textContent = `HD haptics unavailable: ${(err as Error).message}. Using rumble.`;
  }
});

const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.key));
window.addEventListener('keyup', (e) => keys.delete(e.key));

function targetTilt() {
  if (pad.state) {
    const { pitch, roll } = tilt.angles();
    return { x: PITCH_SIGN * pitch, z: ROLL_SIGN * roll };
  }
  const k = (a: string, b: string) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
  return { x: k('ArrowDown', 'ArrowUp') * MAX_TILT, z: k('ArrowLeft', 'ArrowRight') * MAX_TILT };
}

// --- Physics ---------------------------------------------------------------

function rollBall(dt: number) {
  const board = current.board;
  ballVel.x += -GRAVITY * Math.sin(board.rotation.z) * dt;
  ballVel.y += GRAVITY * Math.sin(board.rotation.x) * dt;
  ballVel.multiplyScalar(Math.exp(-ROLL_DAMPING * dt));

  const h = dt / SUBSTEPS;
  let impact = 0;
  for (let i = 0; i < SUBSTEPS; i++) {
    ball.position.x += ballVel.x * h;
    ball.position.z += ballVel.y * h;
    for (const w of current.maze.walls) impact = Math.max(impact, collideWall(w.x, w.z, w.hw, w.hd));
  }
  if (impact > BUMP_MIN_SPEED) addBump(impact / BUMP_FULL_SPEED);

  ball.rotation.z -= (ballVel.x * dt) / BALL_RADIUS;
  ball.rotation.x += (ballVel.y * dt) / BALL_RADIUS;

  const dx = ball.position.x - current.hole.x;
  const dz = ball.position.z - current.hole.z;
  if (dx * dx + dz * dz < HOLE_RADIUS * HOLE_RADIUS) startFall();
}

// Circle vs axis-aligned box in board-local XZ. Returns the impact speed.
function collideWall(x: number, z: number, hw: number, hd: number) {
  const p = ball.position;
  const cx = THREE.MathUtils.clamp(p.x, x - hw, x + hw);
  const cz = THREE.MathUtils.clamp(p.z, z - hd, z + hd);
  let nx = p.x - cx;
  let nz = p.z - cz;
  const d2 = nx * nx + nz * nz;
  if (d2 >= BALL_RADIUS * BALL_RADIUS) return 0;

  let push: number;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nx /= d;
    nz /= d;
    push = BALL_RADIUS - d;
  } else {
    // Centre inside the box: push out along the shallowest axis.
    const ox = hw - Math.abs(p.x - x);
    const oz = hd - Math.abs(p.z - z);
    if (ox < oz) [nx, nz, push] = [Math.sign(p.x - x) || 1, 0, ox + BALL_RADIUS];
    else [nx, nz, push] = [0, Math.sign(p.z - z) || 1, oz + BALL_RADIUS];
  }

  p.x += nx * push;
  p.z += nz * push;
  const vn = ballVel.x * nx + ballVel.y * nz;
  if (vn < 0) {
    ballVel.x -= (1 + WALL_BOUNCE) * vn * nx;
    ballVel.y -= (1 + WALL_BOUNCE) * vn * nz;
  }
  return Math.max(-vn, 0);
}

function fallBall(dt: number) {
  fallVel.y -= FALL_GRAVITY * dt;
  ball.position.addScaledVector(fallVel, dt);
  // Pull the ball into line with the hole so it drops cleanly through.
  const pull = 1 - Math.exp(-20 * dt);
  ball.position.x += (holeWorld.x - ball.position.x) * pull;
  ball.position.z += (holeWorld.z - ball.position.z) * pull;
  ball.rotation.x += 4 * dt;

  if (next && ball.position.y - BALL_RADIUS <= next.group.position.y) land();
}

// --- Haptics ---------------------------------------------------------------

let hd: AudioHaptics | null = null;
let bump = 0;
let roll = 0;

function addBump(strength: number) {
  strength = Math.min(strength, 1);
  hd?.bump(strength);
  bump = Math.max(bump, strength);
}

function updateHaptics(dt: number) {
  const speed = ROLL_HAPTICS && mode === 'rolling' ? ballVel.length() : 0;
  const target = speed < ROLL_MIN_SPEED ? 0 : Math.min(speed / ROLL_FULL_SPEED, 1);
  if (hd) {
    hd.setRoll(rollIntensity(target), target);
    return;
  }

  bump *= Math.exp(-BUMP_DECAY * dt);
  if (bump < 0.02) bump = 0;
  roll += (target - roll) * (1 - Math.exp(-ROLL_SMOOTHING * dt));
  // Quantise so tiny speed changes don't spam output reports.
  const rollOut = Math.round(rollIntensity(roll) * 100) / 100;
  pad.setRumble(bump, Math.max(rollOut, bump * 0.5));
}

// Equal steps in speed are equal steps in decibels: faint when slow,
// ROLL_MAX at full speed.
function rollIntensity(speed01: number) {
  if (speed01 <= 0) return 0;
  return ROLL_MAX * Math.pow(10, (ROLL_RANGE_DB * (speed01 - 1)) / 20);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  hd?.silence();
  pad.setRumble(0, 0);
});

// --- Loop ------------------------------------------------------------------

const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (mode === 'rolling') {
    const t = targetTilt();
    const tx = THREE.MathUtils.clamp(t.x, -MAX_TILT, MAX_TILT);
    const tz = THREE.MathUtils.clamp(t.z, -MAX_TILT, MAX_TILT);
    // Keyboard input snaps, so ease toward target; controller is already smooth.
    const ease = pad.state ? 1 : 1 - Math.exp(-10 * dt);
    current.board.rotation.x += (tx - current.board.rotation.x) * ease;
    current.board.rotation.z += (tz - current.board.rotation.z) * ease;
    rollBall(dt);
  } else {
    fallBall(dt);
  }
  updateSwoop(dt);
  if (!document.hidden) updateHaptics(dt);

  // Camera and sun follow the level the ball is heading for.
  const focusY = -(mode === 'falling' ? levelIndex + 1 : levelIndex) * LEVEL_GAP;
  camera.position.y += (focusY + CAMERA_HEIGHT - camera.position.y) * (1 - Math.exp(-4 * dt));
  camera.lookAt(0, camera.position.y - CAMERA_HEIGHT, 0);
  sun.position.set(5, focusY + 12, 6);
  sun.target.position.set(0, focusY, 0);

  let debug = `level  ${levelIndex + 1}`;
  if (pad.state) {
    const s = pad.state;
    const f = (v: number[]) => v.map((n) => n.toFixed(2).padStart(6)).join(' ');
    const { pitch, roll } = tilt.angles();
    debug +=
      `\nlink   ${s.connection}\n` +
      `accel  ${f(s.accel)} g\n` +
      `gyro   ${f(s.gyro)} rad/s\n` +
      `pitch  ${THREE.MathUtils.radToDeg(pitch).toFixed(1)}°\n` +
      `roll   ${THREE.MathUtils.radToDeg(roll).toFixed(1)}°`;
  }
  debugEl.textContent = debug;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
