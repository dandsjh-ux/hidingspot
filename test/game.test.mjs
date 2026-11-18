import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { test } from 'node:test';
import { io as client } from 'socket.io-client';
import { createGameServer } from '../server.mjs';
import { makeWorld, occupied, clearSight, direction, distance, stepBody, blockAt } from '../public/world.mjs';

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
    hide: 10, seek: 60, pingEvery: 15, droneAt: 10, scopeAt: 5, size: 3
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

  const plaza = makeWorld({ size: 3 }).npcs;
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
