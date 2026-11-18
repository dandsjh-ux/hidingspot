import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSource, distance, EYES } from './world.mjs';

const v = (x, y, z) => new T.Vector3(x, y, z);
const up = v(0, 1, 0), Y = Math.PI / 2;
const plaster = [0xe4cba6, 0xdea982, 0xe8c98e, 0xd09983, 0xe5d5ae, 0xc2c4a5, 0xcfc5ac, 0xd7b27e];
const shutter = [0x455843, 0x3c586e, 0x696546, 0x754b3e, 0x566760];
const tile = [0x995d43, 0xa96c4e, 0xb07856, 0x8b523c, 0xb37555];
const foliage = [0x56674b, 0x67774e, 0x7b845d, 0x3f573d, 0x4b5d42];
const stripes = [0xb5634e, 0x728455, 0x5e7c8b];
const clothes = [0x887a48, 0xc6a574, 0xa25a46, 0x4d6573, 0x7a6b82, 0x668059, 0x745044, 0x2d7178, 0xb78651];

function texture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function surface(kind) {
  return texture(256, (ctx, size) => {
    const rng = randomSource(982);
    ctx.fillStyle = kind === 'grass' ? '#8a8d66' : kind === 'stucco' ? '#ebe3d8' : '#93867a';
    ctx.fillRect(0, 0, size, size);
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
  const maps = Object.fromEntries(['street', 'stone', 'stucco', 'grass'].map(name => [name, surface(name)]));
  const mat = (hex, map = '', metallic = false, glow = false) => {
    const key = [hex, map, metallic, glow].join('/');
    if (!mats.has(key)) mats.set(key, new T.MeshStandardMaterial({
      color: hex, map: maps[map] || null, roughness: metallic ? 0.43 : 0.87, metalness: metallic ? 0.29 : 0,
      bumpMap: map === 'stone' || map === 'street' ? maps[map] : null, bumpScale: 0.021,
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
      const n = g.attributes.normal, uv = g.attributes.uv, unit = m.map === maps.street ? 2.5 : 3.8;
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
  function sign(text, x, y, z, yaw, w = 2.05, h = 0.4) {
    const tex = texture(256, (ctx, size) => {
      ctx.fillStyle = '#524337'; ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#dec28e'; ctx.lineWidth = 2.8; ctx.strokeRect(5, 28, size - 10, size - 56);
      ctx.font = 'bold 27px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f4dfb7'; ctx.fillText(text, size / 2, size / 2, size - 24);
    });
    const mesh = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: tex }));
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; scene.add(mesh);
  }
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
    const { x, z, w, h, d } = o;
    box(x, h / 2, z, w, h, d, mat(plaster[o.hue], 'stucco'));
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
        if (o.clock && front) {
          const [xx, zz] = point(0, 0.135);
          bake(new T.CircleGeometry(0.67, 24), mat(0xeed9ae), xx, h - 7.28, zz, a);
          B(0, h - 7.14, 0.195, 0.055, 0.33, 0.07, iron);
          B(0.14, h - 7.31, 0.195, 0.3, 0.055, 0.07, iron, -0.15);
        }
        continue;
      }
      if (o.chapel && front) {
        A(0, 0.18, 0.022, 2.62, 2.7, 0.01, dark, true);
        A(0, 0.18, 0.14, 2.62, 2.7, 0.28, sand, false);
        B(0, 1.64, 0.19, 0.06, 2.7, 0.08, iron);
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
      if (front) {
        A(0, 0.045, 0.018, 1.29, 1.65, 0.018, dark, true);
        A(0, 0.045, 0.15, 1.29, 1.65, 0.17, trim, false);
        B(0, 0.064, 0.12, 1.66, 0.13, 0.59, sand);
        B(0.34, 0.99, 0.153, 0.082, 0.08, 0.04, mat(0xae844f, '', true));
        if (o.awning) for (let i = 0; i < 10; i++) {
          const [xx, zz] = point(-1.44 + i * 0.32, 0.66);
          box(xx, 2.62, zz, 0.322, 0.05, 1.44, mat(i % 2 ? stripes[o.awning - 1] : 0xe8d1aa), a, 0.2);
        }
        if (o.sign) { const [xx, zz] = point(0, 0.13); sign(o.sign, xx, 3.04, zz, a); }
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
    const x = b.x - 15.62, z = b.z + 13.1;
    cyl(x, 0.9, z, 0.035, 0.07, 1.8, iron, 6);
    sign(b.name.toUpperCase(), x, 1.73, z + 0.055, 0);
    sign(b.name.toUpperCase(), x, 1.73, z - 0.055, Math.PI);
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
          bake(new T.RingGeometry(r - width, r, 64), mat(tone), x, 0.014, z, 0, -Y, 0, false);
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
          if (w > 3.1) for (let i = 0; i < 12; i++) ico(x + (rnd() - 0.5) * w * 0.87, h + 0.10, z + (rnd() - 0.5) * d * 0.75, 0.11, 0.108, 0.11, mat(i % 2 ? 0xb76042 : 0xcc9f49), 0);
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
        for (let j = 0; j < 38; j++) box(x + (rnd() - 0.5) * w * 0.9, 0.03, z + (rnd() - 0.5) * d * 0.96, 0.3 + rnd() * 0.84, 0.01, 0.03, mat(j % 2 ? 0x9ab9a6 : 0x80a898), 0, 0, 0, false);
        break;
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

const shapes = {
  torso: new T.CapsuleGeometry(0.218, 0.29, 3, 9), head: new T.SphereGeometry(0.14, 10, 8),
  limb: new T.CapsuleGeometry(0.064, 0.33, 2, 7), shoe: new T.BoxGeometry(0.14, 0.1, 0.25),
  hat: new T.CylinderGeometry(0.165, 0.22, 0.044, 12)
};
const actorMats = new Map();
function model(id, cloth, villager = false) {
  const i = typeof id === 'number' ? id : parseInt(id.slice(0, 4), 16);
  const skin = [0xf1cc9d, 0xd9a275, 0xe9b792, 0xb87d59, 0xf0c5ac, 0x926245][i % 6];
  const hair = [0x33261d, 0x422e21, 0x7d542d, 0x272423, 0x62574a][i % 5];
  const group = new T.Group(), body = new T.Group(), limbs = [];
  group.add(body);
  function part(parent, shape, c, x, y, z, sx = 1, sy = 1, sz = 1) {
    if (!actorMats.has(c)) actorMats.set(c, new T.MeshStandardMaterial({ color: c }));
    const mesh = new T.Mesh(shapes[shape], actorMats.get(c));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; parent.add(mesh);
  }
  part(body, 'torso', cloth, 0, 1.18, 0, 1, 1, 0.68);
  if (villager && i % 3 === 0) part(body, 'torso', 0xcfb68f, 0, 1.09, 0.12, 0.7, 0.81, 0.23);
  part(body, 'head', skin, 0, 1.49, 0, 0.58, 0.65, 0.57);
  part(body, 'head', skin, 0, 1.66, 0, 0.83, 1.1, 0.92);
  part(body, 'head', hair, 0, 1.744, -0.023, 0.89, 0.65, 0.93);
  if (villager && i % 4 === 0) {
    part(body, 'hat', 0xba9c6c, 0, 1.75, 0);
    part(body, 'head', 0xc4a979, 0, 1.8, -0.013, 1.1, 0.55, 1.04);
  }
  for (const s of [-1, 1]) {
    part(body, 'head', 0x3e3028, s * 0.043, 1.67, 0.115, 0.105, 0.084, 0.07);
    const arm = new T.Group(), leg = new T.Group();
    arm.position.set(s * 0.24, 1.37, 0); arm.rotation.z = s * 0.09;
    leg.position.set(s * 0.105, 0.87, 0); body.add(arm, leg);
    part(arm, 'limb', cloth, 0, -0.17, 0);
    part(arm, 'head', skin, 0, -0.4, 0, 0.38, 0.44, 0.33);
    part(leg, 'limb', 0x403c38, 0, -0.37, 0, 1.38, 1.49, 1.26);
    part(leg, 'shoe', 0x49372c, 0, -0.814, 0.058);
    limbs.push({ s, arm, leg });
  }
  group.userData = { body, limbs };
  return group;
}
function label(name) {
  const tex = texture(256, (ctx, size) => {
    ctx.fillStyle = '#252e24ee'; ctx.beginPath(); ctx.roundRect(12, 61, size - 24, 134, 40); ctx.fill();
    ctx.strokeStyle = '#d4b780'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#faeac9'; ctx.font = '600 33px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; ctx.fillText(name, 128, 129, 200);
  });
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.73, 0.52, 1);
  return sprite;
}

export class View {
  constructor(canvas, quality) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.camera = new T.PerspectiveCamera(66, 1, 0.064, 520);
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
        if (o.geometry && !Object.values(shapes).includes(o.geometry)) o.geometry.dispose();
        if (o.material && ![...actorMats.values()].includes(o.material)) materials.add(o.material);
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
    if (npcEnabled) for (const npc of world.npcs) {
      const person = model(npc.id, clothes[npc.outfit], true);
      person.position.set(npc.x, 0, npc.z); person.rotation.y = npc.yaw;
      const mark = label(npc.name); mark.position.set(npc.x, 2.25, npc.z);
      this.scene.add(person, mark); this.npcs.push({ npc, person, mark });
    }
    this.drops = [];
    const g = new T.SphereGeometry(0.024, 5, 4), m = new T.MeshStandardMaterial({ color: 0xcfdfce, roughness: 0.2, metalness: 0.2 });
    for (let i = 0; i < 42; i++) { const drop = new T.Mesh(g, m); this.scene.add(drop); this.drops.push(drop); }
    this.eye = null;
    this.lastShadow = null;
    this.renderer.shadowMap.needsUpdate = true;
  }
  draw(p, look, state, time, dt, names) {
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
    if (!this.lastShadow || time - this.lastShadow.time > 0.27 ||
        this.lastShadow.x !== shadow.x || this.lastShadow.z !== shadow.z) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastShadow = { time, x: shadow.x, z: shadow.z };
    }
    for (const { npc, person, mark } of this.npcs) {
      const d = distance(npc, focus);
      person.visible = d < 57;
      person.rotation.y = npc.yaw + Math.sin(time * 0.71 + npc.id) * 0.12;
      person.userData.body.position.y = Math.sin(time * 1.36 + npc.id) * 0.012;
      mark.visible = !drone && p.role === 'seeker' && state.phase === 'seek' && d < 10;
    }
    const visible = new Map(state.others.map(a => [a.id, a]));
    if (state.contact) visible.set(state.contact.id, state.contact);
    for (const [id, m] of this.actors) if (!visible.has(id)) m.visible = false;
    for (const [id, a] of visible) {
      if (!this.actors.has(id)) {
        const m = model(id, a.role === 'hider' ? 0xbd7147 : 0x457986);
        const tag = label(names.get(id) || 'Seeker'); tag.name = 'tag'; m.add(tag);
        m.position.set(a.x, 0, a.z); this.scene.add(m); this.actors.set(id, m);
      }
      const m = this.actors.get(id), { body, limbs } = m.userData;
      if (!m.visible) m.position.set(a.x, 0, a.z);
      m.visible = true; m.rotation.y = a.yaw + Math.PI;
      m.position.lerp(v(a.x, 0, a.z), Math.min(1, dt * 15));
      body.scale.y = a.stance === 1 ? 0.64 : a.stance === 2 ? 0.73 : 1;
      body.rotation.x = a.stance === 2 ? Math.PI * 0.47 : a.stance === 1 ? 0.12 : 0;
      body.position.y = a.stance === 2 ? 0.29 : 0;
      body.position.z = a.stance === 2 ? -0.61 : 0;
      const tag = m.getObjectByName('tag');
      tag.visible = a.role === 'seeker'; tag.position.y = a.stance === 2 ? 0.82 : a.stance === 1 ? 1.56 : 2.12;
      for (const { s, arm, leg } of limbs) {
        const walk = a.moving ? Math.sin(time * 13 + s * Y) * (a.stance === 2 ? 0.24 : 0.47) : 0;
        arm.rotation.x = -walk; leg.rotation.x = walk;
      }
    }
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
