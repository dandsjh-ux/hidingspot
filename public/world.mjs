export const CELL = 38;
export const EYES = [1.65, 1.07, 0.51];
export const BODY = [1.82, 1.18, 0.64];
export const PLAYER_RADIUS = 0.34;
export const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function randomSource(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ seed >>> 15, seed | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const ROWS = [
  ['Vineyard Walk', 'North Gate', 'Bell Tower', 'Painter’s Lane', 'Cypress Court'],
  ['Orchard', 'Potters’ Yard', 'Church Steps', 'Blue-Shutter Lane', 'Laundry Court'],
  ['West Arcade', 'Market Square', 'Fountain Plaza', 'Olive Garden', 'East Arcades'],
  ['Canal Bridge', 'Bakery Lane', 'Rose Garden', 'School Courtyard', 'Stone Terrace'],
  ['River Gardens', 'Tiled Courtyard', 'Clock Court', 'Café Terrace', 'Water Gardens']
];
const TYPES = [
  ['vineyard', 'gate', 'tower', 'houses', 'orchard'],
  ['orchard', 'pottery', 'church', 'blue', 'laundry'],
  ['arcade', 'market', 'plaza', 'garden', 'arcade'],
  ['canal', 'bakery', 'rose', 'school', 'terrace'],
  ['orchard', 'houses', 'clock', 'cafe', 'canal']
];
const NPC_NAMES = ['Luca', 'Sofia', 'Marco', 'Nina', 'Enzo', 'Giulia', 'Leo', 'Rosa', 'Mila', 'Toni', 'Alba', 'Dario'];
export const LANDMARKS = {
  vineyard: ['vines', 'rows of climbing vines'], gate: ['arch', 'the stone arch'],
  tower: ['bell tower', 'the tall bell tower'], houses: ['shutters', 'the colourful shutters'],
  orchard: ['trees', 'the shady trees'], pottery: ['pots', 'the clay pots'],
  church: ['church', 'the pale stone church'], blue: ['shutters', 'the blue shutters'],
  laundry: ['washing line', 'the washing line'], arcade: ['arches', 'the row of arches'],
  market: ['market stalls', 'the striped market stalls'], plaza: ['fountain', 'the round fountain'],
  garden: ['olive trees', 'the silver-green olive trees'], canal: ['bridge', 'the narrow bridge'],
  bakery: ['bakery', 'the bakery with a red awning'], rose: ['rose bushes', 'the pink rose bushes'],
  school: ['courtyard', 'the school courtyard'], terrace: ['wall', 'the low stone wall'],
  clock: ['clock tower', 'the square clock tower'], cafe: ['café', 'the café tables']
};

export function makeWorld({ size = 5, seed = 2917 } = {}) {
  const half = size === 3 ? 1 : 2;
  const bound = (half + 0.5) * CELL;
  const blocks = [], objects = [], obstacles = [], npcs = [];
  const rng = randomSource(seed);
  function add(block, kind, dx, dz, w, d, h, data = {}) {
    const obj = { kind, x: block.x + dx, z: block.z + dz, w, d, h, ...data };
    objects.push(obj);
    return obj;
  }
  function wall(obj, bottom = 0, top = obj.h, factor = 1) {
    obstacles.push({ x: obj.x, z: obj.z, w: obj.w * factor, d: obj.d * factor, bottom, top });
  }
  function building(b, dx, dz, w, d, h, data = {}) {
    const obj = add(b, 'building', dx, dz, w, d, h, {
      hue: Math.floor(rng() * 8), face: dz > 0 ? 0 : Math.PI,
      roof: rng() < 0.35 ? 'hip' : 'gable', floors: h > 7 ? 3 : 2, trim: rng() < 0.6,
      ...data
    });
    wall(obj);
    return obj;
  }
  function tree(b, x, z, type = 'olive', scale = 1) {
    const obj = add(b, 'tree', x, z, scale * 0.65, scale * 0.65, scale * (type === 'cypress' ? 7 : 5), {
      variety: type, shade: Math.floor(rng() * 4), angle: rng() * 6.283
    });
    wall(obj, 0, 2.4 * scale);
  }
  function prop(b, kind, x, z, w, d, h, data = {}, solid = true) {
    const obj = add(b, kind, x, z, w, d, h, data);
    if (solid) wall(obj);
    return obj;
  }
  function shelter(b, kind, x, z, w, d, h, clearance, data = {}) {
    const obj = prop(b, kind, x, z, w, d, h, { clearance, ...data }, false);
    wall(obj, clearance, kind === 'stall' ? h : h + 0.32);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      wall({ x: obj.x + side * (w / 2 - 0.16), z: obj.z + end * (d / 2 - 0.16), w: 0.27, d: 0.27, h });
    }
    return obj;
  }
  function houses(b, special) {
    const common = special === 'blue' ? { shutter: 1 } : {};
    building(b, -8.7, -8.2, 10 + rng() * 2.5, 11, 7 + rng() * 4, { ...common, ...(special === 'bakery' ? { sign: 'FORNO', awning: 1 } : {}) });
    building(b, 8.7, -8.4, 11, 10.5, 8 + rng() * 4, common);
    building(b, -9, 8.6, 11, 10, 7 + rng() * 3, { ...common, ...(special === 'school' ? { sign: 'SCUOLA', hue: 5 } : {}) });
    if (special !== 'cafe' && special !== 'pottery') building(b, 9, 8.9, 10.4, 10.3, 6.5 + rng() * 4, common);
    else building(b, 10, 10.5, 7, 6.7, 6, { sign: special === 'cafe' ? 'CAFFÈ' : 'CERAMICA', awning: special === 'cafe' ? 2 : 0 });
    tree(b, 2, 11, 'citrus', 0.72);
    prop(b, 'pot', -4.5, 2.8, 0.75, 0.75, 1.1);
    prop(b, 'bench', 7, 1.1, 2.1, 0.72, 0.82);
    if (special === 'pottery') {
      for (let i = 0; i < 4; i++) prop(b, 'pot', 6 + i * 1.55, 5.8, 0.95, 0.95, 0.8 + rng() * 0.6);
      shelter(b, 'platform', -5.8, 0.1, 2.5, 1.7, 1.05, 0.83);
    }
    if (special === 'cafe') {
      for (const x of [7, 11]) for (const z of [3.2, 5.6]) prop(b, 'table', x, z, 1.2, 1.2, 2.4);
    }
    if (special === 'laundry') {
      prop(b, 'laundry', -3, 3.1, 7, 1, 3.4, {}, false);
      prop(b, 'laundry', 4.9, -2.9, 11, 1, 4.5, {}, false);
    }
    if (special === 'school') {
      shelter(b, 'platform', 0.7, -3.7, 4.9, 2.2, 1.4, 1.32);
      prop(b, 'crate', 2, 1.8, 1.6, 1.2, 1);
    }
  }

  for (let iz = -half; iz <= half; iz++) for (let ix = -half; ix <= half; ix++) {
    const type = TYPES[iz + 2][ix + 2];
    const block = { ix, iz, x: ix * CELL, z: iz * CELL, type, name: ROWS[iz + 2][ix + 2] };
    blocks.push(block);
    switch (type) {
      case 'plaza':
        prop(block, 'fountain', 0, 0, 7.1, 7.1, 2.6, {}, false);
        wall({ x: 0, z: 0, w: 5.00, d: 6.97, h: 0.73 });
        wall({ x: 0, z: 0, w: 6.06, d: 5.81, h: 0.73 });
        wall({ x: 0, z: 0, w: 6.96, d: 3.03, h: 0.73 });
        wall({ x: 0, z: 0, w: 0.82, d: 0.82, h: 2.62 });
        for (const x of [-12, 12]) for (const z of [-11, 11]) {
          tree(block, x, z, 'cypress', 0.82);
          prop(block, 'bench', x * 0.72, z, 2.6, 0.8, 0.85);
          prop(block, 'planter', x * 0.96, z * 0.53, 3.05, 1.28, 1.03, { flower: x > 0 ? 0xc07480 : 0xbc8a58 });
        }
        for (const x of [-5.1, 5.1]) prop(block, 'lamp', x, -8.6, 0.42, 0.42, 3.6, {}, false);
        break;
      case 'church':
      case 'tower':
      case 'clock':
        building(block, -3.7, -1.8, 12, 15, 10.7, { hue: 6, chapel: true, face: 0, floors: 2 });
        building(block, 6, -3.9, 5, 5.4, type === 'tower' ? 22 : 18.3, { hue: 6, tower: true, clock: type !== 'tower', face: 0 });
        prop(block, 'steps', -3.7, 6.8, 10, 2.2, 0.35, {}, false);
        for (const x of [-12, 12]) for (const z of [-10, 10]) tree(block, x, z, 'cypress', 0.95);
        prop(block, 'statue', 6.7, 10.6, 1.6, 1.6, 3.7);
        break;
      case 'market':
        building(block, -9.7, -9.2, 9.8, 8.8, 6.5, { sign: 'MERCATO', hue: 3, face: 0 });
        for (const x of [-9, 0, 9]) for (const z of [-1.5, 8.1]) {
          shelter(block, 'stall', x, z, 4.5, 3, 2.8, 2.13, { stripe: Math.floor(rng() * 3) });
          shelter(block, 'platform', x, z + 0.28, 3.9, 1.32, 1.05, 0.76);
        }
        prop(block, 'crate', 11.6, -7.2, 2.2, 2.2, 1.5);
        break;
      case 'garden':
      case 'orchard':
      case 'rose':
      case 'vineyard':
        for (const x of [-10.7, 10.7]) for (const z of [-10, 0, 10]) {
          tree(block, x + rng() * 1.2, z, type === 'rose' ? 'cypress' : type === 'orchard' ? 'citrus' : 'olive', 0.78 + rng() * 0.22);
        }
        for (const x of [-6.8, 6.8]) for (const z of [-8, 8]) {
          prop(block, 'hedge', x, z, 5.1, 2, type === 'rose' ? 1.22 : 1.31, { flower: type === 'rose' || type === 'vineyard' });
        }
        prop(block, type === 'rose' ? 'statue' : 'well', 0, 0, 2.25, 2.25, type === 'rose' ? 3.1 : 1.05);
        prop(block, 'bench', 0, 10.1, 2.6, 0.8, 0.85);
        shelter(block, 'pergola', 0, -9.6, 5.4, 4.1, 3.1, 2.57, { flower: type === 'rose' });
        break;
      case 'arcade':
      case 'gate':
        if (type === 'arcade') {
          building(block, -9, -8.3, 8.7, 11, 8.4, { hue: 6 });
          building(block, 9, -8.3, 8.7, 11, 9.4, { hue: 4 });
        }
        prop(block, 'arcade', 0, 1.2, 25.6, 1.6, type === 'gate' ? 6.2 : 5, { count: 5 }, false);
        for (let i = 0; i < 6; i++) wall({ x: block.x - 12.5 + i * 5, z: block.z + 1.2, w: 0.82, d: 1.6, h: 4.83 });
        wall({ x: block.x, z: block.z + 1.2, w: 25.3, d: 1.67 }, 3.97, 5.04);
        for (const x of [-9, 9]) tree(block, x, 10.2, 'cypress');
        prop(block, 'crate', 3.6, 7.3, 2.9, 2.2, 1.42);
        break;
      case 'canal': {
        prop(block, 'water', 0, 0, 7, 29, 0, {}, false);
        prop(block, 'bridge', 0, 0, 8.3, 4.4, 0.65, {}, false);
        for (const z of [-8.35, 8.35]) wall({ x: block.x, z: block.z + z, w: 7, d: 12.3, h: 3 });
        for (const z of [-2.12, 2.12]) wall({ x: block.x, z: block.z + z, w: 8, d: 0.36, h: 1.1 });
        for (const x of [-9, 9]) for (const z of [-8.5, 8.5]) tree(block, x, z, 'cypress', 0.87);
        building(block, -11.5, 0, 5.3, 8.4, 6.5);
        building(block, 11.5, 1, 5.5, 8.9, 7.4);
        break;
      }
      case 'terrace':
        for (const x of [-10, 10]) {
          prop(block, 'hedge', x, 8.4, 8, 2.3, 1.3, { flower: true });
          prop(block, 'lowWall', x, -4.7, 8, 0.75, 1.24);
          tree(block, x, -10, 'cypress');
        }
        shelter(block, 'pergola', 0, 1.8, 7, 5, 3.3, 2.7);
        shelter(block, 'platform', -7, 4.2, 2.8, 2.3, 1.44, 1.28);
        prop(block, 'bench', 0, 10, 2.3, 0.8, 0.84);
        break;
      default:
        houses(block, type);
    }
    for (const [dx, dz] of [[-15.2, -13.8], [15.2, 13.8]]) {
      prop(block, 'lamp', dx, dz, 0.4, 0.4, 3.6, {}, false);
    }
    const stations = [[-15.9, -1.2], [10.3, 15.6]];
    if (type === 'plaza') stations.push([7.4, 5.3], [-7.4, -5.3]);
    for (const [dx, dz] of stations) {
      const id = npcs.length;
      npcs.push({ id, name: NPC_NAMES[id % NPC_NAMES.length], x: block.x + dx, z: block.z + dz,
        yaw: dx < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, outfit: (id * 7 + Math.floor(id / 4)) % 9 });
    }
  }
  // Cell bins keep shared movement and sight checks inexpensive on both peers.
  const grid = new Map();
  const bin = 10;
  for (const item of obstacles) {
    for (let x = Math.floor((item.x - item.w / 2) / bin); x <= Math.floor((item.x + item.w / 2) / bin); x++) {
      for (let z = Math.floor((item.z - item.d / 2) / bin); z <= Math.floor((item.z + item.d / 2) / bin); z++) {
        const key = x + ',' + z;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(item);
      }
    }
  }
  return { size: half * 2 + 1, seed, bound, blocks, objects, obstacles, npcs, grid, bin };
}

export function blockAt(world, x, z) {
  const half = (world.size - 1) / 2;
  const ix = clamp(Math.round(x / CELL), -half, half);
  const iz = clamp(Math.round(z / CELL), -half, half);
  return world.blocks[(iz + half) * world.size + ix + half];
}
export function direction(dx, dz) {
  return DIRECTIONS[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8];
}
const candidates = (world, x0, z0, x1, z1) => {
  const found = new Set();
  for (let x = Math.floor(x0 / world.bin); x <= Math.floor(x1 / world.bin); x++) {
    for (let z = Math.floor(z0 / world.bin); z <= Math.floor(z1 / world.bin); z++) {
      for (const object of world.grid.get(x + ',' + z) || []) found.add(object);
    }
  }
  return found;
};
export function occupied(world, x, z, stance = 0) {
  const r = PLAYER_RADIUS;
  if (Math.abs(x) > world.bound - r || Math.abs(z) > world.bound - r) return true;
  for (const o of candidates(world, x - r, z - r, x + r, z + r)) {
    if (BODY[stance] > o.bottom && Math.abs(x - o.x) < o.w / 2 + r && Math.abs(z - o.z) < o.d / 2 + r) return true;
  }
  return false;
}
export function stepBody(world, player, input, dt, sprint = true) {
  if (!occupied(world, player.x, player.z, input.stance)) player.stance = input.stance;
  const speed = player.stance === 2 ? 2.0 : player.stance === 1 ? 3.15 : input.run && sprint ? 8.2 : 5.3;
  const scale = Math.max(1, Math.hypot(input.forward, input.side));
  const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
  const dx = (input.side * cos - input.forward * sin) * speed * dt / scale;
  const dz = (-input.side * sin - input.forward * cos) * speed * dt / scale;
  if (!occupied(world, player.x + dx, player.z, player.stance)) player.x += dx;
  if (!occupied(world, player.x, player.z + dz, player.stance)) player.z += dz;
}
export function clearSight(world, from, to) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  for (const o of candidates(world, Math.min(from.x, to.x), Math.min(from.z, to.z), Math.max(from.x, to.x), Math.max(from.z, to.z))) {
    let entry = 0.001, exit = 0.999;
    for (const [start, delta, low, high] of [
      [from.x, dx, o.x - o.w / 2, o.x + o.w / 2],
      [from.z, dz, o.z - o.d / 2, o.z + o.d / 2],
      [from.y, dy, o.bottom, o.top]
    ]) {
      if (Math.abs(delta) < 1e-8) {
        if (start < low || start > high) { entry = 2; break; }
        continue;
      }
      const a = (low - start) / delta, b = (high - start) / delta;
      entry = Math.max(entry, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (entry > exit) break;
    }
    if (entry <= exit) return false;
  }
  return true;
}
export const atHeight = (what, y) => ({ x: what.x, y, z: what.z });
export const eye = p => atHeight(p, EYES[p.stance]);
