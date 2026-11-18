import * as THREE from 'three';
import { cellCenter, type Maze } from './maze';

export const HOLE_RADIUS = 0.65;
const FLOOR_DEPTH = 0.3;
const WALL_HEIGHT = 0.8;

export interface Level {
  // Outer group is moved by the swoop; inner board is tilted by the player.
  group: THREE.Group;
  board: THREE.Group;
  maze: Maze;
  hole: { x: number; z: number };
}

export function buildLevel(maze: Maze, index: number): Level {
  const group = new THREE.Group();
  const board = new THREE.Group();
  group.add(board);

  const hue = (0.6 + index * 0.13) % 1;
  const floorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.15, 0.3) });
  const wallMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.35, 0.65) });

  // Floor: a square with a round hole, extruded downward from y = 0.
  const half = maze.size / 2 + 0.2;
  const hole = cellCenter(maze, maze.hole);
  const shape = new THREE.Shape()
    .moveTo(-half, -half)
    .lineTo(half, -half)
    .lineTo(half, half)
    .lineTo(-half, half)
    .closePath();
  // Shape Y maps to world -Z after the rotation below.
  shape.holes.push(new THREE.Path().absarc(hole.x, -hole.z, HOLE_RADIUS, 0, Math.PI * 2, true));
  const floorGeo = new THREE.ExtrudeGeometry(shape, { depth: FLOOR_DEPTH, bevelEnabled: false, curveSegments: 32 });
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, -FLOOR_DEPTH, 0);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  board.add(floor);

  for (const w of maze.walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w.hw * 2, WALL_HEIGHT, w.hd * 2), wallMat);
    wall.position.set(w.x, WALL_HEIGHT / 2, w.z);
    wall.castShadow = wall.receiveShadow = true;
    board.add(wall);
  }

  return { group, board, maze, hole };
}

export function disposeLevel(level: Level) {
  level.group.removeFromParent();
  level.group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}
