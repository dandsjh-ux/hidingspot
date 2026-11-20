export const CELL = 38;
export const EYES = [1.65, 1.07, 0.51];
export const BODY = [1.82, 1.18, 0.64];
export const PLAYER_RADIUS = 0.34;
export const BOUNDARY_WALL = 0.47;
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

// Interiors. Each enterable building is hollow: four walls, a doorway, a ceiling slab and furniture.
const WALL = 0.5;
export const ENTER = {
  bakery: { doorW: 1.9, doorH: 2.5, ceil: 3.5, place: ['bakery', 'the warm bakery'] },
  school: { doorW: 1.9, doorH: 2.5, ceil: 3.5, place: ['school', 'the classroom'] },
  cafe: { doorW: 1.9, doorH: 2.5, ceil: 3.4, place: ['café', 'the little café'] },
  pottery: { doorW: 1.9, doorH: 2.5, ceil: 3.4, place: ['pottery shop', 'the clay pottery shop'] },
  church: { doorW: 2.6, doorH: 3.4, ceil: 7, place: ['church', 'the cool stone church'] }
};
// Villager awareness. Villagers look in a wide arc, notice moving people from further away than still ones,
// and notice a crouching or prone hider only when close.
export const NOTICE = { fovCos: Math.cos(1.85), near: 2.1, still: 0.5, run: 1.3, stance: [1, 0.72, 0.45], eyes: 1.55 };
export const WALK = { speed: 0.8 };
const turn = (from, to, k) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * Math.max(0, Math.min(1, k));
const ease = k => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

export function makeLook(rnd, role) {
  const pick = n => Math.floor(rnd() * n);
  const age = role ? 0 : rnd() < 0.14 ? 2 : rnd() < 0.3 ? 1 : 0;
  const sex = role === 'priest' ? 0 : pick(2);
  const look = {
    age, sex, skin: pick(6), hair: age === 1 ? 4 + pick(2) : pick(4), style: pick(5), hat: rnd() < 0.3 ? 1 + pick(3) : 0,
    beard: sex === 0 && age !== 2 && rnd() < 0.3 ? 1 + pick(2) : 0, top: pick(10), bottom: pick(5), shoes: pick(3),
    garment: sex ? (rnd() < 0.5 ? 2 : pick(2)) : pick(2), apron: 0, scarf: rnd() < 0.2 ? pick(4) : -1,
    glasses: false, height: age === 2 ? 0.74 + rnd() * 0.06 : 0.94 + rnd() * 0.1 - (sex ? 0.03 : 0), build: 0.9 + rnd() * 0.25
  };
  if (look.sex) look.beard = 0;
  if (role === 'baker') Object.assign(look, { apron: 1, hat: 4, garment: 0, top: 9, scarf: -1 });
  if (role === 'teacher') Object.assign(look, { glasses: true, garment: 1, hat: 0, style: 1 });
  if (role === 'barista') Object.assign(look, { apron: 3, garment: 0, hat: 0, style: sex ? 1 : 0 });
  if (role === 'potter') Object.assign(look, { apron: 2, garment: 0, hat: 0 });
  if (role === 'priest') Object.assign(look, { garment: 3, top: 8, hat: 0, hair: 4, age: 1, height: 1, beard: 0, style: 3 });
  if (role === 'vendor') Object.assign(look, { apron: 2, hat: 1 });
  return look;
}

export function makeWorld({ size = 5, seed = 2917, walkers = true } = {}) {
  const half = size === 3 ? 1 : 2;
  const bound = (half + 0.5) * CELL;
  const blocks = [], objects = [], obstacles = [], npcs = [], interiors = [];
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
    if (obj.enter) hollow(b, obj); else wall(obj);
    return obj;
  }
  function hollow(b, o) {
    const spec = ENTER[o.enter], front = o.face === 0 ? 1 : -1, T = WALL;
    o.enter = { kind: o.enter, ...spec, T, front };
    const zFront = o.z + front * (o.d / 2 - T / 2), zBack = o.z - front * (o.d / 2 - T / 2);
    const side = (o.w - spec.doorW) / 2;
    const parts = [
      [o.x, zBack, o.w, T, 0, o.h], [o.x - (o.w / 2 - T / 2), o.z, T, o.d, 0, o.h], [o.x + (o.w / 2 - T / 2), o.z, T, o.d, 0, o.h],
      [o.x - (spec.doorW / 2 + side / 2), zFront, side, T, 0, o.h], [o.x + (spec.doorW / 2 + side / 2), zFront, side, T, 0, o.h],
      [o.x, zFront, spec.doorW, T, spec.doorH, o.h], [o.x, o.z, o.w - 2 * T, o.d - 2 * T, spec.ceil, o.h]
    ];
    for (const [x, z, w, d, bottom, top] of parts) obstacles.push({ x, z, w, d, bottom, top });
    const zs = [o.z - o.d / 2 + T, o.z + o.d / 2 - T];
    const room = {
      id: interiors.length, name: o.name, kind: o.enter.kind, place: spec.place, ceil: spec.ceil, block: b,
      x0: o.x - o.w / 2 + T, x1: o.x + o.w / 2 - T, z0: Math.min(...zs), z1: Math.max(...zs),
      door: { x: o.x, z: o.z + front * o.d / 2, w: spec.doorW, h: spec.doorH, front }
    };
    interiors.push(room);
    o.interior = room.id;
    furnish(b, o, room);
  }
  function addNpc(b, x, z, yaw, extra = {}) {
    const id = npcs.length;
    const look = makeLook(randomSource(seed * 7 + id * 131 + 5), extra.role);
    npcs.push({ id, name: NPC_NAMES[id % NPC_NAMES.length], x, z, yaw, outfit: (id * 7 + Math.floor(id / 4)) % 9, look, ...extra });
  }
  function furnish(b, o, room) {
    const T = o.enter.T, f = o.enter.front, iw = o.w - 2 * T, id = o.d - 2 * T, ux = iw / 2;
    const spot = (u, v) => ({ x: o.x + u, z: o.z + f * (o.d / 2 - T - v) });
    const put = (kind, u, v, w, d, h, data = {}, solid = true) => {
      const p = spot(u, v);
      const obj = add(b, kind, p.x - b.x, p.z - b.z, w, d, h, { inside: room.id, face: f, ...data });
      if (solid) wall(obj);
      return obj;
    };
    const low = (u, v, w, d, h, clearance, data) => {
      const p = spot(u, v);
      return shelter(b, 'platform', p.x - b.x, p.z - b.z, w, d, h, clearance, { inside: room.id, face: f, ...data });
    };
    const person = (u, v, role, yaw = 0) => {
      const p = spot(u, v);
      addNpc(b, p.x, p.z, f > 0 ? yaw : Math.PI + yaw, { role, inside: room.id });
    };
    if (o.enter.kind === 'church') put('rug', 0, id * 0.5 + 0.5, 2.2, id - 3, 0.02, { tint: 'church' }, false);
    else put('rug', 0, id * 0.4, Math.min(iw - 2, 4.6), Math.min(id - 2, 4), 0.02, { tint: o.enter.kind }, false);
    switch (o.enter.kind) {
      case 'bakery': {
        const cw = Math.min(iw * 0.36, 3.6);
        put('oven', -ux + 1.7, id - 1.0, 2.8, 1.8, 2.4);
        put('shelf', ux - 2.3, id - 0.32, 3.6, 0.55, 2.2, { goods: 'bread' });
        put('shelf', ux - 0.32, 4.2, 0.55, 3.2, 2.1, { goods: 'bread' });
        put('counter', -1.3 - cw / 2, 3.4, cw, 0.9, 1.1, { goods: 'bread' });
        low(ux - 2.6, 6.0, 2.4, 1.1, 0.95, 0.78, { decor: 'table' });
        put('sack', -ux + 0.55, 6.2, 0.9, 0.8, 0.85);
        put('sack', -ux + 0.55, 7.2, 0.9, 0.8, 0.85);
        put('barrel', ux - 0.6, id - 1.0, 0.9, 0.9, 0.95);
        person(-1.4, 5.0, 'baker', 0);
        break;
      }
      case 'school': {
        put('counter', 0, id - 1.2, 2.4, 0.9, 0.95, { desk: true });
        put('board', 0, id - 0.08, 4.4, 0.1, 1.3, {}, false);
        for (const u of [-3.2, 3.2]) for (const v of [2.8, 4.6, 6.4]) low(u, v, 2.4, 0.9, 0.78, 0.7, { decor: 'desk' });
        put('shelf', -ux + 0.3, id - 3.0, 0.55, 3.0, 2.1, { goods: 'books' });
        put('pot', ux - 0.7, id - 0.7, 0.9, 0.9, 1.2);
        person(0, id - 2.5, 'teacher', 0);
        break;
      }
      case 'cafe': {
        put('counter', -1.0, id - 0.9, 3.6, 0.9, 1.1, { bar: true });
        put('shelf', -1.0, id - 0.3, 3.6, 0.55, 2.2, { goods: 'cups' });
        low(1.8, 2.0, 2.2, 1.0, 0.95, 0.78, { decor: 'table' });
        low(1.8, 3.8, 2.2, 1.0, 0.95, 0.78, { decor: 'table' });
        put('pot', -ux + 0.6, 0.9, 0.9, 0.9, 1.3);
        put('sack', ux - 0.6, id - 0.55, 0.8, 0.7, 0.8);
        person(-1.0, 3.2, 'barista', 0);
        break;
      }
      case 'pottery': {
        put('oven', ux - 1.3, id - 1.0, 2.2, 1.6, 2.2, { kiln: true });
        put('shelf', -ux + 0.3, 3.4, 0.55, 3.4, 2.0, { goods: 'pots' });
        low(-0.4, 3.2, 2.2, 1.1, 0.95, 0.78, { decor: 'wheel' });
        put('pot', ux - 0.7, 1.2, 0.95, 0.95, 1.1);
        put('crate', -ux + 1.0, id - 0.7, 1.4, 0.9, 0.9);
        person(-0.4, 1.7, 'potter', 0);
        break;
      }
      case 'church': {
        put('altar', 0, id - 1.3, 2.8, 1.1, 1.05);
        for (const s of [-1, 1]) {
          put('statue', s * 4.2, id - 1.0, 1.6, 1.6, 3.7);
          put('booth', s * (ux - 0.8), 11.0, 1.4, 1.8, 2.5);
          for (const row of [3.2, 5.2, 7.2, 9.2]) put('pew', s * 2.95, row, 3.0, 0.75, 0.95);
        }
        put('pot', ux - 0.7, 1.0, 0.9, 0.9, 1.0, { font: true });
        low(-ux + 2.3, 1.7, 2.4, 1.0, 0.95, 0.78, { decor: 'table' });
        person(0, id - 3.2, 'priest', 0);
        break;
      }
    }
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
    building(b, -8.7, -8.2, 10 + rng() * 2.5, 11, 7 + rng() * 4, { ...common, ...(special === 'bakery' ? { sign: 'FORNO', name: 'Bakery', awning: 1, enter: 'bakery' } : {}) });
    building(b, 8.7, -8.4, 11, 10.5, 8 + rng() * 4, common);
    building(b, -9, 8.6, 11, 10, 7 + rng() * 3, { ...common, ...(special === 'school' ? { sign: 'SCUOLA', name: 'School', hue: 5, enter: 'school' } : {}) });
    if (special !== 'cafe' && special !== 'pottery') building(b, 9, 8.9, 10.4, 10.3, 6.5 + rng() * 4, common);
    else building(b, 10, 10.5, 7, 6.7, 6, {
      sign: special === 'cafe' ? 'CAFFÈ' : 'CERAMICA', name: special === 'cafe' ? 'Café' : 'Pottery Shop',
      awning: special === 'cafe' ? 2 : 0, enter: special });
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
        building(block, -3.7, -1.8, 12, 15, 10.7, {
          hue: 6, chapel: true, face: 0, floors: 2, name: type === 'church' ? 'Church' : 'Old Chapel', short: type === 'church' ? 'Church' : 'Chapel',
          sign: type === 'church' ? 'CHIESA' : 'CAPPELLA', ...(type === 'church' ? { enter: 'church' } : {})
        });
        building(block, 6, -3.9, 5, 5.4, type === 'tower' ? 22 : 18.3, {
          hue: 6, tower: true, clock: type !== 'tower', face: 0,
          name: type === 'tower' ? 'Bell Tower' : type === 'clock' ? 'Clock Tower' : 'Church Tower', short: type === 'tower' ? 'Bell Tower' : type === 'clock' ? 'Clock Tower' : 'Tower',
          sign: type === 'tower' ? 'CAMPANILE' : 'TORRE'
        });
        prop(block, 'steps', -3.7, 6.8, 10, 2.2, 0.35, {}, false);
        for (const x of [-12, 12]) for (const z of [-10, 10]) tree(block, x, z, 'cypress', 0.95);
        prop(block, 'statue', 6.7, 10.6, 1.6, 1.6, 3.7);
        break;
      case 'market':
        building(block, -9.7, -9.2, 9.8, 8.8, 6.5, { sign: 'MERCATO', name: 'Market Hall', hue: 3, face: 0 });
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
    const stations = [[-15.9, -1.2], [type === 'cafe' || type === 'pottery' ? 14.4 : 10.3, 15.6]];
    if (type === 'plaza') stations.push([7.4, 5.3], [-7.4, -5.3]);
    for (const [dx, dz] of stations) addNpc(block, block.x + dx, block.z + dz, dx < 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
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
  const world = { size: half * 2 + 1, seed, walkers: walkers !== false, bound, blocks, objects, obstacles, npcs, interiors, grid, bin };
  world.buildings = objects.filter(o => o.kind === 'building' && o.name).map(o => ({
    name: o.name, short: o.short || o.name, sub: o.sign, x: o.x, z: o.z, w: o.w, d: o.d, face: o.face, enter: !!o.enter, interior: o.interior,
    block: blockAt(world, o.x, o.z).name
  }));
  for (const npc of npcs) npc.route = makeRoute(world, npc);
  return world;
}

function makeRoute(world, npc) {
  const rnd = randomSource(world.seed * 3 + npc.id * 977 + 11);
  const home = { x: npc.x, z: npc.z };
  const reach = npc.inside != null ? [0.7, 1.6] : [1.4, 3.6];
  const free = (x, z) => !occupied(world, x, z, 0) && (npc.inside != null ? insideOf(world, x, z)?.id === npc.inside : !insideOf(world, x, z));
  const clear = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3);
    for (let i = 1; i <= n; i++) if (!free(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
    return true;
  };
  if (!free(home.x, home.z)) return null;
  const stops = [home];
  for (let k = 0; k < 2; k++) {
    for (let tries = 0; tries < 14; tries++) {
      const angle = rnd() * Math.PI * 2, r = reach[0] + rnd() * (reach[1] - reach[0]);
      const next = { x: home.x + Math.sin(angle) * r, z: home.z + Math.cos(angle) * r };
      if (clear(stops[stops.length - 1], next)) { stops.push(next); break; }
    }
  }
  if (stops.length < 2) return null;
  if (!clear(stops[stops.length - 1], home)) stops.push(stops[stops.length - 2]), stops.push(home);
  else stops.push(home);
  const speed = WALK.speed * (0.8 + rnd() * 0.35);
  const legs = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i], b = stops[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.2) continue;
    legs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, yaw: Math.atan2(b.x - a.x, b.z - a.z), walk: len / speed, speed,
      rest: 3.5 + rnd() * 7, look: rnd() * Math.PI * 2 });
  }
  const period = legs.reduce((sum, leg) => sum + leg.walk + leg.rest, 0);
  return { legs, period, offset: rnd() * period };
}

// Where a villager is at `time` seconds into the round. Both the server and every browser use this,
// so what players see matches what the server uses for sight checks.
export function npcPose(npc, time, walkers = true) {
  const sway = Math.sin(time * 0.45 + npc.id * 1.7) * 0.32;
  const route = walkers ? npc.route : null;
  if (!route) return { x: npc.x, z: npc.z, yaw: npc.yaw + sway, moving: false, speed: 0 };
  let s = ((time + route.offset) % route.period + route.period) % route.period;
  let before = npc.yaw;
  for (const leg of route.legs) {
    if (s < leg.walk) {
      const k = s / leg.walk;
      return {
        x: leg.ax + (leg.bx - leg.ax) * k, z: leg.az + (leg.bz - leg.az) * k, moving: true, speed: leg.speed,
        yaw: turn(before + sway, leg.yaw, ease(s / 0.6))
      };
    }
    s -= leg.walk;
    if (s < leg.rest) return { x: leg.bx, z: leg.bz, moving: false, speed: 0, yaw: turn(leg.yaw, leg.look + sway, ease(s / 0.7)) };
    s -= leg.rest;
    before = leg.look;
  }
  return { x: npc.x, z: npc.z, yaw: npc.yaw, moving: false, speed: 0 };
}

export function insideOf(world, x, z) {
  for (const room of world.interiors) if (x > room.x0 && x < room.x1 && z > room.z0 && z < room.z1) return room;
  return null;
}

// Can this villager notice the hider right now? `target` is { x, z, stance, moving, run }.
// Returns the strength of the sighting from 0 (not seen) up to 1 (right beside the villager).
export function npcNotices(world, pose, target, baseRadius) {
  const dx = target.x - pose.x, dz = target.z - pose.z, d = Math.hypot(dx, dz);
  const radius = baseRadius * NOTICE.stance[target.stance] * (target.moving ? (target.run ? NOTICE.run : 1) : NOTICE.still);
  if (d > radius) return 0;
  if (d > NOTICE.near && (Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz) / d < NOTICE.fovCos) return 0;
  const from = { x: pose.x, y: NOTICE.eyes, z: pose.z };
  const heights = [EYES[target.stance], BODY[target.stance] * 0.5];
  if (!heights.some(y => clearSight(world, from, { x: target.x, y, z: target.z }))) return 0;
  return 1 - d / Math.max(radius, 0.01);
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
  // The boundary wall is 0.94 m thick and centred on `bound`, so a player stops at its inner face.
  const limit = world.bound - BOUNDARY_WALL - r;
  if (Math.abs(x) > limit || Math.abs(z) > limit) return true;
  for (const o of candidates(world, x - r, z - r, x + r, z + r)) {
    if (BODY[stance] > o.bottom && Math.abs(x - o.x) < o.w / 2 + r && Math.abs(z - o.z) < o.d / 2 + r) return true;
  }
  return false;
}
export const SEEKER_SPEED = 2;
export const CATCH_RADIUS = 0.95;
// Moves in short slices so a fast player can never skip through a thin wall in one step.
export function stepBody(world, player, input, dt, sprint = true, boost = 1) {
  if (!occupied(world, player.x, player.z, input.stance)) player.stance = input.stance;
  const speed = (player.stance === 2 ? 2.0 : player.stance === 1 ? 3.15 : input.run && sprint ? 8.2 : 5.3) * boost;
  const scale = Math.max(1, Math.hypot(input.forward, input.side));
  const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
  const dx = (input.side * cos - input.forward * sin) * speed * dt / scale;
  const dz = (-input.side * sin - input.forward * cos) * speed * dt / scale;
  const slices = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
  for (let i = 0; i < slices; i++) {
    if (!occupied(world, player.x + dx / slices, player.z, player.stance)) player.x += dx / slices;
    if (!occupied(world, player.x, player.z + dz / slices, player.stance)) player.z += dz / slices;
  }
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
