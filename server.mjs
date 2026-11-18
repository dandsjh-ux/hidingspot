import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import {
  makeWorld, stepBody, clamp, clearSight, eye, atHeight, direction, blockAt, distance, LANDMARKS,
  npcPose, npcNotices, insideOf
} from './public/world.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const CLOCK = 30;
const RESUME_MS = 45000;
const ALERT_DELAY = 5000, ALERT_SHOW = 8000, PING_MS = 10000, DRONE_SENSE = 25;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pauseKeys = ['endsAt', 'seekAt', 'pingAt', 'startAt'];

const settingRange = {
  seekers: [1, 5], hide: [10, 150], seek: [60, 900],
  witnessRadius: [3, 14], pingEvery: [15, 180], pingRadius: [12, 55],
  droneAt: [10, 600], droneSeconds: [8, 35], droneCooldown: [15, 150], scopeAt: [5, 600],
  seed: [1, 2147483647]
};
export const defaults = {
  seekers: 5, size: 5, seed: 2917, hide: 45, seek: 360, hiderMode: 'rotate', chosen: '',
  locked: false, npc: true, walkers: true, witnessRadius: 8, clues: 'describe', pings: true, pingEvery: 60, pingRadius: 24,
  drone: true, droneAt: 105, droneSeconds: 18, droneCooldown: 50,
  scope: true, scopeAt: 40, sprint: true, moveHider: true
};
const spawn = [
  { x: 0, z: 12 }, { x: -3, z: 10 }, { x: 3, z: 10 },
  { x: -6.5, z: 11 }, { x: 6.5, z: 11 }
];
const stop = { side: 0, forward: 0, yaw: 0, pitch: 0, stance: 0, run: false };
const toNumber = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const dataObject = data => data && typeof data === 'object' && !Array.isArray(data) ? data : {};
const codeFrom = value => typeof value === 'string' ? value.trim().toUpperCase().slice(0, 5) : '';
const nameFrom = value => typeof value === 'string'
  ? Array.from(value.trim().replace(/[^\p{L}\p{M}\p{N} .'-]/gu, '')).slice(0, 18).join('') || 'Explorer'
  : 'Explorer';
const canSee = (world, viewer, player) => [0, 0.32].some(drop =>
  clearSight(world, eye(viewer), atHeight(player, Math.max(0.21, eye(player).y - drop))));
const canSeeNPC = (world, player, pose) => clearSight(world, eye(player), atHeight(pose, 1.42));
const npcClock = (room, time) => Math.max(0, ((room.pausedAt || time) - room.startAt) / 1000);
const anchors = {
  vineyard: 'hedge', gate: 'arcade', tower: 'tower', houses: 'building', orchard: 'tree', pottery: 'pot',
  church: 'chapel', blue: 'building', laundry: 'laundry', arcade: 'arcade', market: 'stall',
  plaza: 'fountain', garden: 'tree', canal: 'bridge', bakery: 'FORNO', rose: 'hedge',
  school: 'SCUOLA', terrace: 'lowWall', clock: 'tower', cafe: 'table'
};
const coverWords = {
  platform: ['table', 'the low wooden table'], stall: ['stall', 'the striped market stall'],
  pergola: ['pergola', 'the leafy wooden pergola'], arcade: ['arch', 'the pale stone arch']
};
export function witnessSpot(world, player) {
  const block = blockAt(world, player.x, player.z);
  const room = insideOf(world, player.x, player.z);
  if (room) return { block, relation: 'inside', place: room.place };
  let nearest, shortest = Infinity;
  for (const obj of world.objects) {
    const dx = Math.abs(player.x - obj.x), dz = Math.abs(player.z - obj.z);
    if (dx < obj.w / 2 && dz < obj.d / 2 && coverWords[obj.kind] &&
        (obj.clearance || obj.kind === 'arcade')) {
      return { block, relation: 'under', place: coverWords[obj.kind] };
    }
    if (blockAt(world, obj.x, obj.z) !== block) continue;
    const type = obj.tower ? 'tower' : obj.chapel ? 'chapel' : obj.sign || obj.kind;
    if (type !== anchors[block.type]) continue;
    const gap = Math.hypot(Math.max(dx - obj.w / 2, 0), Math.max(dz - obj.d / 2, 0));
    if (gap < shortest) { shortest = gap; nearest = obj; }
  }
  const beside = nearest && shortest <= 2.4;
  return { block, relation: beside ? 'beside' : 'near', place: shortest < 10 ? LANDMARKS[block.type] : null };
}
const toWire = p => ({
  id: p.id, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100,
  yaw: p.yaw, stance: p.stance, moving: p.moving, role: p.role
});

function updateSettings(room, patch) {
  const next = { ...room.settings };
  for (const [key, [min, max]] of Object.entries(settingRange)) {
    next[key] = clamp(Math.round(toNumber(patch[key], next[key])), min, max);
  }
  next.seekers = Math.max(next.seekers, room.players.size - 1);
  if ([3, 5].includes(patch.size)) next.size = patch.size;
  if (['rotate', 'random', 'pick'].includes(patch.hiderMode)) next.hiderMode = patch.hiderMode;
  if (typeof patch.chosen === 'string' && room.players.has(patch.chosen)) next.chosen = patch.chosen;
  if (['simple', 'describe'].includes(patch.clues)) next.clues = patch.clues;
  for (const flag of ['locked', 'npc', 'walkers', 'pings', 'drone', 'scope', 'sprint', 'moveHider']) {
    if (typeof patch[flag] === 'boolean') next[flag] = patch[flag];
  }
  return next;
}

export function createGameServer({ now = Date.now } = {}) {
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 8192 });
  const rooms = new Map();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/vendor/three', express.static(resolve(root, 'node_modules/three/build'), { index: false }));
  app.use('/vendor/addons', express.static(resolve(root, 'node_modules/three/examples/jsm'), { index: false }));
  app.use(express.static(resolve(root, 'public')));

  function lobby(room) {
    io.to(room.code).emit('room', {
      code: room.code, host: room.host, phase: room.phase, round: room.round, settings: room.settings,
      players: [...room.players.values()].map(p => ({
        id: p.id, name: p.name, role: p.role, online: !!p.socket, wins: p.wins, clues: p.clueCount
      })),
      result: room.result
    });
  }

  function attach(socket, room, p) {
    p.socket = socket;
    p.goneAt = 0;
    socket.data.code = room.code;
    socket.data.id = p.id;
    socket.join(room.code);
    socket.emit('identity', { code: room.code, id: p.id, token: p.token });
    if (!room.players.get(room.host)?.socket) room.host = p.id;
    lobby(room);
  }

  function finish(room, winner, message, tagger = '') {
    room.phase = 'end';
    room.pausedAt = 0;
    room.ping = null;
    for (const p of room.players.values()) {
      if (p.role === winner) p.wins++;
      p.drone = null;
    }
    room.result = { winner, message, tagger, hider: room.players.get(room.hider)?.name || 'The hider' };
    lobby(room);
  }

  function detach(room, p, reason) {
    if (!p) return;
    const socket = p.socket;
    const live = room.phase === 'hide' || room.phase === 'seek';
    if (live && p.role === 'hider') finish(room, '', 'The hider left. Start a new round to play again.');
    if (socket) {
      socket.leave(room.code);
      socket.data.code = '';
      socket.data.id = '';
      socket.emit('departed', reason);
    }
    room.players.delete(p.id);
    if (!room.players.size) { rooms.delete(room.code); return; }
    if (room.host === p.id) {
      const connected = [...room.players.values()].find(member => member.socket);
      room.host = (connected || room.players.values().next().value).id;
    }
    if (live && room.phase !== 'end' && ![...room.players.values()].some(member => member.role === 'seeker')) {
      finish(room, '', 'The seekers left. Start a new round when someone joins.');
    } else {
      lobby(room);
    }
  }

  function start(room, time) {
    if (room.phase !== 'lobby' && room.phase !== 'end') return 'A round is already running.';
    const players = [...room.players.values()].filter(p => p.socket);
    if (players.length < 2) return 'You need at least two players.';
    let hider;
    if (room.settings.hiderMode === 'pick') {
      hider = players.find(p => p.id === room.settings.chosen);
      if (!hider) return 'Choose a connected player to hide.';
    } else if (room.settings.hiderMode === 'random') {
      hider = players[randomInt(players.length)];
    } else {
      const previous = players.findIndex(p => p.id === room.hider);
      hider = players[(previous + 1) % players.length];
    }
    room.hider = hider.id;
    room.round++;
    room.phase = 'hide';
    room.world = makeWorld(room.settings);
    room.result = null;
    room.witnesses.clear();
    room.aware = new Map();
    room.pending = new Map();
    room.alerts = new Map();
    room.ping = null;
    room.pausedAt = 0;
    room.startAt = time;
    room.seekAt = time + room.settings.hide * 1000;
    room.endsAt = room.seekAt;
    room.pingAt = room.seekAt + room.settings.pingEvery * 1000;
    let seeker = 0;
    for (const p of room.players.values()) {
      p.role = p === hider ? 'hider' : p.socket ? 'seeker' : 'waiting';
      const point = p === hider ? { x: -6, z: 5.9 } : spawn[(p.role === 'seeker' ? seeker++ : 0) % spawn.length];
      Object.assign(p, point, {
        yaw: 0, stance: 0, moving: false, input: { ...stop }, lastInputAt: 0,
        drone: null, droneReady: 0, scope: false, clueCount: 0, clueIds: new Set(), lastAction: 0, lastSeq: 0, heading: null, headingName: '', contact: null
      });
    }
    lobby(room);
    return '';
  }

  function interact(room, p, data, time) {
    if (room.phase !== 'seek' || room.pausedAt || !p.socket || p.role !== 'seeker' || p.drone) return;
    const hider = room.players.get(room.hider);
    if (!hider) return;
    const dx = hider.x - p.x, dz = hider.z - p.z;
    const d = Math.hypot(dx, dz);
    const facing = (-Math.sin(p.input.yaw) * dx - Math.cos(p.input.yaw) * dz) / Math.max(d, 0.01);
    if (data.mode !== 'talk' && d <= 2.9 && (facing > 0.06 || d < 0.75) && canSee(room.world, p, hider)) {
      finish(room, 'seeker', p.name + ' found the hider!', p.name);
      return;
    }
    const npc = Number.isInteger(data.npc) && room.world.npcs[data.npc];
    const pose = npc && npcPose(npc, npcClock(room, time), room.world.walkers);
    if (data.mode !== 'tag' && room.settings.npc && npc && distance(p, pose) <= 4.3 && canSeeNPC(room.world, p, pose)) {
      const seen = room.witnesses.get(npc.id);
      const speaker = npc.name, role = npc.role || 'villager';
      if (!seen) {
        p.socket.emit('clue', { speaker, role, text: 'I do not know. I did not see the hider.', terms: ['did not see'] });
        return;
      }
      const age = Math.max(0, Math.floor((time - seen.time) / 1000));
      const placeText = seen.place && (room.settings.clues === 'describe' ? seen.place[1] : 'the ' + seen.place[0]);
      const spot = placeText ? seen.relation + ' ' + placeText + ' in ' + seen.block.name : 'in ' + seen.block.name;
      if (!p.clueIds.has(npc.id)) { p.clueIds.add(npc.id); p.clueCount++; }
      const heading = seen.direction ? 'They went ' + seen.direction + '.' : 'They were not moving.';
      const word = seen.direction || 'not moving';
      p.socket.emit('clue', {
        speaker, role, text: 'I saw the hider ' + spot + '. ' + heading,
        terms: placeText ? [seen.relation, placeText, word] : ['in', word], age
      });
      return;
    }
    p.socket.emit('notice', data.mode === 'talk' ? 'Move closer to a villager.' : 'Get close to the hider and look at them to tag.');
  }

  function equipment(room, p, what, time) {
    if (room.phase !== 'seek' || room.pausedAt || p.role !== 'seeker') return;
    if (what === 'scope' && room.settings.scope && time >= room.seekAt + room.settings.scopeAt * 1000 && !p.drone) {
      p.scope = !p.scope;
    }
    if (what !== 'drone' || !room.settings.drone || time < room.seekAt + room.settings.droneAt * 1000) return;
    if (p.drone) {
      p.drone = null;
      p.droneReady = time + room.settings.droneCooldown * 1000;
    } else if (time >= p.droneReady) {
      p.scope = false;
      p.drone = { x: p.x, z: p.z, until: time + room.settings.droneSeconds * 1000 };
    }
  }

  function newPlayer(name) {
    return { id: randomBytes(8).toString('hex'), token: randomBytes(24).toString('hex'), name: nameFrom(name),
      role: 'waiting', wins: 0, clueCount: 0, stance: 0, input: { ...stop }, x: 0, z: 0 };
  }
  io.on('connection', socket => {
    let rateSecond = 0, rateCount = 0, lastRoomAction = -Infinity;
    const getRoom = () => rooms.get(socket.data.code);
    const getPlayer = room => room?.players.get(socket.data.id);
    function reserveRoomAction(ack) {
      const time = now();
      if (time - lastRoomAction < 700) { ack({ error: 'Wait a moment and try again.' }); return false; }
      if (getRoom()) { ack({ error: 'Leave your current room first.' }); return false; }
      lastRoomAction = time;
      return true;
    }
    function command(event, fn) {
      socket.on(event, (value, done) => {
        const ack = typeof done === 'function' ? done : () => {};
        fn(dataObject(value), ack);
      });
    }
    command('create-room', (data, ack) => {
      if (!reserveRoomAction(ack)) return;
      if (rooms.size >= 120) { ack({ error: 'The server is full. Try again later.' }); return; }
      let code;
      do { code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
      const p = newPlayer(data.name);
      const room = { code, host: p.id, hider: '', phase: 'lobby', round: 0, settings: { ...defaults },
        players: new Map([[p.id, p]]), witnesses: new Map(), pausedAt: 0 };
      rooms.set(code, room);
      attach(socket, room, p);
      ack({ ok: true });
    });
    command('join-room', (data, ack) => {
      if (!reserveRoomAction(ack)) return;
      const room = rooms.get(codeFrom(data.code));
      if (!room) { ack({ error: 'Room not found. Check the room code.' }); return; }
      if (room.settings.locked) { ack({ error: 'This room is locked.' }); return; }
      if (room.phase === 'hide' || room.phase === 'seek') { ack({ error: 'A round is running. Join after it ends.' }); return; }
      if (room.players.size >= room.settings.seekers + 1) { ack({ error: 'This room is full.' }); return; }
      const p = newPlayer(data.name);
      room.players.set(p.id, p);
      attach(socket, room, p);
      ack({ ok: true });
    });
    command('resume-room', (data, ack) => {
      if (getRoom()) { ack({ error: 'Already connected.' }); return; }
      const room = rooms.get(codeFrom(data.code));
      const player = typeof data.token === 'string' && data.token.length === 48 &&
        [...(room?.players.values() || [])].find(p => p.token === data.token && !p.socket && now() - p.goneAt < RESUME_MS);
      if (!player) { ack({ error: 'That room session has ended.' }); return; }
      attach(socket, room, player);
      ack({ ok: true });
    });
    command('host', (data, ack) => {
      const room = getRoom();
      if (room?.host !== socket.data.id || !room) { ack({ error: 'Only the host can do that.' }); return; }
      const t = now();
      const live = room.phase === 'hide' || room.phase === 'seek';
      const target = room.players.get(data.player);
      let error = '';
      switch (data.action) {
        case 'settings':
          if (!live) { room.settings = updateSettings(room, dataObject(data.settings)); lobby(room); }
          else error = 'Change settings between rounds.';
          break;
        case 'start': error = start(room, t); break;
        case 'pause':
          if (!live) break;
          if (room.pausedAt) {
            const shift = t - room.pausedAt;
            for (const key of pauseKeys) room[key] += shift;
            if (room.ping) room.ping.until += shift;
            for (const p of room.players.values()) {
              if (p.drone) p.drone.until += shift;
              if (p.droneReady) p.droneReady += shift;
            }
            for (const witness of room.witnesses.values()) witness.time += shift;
            for (const [id, since] of room.pending) room.pending.set(id, since + shift);
            for (const [id, until] of room.alerts) room.alerts.set(id, until + shift);
            for (const p of room.players.values()) if (p.contact) p.contact.until += shift;
            room.pausedAt = 0;
          } else {
            room.pausedAt = t;
          }
          break;
        case 'end': if (live) finish(room, '', 'The host ended this round.'); break;
        case 'lobby':
          if (!live) {
            room.phase = 'lobby';
            room.result = null;
            for (const p of room.players.values()) p.role = 'waiting';
            lobby(room);
          }
          break;
        case 'kick':
          if (target && target.id !== room.host) detach(room, target, 'The host removed you from the room.');
          break;
        case 'transfer':
          if (target?.socket) { room.host = target.id; lobby(room); }
          break;
        default: error = 'Unknown host control.';
      }
      ack(error ? { error } : { ok: true });
    });
    socket.on('input', raw => {
      const t = now();
      if (t - rateSecond >= 1000) { rateSecond = t; rateCount = 0; }
      if (++rateCount > 80) return;
      const room = getRoom(), p = getPlayer(room);
      if (!p || (room.phase !== 'hide' && room.phase !== 'seek')) return;
      const v = dataObject(raw);
      const seq = toNumber(v.seq, 0);
      if (!Number.isSafeInteger(seq) || seq <= p.lastSeq) return;
      p.lastSeq = seq;
      p.lastInputAt = t;
      p.input = {
        side: clamp(toNumber(v.side, 0), -1, 1), forward: clamp(toNumber(v.forward, 0), -1, 1),
        yaw: clamp(toNumber(v.yaw, 0), -6.284, 6.284), pitch: clamp(toNumber(v.pitch, 0), -1.5, 1.5),
        stance: clamp(Math.round(toNumber(v.stance, 0)), 0, 2), run: v.run === true
      };
    });
    socket.on('action', raw => {
      const room = getRoom(), p = getPlayer(room), t = now();
      if (!p || t - p.lastAction < 350) return;
      p.lastAction = t;
      const data = dataObject(raw);
      if (data.action === 'interact') interact(room, p, data, t);
      if (data.action === 'tool') equipment(room, p, data.tool, t);
    });
    socket.on('leave-room', () => {
      const room = getRoom();
      if (room) detach(room, getPlayer(room), '');
    });
    socket.on('disconnect', () => {
      const room = getRoom(), p = getPlayer(room);
      if (!p) return;
      p.socket = null;
      p.goneAt = now();
      p.input = { ...stop, yaw: p.yaw, stance: p.stance };
      p.moving = false;
      p.lastSeq = 0;
      if (p.id === room.host) {
        const successor = [...room.players.values()].find(member => member.socket);
        if (successor) room.host = successor.id;
      }
      lobby(room);
    });
  });

  // Keep a smoothed heading so a sighting reports where the hider was going, not one noisy step.
  function follow(p, dx, dz) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const h = p.heading || { x: dx / len, z: dz / len };
    p.heading = { x: h.x * 0.93 + dx / len * 0.07, z: h.z * 0.93 + dz / len * 0.07 };
    if (Math.hypot(p.heading.x, p.heading.z) > 0.2) p.headingName = direction(p.heading.x, p.heading.z);
  }

  // Villagers notice the hider gradually. Closer, moving and standing targets are noticed sooner,
  // and a villager must be facing roughly the right way with a clear view.
  function watch(room, hider, input, t) {
    const clock = npcClock(room, t), dt = 1 / CLOCK, reach = room.settings.witnessRadius * 1.35 + 5;
    const target = {
      x: hider.x, z: hider.z, stance: hider.stance, moving: hider.moving,
      run: hider.moving && input.run && hider.stance === 0 && room.settings.sprint
    };
    let spot;
    for (const npc of room.world.npcs) {
      let level = room.aware.get(npc.id) || 0;
      let strength = 0;
      if (distance(npc, hider) <= reach) {
        const pose = npcPose(npc, clock, room.world.walkers);
        strength = npcNotices(room.world, pose, target, room.settings.witnessRadius);
      }
      if (strength > 0) level = Math.min(1.5, level + dt * (1.1 + strength * 3.2));
      else level = Math.max(0, level - dt * 0.8);
      if (level > 0) room.aware.set(npc.id, level); else room.aware.delete(npc.id);
      if (strength > 0 && level >= 1) {
        spot ||= { ...witnessSpot(room.world, hider), direction: hider.headingName };
        room.witnesses.set(npc.id, { ...spot, time: t });
        // The hider is told five seconds later, so a sighting never gives itself away at once.
        if (!room.alerts.has(npc.id) && !room.pending.has(npc.id)) room.pending.set(npc.id, t);
      }
    }
    for (const [id, since] of room.pending) {
      if (t - since < ALERT_DELAY) continue;
      room.pending.delete(id);
      room.alerts.set(id, t + ALERT_SHOW);
    }
    for (const [id, until] of room.alerts) if (t >= until) room.alerts.delete(id);
  }

  function advance(room, t) {
    if (room.phase !== 'hide' && room.phase !== 'seek') return;
    if (room.pausedAt) return;
    if (t >= room.endsAt) {
      if (room.phase === 'seek') { finish(room, 'hider', 'The hider stayed hidden!'); return; }
      room.phase = 'seek';
      room.endsAt = room.seekAt + room.settings.seek * 1000;
      lobby(room);
    }
    const hider = room.players.get(room.hider);
    for (const p of room.players.values()) {
      const active = p.role === 'hider' || (p.role === 'seeker' && room.phase === 'seek');
      if (!active || !p.socket) continue;
      const input = t - p.lastInputAt < 240 ? p.input : { ...p.input, side: 0, forward: 0, run: false };
      const before = { x: p.x, z: p.z };
      p.yaw = input.yaw;
      if (p.drone && t >= p.drone.until) {
        p.drone = null;
        p.droneReady = t + room.settings.droneCooldown * 1000;
      }
      if (p.drone) {
        const scale = Math.max(1, Math.hypot(input.side, input.forward));
        const next = { x: p.drone.x + input.side * 18 / (CLOCK * scale), z: p.drone.z - input.forward * 18 / (CLOCK * scale) };
        const tether = Math.max(1, distance(next, p) / 64);
        p.drone.x = clamp(p.x + (next.x - p.x) / tether, -room.world.bound, room.world.bound);
        p.drone.z = clamp(p.z + (next.z - p.z) / tether, -room.world.bound, room.world.bound);
      } else {
        const frozen = p === hider && room.phase === 'seek' && !room.settings.moveHider;
        stepBody(room.world, p, frozen ? { ...input, side: 0, forward: 0 } : input, 1 / CLOCK, room.settings.sprint);
      }
      p.moving = distance(p, before) > 0.015;
      if (p === hider) {
        if (p.moving) follow(p, p.x - before.x, p.z - before.z);
        if (room.settings.npc) watch(room, p, input, t);
      }
    }
    if (room.phase === 'seek' && room.settings.pings && t >= room.pingAt && hider) {
      const r = room.settings.pingRadius, angle = Math.random() * Math.PI * 2;
      const offset = r * (0.31 + Math.random() * 0.48);
      room.ping = {
        x: Math.round(hider.x + Math.cos(angle) * offset), z: Math.round(hider.z + Math.sin(angle) * offset),
        radius: r, id: t, label: blockAt(room.world, hider.x, hider.z).name,
        until: t + 12000
      };
      room.pingAt = t + room.settings.pingEvery * 1000;
    }
  }

  function snapshot(room, t) {
    if (room.phase !== 'hide' && room.phase !== 'seek') return;
    const time = room.pausedAt || t;
    for (const p of room.players.values()) {
      if (!p.socket) continue;
      const seeking = room.phase === 'seek' && p.role === 'seeker';
      const others = [];
      let contact = null;
      if (room.phase === 'seek' && p.role !== 'waiting') {
        for (const other of room.players.values()) {
          if (p === other || other.role === 'waiting' || !other.socket) continue;
          if ((other.role === p.role || distance(p, other) < (p.scope ? 120 : 57)) && canSee(room.world, p, other)) {
            others.push(toWire(other));
          }
        }
        // Heat vision: the drone finds the hider within range through roofs and cover, and the ping lasts 10 seconds.
        const hider = room.players.get(room.hider);
        const live = !!(p.drone && hider?.socket && distance(p.drone, hider) < DRONE_SENSE);
        if (live) p.contact = { ...toWire(hider), until: time + PING_MS };
        if (p.contact && p.contact.until > time) contact = { ...p.contact, live, left: p.contact.until - time };
      }
      const npcEnabled = room.settings.npc;
      const remaining = Math.max(0, room.endsAt - time);
      const ping = seeking && room.ping?.until > time ? room.ping : null;
      p.socket.volatile.emit('state', {
        round: room.round, phase: room.phase, remaining, paused: !!room.pausedAt, clock: npcClock(room, t),
        // Everyone who is allowed to look sees the same villager alerts. Seekers start at the search, so the hiding time stays blind.
        alerts: p.role === 'hider' || (seeking && room.settings.npc) ? [...room.alerts.keys()] : undefined,
        self: toWire(p), seq: p.lastSeq, others, contact, ping, npcEnabled,
        drone: p.drone ? { x: p.drone.x, z: p.drone.z, left: Math.max(0, p.drone.until - time) } : null,
        scope: p.scope, droneGate: seeking && room.settings.drone ?
          Math.max(0, room.seekAt + room.settings.droneAt * 1000 - time, p.droneReady - time) : null,
        scopeGate: seeking && room.settings.scope ? Math.max(0, room.seekAt + room.settings.scopeAt * 1000 - time) : null,
        nextPing: seeking && room.settings.pings ? Math.max(0, room.pingAt - time) : null
      });
    }
  }

  let tick = 0;
  const timer = setInterval(() => {
    const t = now();
    tick++;
    for (const room of rooms.values()) {
      if (tick % CLOCK === 0) {
        for (const p of room.players.values()) if (!p.socket && t - p.goneAt >= RESUME_MS) detach(room, p, '');
      }
      advance(room, t);
      if (tick % 2 === 0) snapshot(room, t);
    }
  }, 1000 / CLOCK);
  timer.unref();
  http.once('close', () => clearInterval(timer));
  return { app, http, io };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3000;
  createGameServer().http.listen(port, '0.0.0.0', () => console.log('Hiding Spot is listening on port ' + port));
}
