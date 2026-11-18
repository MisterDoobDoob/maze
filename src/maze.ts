// Grid maze generation (recursive backtracker) plus wall boxes for collision.

export interface Cell {
  c: number;
  r: number;
}

// Axis-aligned wall in board-local XZ, as centre + half extents.
export interface Wall {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

export interface Maze {
  n: number;
  size: number;
  cell: number;
  start: Cell;
  hole: Cell;
  walls: Wall[];
}

export const WALL_THICKNESS = 0.2;
export const BORDER_THICKNESS = 0.4;

export function generateMaze(n: number, size: number, start: Cell): Maze {
  // east[r][c]: wall between (c,r) and (c+1,r); south[r][c]: between (c,r) and (c,r+1).
  const east = grid(n, true);
  const south = grid(n, true);
  const depth = grid<number>(n, -1);

  const stack: Cell[] = [start];
  depth[start.r][start.c] = 0;
  let hole = start;

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = [
      { c: cur.c + 1, r: cur.r },
      { c: cur.c - 1, r: cur.r },
      { c: cur.c, r: cur.r + 1 },
      { c: cur.c, r: cur.r - 1 },
    ].filter((p) => p.c >= 0 && p.r >= 0 && p.c < n && p.r < n && depth[p.r][p.c] < 0);

    if (!options.length) {
      stack.pop();
      continue;
    }
    const next = options[Math.floor(Math.random() * options.length)];
    if (next.c !== cur.c) east[cur.r][Math.min(cur.c, next.c)] = false;
    else south[Math.min(cur.r, next.r)][cur.c] = false;

    // In a perfect maze, DFS depth is the path length from the start.
    depth[next.r][next.c] = depth[cur.r][cur.c] + 1;
    if (depth[next.r][next.c] > depth[hole.r][hole.c]) hole = next;
    stack.push(next);
  }

  const cell = size / n;
  const half = size / 2;
  const t = WALL_THICKNESS / 2;
  const walls: Wall[] = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (c < n - 1 && east[r][c]) {
        walls.push({ x: -half + (c + 1) * cell, z: -half + (r + 0.5) * cell, hw: t, hd: cell / 2 + t });
      }
      if (r < n - 1 && south[r][c]) {
        walls.push({ x: -half + (c + 0.5) * cell, z: -half + (r + 1) * cell, hw: cell / 2 + t, hd: t });
      }
    }
  }

  const b = BORDER_THICKNESS / 2;
  walls.push(
    { x: 0, z: -half, hw: half + b, hd: b },
    { x: 0, z: half, hw: half + b, hd: b },
    { x: -half, z: 0, hw: b, hd: half },
    { x: half, z: 0, hw: b, hd: half },
  );

  return { n, size, cell, start, hole, walls };
}

export function cellCenter(maze: Maze, { c, r }: Cell) {
  const half = maze.size / 2;
  return { x: -half + (c + 0.5) * maze.cell, z: -half + (r + 0.5) * maze.cell };
}

function grid<T>(n: number, value: T): T[][] {
  return Array.from({ length: n }, () => Array<T>(n).fill(value));
}
