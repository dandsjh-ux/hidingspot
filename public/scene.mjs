import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSource, distance, EYES, npcPose, makeLook } from './world.mjs';

const v = (x, y, z) => new T.Vector3(x, y, z);
const up = v(0, 1, 0), Y = Math.PI / 2;
const plaster = [0xe4cba6, 0xdea982, 0xe8c98e, 0xd09983, 0xe5d5ae, 0xc2c4a5, 0xcfc5ac, 0xd7b27e];
const shutter = [0x455843, 0x3c586e, 0x696546, 0x754b3e, 0x566760];
const tile = [0x995d43, 0xa96c4e, 0xb07856, 0x8b523c, 0xb37555];
const foliage = [0x56674b, 0x67774e, 0x7b845d, 0x3f573d, 0x4b5d42];
const stripes = [0xb5634e, 0x728455, 0x5e7c8b];
const clothes = [0x887a48, 0xc6a574, 0xa25a46, 0x4d6573, 0x7a6b82, 0x668059, 0x745044, 0x2d7178, 0xb78651];

function texture(size, draw, height = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = height;
  draw(c.getContext('2d'), size, height);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function surface(kind) {
  return texture(256, (ctx, size) => {
    const rng = randomSource(982);
    ctx.fillStyle = kind === 'grass' ? '#8a8d66' : kind === 'stucco' ? '#ebe3d8' : kind === 'planks' ? '#b79a74' : '#93867a';
    ctx.fillRect(0, 0, size, size);
    if (kind === 'planks') {
      for (let j = 0; j < 8; j++) {
        const n = 150 + Math.floor(rng() * 50);
        ctx.fillStyle = 'rgb(' + (n + 18) + ',' + (n + 2) + ',' + (n - 28) + ')';
        ctx.fillRect(0, j * 32, size, 30);
        ctx.fillStyle = '#4a382b90'; ctx.fillRect(0, j * 32 + 30, size, 2);
        const cut = Math.floor(rng() * 200) + 20; ctx.fillRect(cut, j * 32, 2, 32);
      }
    }
    if (kind === 'tile') {
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const n = 168 + Math.floor(rng() * 26) + ((i + j) % 2) * 14;
        ctx.fillStyle = 'rgb(' + (n + 26) + ',' + (n - 14) + ',' + (n - 52) + ')';
        ctx.fillRect(i * 64 + 1.5, j * 64 + 1.5, 61, 61);
      }
    }
    if (kind === 'stone' || kind === 'street') {
      const unit = kind === 'street' ? 32 : 64;
      for (let j = 0; j < size / unit; j++) for (let i = -1; i < size / unit; i++) {
        const x = i * unit + (j % 2) * unit * 0.5, y = j * unit;
        const n = 152 + Math.floor(rng() * 44);
        ctx.fillStyle = 'rgb(' + (n + 12) + ',' + (n + 6) + ',' + n + ')';
        ctx.beginPath(); ctx.roundRect(x + 0.9, y + 0.9, unit - 1.9, unit - 1.9, 2); ctx.fill();
        ctx.strokeStyle = '#e7d6bb80';
        ctx.beginPath(); ctx.moveTo(x + 4, y + 2); ctx.lineTo(x + unit - 4, y + 2); ctx.stroke();
      }
    }
    const image = ctx.getImageData(0, 0, size, size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const n = (rng() - 0.5) * (kind === 'grass' ? 48 : 19) + Math.sin(i * 0.16) * Math.cos(j * 0.12) * 5;
      const p = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) image.data[p + c] += n;
    }
    ctx.putImageData(image, 0, 0);
  });
}

function build(scene, world) {
  const buckets = new Map(), mats = new Map(), rnd = randomSource(world.seed + 16);
  const maps = Object.fromEntries(['street', 'stone', 'stucco', 'grass', 'planks', 'tile'].map(name => [name, surface(name)]));
  const mat = (hex, map = '', metallic = false, glow = false) => {
    const key = [hex, map, metallic, glow].join('/');
    if (!mats.has(key)) mats.set(key, new T.MeshStandardMaterial({
      color: hex, map: maps[map] || null, roughness: metallic ? 0.43 : 0.87, metalness: metallic ? 0.29 : 0,
      bumpMap: map === 'stone' || map === 'street' || map === 'tile' ? maps[map] : null, bumpScale: 0.021,
      emissive: glow ? 0xca892b : 0, emissiveIntensity: glow ? 0.75 : 0
    }));
    return mats.get(key);
  };
  const sand = mat(0xdac7a6, 'stone'), trim = mat(0xdccdb5), wood = mat(0x896048), dark = mat(0x5a4434);
  const iron = mat(0x333c33, '', true), pane = mat(0x30342c), clay = mat(0xaa7255);
  const grass = mat(0xb1ae80, 'grass'), paving = mat(0xc5b59d, 'street'), flags = mat(0xcbbba1, 'stone');
  const water = mat(0x76a595, '', true);
  function bake(g, m, x, y, z, yaw = 0, pitch = 0, roll = 0, shadow = true) {
    if (roll) g.rotateZ(roll);
    if (pitch) g.rotateX(pitch);
    if (yaw) g.rotateY(yaw);
    g.translate(x, y, z); g.clearGroups();
    const key = m.id + ':' + shadow + ':' + Boolean(g.index);
    if (!buckets.has(key)) buckets.set(key, { m, gs: [], shadow });
    buckets.get(key).gs.push(g);
  }
  function box(x, y, z, w, h, d, m, yaw = 0, pitch = 0, roll = 0, shadow = true) {
    const g = new T.BoxGeometry(w, h, d);
    if (m.map) {
      const n = g.attributes.normal, uv = g.attributes.uv, unit = m.map === maps.street ? 2.5 : m.map === maps.planks || m.map === maps.tile ? 2.6 : 3.8;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.abs(n.getX(i)) > 0.5 ? d : w) / unit,
        uv.getY(i) * (Math.abs(n.getY(i)) > 0.5 ? d : h) / unit);
    }
    bake(g, m, x, y, z, yaw, pitch, roll, shadow);
  }
  function cyl(x, y, z, r, base, h, m, sides = 12) {
    bake(new T.CylinderGeometry(r, base, h, sides), m, x, y, z);
  }
  function ico(x, y, z, w, h, d, m, detail = 1) {
    bake(new T.IcosahedronGeometry(1, detail).scale(w, h, d), m, x, y, z, rnd() * 6.28);
  }
  function beam(a, b, r1, r2, m, sides = 7) {
    const axis = v(...b).sub(v(...a));
    const g = new T.CylinderGeometry(r2, r1, axis.length(), sides);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up, axis.normalize()));
    bake(g, m, ...a.map((x, i) => (x + b[i]) / 2));
  }
  function arch(x, y, z, w, h, thick, depth, m, a = 0, fill = false) {
    const r = w / 2, s = new T.Shape();
    s.moveTo(-r - thick, 0); s.lineTo(-r - thick, h);
    s.absarc(0, h, r + thick, Math.PI, 0, true); s.lineTo(r + thick, 0);
    if (!fill) { s.lineTo(r, 0); s.lineTo(r, h); s.absarc(0, h, r, 0, Math.PI, false); s.lineTo(-r, 0); }
    s.closePath();
    bake(new T.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 9 }), m, x, y, z, a);
  }
  const signMats = new Map();
  function signMat(title, sub, style, ratio) {
    const key = [title, sub, style].join('|');
    if (signMats.has(key)) return signMats.get(key);
    const W = 1024, H = Math.round(W / ratio);
    const palette = { plaque: ['#4a382c', '#e7c987', '#fff0cf'], street: ['#2f3d2c', '#d9c58f', '#fbf3dc'], blade: ['#5b4331', '#e7c987', '#fff0cf'] }[style];
    const tex = texture(W, (ctx, w, h) => {
      ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = palette[1]; ctx.lineWidth = Math.round(h * 0.035);
      ctx.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14);
      ctx.strokeStyle = palette[1] + '88'; ctx.lineWidth = Math.round(h * 0.012);
      ctx.strokeRect(h * 0.13, h * 0.13, w - h * 0.26, h - h * 0.26);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = style === 'street' && title.length > 14 && title.includes(' ')
        ? [title.slice(0, title.lastIndexOf(' ', Math.ceil(title.length / 2) + 2)), title.slice(title.lastIndexOf(' ', Math.ceil(title.length / 2) + 2) + 1)]
        : [title];
      const room = h * (sub ? 0.46 : 0.62) / (lines.length > 1 ? 1.5 : 1);
      ctx.fillStyle = palette[2];
      lines.forEach((line, i) => {
        ctx.font = '700 ' + Math.round(room) + 'px "Trebuchet MS", Georgia, serif';
        const y = sub ? h * 0.40 : h * 0.5;
        ctx.fillText(line, w / 2, y + (i - (lines.length - 1) / 2) * room * 1.05, w - h * 0.5);
      });
      if (sub) {
        ctx.fillStyle = palette[1]; ctx.font = 'italic ' + Math.round(h * 0.2) + 'px Georgia, serif';
        ctx.fillText(sub, w / 2, h * 0.76, w - h * 0.5);
      }
    }, H);
    tex.anisotropy = 8; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
    const m = new T.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    signMats.set(key, m);
    return m;
  }
  // Both faces of a sign are real planes, so the text never reads back to front.
  function sign(title, sub, x, y, z, yaw, w = 3.2, h = 0.8, style = 'plaque') {
    const m = signMat(title, sub, style, w / h), nx = Math.sin(yaw) * 0.014, nz = Math.cos(yaw) * 0.014;
    bake(new T.PlaneGeometry(w, h), m, x + nx, y, z + nz, yaw, 0, 0, false);
    bake(new T.PlaneGeometry(w, h), m, x - nx, y, z - nz, yaw + Math.PI, 0, 0, false);
    box(x - nx * 0.6, y, z - nz * 0.6, w + 0.1, h + 0.1, 0.02, wood, yaw, 0, 0, false);
  }
  // Shell of an enterable building: hollow ground floor with a doorway, solid storeys above.
  const INSIDE = { bakery: [0xf1e3c4, 'tile', 0xbf8e6c], school: [0xe9e3c8, 'planks', 0xd6b88e], cafe: [0xebd2ac, 'tile', 0xa98466],
    pottery: [0xddc8a6, 'stone', 0xc9b79c], church: [0xebe4d4, 'stone', 0xcfc4b0] };
  const RUGS = { bakery: 0x8d4b3a, school: 0x4f6a58, cafe: 0x6a4a3a, pottery: 0x77614a, church: 0x8a2f38 };
  function shell(o) {
    const { x, z, w, d, h } = o, e = o.enter, T_ = e.T, f = e.front, ceil = e.ceil;
    const stucco = mat(plaster[o.hue], 'stucco'), [wallTone, floorMap, floorTone] = INSIDE[e.kind];
    const zB = z - f * (d / 2 - T_ / 2), zF = z + f * (d / 2 - T_ / 2), side = (w - e.doorW) / 2;
    box(x, ceil / 2, zB, w, ceil, T_, stucco);
    for (const s of [-1, 1]) {
      box(x + s * (w / 2 - T_ / 2), ceil / 2, z, T_, ceil, d, stucco);
      box(x + s * (e.doorW / 2 + side / 2), ceil / 2, zF, side, ceil, T_, stucco);
    }
    box(x, (e.doorH + ceil) / 2, zF, e.doorW, ceil - e.doorH, T_, stucco);
    box(x, (ceil + h) / 2, z, w, h - ceil, d, stucco);
    // Inside surfaces
    const iw = w - 2 * T_, id = d - 2 * T_, lining = mat(wallTone, 'stucco'), skirting = mat(0x6c4d3a);
    const inner = 0.012;
    for (const s of [-1, 1]) box(x + s * (iw / 2 - inner), ceil / 2, z, 0.024, ceil, id, lining);
    box(x, ceil / 2, z - f * (id / 2 - inner), iw, ceil, 0.024, lining);
    for (const s of [-1, 1]) box(x + s * (e.doorW / 2 + (iw / 2 - e.doorW / 2) / 2), ceil / 2, z + f * (id / 2 - inner), iw / 2 - e.doorW / 2, ceil, 0.024, lining);
    box(x, (e.doorH + ceil) / 2, z + f * (id / 2 - inner), e.doorW, ceil - e.doorH, 0.024, lining);
    for (const s of [-1, 1]) {
      box(x + s * (iw / 2 - 0.05), 0.11, z, 0.06, 0.22, id, skirting);
      box(x, 0.11, z - f * (id / 2 - 0.05), iw, 0.22, 0.06, skirting);
    }
    box(x, 0.026, z, iw, 0.052, id, mat(floorTone, floorMap), 0, 0, 0, false);
    box(x, ceil - 0.05, z, iw, 0.1, id, mat(0xe8dcc3, 'stucco'));
    const beams = Math.max(2, Math.round(id / 1.8));
    for (let i = 0; i < beams; i++) box(x, ceil - 0.17, z - id / 2 + (i + 0.5) * id / beams, iw, 0.14, 0.2, wood);
    // Lamps hang from the ceiling and glow
    const glow = mat(0xffd488, '', false, true), lampCount = e.kind === 'church' ? 3 : Math.ceil(id / 3.6);
    for (let i = 0; i < lampCount; i++) {
      const lz = z - id / 2 + (i + 0.5) * id / lampCount;
      cyl(x, ceil - 0.42, lz, 0.012, 0.012, 0.74, iron, 5);
      cyl(x, ceil - 0.86, lz, 0.11, 0.26, 0.26, glow, 10);
    }
    // Door: frame and worn stone threshold
    const jamb = (e.doorW + 0.3) / 2;
    for (const s of [-1, 1]) {
      box(x + s * jamb, e.doorH / 2, zF + f * (T_ / 2 + 0.02), 0.16, e.doorH + 0.1, 0.1, trim);
    }
    box(x, e.doorH + 0.06, zF + f * (T_ / 2 + 0.02), e.doorW + 0.46, 0.16, 0.12, trim);
    box(x, 0.03, zF + f * (T_ / 2 + 0.1), e.doorW + 0.2, 0.07, 0.9, sand, 0, 0, 0, false);
  }
  const i_book = s => (s > 0 ? 0x4d6a8a : 0x8a4d4d);
  function roof(o) {
    const { x, z, h } = o, w = o.w + 0.65, d = o.d + 0.65;
    const lift = o.tower ? 1.65 : Math.min(2.45, w * 0.22);
    const roofM = mat(tile[o.hue % 5]);
    if (o.tower || o.roof === 'hip') {
      const r = o.tower ? 0.04 : d * 0.27;
      const a = [-w / 2, 0, -d / 2], b = [w / 2, 0, -d / 2], c = [w / 2, 0, d / 2], e = [-w / 2, 0, d / 2];
      const f = [0, lift, -r], g = [0, lift, r];
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute([a, f, b, b, f, g, b, g, c, c, g, e, e, g, f, e, f, a].flat(), 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(36), 2)); geo.computeVertexNormals();
      bake(geo, roofM, x, h, z);
      for (const side of [-1, 1]) for (let i = 0; i <= 14; i++) {
        const shift = i / 14 - 0.5;
        beam([x + side * w / 2, h + 0.08, z + shift * d], [x, h + lift + 0.08, z + shift * r * 2], 0.068, 0.064, mat(tile[(i + o.hue) % 5]), 5);
      }
    } else {
      const shape = new T.Shape();
      shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, lift); shape.closePath();
      bake(new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }), mat(plaster[o.hue]), x, h, z - d / 2);
      for (const side of [-1, 1]) {
        box(x + side * w / 4, h + lift / 2, z, Math.hypot(w / 2, lift), 0.15, d, roofM, 0, 0, -side * Math.atan2(lift, w / 2));
        const ribs = Math.ceil(d / 0.54);
        for (let i = 0; i < ribs; i++) {
          const zz = z - d / 2 + (i + 0.5) * d / ribs;
          beam([x + side * w / 2, h + 0.09, zz], [x, h + lift + 0.09, zz], 0.079, 0.073, mat(tile[(i + o.hue) % 5]), 6);
        }
      }
    }
    if (!o.tower) for (const side of [-1, 1]) {
      box(x + side * w * 0.24, h + lift * 0.73, z + d * 0.24, 0.51, 1.42, 0.55, trim);
      box(x + side * w * 0.24, h + lift * 0.73 + 0.71, z + d * 0.24, 0.66, 0.16, 0.69, roofM);
    }
  }
  function building(o) {
    const { x, z, w, h, d } = o, glowM = mat(0xffe0a0, '', false, true);
    if (o.enter) shell(o); else box(x, h / 2, z, w, h, d, mat(plaster[o.hue], 'stucco'));
    box(x, h - 0.09, z, w + 0.36, 0.27, d + 0.36, trim);
    if (o.trim) box(x, 0.31, z, w + 0.07, 0.62, d + 0.07, sand);
    for (let side = 0; side < 4; side++) {
      const a = side * Y, front = Math.cos(a - o.face) > 0.9, size = side % 2 ? d : w, depth = (side % 2 ? w : d) / 2;
      const point = (i, j) => [x + i * Math.cos(a) + (j + depth) * Math.sin(a), z - i * Math.sin(a) + (j + depth) * Math.cos(a)];
      const B = (i, y, j, width, height, deep, m, roll = 0) => {
        const [xx, zz] = point(i, j);
        box(xx, y, zz, width, height, deep, m, a, 0, roll);
      };
      const A = (i, y, j, width, height, thick, m, fill) => {
        const [xx, zz] = point(i, j);
        arch(xx, y, zz, width, height, thick, 0.12, m, a, fill);
      };
      if (o.tower) {
        A(0, h - 4.5, 0.04, 1.37, 2, 0.04, pane, true);
        A(0, h - 4.5, 0.17, 1.3, 2, 0.18, trim, false);
        for (const level of [h - 4.65, h - 6.15, 5.8]) B(0, level, 0.056, size + 0.16, 0.17, 0.19, sand);
        if (front && o.name) {
          const [xx, zz] = point(0, 0.06);
          sign(o.name.toUpperCase(), o.sign, xx, 2.9, zz, a, 4.2, 1.05);
        }
        if (o.clock && front) {
          const [xx, zz] = point(0, 0.135);
          bake(new T.CircleGeometry(0.67, 24), mat(0xeed9ae), xx, h - 7.28, zz, a);
          B(0, h - 7.14, 0.195, 0.055, 0.33, 0.07, iron);
          B(0.14, h - 7.31, 0.195, 0.3, 0.055, 0.07, iron, -0.15);
        }
        continue;
      }
      if (o.chapel && front) {
        if (!o.enter) {
          A(0, 0.18, 0.022, 2.62, 2.7, 0.01, dark, true);
          A(0, 0.18, 0.14, 2.62, 2.7, 0.28, sand, false);
          B(0, 1.64, 0.19, 0.06, 2.7, 0.08, iron);
        } else {
          B(0, 3.62, 0.2, 3.5, 0.32, 0.34, sand);
        }
        { const [xx, zz] = point(0, 0.06); sign(o.name.toUpperCase(), o.sign, xx, o.enter ? 5.5 : 4.2, zz, a, 5.2, 1.3); }
        const [xx, zz] = point(0, 0.14);
        bake(new T.RingGeometry(0.73, 0.96, 28), trim, xx, h - 2.17, zz, a);
        bake(new T.CircleGeometry(0.72, 28), pane, xx, h - 2.17, zz - 0.026, a);
        B(0, 0.42, 0.07, w, 0.53, 0.25, sand);
        B(0, h - 0.87, 0.16, w - 1.4, 0.15, 0.28, trim);
        for (const s of [-1, 1]) {
          B(s * 4.05, 4.75, 0.09, 0.43, 8.7, 0.26, trim);
          B(s * 4.05, 0.56, 0.18, 0.68, 0.37, 0.51, sand);
          B(s * 4.05, 9.09, 0.18, 0.67, 0.19, 0.51, sand);
          for (let i = 0; i < 12; i++) B(s * (w / 2 - 0.28), 0.34 + i * 0.63, 0.074,
            i % 2 === 0 ? 0.72 : 0.51, 0.25, 0.2, sand);
        }
        continue;
      }
      const count = Math.max(1, Math.floor(size / 2.84)), level = h / o.floors;
      const shut = mat(shutter[o.shutter ?? (o.hue + side) % shutter.length]);
      for (let i = 0; i < count; i++) for (let n = 0; n < o.floors; n++) {
        if (!n && front && (Math.abs(i - (count - 1) / 2) < 0.6)) continue;
        const xx = (i - (count - 1) / 2) * size / (count + 0.18), yy = n * level + 1.72;
        B(xx, yy, 0.04, 1.09, 1.57, 0.1, trim);
        B(xx, yy, 0.105, 0.84, 1.34, 0.06, pane);
        B(xx, yy, 0.146, 0.045, 1.35, 0.04, wood);
        B(xx, yy, 0.15, 0.84, 0.045, 0.04, wood);
        B(xx, yy - 0.79, 0.14, 1.24, 0.16, 0.3, sand);
        if (o.enter && !n) {
          B(xx, yy, -(o.enter.T + 0.03), 1.0, 1.5, 0.02, trim); B(xx, yy, -(o.enter.T + 0.045), 0.8, 1.3, 0.02, glowM);
          B(xx, yy, -(o.enter.T + 0.06), 0.045, 1.3, 0.02, wood); B(xx, yy, -(o.enter.T + 0.06), 0.8, 0.045, 0.02, wood);
        }
        if (!o.chapel) for (const s of [-1, 1]) {
          B(xx + 0.64 * s, yy, 0.11, 0.36, 1.44, 0.12, shut);
          for (let j = 0; j < 5; j++) B(xx + 0.64 * s, yy - 0.48 + j * 0.23, 0.182, 0.29, 0.022, 0.027, dark);
        }
        if (o.trim && front && n > 0 && i % 2 === 0 && !o.chapel) {
          B(xx, yy - 0.8, 0.31, 1.04, 0.2, 0.36, clay);
          for (let j = 0; j < 5; j++) {
            const [fx, fz] = point(xx - 0.4 + j * 0.2, 0.33);
            ico(fx, yy - 0.64, fz, 0.16, 0.13, 0.15, mat(foliage[j]), 0);
            if (j % 2 === 0) ico(fx, yy - 0.54, fz, 0.07, 0.078, 0.07, mat(0xb55c73), 0);
          }
        }
      }
      if (front && o.enter) {
        B(0, 0.04, 0.12, o.enter.doorW + 0.5, 0.1, 0.6, sand);
      } else if (front) {
        A(0, 0.045, 0.018, 1.29, 1.65, 0.018, dark, true);
        A(0, 0.045, 0.15, 1.29, 1.65, 0.17, trim, false);
        B(0, 0.064, 0.12, 1.66, 0.13, 0.59, sand);
        B(0.34, 0.99, 0.153, 0.082, 0.08, 0.04, mat(0xae844f, '', true));
      }
      if (front) {
        if (o.awning) for (let i = 0; i < 10; i++) {
          const [xx, zz] = point(-1.44 + i * 0.32, 0.66);
          box(xx, 2.62, zz, 0.322, 0.05, 1.44, mat(i % 2 ? stripes[o.awning - 1] : 0xe8d1aa), a, 0.2);
        }
        if (o.name && !o.chapel) {
          const [xx, zz] = point(0, 0.13);
          sign(o.name.toUpperCase(), o.sign, xx, o.enter ? o.enter.doorH + 0.75 : 3.1, zz, a, o.enter ? 4.4 : 3.0, o.enter ? 1.1 : 0.78);
          const reach = (o.enter ? o.enter.doorW / 2 : 0.85) + 1.0;
          const [bx, bz] = point(reach, 0.95), [sx, sz] = point(reach, 0.12);
          beam([sx, 3.55, sz], [bx, 3.55, bz], 0.025, 0.025, iron, 5);
          sign(o.name, o.sign, bx, 3.0, bz, a + Y, 1.5, 0.95, 'blade');
          box(bx, 3.5, bz, 0.04, 0.12, 0.04, iron);
        }
      }
    }
    roof(o);
    if (o.chapel) {
      box(x, h + 1.49, z + d / 2 - 0.23, 0.17, 1.99, 0.16, trim);
      box(x, h + 1.86, z + d / 2 - 0.23, 0.97, 0.16, 0.16, trim);
    }
  }

  box(0, -0.23, 0, world.bound * 2 + 10, 0.42, world.bound * 2 + 10, paving, 0, 0, 0, false);
  for (const b of world.blocks) {
    const green = ['garden', 'rose', 'orchard', 'vineyard', 'terrace'].includes(b.type);
    if (b.type !== 'canal') box(b.x, -0.03, b.z, 30, 0.082, 30, green ? grass : flags, 0, 0, 0, false);
    if (green) {
      box(b.x, 0.01, b.z, 4, 0.031, 30, flags, 0, 0, 0, false);
      box(b.x, 0.01, b.z, 30, 0.028, 3.8, flags, 0, 0, 0, false);
    }
    for (const s of [-1, 1]) {
      box(b.x + s * 15.15, 0.015, b.z, 0.34, 0.081, 30.6, sand, 0, 0, 0, false);
      box(b.x, 0.015, b.z + s * 15.15, 30.6, 0.081, 0.34, sand, 0, 0, 0, false);
    }
    // District signposts: a tall post at two opposite corners, with plates facing along both streets
    for (const [sx, sz] of [[-17.4, 13.4], [17.4, -13.4]]) {
      const x = b.x + sx, z = b.z + sz;
      cyl(x, 1.55, z, 0.045, 0.075, 3.1, iron, 6);
      cyl(x, 3.14, z, 0.07, 0.07, 0.08, iron, 6);
      sign(b.name.toUpperCase(), '', x, 2.6, z, 0, 3.8, 0.9, 'street');
      sign(b.name.toUpperCase(), '', x, 2.6, z, Y, 3.8, 0.9, 'street');
    }
  }
  for (const o of world.objects) {
    const { x, z, w, d, h, clearance } = o;
    switch (o.kind) {
      case 'building': building(o); break;
      case 'tree': {
        const cypress = o.variety === 'cypress';
        beam([x, 0, z], [x + 0.21, h * 0.62, z - 0.11], w * 0.42, w * 0.12, dark);
        for (let i = 0; i < 9; i++) {
          const a = o.angle + i * 2.4, r = cypress ? 0.12 : h * (i > 4 ? 0.27 : 0.11);
          const xx = x + Math.sin(a) * r, zz = z + Math.cos(a) * r;
          const yy = h * (cypress ? 0.27 + i * 0.079 : 0.62 + rnd() * 0.2);
          if (!cypress && i > 3) beam([x, h * 0.33, z], [xx, yy, zz], w * 0.19, 0.043, dark);
          const width = h * (cypress ? 0.17 - i * 0.014 : 0.23);
          ico(xx, yy, zz, width, h * (cypress ? 0.25 - i * 0.016 : 0.205), width * 0.9, mat(foliage[(i + o.shade) % 5]));
          if (o.variety === 'citrus' && i > 2) ico(xx + 0.26, yy - 0.43, zz + 0.28, 0.094, 0.089, 0.094, mat(0xca843d), 0);
        }
        break;
      }
      case 'hedge':
        for (let i = 0; i < Math.ceil(w / 0.5); i++) {
          const xx = x - w / 2 + 0.29 + i * 0.5;
          ico(xx, h * 0.49, z + (rnd() - 0.5) * 0.22, 0.58, h * 0.53, d * 0.53, mat(foliage[(i + 1) % 5]));
          if (o.flower) for (let j = 0; j < 3; j++) ico(xx + (rnd() - 0.5) * 0.5, h * (0.81 + rnd() * 0.19), z + (rnd() - 0.5) * d, 0.105, 0.087, 0.11, mat(j % 2 ? 0xc98192 : 0xa6506a), 0);
        }
        break;
      case 'planter':
        box(x, 0.12, z, w + 0.14, 0.24, d + 0.16, sand);
        box(x, 0.29, z, w, 0.41, d, trim);
        box(x, 0.49, z, w + 0.1, 0.16, d + 0.13, sand);
        for (let i = 0; i < 16; i++) {
          const xx = x + (rnd() - 0.5) * w * 0.9, zz = z + (rnd() - 0.5) * d * 0.78, yy = 0.65 + rnd() * 0.19;
          ico(xx, yy, zz, 0.26, 0.22, 0.22, mat(foliage[i % 5]), 1);
          for (let j = 0; j < 3; j++) ico(xx + (rnd() - 0.5) * 0.32, yy + 0.16 + rnd() * 0.09,
            zz + (rnd() - 0.5) * 0.30, 0.073, 0.066, 0.075, mat(i % 3 ? o.flower : 0xdfb77d), 0);
        }
        break;
      case 'fountain':
        for (const [r, width, tone] of [[5.15, 0.19, 0x96815f], [5.44, 0.054, 0xb8a382], [6.95, 0.10, 0xa18b70]]) {
          bake(new T.RingGeometry(r - width, r, 64), mat(tone), x, 0.03, z, 0, -Y, 0, false);
        }
        cyl(x, 0.1, z, 3.52, 3.58, 0.2, sand, 16);
        cyl(x, 0.26, z, 3.3, 3.34, 0.19, trim, 16);
        cyl(x, 0.36, z, 3.03, 3.03, 0.06, water, 20);
        for (let i = 0; i < 16; i++) {
          const a = i * Math.PI / 8, xx = x + Math.sin(a) * 3.17, zz = z + Math.cos(a) * 3.17;
          box(xx, 0.49, zz, 1.28, 0.32, 0.3, sand, a);
          box(xx, 0.66, zz, 1.29, 0.13, 0.38, trim, a);
        }
        cyl(x, 0.87, z, 0.26, 0.58, 1.11, sand);
        cyl(x, 1.49, z, 1.13, 0.48, 0.3, trim, 24);
        cyl(x, 1.66, z, 1.05, 1.05, 0.027, water, 24);
        cyl(x, 1.94, z, 0.15, 0.32, 0.59, sand);
        ico(x, 2.39, z, 0.24, 0.27, 0.24, trim);
        break;
      case 'well':
        cyl(x, h * 0.46, z, w * 0.49, w * 0.49, h * 0.92, sand);
        cyl(x, h * 0.92, z, w * 0.54, w * 0.54, h * 0.16, trim);
        cyl(x, h * 1.006, z, w * 0.36, w * 0.36, 0.018, pane);
        break;
      case 'pot':
        cyl(x, h * 0.39, z, w * 0.49, w * 0.28, h * 0.77, clay);
        cyl(x, h * 0.76, z, w * 0.55, w * 0.54, h * 0.10, mat(0xbb805c));
        for (let i = 0; i < 6; i++) ico(x + 0.24 * Math.sin(i * 2), h + 0.1 * (i % 2), z + 0.23 * Math.cos(i * 2), 0.22, 0.20, 0.23, mat(foliage[i % 5]), 0);
        break;
      case 'stall':
      case 'platform':
      case 'pergola':
        for (const s of [-1, 1]) for (const t of [-1, 1]) box(x + s * (w / 2 - 0.16), h * 0.49, z + t * (d / 2 - 0.16), 0.17, h, 0.18, dark);
        if (o.kind === 'stall') for (let i = 0; i < 12; i++) for (const t of [-1, 1]) {
          const xx = x - w / 2 + (i + 0.5) * w / 12, m = mat(i % 2 ? stripes[o.stripe] : 0xe6d1ac);
          box(xx, h - 0.29, z + t * d / 4, w / 12 + 0.01, 0.066, d * 0.54, m, 0, t * 0.28);
          box(xx, 2.18, z + t * d * 0.505, w / 12 + 0.01, 0.23, 0.07, m);
        } else if (o.kind === 'platform') {
          box(x, (h + clearance) / 2, z, w, h - clearance, d, wood);
          for (let i = 0; i < 4; i++) box(x, h + 0.006, z + (i - 1.5) * d / 5, w, 0.02, 0.015, dark);
          if (o.decor) {
            const top = h + 0.012;
            box(x, top, z, w + 0.04, 0.02, d + 0.04, o.decor === 'desk' ? mat(0xb98f62) : mat(o.decor === 'wheel' ? 0x9d8468 : 0xe9dfc9));
            if (o.decor === 'table') for (let i = 0; i < 3; i++) {
              const tx = x + (i - 1) * w * 0.28, tz = z + (i % 2 ? 0.14 : -0.12);
              cyl(tx, top + 0.07, tz, 0.07, 0.05, 0.08, mat(0xf3eee2), 10);
              cyl(tx + 0.12, top + 0.05, tz + 0.2, 0.025, 0.025, 0.06, mat(0xd8d0c0), 8);
            }
            if (o.decor === 'desk') for (const s of [-1, 1]) {
              box(x + s * w * 0.24, top + 0.025, z, 0.4, 0.03, 0.3, mat(i_book(s)), 0, 0, 0.0);
              box(x + s * w * 0.24 + 0.06, top + 0.05, z + 0.06, 0.24, 0.02, 0.2, mat(0xf0e8d2));
            }
            if (o.decor === 'wheel') {
              cyl(x, top + 0.12, z, 0.38, 0.38, 0.05, iron, 14);
              cyl(x, top + 0.2, z, 0.09, 0.14, 0.13, clay, 10);
              ico(x + 0.78, top + 0.08, z + 0.05, 0.16, 0.12, 0.16, mat(0xb98763), 1);
            }
          } else if (w > 3.1) for (let i = 0; i < 12; i++) ico(x + (rnd() - 0.5) * w * 0.87, h + 0.10, z + (rnd() - 0.5) * d * 0.75, 0.11, 0.108, 0.11, mat(i % 2 ? 0xb76042 : 0xcc9f49), 0);
        } else {
          for (const t of [-1, 1]) box(x, clearance + 0.13, z + t * (d / 2 - 0.15), w + 0.26, 0.24, 0.19, dark);
          for (let i = 0; i < 10; i++) {
            const xx = x - w / 2 + w * i / 9;
            box(xx, clearance + 0.29, z, 0.14, 0.17, d + 0.29, wood);
            for (let j = 0; j < 3; j++) {
              const zz = z - d / 2 + (j + 0.5) * d / 3;
              ico(xx, clearance + 0.4 + rnd() * 0.12, zz, 0.61, 0.27, 0.65, mat(foliage[(i + j) % 5]));
              if (o.flower && i % 2 === 0) ico(xx, clearance + 0.41, zz + 0.44, 0.21, 0.18, 0.21, mat(0xba6481), 0);
            }
          }
        }
        break;
      case 'arcade':
        for (let i = 0; i < o.count; i++) {
          const xx = x + (i - 2) * 5;
          arch(xx, 0, z - 0.8, 4.12, 2.18, 0.44, 1.6, sand);
          arch(xx, 0, z + 0.81, 4.07, 2.17, 0.24, 0.13, trim);
          arch(xx, 0, z - 0.81, 4.07, 2.17, 0.24, 0.13, trim, Math.PI);
          box(xx, 4.56, z, 5.02, 0.53, 1.68, sand);
          box(xx, 4.91, z, 5.05, 0.26, 1.95, trim);
          if (h > 6) box(xx, 5.42, z, 2.2, 0.8, 1.65, sand);
        }
        break;
      case 'bench':
        for (const s of [-1, 1]) box(x + s * w * 0.39, 0.23, z, 0.12, 0.46, 0.48, iron);
        for (let i = 0; i < 3; i++) {
          box(x, 0.44, z - 0.19 + i * 0.17, w, 0.084, 0.14, wood);
          box(x, 0.62 + i * 0.10, z - 0.29, w, 0.077, 0.105, wood);
        }
        break;
      case 'steps':
        for (let i = 0; i < 4; i++) box(x, 0.031 + i * 0.058, z + (1.5 - i) * d / 4, w, 0.064 + i * 0.116, d / 4, sand);
        break;
      case 'statue':
        box(x, 0.14, z, w, 0.28, d, sand);
        box(x, 0.59, z, w * 0.72, 0.71, d * 0.72, trim);
        box(x, 0.98, z, w * 0.91, 0.17, d * 0.91, sand);
        ico(x, 1.79, z, 0.42, 0.72, 0.3, trim);
        ico(x + 0.073, 2.54, z, 0.25, 0.31, 0.25, trim, 2);
        beam([x - 0.3, 2.11, z], [x - 0.5, 1.66, z + 0.18], 0.14, 0.105, trim);
        beam([x + 0.31, 2.11, z], [x + 0.56, 2.36, z + 0.13], 0.14, 0.09, trim);
        break;
      case 'crate':
        box(x, h / 2, z, w, h, d, wood);
        for (let i = 0; i < 6; i++) box(x + (i - 2.5) * w / 6, h / 2, z + d / 2, w / 6 - 0.025, h * 0.94, 0.05, i % 2 ? wood : dark);
        for (const y of [0.14, h - 0.1]) box(x, y, z + d / 2 + 0.045, w, 0.14, 0.08, dark);
        break;
      case 'lowWall':
        box(x, h / 2, z, w, h, d, sand); box(x, h, z, w + 0.18, 0.15, d + 0.19, trim); break;
      case 'table':
        cyl(x, 0.43, z, 0.07, 0.1, 0.86, iron);
        cyl(x, 0.85, z, w * 0.53, w * 0.53, 0.095, wood);
        cyl(x, h / 2, z, 0.027, 0.035, h, dark);
        cyl(x, h - 0.17, z, 0.08, 1.03, 0.34, mat(0xb29873), 8);
        for (const s of [-1, 1]) {
          box(x + s * 0.84, 0.43, z, 0.38, 0.11, 0.42, wood);
          box(x + s, 0.63, z, 0.07, 0.47, 0.42, wood);
          cyl(x + s * 0.84, 0.21, z, 0.068, 0.073, 0.42, iron);
        }
        break;
      case 'laundry':
        for (const s of [-1, 1]) cyl(x + s * w / 2, h / 2, z, 0.06, 0.08, h, wood);
        beam([x - w / 2, h, z], [x + w / 2, h, z], 0.014, 0.014, dark);
        for (let i = 0; i < 7; i++) box(x + (i - 3) * w / 7, h - 0.33, z + i * 0.008, 0.34 + rnd() * 0.28, 0.66, 0.044, mat([0xe8dcc4, 0xd3a699, 0xa6b8ad][i % 3]), 0, 0, 0.036 * (i % 2 ? 1 : -1));
        break;
      case 'lamp':
        cyl(x, 0.12, z, 0.16, 0.23, 0.24, iron);
        cyl(x, 1.49, z, 0.045, 0.081, 2.91, iron);
        cyl(x, 3.12, z, 0.22, 0.14, 0.45, mat(0xffd488, '', false, true), 6);
        cyl(x, 3.43, z, 0.04, 0.26, 0.21, iron, 6);
        break;
      case 'water':
        box(x, 0.01, z, w, 0.03, d, water, 0, 0, 0, false);
        for (const s of [-1, 1]) {
          box(x + s * (w / 2 + 0.37), 0.062, z, 0.74, 0.19, d, sand);
          box(x + s * (w / 2 + 3.18), -0.025, z, 4.95, 0.087, d, flags, 0, 0, 0, false);
        }
        for (let j = 0; j < 38; j++) box(x + (rnd() - 0.5) * w * 0.9, 0.045, z + (rnd() - 0.5) * d * 0.96, 0.3 + rnd() * 0.84, 0.01, 0.03, mat(j % 2 ? 0x9ab9a6 : 0x80a898), 0, 0, 0, false);
        break;
      case 'rug': {
        const m = mat(RUGS[o.tint], 'stucco');
        box(x, 0.058, z, w, 0.012, d, m, 0, 0, 0, false);
        box(x, 0.066, z, w - 0.5, 0.006, d - 0.5, mat(0xe9d6a8), 0, 0, 0, false);
        box(x, 0.071, z, w - 0.8, 0.006, d - 0.8, m, 0, 0, 0, false);
        break;
      }
      case 'oven': {
        const f = o.face, brick = mat(0x9b5a43, 'stone'), soot = mat(0x2d2420);
        box(x, h * 0.35, z, w, h * 0.7, d, brick);
        box(x, h * 0.74, z, w * 0.82, h * 0.12, d * 0.82, mat(0x8c5039));
        cyl(x, h + 0.2, z - f * d * 0.12, 0.26, 0.4, 1.2, mat(0x8c5039), 10);
        box(x, h * 0.37, z + f * (d / 2 + 0.01), w * 0.42, h * 0.3, 0.05, soot);
        box(x, h * 0.3, z + f * (d / 2 + 0.03), w * 0.3, 0.09, 0.03, mat(0xff9a3d, '', false, true));
        box(x, h * 0.7 + 0.03, z + f * (d / 2 + 0.03), w + 0.1, 0.1, 0.1, sand);
        break;
      }
      case 'shelf': {
        const long = w > d, goods = o.goods;
        box(x, h / 2, z, w, h, d, mat(0x7b5740));
        const count = Math.floor(h / 0.5);
        for (let k = 0; k < count; k++) {
          const y = 0.35 + k * 0.5;
          box(x, y, z, long ? w + 0.04 : d * 0 + w + 0.04, 0.045, long ? d + 0.04 : d + 0.04, mat(0xa07a56));
          const n = Math.floor((long ? w : d) / 0.34);
          for (let i = 0; i < n; i++) {
            const off = -(long ? w : d) / 2 + 0.2 + i * ((long ? w : d) - 0.4) / Math.max(1, n - 1);
            for (const side of [-1, 1]) {
              const ix = long ? x + off : x + side * (w / 2 + 0.03), iz = long ? z + side * (d / 2 + 0.03) : z + off;
              const col = [0xb9532e, 0xe2c27b, 0x5d7a8c, 0xcf9a4f, 0x7c8f5e][(i + k) % 5];
              if (goods === 'bread') ico(ix, y + 0.1, iz, 0.13, 0.07, 0.09, mat(0xc88a46), 0);
              else if (goods === 'pots') cyl(ix, y + 0.11, iz, 0.07, 0.1, 0.2, i % 2 ? clay : mat(0xd6a876), 8);
              else if (goods === 'books') box(ix, y + 0.12, iz, long ? 0.07 : 0.2, 0.22, long ? 0.2 : 0.07, mat(col));
              else cyl(ix, y + 0.06, iz, 0.045, 0.04, 0.09, mat(i % 2 ? 0xf1ebdc : col), 8);
            }
          }
        }
        break;
      }
      case 'counter': {
        box(x, h / 2 - 0.04, z, w, h - 0.08, d, mat(o.bar ? 0x6c4a39 : 0x916548));
        box(x, h - 0.03, z, w + 0.12, 0.07, d + 0.12, o.bar || o.desk ? mat(0x4d3a2c) : mat(0xd9cdb6));
        for (let i = 0; i < Math.floor(w / 0.5); i++) box(x - w / 2 + 0.3 + i * 0.5, h * 0.45, z + o.face * (d / 2 + 0.01), 0.36, h * 0.6, 0.03, mat(0x7a5740));
        const top = h + 0.005;
        if (o.goods === 'bread') for (let i = 0; i < 3; i++) {
          cyl(x - w * 0.3 + i * w * 0.3, top + 0.04, z, 0.24, 0.2, 0.08, mat(0xa9805a), 10);
          for (let j = 0; j < 4; j++) ico(x - w * 0.3 + i * w * 0.3 + (j - 1.5) * 0.09, top + 0.12, z + (j % 2) * 0.06, 0.1, 0.06, 0.07, mat(0xc88a46), 0);
        }
        if (o.bar) {
          box(x - w * 0.3, top + 0.22, z, 0.5, 0.42, 0.34, iron);
          box(x - w * 0.3, top + 0.46, z, 0.34, 0.05, 0.3, mat(0xb8a37b, '', true));
          for (let i = 0; i < 4; i++) cyl(x + w * 0.1 + i * 0.2, top + 0.05, z + 0.05, 0.04, 0.035, 0.08, mat(0xf3eee2), 8);
        }
        if (o.desk) {
          box(x - 0.5, top + 0.03, z, 0.5, 0.05, 0.35, mat(0xf2ead4));
          cyl(x + 0.6, top + 0.12, z, 0.1, 0.1, 0.24, mat(0x5d7a8c), 8);
          ico(x + 0.6, top + 0.31, z, 0.09, 0.09, 0.09, mat(0x4b7c62), 1);
        }
        break;
      }
      case 'sack':
        for (let i = 0; i < 2; i++) {
          ico(x + (i - 0.5) * 0.14, i ? 0.62 : 0.32, z, w * 0.5, i ? 0.24 : 0.3, d * 0.5, mat(0xc7b183), 1);
        }
        cyl(x, 0.68, z, 0.06, 0.1, 0.1, mat(0x9d8660), 7);
        break;
      case 'barrel':
        cyl(x, h / 2, z, w * 0.45, w * 0.45, h, mat(0x835f43), 12);
        for (const y of [0.2, h - 0.2]) cyl(x, y, z, w * 0.47, w * 0.47, 0.05, iron, 12);
        break;
      case 'board': {
        box(x, 1.75, z, w + 0.16, h + 0.16, 0.05, wood);
        box(x, 1.75, z + o.face * 0.03, w, h, 0.03, mat(0x2d4a3d));
        box(x - w * 0.2, 1.8, z + o.face * 0.05, w * 0.35, 0.025, 0.01, mat(0xf3eee2));
        box(x + w * 0.15, 1.5, z + o.face * 0.05, w * 0.3, 0.025, 0.01, mat(0xf3eee2));
        box(x, 1.08, z + o.face * 0.09, w, 0.04, 0.16, wood);
        break;
      }
      case 'altar': {
        box(x, 0.45, z, w, 0.9, d, sand);
        box(x, 0.93, z, w + 0.2, 0.1, d + 0.2, trim);
        box(x, 0.99, z, w - 0.3, 0.03, d - 0.3, mat(0xf4efe4));
        for (const s of [-1, 1]) { cyl(x + s * 0.9, 1.16, z, 0.03, 0.04, 0.3, mat(0xc6a35a, '', true), 8); cyl(x + s * 0.9, 1.35, z, 0.02, 0.02, 0.1, mat(0xfff3d0, '', false, true), 6); }
        box(x, 2.1, z - o.face * (d / 2 - 0.02), 0.1, 1.2, 0.08, wood);
        box(x, 2.3, z - o.face * (d / 2 - 0.02), 0.6, 0.1, 0.08, wood);
        break;
      }
      case 'pew': {
        const f = o.face;
        box(x, 0.47, z, w, 0.07, d * 0.62, wood);
        box(x, 0.22, z, 0.1, 0.44, d * 0.5, dark);
        for (const s of [-1, 1]) box(x + s * (w / 2 - 0.05), 0.47, z, 0.1, 0.94, d * 0.8, wood);
        box(x, 0.72, z + f * d * 0.36, w - 0.1, 0.46, 0.07, wood, 0, -f * 0.1);
        box(x, 0.16, z - f * d * 0.32, w - 0.2, 0.2, 0.2, dark);
        break;
      }
      case 'booth': {
        box(x, h / 2, z, w, h, d, mat(0x5c3f2e));
        box(x, h + 0.08, z, w + 0.14, 0.16, d + 0.14, dark);
        for (const s of [-1, 1]) box(x + s * w * 0.25, h * 0.44, z + o.face * (d / 2 + 0.02), w * 0.4, h * 0.78, 0.05, mat(0x7a553d));
        box(x, h * 0.44, z + o.face * (d / 2 + 0.03), 0.04, h * 0.78, 0.04, iron);
        break;
      }
      case 'bridge':
        box(x, 0.033, z, w, 0.113, d, sand);
        for (const s of [-1, 1]) {
          box(x, 0.42, z + s * 2.12, w, 0.84, 0.37, sand);
          box(x, 0.88, z + s * 2.12, w + 0.16, 0.14, 0.54, trim);
        }
        break;
    }
  }
  for (const s of [-1, 1]) {
    box(s * world.bound, 0.53, 0, 0.94, 1.06, world.bound * 2, sand);
    box(0, 0.53, s * world.bound, world.bound * 2, 1.06, 0.94, sand);
    box(s * world.bound, 1.09, 0, 1.1, 0.17, world.bound * 2, trim);
    box(0, 1.09, s * world.bound, world.bound * 2, 0.17, 1.1, trim);
  }
  box(0, -2.6, 0, 820, 4.6, 820, grass, 0, 0, 0, false);
  for (let i = 0; i < 37; i++) {
    const a = i / 37 * 6.283, r = 156 + rnd() * 206;
    ico(Math.cos(a) * r, -11, Math.sin(a) * r, 33 + rnd() * 76, 18 + rnd() * 30, 40 + rnd() * 53, mat([0x95936a, 0x888b6c, 0xa0a17c, 0x8d9880][i % 4]), 2);
  }
  for (let i = 0; i < 82; i++) {
    const a = i / 82 * Math.PI * 2, r = world.bound * 1.57 + rnd() * 32, h = 3.2 + rnd() * 5.8;
    ico(Math.cos(a) * r, h * 0.44, Math.sin(a) * r, h * 0.16, h * 0.53, h * 0.17, mat(foliage[3 + i % 2]));
  }
  for (const { m, gs, shadow } of buckets.values()) {
    const mesh = new T.Mesh(mergeGeometries(gs), m);
    mesh.castShadow = shadow; mesh.receiveShadow = true; scene.add(mesh);
    gs.forEach(g => g.dispose());
  }
}

// ---- Characters -------------------------------------------------------------------------------------
// Each person is a small rig of merged, vertex-coloured parts: torso, head, two arms (shoulder + elbow) and two
// legs (hip + knee). Merging keeps draw calls low while still allowing a real walk cycle.
const UNIT = {
  sphere: new T.SphereGeometry(1, 14, 10), cyl: new T.CylinderGeometry(1, 1, 1, 12), box: new T.BoxGeometry(1, 1, 1),
  taper: new T.CylinderGeometry(1, 0.78, 1, 12), cone: new T.CylinderGeometry(1, 1.8, 1, 14), ring: new T.TorusGeometry(1, 0.13, 6, 14)
};
const skins = [0xf3d0a8, 0xe3b48a, 0xd39c72, 0xb37a54, 0x8c5e3f, 0xf0c5ac];
const hairs = [0x2a1f19, 0x3f2a1d, 0x6b4a2b, 0x8a5a2d, 0x8f8b86, 0xdcd8d0];
const tops = [0xf0e6d2, 0xb5634e, 0x5e7c8b, 0x728455, 0xd9b45f, 0x8d6a9a, 0xa9b8a0, 0x4f6f85, 0x2b2926, 0xf5f1e6];
const bottoms = [0x4a4f58, 0x5a4636, 0x3e4a3e, 0x6b5f50, 0x2f3743];
const shoeTones = [0x4a3427, 0x2a2623, 0x7a5638];
const aprons = [0, 0xf4efe3, 0x8a6446, 0x35312d];
const scarves = [0xb5434a, 0xd7a84b, 0x4c7a8a, 0x7a9a5e];
const hats = [0, 0xd2b878, 0x4a4036, 0x7b2d3a, 0xf6f2ea];
const tint = new T.Color();
function part(kind, color, [x, y, z], [sx, sy, sz], [rx, ry, rz] = [0, 0, 0]) {
  const g = UNIT[kind].clone();
  g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  tint.set(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
  g.setAttribute('color', new T.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}
const merged = list => mergeGeometries(list);
const actorMaterial = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
// Heat vision for the drone: a flat thermal glow that draws through roofs and walls, hot in the middle and red at the edges.
const thermalMaterial = new T.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false, uniforms: { beat: { value: 1 } },
  vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `varying vec3 n; uniform float beat;
    void main(){ float edge = pow(1. - abs(n.z), 1.3); vec3 hot = mix(vec3(1., .96, .6), vec3(.98, .22, .04), edge);
      gl_FragColor = vec4(hot * beat, .96); }`
});
function thermal(group, on, time) {
  if (on) thermalMaterial.uniforms.beat.value = 0.9 + Math.sin(time * 9) * 0.1;
  if (group.userData.hot === on) return;
  group.userData.hot = on;
  group.scale.setScalar(group.userData.scale * (on ? 2.2 : 1));
  group.traverse(o => {
    if (!o.isMesh) return;
    if (on) { o.userData.plain = o.material; o.material = thermalMaterial; o.renderOrder = 10; }
    else if (o.userData.plain) { o.material = o.userData.plain; o.renderOrder = 0; }
  });
}

// Build one person from a `look` (see makeLook in world.mjs). Returns a Group with the rig on userData.
function person(look, hexTop, hexBottom) {
  const skin = skins[look.skin], hair = hairs[look.hair];
  const top = hexTop ?? tops[look.top], bottom = hexBottom ?? bottoms[look.bottom], shoe = shoeTones[look.shoes];
  const slim = look.age === 2 ? 0.86 : 1, w = look.build * slim, female = look.sex === 1;
  const sleeveLong = look.top % 2 === 0 || look.garment === 3;
  const robe = look.garment === 3, dress = look.garment === 2, vest = look.garment === 1;
  const root = new T.Group(), hips = new T.Group(), torso = new T.Group(), neck = new T.Group(), head = new T.Group();
  const rig = { root, hips, torso, neck, head, arms: [], legs: [] };
  root.add(hips); hips.position.y = 0.93; hips.add(torso);
  const mesh = (group, list) => {
    const m = new T.Mesh(merged(list), actorMaterial);
    m.castShadow = true; group.add(m); return m;
  };

  // Torso: pelvis, ribcage, shoulders, collar and clothing layers
  const chestW = (female ? 0.165 : 0.19) * w, waistW = (female ? 0.135 : 0.16) * w;
  const body = [
    part('sphere', robe || dress ? top : bottom, [0, 0.0, 0], [chestW * 0.92, 0.13, 0.112]),
    part('taper', top, [0, 0.29, 0], [chestW, 0.3, 0.118 * (look.age === 1 ? 1.08 : 1)]),
    part('sphere', top, [0, 0.54, 0], [chestW * 1.03, 0.085, 0.112]),
    part('cyl', skin, [0, 0.62, 0], [0.045, 0.07, 0.045]),
    part('cyl', top, [0, 0.585, 0.004], [0.075, 0.028, 0.07])
  ];
  if (vest && !robe) {
    const vestTone = tops[(look.top + 4) % 10] === top ? 0x4a3d33 : 0x4a3d33;
    body.push(part('taper', vestTone, [0, 0.27, 0.006], [chestW * 1.05, 0.27, 0.126]));
    body.push(part('box', 0xd8c9a8, [0, 0.35, 0.128], [0.012, 0.3, 0.008]));
  }
  if (dress) body.push(part('cone', bottomTone(top), [0, -0.29, 0], [0.17 * w, 0.62, 0.17 * w * 0.92]));
  if (robe) {
    body.push(part('cone', top, [0, -0.38, 0], [0.19 * w, 0.82, 0.17 * w]));
    body.push(part('cyl', 0xf4efe3, [0, 0.585, 0.02], [0.065, 0.025, 0.062]));
    body.push(part('box', 0x6b4a2b, [0, 0.1, 0.17 * w], [0.03, 0.04, 0.012]));
  } else if (look.apron) {
    const ap = aprons[look.apron];
    body.push(part('box', ap, [0, 0.12, 0.126], [0.27 * w, 0.62, 0.012]));
    body.push(part('box', ap, [0, 0.44, 0.1], [0.05, 0.14, 0.012], [0.3, 0, 0]));
  } else if (!dress) {
    body.push(part('cyl', 0x3b2f27, [0, 0.06, 0], [waistW * 1.01, 0.025, 0.115]));
  }
  if (look.scarf >= 0) body.push(part('ring', scarves[look.scarf], [0, 0.585, 0.004], [0.088, 0.088, 0.07], [Math.PI / 2, 0, 0]));
  mesh(torso, body);

  // Head
  torso.add(neck); neck.position.y = 0.6; neck.add(head); head.position.y = 0.04;
  const old = look.age === 1, child = look.age === 2, face = child ? 1.12 : 1;
  const parts = [
    part('sphere', skin, [0, 0.12, 0], [0.092 * face, 0.112 * face, 0.1 * face]),
    part('sphere', skin, [0, 0.07, 0.03], [0.075, 0.08, 0.07]),
    part('sphere', shade(skin, 0.94), [0, 0.1, 0.107 * face], [0.017, 0.024, 0.024]),
    part('sphere', shade(skin, 0.97), [-0.093 * face, 0.115, 0], [0.014, 0.03, 0.02]),
    part('sphere', shade(skin, 0.97), [0.093 * face, 0.115, 0], [0.014, 0.03, 0.02]),
    part('box', 0x8c4a46, [0, 0.062, 0.095 * face], [0.034, 0.006, 0.01])
  ];
  for (const s of [-1, 1]) {
    parts.push(part('sphere', 0xf6f2ea, [s * 0.036, 0.13, 0.088 * face], [0.017, 0.012, 0.01]));
    parts.push(part('sphere', 0x2b211b, [s * 0.036, 0.13, 0.097 * face], [0.0095, 0.0095, 0.006]));
    parts.push(part('box', old ? 0xcfcac2 : hair, [s * 0.038, 0.157, 0.092 * face], [0.034, 0.0075, 0.01], [0, 0, s * -0.12]));
  }
  if (look.glasses) for (const s of [-1, 1]) parts.push(part('ring', 0x2b2622, [s * 0.038, 0.13, 0.1 * face], [0.03, 0.03, 0.03]));
  if (look.beard === 1) parts.push(part('sphere', hair, [0, 0.052, 0.052], [0.078, 0.06, 0.07]));
  if (look.beard === 2) parts.push(part('box', hair, [0, 0.083, 0.102 * face], [0.05, 0.012, 0.012]));
  // Hair styles
  const bald = look.hat === 4;
  if (!bald && look.hat !== 1 && look.hat !== 2) {
    const cover = [0.1 * face, 0.112 * face, 0.108 * face];
    switch (look.style) {
      case 0: parts.push(part('sphere', hair, [0, 0.135, -0.018], cover)); break;
      case 1: parts.push(part('sphere', hair, [0, 0.135, -0.018], cover), part('sphere', hair, [0, 0.2, -0.085], [0.05, 0.05, 0.05])); break;
      case 2: parts.push(part('sphere', hair, [0, 0.135, -0.018], cover), part('taper', hair, [0, 0.0, -0.088], [0.09, 0.17, 0.045])); break;
      case 3: parts.push(part('sphere', hair, [0, 0.085, -0.03], [0.099 * face, 0.075, 0.104 * face])); break;
      default: parts.push(part('sphere', hair, [0, 0.135, -0.018], cover), part('taper', hair, [0, 0.07, -0.13], [0.03, 0.12, 0.03], [0.35, 0, 0]));
    }
  } else if (!bald) {
    parts.push(part('sphere', hair, [0, 0.1, -0.03], [0.098, 0.09, 0.104]));
  }
  if (look.hat === 1) {
    parts.push(part('cyl', hats[1], [0, 0.218, 0], [0.2, 0.014, 0.2]), part('cyl', hats[1], [0, 0.255, 0], [0.105, 0.07, 0.105]), part('cyl', 0x8a5e3a, [0, 0.235, 0], [0.108, 0.018, 0.108]));
  } else if (look.hat === 2) {
    parts.push(part('sphere', hats[2], [0, 0.185, -0.005], [0.105, 0.065, 0.112]), part('box', hats[2], [0, 0.17, 0.1], [0.1, 0.012, 0.07]));
  } else if (look.hat === 3) {
    parts.push(part('cyl', hats[3], [0.015, 0.215, 0], [0.125, 0.022, 0.125], [0, 0, 0.12]));
  } else if (look.hat === 4) {
    parts.push(part('cyl', hats[4], [0, 0.285, 0], [0.098, 0.12, 0.098]), part('sphere', hats[4], [0, 0.36, 0], [0.105, 0.05, 0.105]), part('cyl', 0xd6cfbf, [0, 0.19, 0], [0.101, 0.02, 0.101]));
    parts.push(part('sphere', hair, [0, 0.095, -0.04], [0.098, 0.07, 0.1]));
  }
  mesh(head, parts);

  // Arms (shoulder and elbow)
  const sleeve = top;
  for (const s of [-1, 1]) {
    const arm = new T.Group(), elbow = new T.Group();
    arm.position.set(s * (chestW + 0.045), 0.52, 0);
    elbow.position.y = -0.285; arm.add(elbow);
    mesh(arm, [part('sphere', sleeve, [0, 0, 0], [0.056, 0.056, 0.054]), part('taper', sleeve, [0, -0.145, 0], [0.052, 0.29, 0.052])]);
    mesh(elbow, [
      part('sphere', sleeveLong ? sleeve : skin, [0, 0, 0], [0.046, 0.046, 0.046]),
      part('taper', sleeveLong ? sleeve : skin, [0, -0.125, 0], [0.043, 0.25, 0.043]),
      part('sphere', skin, [0, -0.27, 0.004], [0.046, 0.055, 0.04])
    ]);
    torso.add(arm);
    rig.arms.push({ s, arm, elbow });
  }
  // Legs (hip and knee)
  for (const s of [-1, 1]) {
    const leg = new T.Group(), knee = new T.Group();
    leg.position.set(s * 0.095 * w, -0.02, 0);
    knee.position.y = -0.43; leg.add(knee);
    const trouser = robe || dress ? skin : bottom;
    mesh(leg, [part('taper', trouser, [0, -0.215, 0], [0.083 * w, 0.43, 0.08 * w])]);
    mesh(knee, [
      part('sphere', trouser, [0, 0, 0], [0.06, 0.06, 0.06]),
      part('taper', trouser, [0, -0.2, 0], [0.058, 0.4, 0.056]),
      part('box', shoe, [0, -0.4, 0.035], [0.1, 0.07, 0.22]),
      part('sphere', shoe, [0, -0.395, 0.145], [0.052, 0.04, 0.05]),
      part('box', 0x1d1a18, [0, -0.437, 0.03], [0.103, 0.014, 0.225])
    ]);
    torso.parent.add(leg);
    rig.legs.push({ s, leg, knee });
  }
  const scale = look.height * (child ? 1 : 1);
  root.scale.setScalar(scale);
  root.userData = { rig, phase: Math.random() * 6.28, speed: 0, look: 0, scale };
  return root;
}
function shade(hex, k) { tint.set(hex); return tint.clone().multiplyScalar(k).getHex(); }
function bottomTone(hex) { return shade(hex, 0.82); }

// Pose the rig. `a`: { phase, speed (m/s), stance (0 stand, 1 crouch, 2 prone), time, look (head yaw), gesture (0..1), seed }
function pose(root, a) {
  const { rig, scale } = root.userData;
  const walking = a.speed > 0.15, swing = Math.sin(a.phase);
  const amp = Math.min(0.72, 0.16 + a.speed * 0.11) * (a.stance === 2 ? 0.45 : 1);
  const breath = Math.sin(a.time * 1.9 + a.seed) * 0.5 + 0.5;
  const sway = walking ? 0 : Math.sin(a.time * 0.5 + a.seed) * 0.02;
  rig.torso.scale.set(1 + breath * 0.006, 1 + breath * 0.012, 1 + breath * 0.01);
  let hipsY = 0.93 - 0.02;
  let lean = walking ? Math.min(0.1, a.speed * 0.018) : 0;
  let thigh = 0, kneeBase = 0;
  rig.hips.rotation.set(0, 0, 0);
  rig.hips.position.z = 0;
  if (a.stance === 1) {
    thigh = -1.12; kneeBase = 1.95; hipsY = 0.93 - 0.37; lean = 0.32;
  }
  if (a.stance === 2) {
    rig.hips.rotation.x = Math.PI / 2 - 0.08;
    hipsY = 0.17; rig.hips.position.z = -0.05; lean = 0;
  }
  const bob = walking && a.stance === 0 ? Math.abs(Math.cos(a.phase)) * 0.028 * Math.min(1.4, a.speed / 1.5 + 0.4) : 0;
  rig.hips.position.y = hipsY + bob;
  rig.torso.rotation.set(lean + (a.stance === 2 ? -0.5 + Math.sin(a.phase * 0.5) * 0.04 * (walking ? 1 : 0) : 0), walking ? swing * 0.07 : sway, walking ? Math.cos(a.phase) * 0.025 : sway * 0.4);
  for (const { s, leg, knee } of rig.legs) {
    const k = Math.sin(a.phase + (s > 0 ? 0 : Math.PI));
    const lift = Math.max(0, Math.cos(a.phase + (s > 0 ? 0 : Math.PI)));
    if (a.stance === 0) {
      leg.rotation.x = walking ? -k * amp : sway * -0.5 * s;
      knee.rotation.x = walking ? lift * amp * 1.35 + 0.04 : 0.03;
      leg.rotation.z = s * -0.025;
    } else if (a.stance === 1) {
      leg.rotation.x = thigh + (walking ? -k * 0.28 : 0);
      knee.rotation.x = kneeBase + (walking ? lift * 0.35 : 0);
      leg.rotation.z = s * -0.07;
    } else {
      leg.rotation.x = walking ? -k * 0.3 : 0;
      knee.rotation.x = walking ? lift * 0.35 : 0.04;
      leg.rotation.z = s * -0.03;
    }
  }
  for (const { s, arm, elbow } of rig.arms) {
    const k = Math.sin(a.phase + (s > 0 ? Math.PI : 0));
    if (a.stance === 0) {
      arm.rotation.x = walking ? -k * amp * 0.85 : Math.sin(a.time * 0.7 + a.seed + s) * 0.03;
      arm.rotation.z = s * (0.07 + (walking ? 0 : breath * 0.01));
      elbow.rotation.x = -(0.16 + (walking ? amp * 0.5 * Math.max(0, -k) + 0.12 : 0.04));
    } else if (a.stance === 1) {
      arm.rotation.x = -0.55 + (walking ? -k * 0.25 : 0);
      arm.rotation.z = s * 0.12; elbow.rotation.x = -0.7;
    } else {
      arm.rotation.x = -2.55 + (walking ? -k * 0.35 : 0);
      arm.rotation.z = s * 0.22; elbow.rotation.x = -0.35 + (walking ? Math.max(0, k) * -0.3 : 0);
    }
    // Talking gesture: the right hand lifts and the forearm waves a little
    if (s > 0 && a.gesture > 0 && a.stance === 0 && !walking) {
      arm.rotation.x = -0.55 * a.gesture; elbow.rotation.x = -(0.16 + 1.0 * a.gesture) + Math.sin(a.time * 6) * 0.12 * a.gesture;
    }
  }
  rig.neck.rotation.x = a.stance === 2 ? -1.0 : a.stance === 1 ? -0.2 : 0.02;
  rig.neck.rotation.y = clampLook(a.look);
  rig.head.rotation.x = a.stance === 2 ? -0.5 : 0;
  root.position.y = 0;
}
const clampLook = v => Math.max(-1.15, Math.min(1.15, v));

function label(name) {
  const tex = texture(256, (ctx, size) => {
    ctx.fillStyle = '#252e24ee'; ctx.beginPath(); ctx.roundRect(12, 61, size - 24, 134, 40); ctx.fill();
    ctx.strokeStyle = '#d4b780'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#faeac9'; ctx.font = '600 33px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; ctx.fillText(name, 128, 129, 200);
  });
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.15, 0.35, 1);
  return sprite;
}
function alertMaterial() {
  const tex = texture(128, (ctx, size) => {
    ctx.fillStyle = '#e8a33acc'; ctx.beginPath(); ctx.arc(64, 64, 52, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#2d2418'; ctx.font = '900 80px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 64, 70);
  });
  return new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
}

export class View {
  constructor(canvas, quality) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.camera = new T.PerspectiveCamera(66, 1, 0.09, 520);
    this.camera.rotation.order = 'YXZ';
    this.actors = new Map();
    this.quality(quality);
  }
  quality(name) {
    const [pixel, shadow] = ({ low: [0.85, 0], medium: [1.2, 1024], high: [1.65, 2048] })[name] || [1.2, 1024];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pixel));
    this.renderer.shadowMap.enabled = !!shadow;
    this.shadowPixels = shadow;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.sun) {
      this.sun.castShadow = !!shadow;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(shadow || 512, shadow || 512);
    }
    this.resize();
  }
  resize() {
    const c = this.renderer.domElement, w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    const pixel = this.renderer.getPixelRatio();
    if (c.width === Math.floor(w * pixel) && c.height === Math.floor(h * pixel)) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  prepare(world, npcEnabled) {
    if (this.scene) {
      const materials = new Set(), textures = new Set();
      this.scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== actorMaterial && o.material !== thermalMaterial) materials.add(o.material);
      });
      for (const m of materials) { if (m.map) textures.add(m.map); m.dispose(); }
      for (const t of textures) t.dispose();
      this.sun.shadow.map?.dispose();
    }
    this.actors.clear();
    this.scene = new T.Scene(); this.scene.fog = new T.FogExp2(0xdbbb9b, 0.006);
    const sun = v(0.43, 0.34, -0.84).normalize(); this.sunDirection = sun;
    this.sky = new T.Mesh(new T.SphereGeometry(448, 24, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false,
      uniforms: { sunPoint: { value: sun } },
      vertexShader: 'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        varying vec3 p;
        uniform vec3 sunPoint;
        float hash(vec2 a) { return fract(sin(dot(a,vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 a) {
          vec2 g=floor(a), f=fract(a); f=f*f*(3.-2.*f);
          return mix(mix(hash(g),hash(g+vec2(1,0)),f.x),mix(hash(g+vec2(0,1)),hash(g+1.),f.x),f.y);
        }
        void main() {
          vec3 q=normalize(p);
          float h=pow(smoothstep(0.,.77,max(0.,q.y)),.55);
          float d=max(dot(q,sunPoint),0.);
          vec3 s=mix(vec3(.95,.66,.43),vec3(.245,.45,.64),h);
          s+=vec3(.39,.22,.1)*pow(d,14.)+vec3(.93,.48,.21)*pow(d,115.);
          vec2 k=q.xz*(6.1/(.34+max(0.,q.y)));
          float veil=n(k)*.57+n(k*2.09)*.27+n(k*4.21)*.10+n(k*8.3)*.06;
          float cloud=smoothstep(.57,.81,veil)*smoothstep(.014,.12,q.y);
          s=mix(s,vec3(.91,.74,.59)+vec3(.29,.16,.05)*pow(d,11.),cloud*.66);
          s+=vec3(2.6,1.85,1.13)*smoothstep(.9992,.9998,d);
          gl_FragColor=vec4(s,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));
    this.sky.renderOrder = -2;
    this.sun = new T.DirectionalLight(0xffd4a1, 3.12); this.sun.castShadow = !!this.shadowPixels;
    const s = this.sun.shadow;
    s.mapSize.set(this.shadowPixels || 512, this.shadowPixels || 512);
    s.camera.left = s.camera.bottom = -33; s.camera.right = s.camera.top = 33;
    s.camera.near = 2; s.camera.far = 180; s.normalBias = 0.036; s.bias = -0.00019;
    this.scene.add(this.sky, this.sun, this.sun.target, new T.HemisphereLight(0xe8e8e3, 0x98795b, 1.65));
    build(this.scene, world);
    this.npcs = [];
    this.walkers = world.walkers;
    this.alertMaterial?.map?.dispose(); this.alertMaterial?.dispose();
    this.alertMaterial = alertMaterial();
    if (npcEnabled) for (const npc of world.npcs) {
      const body = person(npc.look);
      const mark = label(npc.role ? npc.name + ' · ' + npc.role : npc.name);
      const flag = new T.Sprite(this.alertMaterial); flag.scale.set(0.34, 0.34, 1); flag.renderOrder = 5; flag.visible = false;
      mark.position.y = 2.14; flag.position.y = 2.58;
      body.add(mark, flag);
      const seed = npc.id * 1.37;
      body.userData.seed = seed; body.userData.nextGesture = 3 + (npc.id * 7) % 13;
      body.position.set(npc.x, 0, npc.z); body.rotation.y = npc.yaw;
      this.scene.add(body); this.npcs.push({ npc, body, mark, flag, seed, look: 0, gesture: 0, gestureAt: -99, talker: npc.id % 3 !== 0 });
    }
    this.rings = [0, 1].map(() => {
      const ring = new T.Mesh(new T.RingGeometry(0.85, 1.0, 48).rotateX(-Math.PI / 2),
        new T.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide }));
      ring.renderOrder = 9; ring.visible = false; this.scene.add(ring);
      return ring;
    });
    const glowTexture = texture(128, (ctx, size) => {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, '#fff2a8ff'); g.addColorStop(0.35, '#ff9a3acc'); g.addColorStop(1, '#ff4a1000');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    });
    this.heatGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, transparent: true, depthTest: false, depthWrite: false, blending: T.AdditiveBlending }));
    this.heatGlow.scale.set(9, 9, 1); this.heatGlow.renderOrder = 8; this.heatGlow.visible = false; this.scene.add(this.heatGlow);
    this.drops = [];
    const g = new T.SphereGeometry(0.024, 5, 4), m = new T.MeshStandardMaterial({ color: 0xcfdfce, roughness: 0.2, metalness: 0.2 });
    for (let i = 0; i < 42; i++) { const drop = new T.Mesh(g, m); this.scene.add(drop); this.drops.push(drop); }
    this.eye = null;
    this.lastShadow = null;
    this.renderer.shadowMap.needsUpdate = true;
  }
  draw(p, look, state, time, dt, names, npcTime = 0) {
    if (!this.scene) return;
    this.resize();
    const drone = state.drone, focus = drone || p;
    if (drone) {
      const point = v(focus.x, 34, focus.z + 0.001);
      if (!this.wasDrone) this.camera.position.copy(point);
      else this.camera.position.lerp(point, Math.min(1, dt * 15));
      this.camera.rotation.set(-Y + 0.0001, 0, 0, 'YXZ');
    } else {
      const height = EYES[p.stance] + (look.walking ? Math.sin(time * (p.stance ? 10 : 14)) * (p.stance ? 0.023 : 0.042) : 0);
      this.eye = this.eye == null || this.wasDrone ? height : T.MathUtils.lerp(this.eye, height, Math.min(1, dt * 15));
      this.camera.position.set(p.x, this.eye, p.z); this.camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    }
    this.wasDrone = !!drone;
    const fov = drone ? 58 : state.scope ? 31 : 66;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.sky.position.copy(this.camera.position);
    this.sun.target.position.set(Math.round(focus.x / 4) * 4, 0, Math.round(focus.z / 4) * 4);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection, 92);
    const shadow = this.sun.target.position;
    if (!this.lastShadow || time - this.lastShadow.time > (this.motion ? 0.09 : 0.4) ||
        this.lastShadow.x !== shadow.x || this.lastShadow.z !== shadow.z) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastShadow = { time, x: shadow.x, z: shadow.z };
    }
    const watchers = new Set(state.alerts || []);
    let motion = false;
    for (const ent of this.npcs) {
      const { npc, body, mark, flag } = ent, ud = body.userData;
      const where = npcPose(npc, npcTime, this.walkers), d = distance(where, focus);
      body.visible = d < 57;
      if (!body.visible) continue;
      body.position.set(where.x, 0, where.z);
      body.rotation.y = where.yaw;
      // Villagers glance at someone who comes close
      let target = 0;
      if (!drone && d < 6.5) {
        const bearing = Math.atan2(focus.x - where.x, focus.z - where.z);
        const diff = Math.atan2(Math.sin(bearing - where.yaw), Math.cos(bearing - where.yaw));
        if (Math.abs(diff) < 2.0) target = Math.max(-1.1, Math.min(1.1, diff));
      } else if (!where.moving) {
        target = Math.sin(time * 0.37 + ent.seed * 2.3) * 0.45 * (Math.sin(time * 0.11 + ent.seed) > 0.2 ? 1 : 0.25);
      }
      ent.look += (target - ent.look) * Math.min(1, dt * 4);
      if (where.moving) ud.phase += dt * where.speed * (where.speed > 2 ? 3.2 : 4.1);
      let gesture = 0;
      if (ent.talker && !where.moving) {
        const cycle = 9 + (npc.id % 7) * 1.6, t = (time + ent.seed * 3) % cycle;
        if (t < 2.4) gesture = Math.sin(Math.PI * t / 2.4);
      }
      pose(body, { phase: ud.phase, speed: where.moving ? where.speed : 0, stance: 0, time, look: ent.look, gesture, seed: ent.seed });
      mark.visible = !drone && p.role === 'seeker' && state.phase === 'seek' && d < 10;
      flag.visible = !drone && watchers.has(npc.id) && d < 40;
      if (flag.visible) flag.position.y = 2.58 + Math.sin(time * 5 + ent.seed) * 0.04;
      if (where.moving && d < 30) motion = true;
    }
    const visible = new Map(state.others.map(a => [a.id, a]));
    const heat = drone && state.contact?.live ? state.contact : null;
    if (heat) visible.set(heat.id, heat);
    this.heatGlow.visible = !!heat;
    if (heat) { this.heatGlow.position.set(heat.x, 1.0, heat.z); this.heatGlow.material.opacity = 0.5 + Math.sin(time * 7) * 0.15; }
    this.rings.forEach((ring, i) => {
      ring.visible = !!heat;
      if (!heat) return;
      const phase = (time * 0.9 + i * 0.5) % 1;
      ring.position.set(heat.x, 0.3, heat.z); ring.scale.setScalar(0.8 + phase * 3.6); ring.material.opacity = 1 - phase;
    });
    for (const [id, m] of this.actors) if (!visible.has(id)) m.visible = false;
    for (const [id, a] of visible) {
      if (!this.actors.has(id)) {
        const rnd = randomSource(parseInt(id.slice(0, 6), 16) || 7), look = makeLook(rnd, null);
        Object.assign(look, { age: 0, height: 1, apron: 0, garment: 0, scarf: -1, glasses: false, beard: look.sex ? 0 : look.beard, hat: a.role === 'hider' ? 0 : 2, build: 1, sex: look.sex });
        const m = person(look, a.role === 'hider' ? 0xd0702f : 0x2f7f90, a.role === 'hider' ? 0x4a4036 : 0x3a4658);
        const tag = label(names.get(id) || 'Seeker'); tag.name = 'tag'; m.add(tag);
        m.userData.seed = rnd() * 9; m.position.set(a.x, 0, a.z); this.scene.add(m); this.actors.set(id, m);
      }
      const m = this.actors.get(id), ud = m.userData;
      if (!m.visible) m.position.set(a.x, 0, a.z);
      m.visible = true; m.rotation.y = a.yaw + Math.PI;
      const before = { x: m.position.x, z: m.position.z };
      m.position.lerp(v(a.x, 0, a.z), Math.min(1, dt * 15));
      const instant = dt > 0 ? Math.hypot(m.position.x - before.x, m.position.z - before.z) / dt : 0;
      ud.speed += (Math.min(instant, 18) - ud.speed) * Math.min(1, dt * 8);
      const speed = a.moving ? Math.max(ud.speed, 1) : 0;
      if (speed) ud.phase += dt * Math.min(speed, 10) * (speed > 2 ? 3.2 : 4.1);
      pose(m, { phase: ud.phase, speed, stance: a.stance, time, look: 0, gesture: 0, seed: ud.seed });
      if (a.moving) motion = true;
      thermal(m, !!heat && heat.id === id, time);
      const tag = m.getObjectByName('tag');
      tag.visible = a.role === 'seeker'; tag.position.y = a.stance === 2 ? 0.8 : a.stance === 1 ? 1.4 : 2.1;
    }
    this.motion = motion;
    this.drops.forEach((drop, i) => {
      const a = (i % 7) * Math.PI * 2 / 7, t = (time * 0.85 + Math.floor(i / 7) / 6) % 1;
      const r = 0.10 + t * 1.08;
      drop.position.set(Math.cos(a) * r, 2.45 + 0.58 * t - 1.48 * t * t, Math.sin(a) * r);
      drop.scale.y = 1 + t * 1.5;
      drop.visible = Math.hypot(focus.x, focus.z) < 42;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
