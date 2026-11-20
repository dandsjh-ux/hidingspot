import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { test } from 'node:test';
import { io as client } from 'socket.io-client';
import { createGameServer, witnessSpot } from '../server.mjs';
import {
  BOUNDARY_WALL, makeWorld, occupied, clearSight, direction, distance, stepBody, blockAt, npcPose, npcNotices, insideOf, SEEKER_SPEED
} from '../public/world.mjs';

test('town sizes, walkable spawn, walls, and clearance for crouching and going prone', () => {
  const town = makeWorld();
  assert.equal(town.blocks.length, 25);
  assert.equal(makeWorld({ size: 3 }).blocks.length, 9);
  assert.ok(town.npcs.length >= 50);
  assert.deepEqual(makeWorld().objects, town.objects);
  assert.equal(blockAt(town, 0, 0).name, 'Fountain Plaza');
  assert.equal(direction(2, 0), 'east');
  assert.equal(direction(0, -2), 'north');
  const cover = town.objects.find(o => o.kind === 'platform' && o.clearance < 1);
  assert.equal(occupied(town, cover.x, cover.z, 0), true);
  assert.equal(occupied(town, cover.x, cover.z, 1), true);
  assert.equal(occupied(town, cover.x, cover.z, 2), false);
  assert.equal(clearSight(town, { x: cover.x, y: 30, z: cover.z }, { x: cover.x, y: 0.4, z: cover.z }), false);
  const house = town.objects.find(o => o.kind === 'building');
  assert.equal(clearSight(town, { x: house.x - house.w, y: 1.5, z: house.z }, { x: house.x + house.w, y: 1.5, z: house.z }), false);
  const body = { x: -6, z: 5.9, stance: 0 };
  stepBody(town, body, { side: 0, forward: 1, yaw: 0, stance: 1 }, 0.1);
  assert.ok(body.z < 5.9);
  assert.equal(body.stance, 1);
});


test('named buildings have open interiors that a player can walk into and hide in', () => {
  for (const size of [5, 3]) {
    const town = makeWorld({ size });
    const names = town.buildings.map(b => b.name);
    for (const name of ['Bakery', 'School', 'Church', 'Pottery Shop', 'Market Hall']) assert.ok(names.includes(name), name);
    assert.equal(town.interiors.length, size === 5 ? 5 : 4);
    assert.ok(town.buildings.filter(b => b.enter).length === town.interiors.length);
    for (const room of town.interiors) {
      // Walk straight in through the door while standing.
      const f = room.door.front;
      const body = { x: room.door.x, z: room.door.z + f * 2.5, stance: 0 };
      for (let i = 0; i < 60; i++) stepBody(town, body, { side: 0, forward: 1, yaw: f > 0 ? 0 : Math.PI, stance: 0 }, 1 / 30);
      assert.equal(insideOf(town, body.x, body.z)?.id, room.id, room.name + ' door is walkable');
      // Flood fill proves that the room has plenty of floor and a spot where only a prone player fits.
      const step = 0.25, key = (x, z) => Math.floor(x / step + 0.3) + ',' + Math.floor(z / step + 0.3);
      const reach = stance => {
        const seen = new Set([key(body.x, body.z)]), stack = [{ x: body.x, z: body.z }], inside = [];
        while (stack.length) {
          const c = stack.pop();
          if (insideOf(town, c.x, c.z)?.id === room.id) inside.push(c);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = { x: c.x + dx * step, z: c.z + dz * step }, k = key(n.x, n.z);
            if (seen.has(k) || occupied(town, n.x, n.z, stance) || Math.abs(n.x - room.door.x) > 25 || Math.abs(n.z - room.door.z) > 25) continue;
            seen.add(k); stack.push(n);
          }
        }
        return inside;
      };
      const standing = reach(0), prone = reach(2);
      assert.ok(standing.length > 60, room.name + ' has floor space');
      assert.ok(prone.length > standing.length, room.name + ' has a low spot only a prone player fits');
      // Roof and walls hide a player inside from the drone and from the street.
      const mid = { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 };
      assert.equal(clearSight(town, { x: mid.x, y: 33, z: mid.z }, { x: mid.x, y: 0.5, z: mid.z }), false);
      assert.equal(clearSight(town, { x: room.x0 - 3, y: 1.5, z: mid.z }, { x: room.x0 + 0.8, y: 1.2, z: mid.z }), false);
      // The doorway is open: you can see in from the doorstep.
      const step1 = { x: room.door.x, y: 1.5, z: room.door.z + f * 2 };
      const spot = standing.find(c => Math.abs(c.x - room.door.x) < 0.3 && Math.abs(c.z - room.door.z) > 1.2 && Math.abs(c.z - room.door.z) < 3);
      assert.ok(clearSight(town, step1, { x: spot.x, y: 1.2, z: spot.z }), room.name + ' door is open to the view');
      assert.deepEqual(witnessSpot(town, spot), { block: room.block, relation: 'inside', place: room.place });
    }
  }
});

test('villagers walk short routes that stay on open ground and are the same on every peer', () => {
  const town = makeWorld(), twin = makeWorld();
  for (const npc of town.npcs) {
    assert.ok(npc.route, 'villager ' + npc.id + ' has a route');
    const room = npc.inside != null;
    let moved = 0;
    for (let t = 0; t < npc.route.period; t += 0.4) {
      const here = npcPose(npc, t), there = npcPose(twin.npcs[npc.id], t);
      assert.deepEqual(here, there);
      assert.equal(occupied(town, here.x, here.z, 0), false, 'villager ' + npc.id + ' is not inside a wall at ' + t);
      assert.ok(distance(here, npc) < (room ? 2.2 : 4.2));
      if (!room) assert.equal(insideOf(town, here.x, here.z), null);
      if (here.moving) moved++;
    }
    assert.ok(moved > 2, 'villager ' + npc.id + ' actually walks');
  }
  const first = town.npcs[0];
  assert.equal(npcPose(first, 3, false).x, first.x);
  assert.ok(town.npcs.some(n => n.role === 'baker') && town.npcs.some(n => n.role === 'priest'));
});

test('villagers notice a hider by distance, stance, movement, facing and clear view', () => {
  const town = makeWorld({ size: 3 });
  const north = { x: 0, z: 19, yaw: Math.PI };
  const at = (z, extra = {}) => ({ x: 0, z, stance: 0, moving: true, run: false, ...extra });
  assert.ok(npcNotices(town, north, at(12), 8) > 0, 'a walking hider 7 m away is noticed');
  assert.equal(npcNotices(town, north, at(12, { moving: false }), 8), 0, 'a still hider 7 m away is not');
  assert.ok(npcNotices(town, north, at(16, { moving: false }), 8) > 0, 'a still hider 3 m away is');
  assert.equal(npcNotices(town, north, at(12, { stance: 1 }), 8), 0, 'a crouching hider is harder to notice');
  assert.ok(npcNotices(town, north, at(14, { stance: 1 }), 8) > 0);
  assert.equal(npcNotices(town, north, at(14, { stance: 2 }), 8), 0, 'a prone hider is hardest');
  assert.equal(npcNotices(town, north, at(9.2), 8), 0, 'walking 9.8 m away is out of range');
  assert.ok(npcNotices(town, north, at(9.2, { run: true }), 8) > 0, 'running carries further');
  assert.equal(npcNotices(town, { ...north, yaw: 0 }, at(12), 8), 0, 'a villager facing away does not see them');
  assert.ok(npcNotices(town, { ...north, yaw: 0 }, at(17.5), 8) > 0, 'but they notice someone right behind them');
  const house = town.objects.find(o => o.kind === 'building' && !o.enter);
  const a = { x: house.x - house.w / 2 - 2, z: house.z, yaw: Math.PI / 2 };
  assert.equal(npcNotices(town, a, { x: house.x + house.w / 2 + 2, z: house.z, stance: 0, moving: true }, 60), 0, 'walls block the view');
});

function until(socket, event, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, accept);
      reject(new Error('Timed out waiting for ' + event));
    }, timeout);
    function accept(value) {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, accept);
      resolve(value);
    }
    socket.on(event, accept);
  });
}
const emit = (socket, event, data) => socket.timeout(3500).emitWithAck(event, data);

async function harness(t) {
  let offset = 0;
  const server = createGameServer({ now: () => Date.now() + offset });
  server.http.listen(0, '127.0.0.1');
  await once(server.http, 'listening');
  const base = 'http://127.0.0.1:' + server.http.address().port;
  const clients = [];
  t.after(async () => {
    clients.forEach(socket => socket.disconnect());
    await new Promise(resolve => server.io.close(resolve));
  });
  async function connect() {
    const socket = client(base, { transports: ['websocket'], reconnection: false });
    clients.push(socket);
    await until(socket, 'connect');
    socket.seq = 0;
    socket.on('state', value => { socket.latest = value; });
    return socket;
  }
  return { base, connect, jump: ms => { offset += ms; } };
}
function input(socket, options = {}) {
  socket.emit('input', { seq: ++socket.seq, yaw: 0, forward: 0, side: 0, stance: 0, ...options });
}
async function steer(socket, x, z) {
  let state = socket.latest;
  const target = { x, z };
  for (let i = 0; i < 120; i++) {
    if (distance(state.self, target) < 0.33) { input(socket); return; }
    input(socket, { side: Math.max(-1, Math.min(1, (x - state.self.x) * 1.9)),
      forward: Math.max(-1, Math.min(1, (state.self.z - z) * 1.9)) });
    state = await until(socket, 'state');
  }
  throw new Error('Could not move to ' + JSON.stringify(target) + '. Last position ' + JSON.stringify(state.self));
}

test('multiplayer capacity, host controls, witness memories, timed tools, tagging and role rotation', { timeout: 35000 }, async t => {
  const { base, connect, jump } = await harness(t);
  assert.deepEqual(await (await fetch(base + '/healthz')).json(), { ok: true });
  assert.equal((await fetch(base + '/vendor/three/three.module.js')).status, 200);
  const [host, guest] = await Promise.all([connect(), connect()]);
  const opening = until(host, 'identity');
  assert.deepEqual(await emit(host, 'create-room', { name: 'Teacher' }), { ok: true });
  const { code, id: hostId } = await opening;
  const joining = until(guest, 'identity');
  assert.deepEqual(await emit(guest, 'join-room', { code, name: 'Student' }), { ok: true });
  const student = await joining;
  const extra = await Promise.all(Array.from({ length: 5 }, () => connect()));
  for (const socket of extra.slice(0, 4)) assert.deepEqual(await emit(socket, 'join-room', { code }), { ok: true });
  assert.match((await emit(extra[4], 'join-room', { code })).error, /full/);
  const cleared = until(host, 'room', value => value.players.length === 2);
  for (const socket of extra.slice(0, 4)) socket.emit('leave-room');
  await cleared;
  assert.match((await emit(guest, 'host', { action: 'start' })).error, /Only the host/);
  assert.deepEqual(await emit(host, 'host', { action: 'settings', settings: {
    hide: 10, seek: 60, pingEvery: 15, droneAt: 10, scopeAt: 5, size: 3, walkers: false
  } }), { ok: true });

  const hiding = until(guest, 'state', s => s.phase === 'hide');
  await emit(host, 'host', { action: 'start' });
  assert.deepEqual((await hiding).others, []);
  await until(host, 'state', s => s.phase === 'hide');
  assert.equal(host.latest.self.id, hostId);
  assert.equal(host.latest.self.role, 'hider');
  input(guest, { forward: 1 });
  await steer(host, -6, -5);
  assert.equal(guest.latest.self.z, 12);
  await emit(host, 'host', { action: 'pause' });
  const paused = await until(guest, 'state', s => s.paused);
  jump(12000);
  assert.equal((await until(guest, 'state', s => s.paused)).remaining, paused.remaining);
  await emit(host, 'host', { action: 'pause' });
  jump(10000);
  await until(guest, 'state', s => s.phase === 'seek');

  const plaza = makeWorld({ size: 3, walkers: false }).npcs;
  const unseen = plaza.find(p => p.x === 7.4 && p.z === 5.3);
  const seen = plaza.find(p => p.x === -7.4 && p.z === -5.3);
  await steer(guest, 5.7, 8.0);
  const unknown = until(guest, 'clue');
  guest.emit('action', { action: 'interact', mode: 'talk', npc: unseen.id });
  assert.match((await unknown).text, /^I do not know/);
  await steer(guest, -6.6, 8.0);
  await steer(guest, -6.6, -2.1);
  const clue = until(guest, 'clue');
  guest.emit('action', { action: 'interact', mode: 'talk', npc: seen.id });
  const memory = await clue;
  assert.match(memory.text, /Fountain Plaza.*went north/);
  assert.ok(memory.terms.includes('north'));

  jump(16000);
  const ping = await until(guest, 'state', s => !!s.ping);
  assert.equal(ping.scopeGate, 0);
  assert.equal(ping.droneGate, 0);
  assert.equal(host.latest.ping, null);
  assert.ok(distance(ping.ping, host.latest.self) < ping.ping.radius);
  assert.ok(distance(ping.ping, host.latest.self) > 2);
  guest.emit('action', { action: 'tool', tool: 'scope' });
  await until(guest, 'state', s => s.scope === true);
  await wait(380);
  guest.emit('action', { action: 'tool', tool: 'drone' });
  const flight = await until(guest, 'state', s => !!s.drone);
  assert.equal(flight.scope, false);
  assert.equal(flight.contact.id, hostId);
  const aircraft = { ...flight.drone };
  for (let i = 0; i < 12; i++) { input(guest, { side: -1 }); await wait(32); }
  assert.ok(guest.latest.drone.x < aircraft.x - 2);
  assert.equal(guest.latest.self.x, flight.self.x);
  input(guest);
  guest.emit('action', { action: 'tool', tool: 'drone' });
  const landed = await until(guest, 'state', s => !s.drone);
  assert.ok(landed.droneGate > 0);
  await steer(guest, -6.4, -3.6);
  await wait(380);
  const end = until(host, 'room', value => value.phase === 'end');
  guest.emit('action', { action: 'interact', mode: 'tag' });
  const outcome = await end;
  assert.equal(outcome.result.winner, 'seeker');
  assert.equal(outcome.result.tagger, 'Student');
  assert.equal(outcome.players.find(p => p.id === student.id).clues, 1);

  guest.seq = 0;
  const next = until(guest, 'state', value => value.round === 2);
  await emit(host, 'host', { action: 'start' });
  assert.equal((await next).self.role, 'hider');
  jump(11000);
  await until(guest, 'state', value => value.phase === 'seek');
  const secondEnd = until(host, 'room', value => value.phase === 'end');
  jump(61000);
  assert.equal((await secondEnd).result.winner, 'hider');
});

test('a player can reconnect while a seat is held and host controls move to a connected player', async t => {
  const { connect } = await harness(t);
  const [first, second] = await Promise.all([connect(), connect()]);
  const one = until(first, 'identity');
  await emit(first, 'create-room', { name: 'A' });
  const a = await one;
  const two = until(second, 'identity');
  await emit(second, 'join-room', { code: a.code, name: 'B' });
  const b = await two;
  const transfer = until(second, 'room', value => value.host === b.id);
  first.disconnect();
  await transfer;
  const comeback = await connect();
  const restored = until(comeback, 'identity');
  await emit(comeback, 'resume-room', a);
  assert.equal((await restored).id, a.id);
  assert.match((await emit(comeback, 'host', { action: 'start' })).error, /Only the host/);
  const start = until(comeback, 'state', value => value.phase === 'hide');
  assert.deepEqual(await emit(second, 'host', { action: 'start' }), { ok: true });
  assert.equal((await start).self.id, a.id);
});

test('the hider hears about a sighting only after five seconds, and the alert then fades', { timeout: 25000 }, async t => {
  const { connect, jump } = await harness(t);
  const [host, guest] = await Promise.all([connect(), connect()]);
  const opened = until(host, 'identity');
  await emit(host, 'create-room', { name: 'Hider' });
  const { code } = await opened;
  await emit(guest, 'join-room', { code, name: 'Seeker' });
  await emit(host, 'host', { action: 'settings', settings: { hide: 150, seek: 300, size: 3, walkers: false } });
  await emit(host, 'host', { action: 'start' });
  await until(host, 'state', s => s.phase === 'hide' && s.self.role === 'hider');
  assert.equal((await until(guest, 'state', s => s.phase === 'hide')).alerts, undefined);
  const villager = makeWorld({ size: 3, walkers: false }).npcs.find(n => n.x === -7.4 && n.z === -5.3);
  await steer(host, -6, 0);
  await steer(host, -6, -3.6);
  input(host);
  // The villager has already noticed the hider, but nothing is shown yet.
  await wait(500);
  assert.deepEqual(host.latest.alerts, []);
  jump(3000);
  await wait(200);
  assert.deepEqual(host.latest.alerts, [], 'still nothing after three seconds');
  jump(3000);
  const alert = await until(host, 'state', s => s.alerts?.some(a => a.id === villager.id), 3000);
  assert.ok(alert.alerts.length >= 1);
  const heading = alert.alerts.find(a => a.id === villager.id).dir;
  assert.ok(typeof heading === 'number' && Math.abs(heading) < 0.6, 'the alert points the way the hider was running (north), got ' + heading);
  assert.equal(guest.latest.alerts, undefined);
  // Move away and go prone. The alert fades after a few seconds.
  await steer(host, -6, 4);
  input(host, { stance: 2 });
  jump(9000);
  await wait(300);
  jump(9000);
  const quiet = await until(host, 'state', s => s.self.stance === 2 && s.alerts?.length === 0, 4000);
  assert.deepEqual(quiet.alerts, []);
});

// Shortest walkable path on a half-metre grid, so a test can march a player to a spot indoors.
function route(world, from, to) {
  const step = 0.5, key = (x, z) => Math.round(x / step) + ',' + Math.round(z / step);
  const start = { x: Math.round(from.x / step) * step, z: Math.round(from.z / step) * step };
  const prev = new Map([[key(start.x, start.z), null]]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (distance(c, to) < 0.6) {
      const path = [];
      for (let p = c; p; p = prev.get(key(p.x, p.z))) path.push(p);
      return path.reverse();
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = { x: c.x + dx * step, z: c.z + dz * step }, k = key(n.x, n.z);
      if (!prev.has(k) && !occupied(world, n.x, n.z, 0)) { prev.set(k, c); queue.push(n); }
    }
  }
  return null;
}

test('the drone finds a hider inside a building with heat vision, and the ping lasts ten seconds', { timeout: 45000 }, async t => {
  const { connect, jump } = await harness(t);
  const [host, guest] = await Promise.all([connect(), connect()]);
  const opened = until(host, 'identity');
  await emit(host, 'create-room', { name: 'Hider' });
  const { code, id: hiderId } = await opened;
  await emit(guest, 'join-room', { code, name: 'Seeker' });
  await emit(host, 'host', { action: 'settings', settings: { hide: 12, seek: 200, size: 3, walkers: false, droneAt: 10, droneSeconds: 35 } });
  await emit(host, 'host', { action: 'start' });
  await until(host, 'state', s => s.phase === 'hide' && s.self.role === 'hider');
  const town = makeWorld({ size: 3, walkers: false });
  const bakery = town.interiors.find(r => r.name === 'Bakery');
  const inside = { x: (bakery.x0 + bakery.x1) / 2 + 1, z: (bakery.z0 + bakery.z1) / 2 };
  const path = route(town, host.latest.self, inside);
  assert.ok(path, 'there is a way into the bakery');
  for (const point of path.filter((_, i) => i % 2 === 0 || i === path.length - 1)) await steer(host, point.x, point.z);
  assert.equal(insideOf(town, host.latest.self.x, host.latest.self.z)?.name, 'Bakery');
  jump(13000);
  await until(guest, 'state', s => s.phase === 'seek' && s.droneGate === 0);
  guest.emit('action', { action: 'tool', tool: 'drone' });
  let flight = await until(guest, 'state', s => !!s.drone);
  assert.equal(flight.contact, null, 'out of range at first');
  for (let i = 0; i < 160 && !guest.latest.contact?.live; i++) { input(guest, { side: -1, forward: -0.35 }); await wait(32); }
  input(guest);
  const found = guest.latest.contact;
  assert.ok(found?.live, 'heat vision locks on');
  assert.equal(found.id, hiderId);
  assert.equal(insideOf(town, found.x, found.z)?.name, 'Bakery');
  assert.equal(clearSight(town, { x: found.x, y: 33, z: found.z }, { x: found.x, y: 1.6, z: found.z }), false, 'a roof is in the way');
  assert.ok(found.left > 9000);
  await wait(400);
  guest.emit('action', { action: 'tool', tool: 'drone' });
  const landed = await until(guest, 'state', s => !s.drone && s.contact);
  assert.equal(landed.contact.live, false);
  assert.equal(landed.contact.id, hiderId);
  assert.ok(landed.contact.left > 0 && landed.contact.left <= 10000);
  jump(11000);
  assert.equal((await until(guest, 'state', s => s.contact === null)).contact, null);
});

test('seekers see the same villager alerts as the hider, but only once the search has started', { timeout: 25000 }, async t => {
  const { connect, jump } = await harness(t);
  const [host, guest] = await Promise.all([connect(), connect()]);
  const opened = until(host, 'identity');
  await emit(host, 'create-room', { name: 'Hider' });
  const { code } = await opened;
  await emit(guest, 'join-room', { code, name: 'Seeker' });
  await emit(host, 'host', { action: 'settings', settings: { hide: 14, seek: 200, size: 3, walkers: false } });
  await emit(host, 'host', { action: 'start' });
  await until(host, 'state', s => s.phase === 'hide' && s.self.role === 'hider');
  const villager = makeWorld({ size: 3, walkers: false }).npcs.find(n => n.x === -7.4 && n.z === -5.3);
  await steer(host, -6, 0);
  await steer(host, -6, -3.6);
  input(host);
  await wait(400);
  jump(5500);
  const hider = await until(host, 'state', s => s.alerts?.some(a => a.id === villager.id), 3000);
  assert.ok(hider.alerts.length >= 1);
  assert.equal(guest.latest.phase, 'hide');
  assert.equal(guest.latest.alerts, undefined, 'the seeker is still blind while the hider hides');
  jump(6000);
  const seeker = await until(guest, 'state', s => s.phase === 'seek' && s.alerts?.some(a => a.id === villager.id), 3000);
  assert.ok(seeker.alerts.some(a => a.id === villager.id));
  assert.ok(Math.abs(seeker.alerts.find(a => a.id === villager.id).dir) < 0.6, 'seekers get the hider’s heading too');
});

test('seekers move twice as fast, never skip through walls, and catch the hider by touching them', { timeout: 25000 }, async t => {
  // Shared movement: a seeker covers twice the ground, and fast steps still stop at a wall.
  const town = makeWorld({ size: 3, walkers: false });
  const slow = { x: 0, z: 19, stance: 0 }, fast = { x: 0, z: 19, stance: 0 };
  stepBody(town, slow, { side: 1, forward: 0, yaw: 0, stance: 0 }, 0.1);
  stepBody(town, fast, { side: 1, forward: 0, yaw: 0, stance: 0 }, 0.1, true, SEEKER_SPEED);
  assert.ok(Math.abs(fast.x / slow.x - 2) < 0.01);
  const house = town.objects.find(o => o.kind === 'building' && !o.enter);
  const runner = { x: house.x - house.w / 2 - 1, z: house.z, stance: 0 };
  for (let i = 0; i < 30; i++) stepBody(town, runner, { side: 1, forward: 0, yaw: 0, stance: 0, run: true }, 0.056, true, SEEKER_SPEED);
  assert.ok(runner.x < house.x - house.w / 2, 'a fast seeker is stopped by the wall');

  const { connect, jump } = await harness(t);
  const [host, guest] = await Promise.all([connect(), connect()]);
  const opened = until(host, 'identity');
  await emit(host, 'create-room', { name: 'Hider' });
  const { code } = await opened;
  await emit(guest, 'join-room', { code, name: 'Seeker' });
  await emit(host, 'host', { action: 'settings', settings: { hide: 10, seek: 200, size: 3, walkers: false } });
  await emit(host, 'host', { action: 'start' });
  await until(guest, 'state', s => s.phase === 'hide');
  jump(11000);
  await until(guest, 'state', s => s.phase === 'seek');
  // Walk (not run) east along the street and measure the speed against the shared round clock.
  const samples = [];
  for (let i = 0; i < 14; i++) {
    input(guest, { side: 1 });
    await wait(40);
    if (i >= 3) samples.push({ x: guest.latest.self.x, clock: guest.latest.clock });
  }
  input(guest);
  const first = { self: samples[0] , clock: samples[0].clock }, second = { self: samples.at(-1), clock: samples.at(-1).clock };
  const speed = (second.self.x - first.self.x) / (second.clock - first.clock);
  assert.ok(speed > 9.5 && speed < 11.5, 'walking seeker speed ' + speed.toFixed(1) + ' m/s');
  // Run at the hider. Touching is enough, with no key press.
  const end = until(host, 'room', value => value.phase === 'end', 12000);
  let finished = false;
  end.then(() => { finished = true; }, () => {});
  for (let i = 0; i < 150 && !finished; i++) {
    const me = guest.latest.self, them = host.latest.self;
    const dx = them.x - me.x, dz = them.z - me.z, len = Math.max(1, Math.hypot(dx, dz));
    input(guest, { side: dx / len, forward: -dz / len, run: true });
    await wait(40);
  }
  const outcome = await end;
  assert.equal(outcome.result.winner, 'seeker');
  assert.match(outcome.result.message, /caught/);
});

test('players stop at the inner face of the boundary wall in every direction, and interior floors sit level with the street', () => {
  for (const size of [5, 3]) {
    const town = makeWorld({ size });
    const edge = town.bound - BOUNDARY_WALL;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // Run into the wall from a point in the street at full tilt, as a boosted seeker.
      const body = { x: dx ? 0 : 19, z: dz ? 0 : 19, stance: 0 };
      if (dx) body.z = 19; else body.x = 19;
      for (let i = 0; i < 400; i++) stepBody(town, body, { side: dx, forward: -dz, yaw: 0, stance: 0, run: true }, 0.056, true, SEEKER_SPEED);
      const reach = Math.max(Math.abs(body.x), Math.abs(body.z)) + 0.34;
      assert.ok(reach <= edge + 1e-6, `size ${size} direction ${dx},${dz}: body reaches ${reach.toFixed(2)} but the wall starts at ${edge.toFixed(2)}`);
      assert.ok(reach > edge - 0.5, 'and they can walk right up to it');
    }
  }
});

test('the host can set the seeker speed, within limits, and seekers move at that speed', { timeout: 40000 }, async t => {
  async function seekerSpeed(percent) {
    const { connect, jump } = await harness(t);
    const [host, guest] = await Promise.all([connect(), connect()]);
    const opened = until(host, 'identity');
    await emit(host, 'create-room', { name: 'Host' });
    const { code } = await opened;
    await emit(guest, 'join-room', { code, name: 'Seeker' });
    assert.deepEqual(await emit(host, 'host', { action: 'settings', settings: { hide: 10, seek: 200, size: 3, walkers: false, seekerSpeed: percent } }), { ok: true });
    await emit(host, 'host', { action: 'start' });
    await until(guest, 'state', s => s.phase === 'hide');
    jump(11000);
    await until(guest, 'state', s => s.phase === 'seek');
    const samples = [];
    for (let i = 0; i < 16; i++) {
      input(guest, { side: 1 });
      await wait(40);
      if (i >= 4) samples.push({ x: guest.latest.self.x, clock: guest.latest.clock });
    }
    input(guest);
    const [a, b] = [samples[0], samples.at(-1)];
    return (b.x - a.x) / (b.clock - a.clock);
  }
  const slow = await seekerSpeed(100), fast = await seekerSpeed(300);
  assert.ok(slow > 4.6 && slow < 6, 'at 100% a seeker walks like the hider, got ' + slow.toFixed(1));
  assert.ok(fast > 14.5 && fast < 17.2, 'at 300% a seeker walks three times as fast, got ' + fast.toFixed(1));

  // Out-of-range values are clamped to 50-300 and the default is 200.
  const { connect } = await harness(t);
  const host = await connect();
  const opened = until(host, 'identity');
  await emit(host, 'create-room', { name: 'Host' });
  await opened;
  assert.equal((await until(host, 'room', () => true, 500).catch(() => null))?.settings.seekerSpeed ?? 200, 200);
  const high = until(host, 'room', v => v.settings.seekerSpeed === 300);
  await emit(host, 'host', { action: 'settings', settings: { seekerSpeed: 9999 } });
  await high;
  const low = until(host, 'room', v => v.settings.seekerSpeed === 50);
  await emit(host, 'host', { action: 'settings', settings: { seekerSpeed: 1 } });
  await low;
});
