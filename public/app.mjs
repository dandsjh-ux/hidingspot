import { CELL, DIRECTIONS, makeWorld, blockAt, clamp, distance, direction, clearSight, eye, atHeight, occupied, stepBody, npcPose, insideOf } from './world.mjs';

const $ = id => document.getElementById(id);
const button = (text, className, action) => {
  const item = document.createElement('button');
  item.textContent = text; item.className = className; item.type = 'button'; item.addEventListener('click', action);
  return item;
};
const socket = window.io();
const screens = ['landing', 'room-screen', 'game'];
const invite = new URL(location.href).searchParams.get('room')?.toUpperCase() || '';
const getPref = (key, fallback = '') => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const savePref = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
let identity, room, scene, world, state, predicted, activeRound = 0, simulation = false, names = new Map();
let localLobby = false, settingsDirty = false, currentClue, clueTimeout, noticeTimeout, statusTimeout, lastPing = 0;
let joinMode = !!invite, noPointerLock = !('pointerLockElement' in document), building = false, buildNumber = 0;
let clockOffset = 0, clockKnown = false, lastWatched = 0, watchedBefore = 0;
let seq = 0, lastSent = 0, lastUI = 0, lastFrame = 0, fpsStart = 0, fpsFrames = 0, fpsApplied = false;
let stance = 0, yaw = 0, pitch = 0, stick = { side: 0, forward: 0 }, stickId = null, lookPointer = null, touchRun = false;
const keys = new Set(), pending = new Map(), maps = new Map();
const coarse = matchMedia('(pointer: coarse)');
const quality = $('quality'), mode = $('input-mode');
quality.value = getPref('hs-quality', coarse.matches ? 'low' : 'medium');
mode.value = getPref('hs-mode', 'auto');
$('screen-name').value = getPref('hs-nickname');
$('room-input').value = invite;
const touch = () => mode.value === 'touch' || (mode.value === 'auto' && coarse.matches);
const live = () => room?.phase === 'hide' || room?.phase === 'seek';
const amHost = () => room?.host === identity?.id;
const currentDialog = () => document.querySelector('dialog[open]');
const hasLock = () => !!document.pointerLockElement;
const active = () => simulation && socket.connected && !!state && !state.paused && !currentDialog() &&
  (state.self.role === 'hider' || (state.self.role === 'seeker' && state.phase === 'seek'));
const clock = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
const words = value => value[0].toUpperCase() + value.slice(1);

function show(which) {
  screens.forEach(id => { $(id).hidden = id !== which; });
}
function messaging(el, message) {
  el.hidden = !message;
  el.textContent = message;
}
function entryMode(next) {
  joinMode = next;
  $('room-field').hidden = !joinMode;
  $('room-input').required = joinMode;
  $('entry-main').firstChild.textContent = joinMode ? 'Join room ' : 'Create room ';
  $('entry-alternate').textContent = joinMode ? 'Create a room' : 'Join a room';
  messaging($('entry-error'), '');
}
entryMode(joinMode);
$('entry-alternate').onclick = () => {
  entryMode(!joinMode);
  if (joinMode) $('room-input').focus();
};
$('room-input').oninput = () => { $('room-input').value = $('room-input').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
function rpc(event, data) {
  return new Promise(resolve => {
    if (!socket.connected) { resolve({ error: 'Connecting to the server. Try again in a moment.' }); return; }
    socket.timeout(4500).emit(event, data, (err, response) => resolve(err ? { error: 'The server took too long to reply.' } : response || {}));
  });
}
$('entry-form').onsubmit = async event => {
  event.preventDefault();
  const entry = $('entry-main'), name = $('screen-name').value;
  entry.disabled = true;
  const result = await rpc(joinMode ? 'join-room' : 'create-room', { name, code: $('room-input').value });
  entry.disabled = false;
  messaging($('entry-error'), result.error);
  if (!result.error) savePref('hs-nickname', name);
};
function session(data) {
  try {
    if (data) sessionStorage.setItem('hs-session', JSON.stringify(data));
    else sessionStorage.removeItem('hs-session');
  } catch {}
}
function priorSession() {
  try { return JSON.parse(sessionStorage.getItem('hs-session')); } catch { return null; }
}
socket.on('connect', async () => {
  const old = priorSession();
  if (!old || (invite && old.code !== invite && !identity)) return;
  const result = await rpc('resume-room', old);
  if (result.error) {
    session(null);
    if (identity) leaveUI(result.error);
  } else {
    notify('Back in the room.');
  }
});
socket.on('identity', data => {
  identity = data; session(data); predicted = null; pending.clear();
});
socket.on('disconnect', () => {
  resetInput();
  if (room && live()) notify('Connection lost. Reconnecting…', 10000);
  else if (room) messaging($('room-error'), 'Connection lost. Reconnecting…');
});
socket.on('departed', leaveUI);
function leaveUI(message = '') {
  identity = room = state = world = predicted = null;
  activeRound = 0; building = simulation = false; localLobby = false; settingsDirty = false; buildNumber++;
  session(null); resetInput(); currentDialog()?.close(); closeClue();
  document.exitPointerLock?.();
  if (new URL(location.href).searchParams.has('room')) history.replaceState({}, '', location.pathname);
  entryMode(false); show('landing'); messaging($('entry-error'), message);
}
document.querySelectorAll('[data-leave]').forEach(el => el.onclick = () => {
  if (socket.connected) socket.emit('leave-room');
  leaveUI();
});

const groups = [
  ['Round and room', [
    ['seekers', 'Maximum seekers', 1, 5], ['size', 'Town size', [[5, 'Full town · 25 blocks'], [3, 'Compact town · 9 blocks']]],
    ['hide', 'Hide time (seconds)', 10, 150], ['seek', 'Seek time (seconds)', 60, 900],
    ['hiderMode', 'Choose the hider', [['rotate', 'Rotate each round'], ['random', 'Random'], ['pick', 'Host chooses']]],
    ['chosen', 'Selected hider', 'players'],
    ['moveHider', 'Hider can move during the search', 'check'], ['sprint', 'Allow running', 'check'],
    ['locked', 'Lock room to new players', 'check'], ['seed', 'Town variation seed', 1, 2147483647]
  ]],
  ['Villagers and vocabulary', [
    ['npc', 'Villagers give clues', 'check'], ['walkers', 'Villagers walk around', 'check'], ['witnessRadius', 'Villager sight radius (metres)', 3, 14],
    ['clues', 'Clue difficulty', [['simple', 'Simple places'], ['describe', 'Descriptive phrases']]]
  ]],
  ['Search circles', [
    ['pings', 'Show search circles', 'check'], ['pingEvery', 'Time between pings (seconds)', 15, 180],
    ['pingRadius', 'Search circle radius (metres)', 12, 55]
  ]],
  ['Seeker equipment', [
    ['scope', 'Binoculars', 'check'], ['scopeAt', 'Binocular unlock (seconds into search)', 5, 600],
    ['drone', 'Drone', 'check'], ['droneAt', 'Drone unlock (seconds into search)', 10, 600],
    ['droneSeconds', 'Drone flight time (seconds)', 8, 35], ['droneCooldown', 'Drone recharge (seconds)', 15, 150]
  ]]
];
function settingsForm() {
  if (settingsDirty && amHost()) {
    // Keep an in-progress edit when another player arrives. Refresh names only.
    const picker = $('settings-form').elements.chosen;
    if (picker) playerOptions(picker, picker.value);
    return;
  }
  const root = $('settings'), opened = [...root.querySelectorAll('details')].map(item => item.open);
  root.replaceChildren();
  $('settings-title').textContent = amHost() ? 'Host controls' : 'Round settings';
  for (const [i, [label, fields]] of groups.entries()) {
    const section = document.createElement('details'), summary = document.createElement('summary'), grid = document.createElement('div');
    section.open = opened[i] ?? (i === 0);
    summary.textContent = label; grid.className = 'setting-items'; section.append(summary, grid); root.append(section);
    for (const [name, title, type, max] of fields) {
      const wrap = document.createElement('label');
      const select = Array.isArray(type) || type === 'players';
      const input = document.createElement(select ? 'select' : 'input');
      input.name = name; input.disabled = !amHost();
      if (type === 'check') {
        input.type = 'checkbox'; input.checked = room.settings[name];
        wrap.className = 'check'; wrap.append(input, title);
      } else {
        if (type === 'players') playerOptions(input, room.settings.chosen);
        else if (select) {
          for (const [value, option] of type) input.add(new Option(option, value));
          input.value = room.settings[name];
        } else {
          input.type = 'number'; input.min = name === 'seekers' ? Math.max(type, room.players.length - 1) : type;
          input.max = max; input.value = room.settings[name]; input.required = true;
        }
        wrap.append(title, input);
      }
      grid.append(wrap);
    }
  }
}
function playerOptions(select, value) {
  select.replaceChildren(new Option('Choose a player', ''));
  for (const member of room.players.filter(p => p.online)) select.add(new Option(member.name, member.id));
  select.value = value;
}
function renderLobby() {
  if (!room || !identity) return;
  const players = room.players, connected = players.filter(p => p.online).length;
  $('room-code').textContent = room.code;
  $('capacity').textContent = players.length + ' / ' + (room.settings.seekers + 1);
  const roster = $('roster');
  roster.replaceChildren();
  for (const player of players) {
    const row = document.createElement('li'), dot = document.createElement('span'), name = document.createElement('b');
    dot.className = 'status-dot' + (player.online ? '' : ' off');
    name.textContent = player.name + (player.id === identity.id ? ' (you)' : '');
    row.append(dot, name);
    const details = document.createElement('small');
    details.textContent = !player.online ? 'Reconnecting' : player.id === room.host ? 'Host' : player.wins ? 'Wins ' + player.wins : '';
    row.append(details);
    if (amHost() && player.id !== identity.id) {
      if (player.online) row.append(button('Make host', 'ghost roster-action', () => host('transfer', { player: player.id })));
      row.append(button('Remove', 'ghost roster-action', () => host('kick', { player: player.id })));
    }
    roster.append(row);
  }
  $('game-summary').textContent = room.settings.size ** 2 + ' blocks · ' + clock(room.settings.hide * 1000) + ' to hide · ' + clock(room.settings.seek * 1000) + ' to seek';
  $('start').hidden = !amHost(); $('start').disabled = connected < 2;
  $('waiting').hidden = amHost() && connected >= 2;
  $('waiting').textContent = amHost() ? 'Invite at least one more player to start.' : 'Waiting for the host to start.';
  $('save-settings').hidden = !amHost();
  settingsForm();
}
async function host(action, extra = {}) {
  const result = await rpc('host', { action, ...extra });
  if (result.error) {
    if (live() || currentDialog()?.id === 'results') notify(result.error, 5000);
    else messaging($('room-error'), result.error);
  } else messaging($('room-error'), '');
  return !result.error;
}
async function saveSettings() {
  if (!amHost() || !$('settings-form').reportValidity()) return false;
  const values = {};
  for (const el of $('settings-form').elements) {
    if (el.name) values[el.name] = el.type === 'checkbox' ? el.checked :
      el.type === 'number' || el.name === 'size' ? Number(el.value) : el.value;
  }
  settingsDirty = false;
  const saved = await host('settings', { settings: values });
  $('save-status').textContent = saved ? 'Settings saved' : '';
  if (!saved) settingsDirty = true;
  return saved;
}
$('settings-form').oninput = () => { settingsDirty = true; $('save-status').textContent = 'Unsaved changes'; };
$('settings-form').onsubmit = event => { event.preventDefault(); saveSettings(); };
async function start() {
  if (settingsDirty && !(await saveSettings())) return;
  await host('start');
}
$('start').onclick = start;
$('result-next').onclick = start;
$('result-lobby').onclick = () => { localLobby = true; currentDialog()?.close(); show('room-screen'); renderLobby(); };
$('pause').onclick = async () => { if (await host('pause')) $('menu').close(); };
$('end-round').onclick = () => host('end');
$('copy').onclick = async () => {
  if (!room) return;
  const url = new URL(location.href); url.searchParams.set('room', room.code);
  const item = $('copy');
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url.href);
    item.textContent = 'Copied!';
  } catch {
    const input = document.createElement('input'); input.value = url.href; input.readOnly = true;
    item.replaceWith(input); input.focus(); input.select();
    input.onblur = () => input.replaceWith(item);
  }
  setTimeout(() => { item.textContent = 'Copy invite'; }, 1600);
};

socket.on('room', update => {
  const previous = room?.phase;
  room = update;
  if (!amHost()) settingsDirty = false;
  names = new Map(room.players.map(p => [p.id, p.name]));
  if (live()) {
    if (activeRound !== room.round) enterRound();
    else if (previous === 'hide' && room.phase === 'seek') {
      transient(state?.self.role === 'hider' ? 'The seekers are coming.' : 'Find the hider. Ask a villager for a clue.');
    }
  } else {
    simulation = false;
    resetInput();
    document.exitPointerLock?.();
    if (room.phase === 'end' && !localLobby && activeRound === room.round) {
      show('game'); results();
    } else {
      currentDialog()?.close();
      show('room-screen'); renderLobby();
    }
  }
});
async function enterRound() {
  const ticket = ++buildNumber;
  activeRound = room.round; localLobby = false; building = true; simulation = false;
  state = predicted = null; pending.clear(); maps.clear();
  lastPing = seq = lastSent = 0; clockKnown = false; watchedBefore = 0;
  lastUI = lastFrame = 0;
  yaw = pitch = stance = 0; fpsFrames = fpsStart = 0; fpsApplied = false;
  resetInput(); currentDialog()?.close(); closeClue();
  $('center-status').hidden = true; $('game-notice').hidden = true;
  $('ping-readout').hidden = true; $('drone-readout').hidden = true;
  $('map-button').disabled = true;
  show('game');
  $('game').classList.toggle('touch', touch());
  blockScreen('LOADING TOWN', 'Opening the gates', 'The town will appear in a moment.');
  try {
    const { View } = await import('./scene.mjs');
    if (ticket !== buildNumber || !live() || room.round !== activeRound) return;
    const next = makeWorld(room.settings);
    if (!scene) scene = new View($('view'), quality.value);
    const changed = !world || world.seed !== next.seed || world.size !== next.size || room.settings.npc !== world.hasNPC || next.walkers !== world.walkers;
    world = next; world.hasNPC = room.settings.npc;
    if (changed) scene.prepare(world, room.settings.npc);
    else { scene.eye = null; scene.wasDrone = false; }
    building = false; simulation = true;
    $('map-button').disabled = false;
    $('run').hidden = !room.settings.sprint;
    $('host-live').hidden = !amHost();
  } catch (error) {
    console.error(error);
    blockScreen('GRAPHICS UNAVAILABLE', 'The town could not load', 'Try a browser with WebGL 2. Use the game menu to leave the room.');
  }
}
function blockScreen(kicker, title, text) {
  $('blocked-view').hidden = false;
  $('blocked-kicker').textContent = kicker; $('blocked-title').textContent = title; $('blocked-text').textContent = text;
}
socket.on('state', next => {
  if (!live() || next.round !== activeRound) return;
  const previous = state;
  state = { ...next, arrived: performance.now() };
  // Villagers walk on a clock the server shares, so everyone sees them in the same place.
  const sample = next.clock - state.arrived / 1000;
  if (!clockKnown || next.paused || Math.abs(sample - clockOffset) > 0.6) { clockOffset = sample; clockKnown = true; }
  else clockOffset += (sample - clockOffset) * (sample > clockOffset ? 0.3 : 0.05);
  if (!predicted) {
    predicted = { ...next.self };
    yaw = next.self.yaw; stance = next.self.stance;
  } else if (world && !building) {
    const old = pending.get(next.seq);
    const discrepancy = old ? distance(next.self, old) : distance(next.self, predicted);
    if (next.paused || next.drone || discrepancy > 2.1 || previous?.drone) {
      Object.assign(predicted, next.self);
    } else if (old && discrepancy > 0.025) {
      const x = predicted.x + clamp(next.self.x - old.x, -0.34, 0.34) * 0.47;
      const z = predicted.z + clamp(next.self.z - old.z, -0.34, 0.34) * 0.47;
      if (!occupied(world, x, z, predicted.stance)) { predicted.x = x; predicted.z = z; }
    } else if (!old && discrepancy > 0.26) {
      const x = predicted.x + (next.self.x - predicted.x) * 0.4;
      const z = predicted.z + (next.self.z - predicted.z) * 0.4;
      if (!occupied(world, x, z, predicted.stance)) { predicted.x = x; predicted.z = z; }
    }
    if (predicted.stance !== next.self.stance && !active()) predicted.stance = next.self.stance;
  }
  for (const key of pending.keys()) if (key < next.seq - 4) pending.delete(key);
  if (next.ping?.id && next.ping.id !== lastPing) {
    lastPing = next.ping.id;
    transient('Search circle updated. Check your map.');
  }
});
socket.on('notice', notify);
socket.on('clue', data => {
  currentClue = data;
  $('speaker').textContent = data.speaker + ' · ' + (data.role || 'villager');
  const paragraph = $('clue-text');
  paragraph.replaceChildren();
  let position = 0;
  for (const term of data.terms) {
    const index = data.text.indexOf(term, position);
    if (index < 0) continue;
    const mark = document.createElement('mark'); mark.textContent = term;
    paragraph.append(data.text.slice(position, index), mark);
    position = index + term.length;
  }
  paragraph.append(data.text.slice(position));
  $('clue-age').textContent = data.age == null ? 'No sighting' : data.age < 5 ? 'Just now' : clock(data.age * 1000) + ' ago';
  $('listen').hidden = !('speechSynthesis' in window);
  $('clue').hidden = false;
  clearTimeout(clueTimeout); clueTimeout = setTimeout(closeClue, 19000);
});
function closeClue() { $('clue').hidden = true; currentClue = null; clearTimeout(clueTimeout); }
$('clue-close').onclick = closeClue;
$('listen').onclick = () => {
  if (!currentClue || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const phrase = new SpeechSynthesisUtterance(currentClue.text); phrase.lang = 'en-GB'; phrase.rate = 0.83;
  speechSynthesis.speak(phrase);
};
function notify(text, duration = 2700) {
  if ($('game').hidden) return;
  messaging($('game-notice'), text);
  clearTimeout(noticeTimeout); noticeTimeout = setTimeout(() => messaging($('game-notice'), ''), duration);
}
function transient(text) {
  messaging($('center-status'), text);
  clearTimeout(statusTimeout); statusTimeout = setTimeout(() => messaging($('center-status'), ''), 3300);
}

const quiz = [
  ['“Look under the stall.” Where should you look?', ['Below it', 'Above it', 'Far away'], 0, 'Under means below something.'],
  ['On the town map, which way is east?', ['Up', 'Right', 'Left'], 1, 'East is to the right when north is up.'],
  ['“Look near the striped stall.” What does striped mean?', ['Covered in spots', 'Made of stone', 'With bands of colour'], 2, 'Something striped has bands of colour.'],
  ['“Walk across the bridge.” Where will you finish?', ['On the other side', 'Below it', 'Behind the bridge'], 0, 'Across means from one side to the other.'],
  ['“Look behind the hedge.” Where is the hiding place?', ['High above it', 'At the back of it', 'In front of it'], 1, 'Behind means at the back of something.'],
  ['Where can you find a shady spot?', ['Under a tree', 'In bright sun', 'Above the clouds'], 0, 'A shady place is out of the sunlight.']
];
function results() {
  const current = room.result;
  if (!current) return;
  $('result-title').textContent = current.winner === 'hider' ? 'The hider wins' : current.winner === 'seeker' ? 'The seekers win' : 'Round finished';
  $('result-text').textContent = current.message;
  const self = room.players.find(p => p.id === identity?.id);
  const noun = self?.clues === 1 ? 'clue' : 'clues';
  $('result-stats').textContent = 'Hider: ' + current.hider + (self?.role === 'seeker' ? ' · You collected ' + self.clues + ' ' + noun : '');
  $('result-next').hidden = !amHost();
  $('result-next').disabled = room.players.filter(p => p.online).length < 2;
  if (!$('results').open) {
    const [question, answers, correct, feedback] = quiz[(room.round - 1) % quiz.length];
    $('practice-question').textContent = question;
    $('practice-feedback').textContent = '';
    $('answers').replaceChildren();
    answers.forEach((answer, index) => $('answers').append(button(answer, 'ghost compact', event => {
      $('practice-feedback').textContent = index === correct ? 'Correct. ' + feedback : 'Try again.';
      if (index === correct) {
        event.currentTarget.classList.add('correct');
        for (const el of $('answers').children) el.disabled = true;
      }
    })));
    openDialog('results');
  }
}
function openDialog(id) {
  if ($(id).open) return;
  if (id === 'map' && (!world || building)) return;
  currentDialog()?.close();
  if (hasLock()) document.exitPointerLock?.();
  resetInput();
  if (id === 'menu') {
    $('host-live').hidden = !amHost() || !live();
    $('pause').textContent = state?.paused ? 'Resume round' : 'Pause round';
  }
  $(id).showModal();
  if (id === 'map') drawMap($('large-map'), true);
}
document.querySelectorAll('[data-open]').forEach(el => el.onclick = () => openDialog(el.dataset.open));
document.querySelectorAll('[data-close]').forEach(el => el.onclick = () => el.closest('dialog').close());
$('results').addEventListener('cancel', event => event.preventDefault());
quality.onchange = () => { savePref('hs-quality', quality.value); scene?.quality(quality.value); };
mode.onchange = () => {
  savePref('hs-mode', mode.value); $('game').classList.toggle('touch', touch()); resetInput();
};
coarse.addEventListener('change', () => $('game').classList.toggle('touch', touch()));

function resetInput() {
  keys.clear(); stick = { side: 0, forward: 0 }; stickId = lookPointer = null; touchRun = false;
  $('stick').style.transform = ''; $('run').setAttribute('aria-pressed', 'false');
}
window.addEventListener('blur', resetInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
const forwards = ['w', 'arrowup'], backwards = ['s', 'arrowdown'], left = ['a', 'arrowleft'], right = ['d', 'arrowright'];
const movementKeys = [...forwards, ...backwards, ...left, ...right, 'shift'];
const held = set => set.some(k => keys.has(k));
document.addEventListener('keydown', event => {
  if (!live()) return;
  const key = event.key.toLowerCase();
  if (key === 'escape' && hasLock()) {
    document.exitPointerLock?.();
    return;
  }
  if (key === 'p' && !event.repeat && !currentDialog()) {
    event.preventDefault();
    openDialog('menu');
    return;
  }
  if (currentDialog()) {
    if (key === 'm' && $('map').open) { event.preventDefault(); $('map').close(); }
    return;
  }
  if (movementKeys.includes(key)) {
    keys.add(key); event.preventDefault();
    return;
  }
  if (event.repeat || !['z', 'c', 'e', 'b', 'f', 'm'].includes(key)) return;
  event.preventDefault();
  if (key === 'c') changeStance(1);
  if (key === 'z') changeStance(2);
  if (key === 'e') interact();
  if (key === 'b') tool('scope');
  if (key === 'f') tool('drone');
  if (key === 'm') openDialog('map');
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
function changeStance(value) {
  if (!active() || state.drone) return;
  const next = stance === value ? 0 : value;
  if (predicted && occupied(world, predicted.x, predicted.z, next)) {
    notify('Move out from under the cover first.');
    return;
  }
  stance = next;
}
function aimMove(x, y, multiplier) {
  yaw -= x * multiplier;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  pitch = clamp(pitch - y * multiplier, -1.39, 1.39);
}
document.addEventListener('mousemove', event => {
  if (hasLock() && active() && !state.drone) aimMove(event.movementX, event.movementY, 0.00235);
});
document.addEventListener('pointerlockchange', () => {
  if (!hasLock()) resetInput();
});
document.addEventListener('pointerlockerror', () => {
  noPointerLock = true; notify('Drag the town view to look around.', 4500);
});
function capture() {
  if (touch() || noPointerLock || !live() || currentDialog()) return;
  try {
    const request = $('look-zone').requestPointerLock();
    request?.catch(() => {
      noPointerLock = true; notify('Drag the town view to look around.', 4500);
    });
  } catch {
    noPointerLock = true;
  }
}
$('capture').onclick = capture;
const lookArea = $('look-zone');
lookArea.addEventListener('pointerdown', event => {
  if (!active() || state.drone || (lookPointer && lookPointer.id !== event.pointerId)) return;
  if (event.pointerType === 'mouse' && !touch() && !noPointerLock) { capture(); return; }
  lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  lookArea.setPointerCapture(event.pointerId);
});
lookArea.addEventListener('pointermove', event => {
  if (lookPointer?.id !== event.pointerId) return;
  if (active() && !state.drone) aimMove(event.clientX - lookPointer.x, event.clientY - lookPointer.y, 0.005);
  lookPointer.x = event.clientX; lookPointer.y = event.clientY;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  lookArea.addEventListener(type, event => { if (event.pointerId === lookPointer?.id) lookPointer = null; });
}
const pad = $('touch-pad'), knob = $('stick');
function dragStick(event) {
  const rect = pad.getBoundingClientRect(), radius = rect.width * 0.36;
  const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
  const scale = Math.max(radius, Math.hypot(x, y));
  stick = { side: x / scale, forward: -y / scale };
  knob.style.transform = 'translate(' + stick.side * radius + 'px,' + -stick.forward * radius + 'px)';
}
pad.onpointerdown = event => {
  if (stickId !== null || !active()) return;
  stickId = event.pointerId; pad.setPointerCapture(stickId); dragStick(event);
};
pad.onpointermove = event => { if (event.pointerId === stickId) dragStick(event); };
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, event => {
  if (event.pointerId !== stickId) return;
  stickId = null; stick = { side: 0, forward: 0 }; knob.style.transform = '';
});
$('run').onclick = () => { touchRun = !touchRun; $('run').setAttribute('aria-pressed', touchRun); };
$('crouch').onclick = () => changeStance(1);
$('prone').onclick = () => changeStance(2);
$('scope').onclick = () => tool('scope');
$('drone').onclick = () => tool('drone');
$('action-button').onclick = () => interact();
function tool(which) {
  if (!active() || state.self.role !== 'seeker' || state.phase !== 'seek') return;
  const wait = state[which + 'Gate'];
  if (wait == null) return;
  if (wait > 0 && !state[which]) { notify('Ready in ' + clock(wait) + '.'); return; }
  socket.emit('action', { action: 'tool', tool: which });
}
function input() {
  const enabled = active();
  const side = enabled ? clamp(Number(held(right)) - Number(held(left)) + stick.side, -1, 1) : 0;
  const forward = enabled ? clamp(Number(held(forwards)) - Number(held(backwards)) + stick.forward, -1, 1) : 0;
  return { side, forward, run: enabled && (keys.has('shift') || touchRun), yaw, pitch, stance };
}
function send(command, reliable = false) {
  if (!socket.connected) return;
  const next = ++seq;
  pending.set(next, predicted ? { x: predicted.x, z: predicted.z } : { x: 0, z: 0 });
  if (pending.size > 64) pending.delete(pending.keys().next().value);
  (reliable ? socket : socket.volatile).emit('input', { ...command, seq: next });
}
const npcClock = now => state.paused ? state.clock : now / 1000 + clockOffset;
function targets() {
  if (!world || !active() || state.drone || state.phase !== 'seek' || state.self.role !== 'seeker') return {};
  const look = p => {
    const dx = p.x - predicted.x, dz = p.z - predicted.z;
    const len = Math.hypot(dx, dz);
    return { len, angle: (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / Math.max(len, 0.01) };
  };
  const hider = state.others.find(p => p.role === 'hider');
  if (hider) {
    const { len, angle } = look(hider);
    if (len <= 2.9 && (angle > 0.06 || len < 0.75)) return { tag: true };
  }
  let best, bestScore = -Infinity;
  const clock = npcClock(performance.now());
  if (state.npcEnabled) for (const npc of world.npcs) {
    const where = npcPose(npc, clock, world.walkers);
    const { len, angle } = look(where);
    if (len > 4.2 || (angle < 0.05 && len > 2.2) || !clearSight(world, eye(predicted), atHeight(where, 1.42))) continue;
    const score = angle * 3 - len * 0.3;
    if (score > bestScore) { bestScore = score; best = npc; }
  }
  return { npc: best };
}
function interact() {
  if (!active() || state.phase !== 'seek' || state.self.role !== 'seeker' || state.drone) return;
  const { tag, npc } = targets();
  send(input(), true);
  socket.emit('action', { action: 'interact', mode: tag || !npc ? 'tag' : 'talk', npc: npc?.id });
}

const mapColors = {
  vineyard: '#88905e', gate: '#aa997a', tower: '#b29975', houses: '#a68865', orchard: '#889463',
  pottery: '#a9876f', church: '#b3a284', blue: '#849592', laundry: '#a78173', arcade: '#b09a77',
  market: '#b78365', plaza: '#c1aa81', garden: '#85966c', canal: '#74938a', bakery: '#a58b6a',
  rose: '#ad817c', school: '#939a7a', terrace: '#998e70', clock: '#b2a180', cafe: '#a98f7b'
};
function drawMap(canvas, large) {
  if (!world || !predicted) return;
  const size = canvas.width, pad = size * 0.06, span = size - pad * 2, unit = span / (world.bound * 2), k = size / 560;
  const x = value => pad + (value + world.bound) * unit, z = x;
  const ctx = canvas.getContext('2d');
  if (!maps.has(size)) {
    const background = document.createElement('canvas'); background.width = background.height = size;
    const map = background.getContext('2d');
    map.fillStyle = '#252f24'; map.fillRect(0, 0, size, size);
    map.fillStyle = '#414737'; map.fillRect(pad, pad, span, span);
    map.textAlign = 'center'; map.textBaseline = 'middle'; map.lineJoin = 'round';
    for (const block of world.blocks) {
      const dx = x(block.x), dz = z(block.z), dim = CELL * 0.81 * unit;
      map.fillStyle = mapColors[block.type];
      map.beginPath(); map.roundRect(dx - dim / 2, dz - dim / 2, dim, dim, large ? 5 : 2); map.fill();
    }
    // Buildings: named ones are light. Gold ones have an open door, so a hider can go inside.
    for (const o of world.objects) {
      if (o.kind !== 'building') continue;
      const w = o.w * unit, d = o.d * unit, cx = x(o.x), cz = z(o.z);
      map.fillStyle = o.enter ? '#efcf7c' : o.name ? '#ddc89c' : '#8a7a5c';
      map.fillRect(cx - w / 2, cz - d / 2, w, d);
      map.strokeStyle = o.enter ? '#7a5a1e' : '#4d4330'; map.lineWidth = large ? 1.2 * k : 0.8; map.strokeRect(cx - w / 2, cz - d / 2, w, d);
      if (o.enter) {
        const front = o.face === 0 ? 1 : -1, door = Math.max(o.enter.doorW * unit, large ? 6 * k : 3);
        map.fillStyle = '#2a2417';
        map.fillRect(cx - door / 2, cz + front * d / 2 - (large ? 2 * k : 1.5), door, large ? 4 * k : 3);
      }
    }
    if (large) {
      const bFont = Math.round(Math.max(11, Math.min(19, unit * 2.9)) * k), dFont = Math.round(Math.max(10, Math.min(23, unit * 3.1)) * k);
      for (const o of world.objects) {
        if (o.kind !== 'building' || !o.name) continue;
        const label = o.short || o.name, words = label.split(' '), cx = x(o.x), cz = z(o.z) - (o.tower ? o.d * unit / 2 + bFont * 0.75 : 0);
        const lines = words.length > 1 && label.length > 8 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [label];
        map.font = '800 ' + bFont + 'px system-ui, sans-serif';
        lines.forEach((line, i) => {
          const yy = cz + (i - (lines.length - 1) / 2) * bFont * 1.05;
          map.lineWidth = 3.2 * k; map.strokeStyle = '#2a2417e6'; map.strokeText(line, cx, yy, Math.max(o.w * unit * 1.5, 50 * k));
          map.fillStyle = o.enter ? '#ffe9a8' : '#fff6de'; map.fillText(line, cx, yy, Math.max(o.w * unit * 1.5, 50 * k));
        });
      }
      // District names sit in the street below each block
      map.font = '700 ' + dFont + 'px system-ui, sans-serif'; map.fillStyle = '#f0dca8';
      for (const block of world.blocks) {
        map.fillText(block.name.toUpperCase(), x(block.x), z(block.z) + CELL * 0.405 * unit + (CELL * 0.095 * unit) * 0.95, CELL * 0.97 * unit);
      }
    }
    map.textAlign = 'center'; map.textBaseline = 'middle';
    map.font = '800 ' + (large ? 18 * k : 12) + 'px system-ui'; map.fillStyle = '#ead29d';
    map.fillText('N', size / 2, pad / 2 + (large ? 0 : 1));
    map.fillText('E', size - pad / 2, size / 2);
    if (large) {
      map.fillText('W', pad / 2, size / 2);
      map.fillText('S', size / 2, size - pad / 2);
    }
    map.strokeStyle = '#d3b98788'; map.strokeRect(pad, pad, span, span);
    maps.set(size, background);
  }
  ctx.drawImage(maps.get(size), 0, 0);
  const ping = state?.ping;
  if (ping) {
    ctx.save();
    ctx.beginPath(); ctx.rect(pad, pad, span, span); ctx.clip();
    ctx.beginPath(); ctx.arc(x(ping.x), z(ping.z), ping.radius * unit, 0, 6.283);
    ctx.fillStyle = '#fbc16e50'; ctx.fill(); ctx.strokeStyle = '#ffd186';
    ctx.setLineDash(large ? [7, 5] : [4, 3]); ctx.lineWidth = large ? 3 : 2; ctx.stroke(); ctx.restore();
  }
  for (const other of state?.others || []) {
    if (other.role !== 'seeker' || state.self.role !== 'seeker') continue;
    ctx.beginPath(); ctx.arc(x(other.x), z(other.z), large ? 4.8 : 2.5, 0, 6.283);
    ctx.fillStyle = '#a7e0d6'; ctx.fill(); ctx.strokeStyle = '#24453b'; ctx.stroke();
  }
  if (state?.drone) {
    ctx.strokeStyle = '#c9f3d0'; ctx.lineWidth = large ? 2.5 : 1.5;
    ctx.strokeRect(x(state.drone.x) - 3, z(state.drone.z) - 3, 6, 6);
  }
  if (state?.contact) {
    // Drone ping: pulsing heat rings that stay for ten seconds, dashed once the drone has lost the signal
    const c = state.contact, beat = (performance.now() / 900) % 1, base = large ? 7 : 4.5;
    ctx.save();
    ctx.strokeStyle = '#ff7a2e'; ctx.fillStyle = '#ff7a2e55'; ctx.lineWidth = large ? 3 : 2;
    if (!c.live) ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(x(c.x), z(c.z), base, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1 - beat; ctx.beginPath(); ctx.arc(x(c.x), z(c.z), base + beat * base * 2.4, 0, 6.283); ctx.stroke();
    ctx.restore();
  }
  if (state?.self.role === 'hider') {
    // A villager saw you five seconds ago. The alert sits on the villager who noticed.
    const at = npcClock(performance.now());
    for (const id of state.alerts || []) {
      const npc = world.npcs[id];
      if (!npc) continue;
      const where = npcPose(npc, at, world.walkers), r = large ? 11 : 6.5, pulse = 1 + Math.sin(performance.now() / 160) * 0.12;
      ctx.save(); ctx.translate(x(where.x), z(where.z)); ctx.scale(pulse, pulse);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283);
      ctx.fillStyle = '#f2a33a'; ctx.fill(); ctx.lineWidth = large ? 2 : 1.4; ctx.strokeStyle = '#2b1d0c'; ctx.stroke();
      ctx.fillStyle = '#2b1d0c'; ctx.font = '900 ' + Math.round(r * 1.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, r * 0.08);
      ctx.restore();
    }
  }
  ctx.save(); ctx.translate(x(predicted.x), z(predicted.z)); ctx.rotate(-yaw);
  const marker = large ? 10 : 6;
  ctx.beginPath(); ctx.moveTo(0, -marker); ctx.lineTo(marker * 0.65, marker * 0.7);
  ctx.lineTo(0, marker * 0.32); ctx.lineTo(-marker * 0.65, marker * 0.7); ctx.closePath();
  ctx.fillStyle = '#fff1c5'; ctx.fill(); ctx.lineWidth = large ? 2 : 1.4; ctx.strokeStyle = '#1f2a20'; ctx.stroke();
  ctx.restore();
  if (large) $('map-caption').textContent = (ping ? 'The gold circle shows a possible search area. ' : 'The arrow shows where you are facing. ') + 'Gold buildings have an open door: a hider can go inside.';
}
function nearBuilding() {
  const px = state.drone?.x ?? predicted.x, pz = state.drone?.z ?? predicted.z;
  const room = insideOf(world, px, pz);
  if (room) return 'Inside the ' + room.name;
  let best = '', shortest = 11;
  for (const b of world.buildings) {
    const gap = Math.hypot(Math.max(Math.abs(px - b.x) - b.w / 2, 0), Math.max(Math.abs(pz - b.z) - b.d / 2, 0));
    if (gap < shortest) { shortest = gap; best = 'Near the ' + b.name; }
  }
  return best;
}
function hud(time) {
  const self = state.self, isHide = state.phase === 'hide', isSeeker = self.role === 'seeker';
  const age = Math.min(350, time - state.arrived);
  const remaining = state.remaining - (state.paused ? 0 : age);
  $('timer').textContent = clock(remaining);
  $('timer').parentElement.classList.toggle('urgent', remaining < 15000);
  $('role-text').textContent = self.role.toUpperCase();
  $('phase-label').textContent = state.paused ? 'PAUSED' : isHide ? 'HIDE' : 'SEEK';
  const area = blockAt(world, state.drone?.x ?? predicted.x, state.drone?.z ?? predicted.z);
  $('place').textContent = area.name;
  const near = nearBuilding();
  $('near-building').hidden = !near; $('near-building').textContent = near;
  const facing = state.drone ? 'north' : direction(-Math.sin(yaw), -Math.cos(yaw));
  $('compass').textContent = words(facing);
  $('stance-readout').textContent = ['Standing', 'Crouching', 'Prone'][predicted.stance];
  const obscured = isHide && isSeeker;
  const waiting = self.role === 'waiting';
  if (waiting) blockScreen('ROUND IN PROGRESS', 'Watch the clock', 'You can play when the next round begins.');
  else if (state.paused) blockScreen('THE HOST PAUSED THE GAME', 'Round paused', 'The clock will continue when the host resumes.');
  else if (obscured) blockScreen('YOU ARE A SEEKER', 'Look away', 'Give the hider time to find a spot. Your view opens when this timer ends.');
  else $('blocked-view').hidden = true;
  $('capture').hidden = touch() || noPointerLock || hasLock() || obscured || waiting || state.paused || !!state.drone || !active();
  $('crouch').disabled = $('prone').disabled = !!state.drone || !active();
  $('crouch').setAttribute('aria-pressed', predicted.stance === 1);
  $('prone').setAttribute('aria-pressed', predicted.stance === 2);
  $('game').classList.toggle('drone-flight', !!state.drone);
  $('drone-readout').hidden = !state.drone;
  if (state.drone) $('drone-readout').textContent = 'Drone view · ' + clock(state.drone.left) + (state.contact?.live ? ' · HEAT SIGNATURE FOUND' : state.contact ? ' · Ping ' + clock(state.contact.left) : '');
  for (const [key, name] of [['scope', 'Binoculars'], ['drone', 'Drone']]) {
    const el = $(key), gate = state[key + 'Gate'], running = !!state[key];
    el.hidden = gate == null;
    el.disabled = state.paused || (key === 'scope' && !!state.drone) || (!running && gate > 0);
    el.classList.toggle('ready', gate === 0); el.classList.toggle('on', running);
    el.firstElementChild.textContent = running ? (key === 'drone' ? 'Land drone' : 'Lower binoculars') : name + (gate > 0 ? ' ' + clock(gate) : '');
  }
  const watched = state.alerts?.length || 0, hiderView = self.role === 'hider' && state.npcEnabled;
  $('ping-readout').hidden = hiderView ? watched === 0 : state.nextPing == null;
  $('ping-readout').classList.toggle('seen', hiderView && watched > 0);
  if (hiderView) {
    $('ping-readout').textContent = '! ' + watched + (watched === 1 ? ' villager saw you. Check your map.' : ' villagers saw you. Check your map.');
    if (watched > watchedBefore && time - lastWatched > 1000) { lastWatched = time; notify('! A villager saw you. Check your map.', 3200); }
    watchedBefore = watched;
  } else {
    $('ping-readout').textContent = state.ping ? 'Search near ' + state.ping.label : 'Search circle in ' + clock(state.nextPing);
  }
  const target = targets();
  const caption = target.tag ? 'Tag hider' : target.npc ? 'Ask ' + target.npc.name : '';
  $('game').classList.toggle('has-target', !!caption);
  $('action-button').hidden = !caption || !touch();
  $('action-button').textContent = caption;
  messaging($('aim-prompt'), !touch() && caption ? 'E · ' + caption : '');
  drawMap($('mini-map'), false);
  if ($('map').open) drawMap($('large-map'), true);
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!simulation || !live() || !predicted || !state || building) return;
  const dt = Math.min(0.056, Math.max(0.001, (now - (lastFrame || now - 16)) / 1000));
  lastFrame = now;
  const command = input();
  const seekerBlind = state.self.role === 'seeker' && state.phase === 'hide';
  const canWalk = active() && !state.drone && !(predicted.role === 'hider' && state.phase === 'seek' && !room.settings.moveHider);
  if (active() && !state.drone) stepBody(world, predicted, canWalk ? command : { ...command, side: 0, forward: 0 }, dt, room.settings.sprint);
  if (now - lastSent >= 34) { send(command); lastSent = now; }
  if (!seekerBlind && predicted.role !== 'waiting') {
    scene.draw(predicted, { yaw, pitch, walking: canWalk && Math.hypot(command.side, command.forward) > 0.1 }, state, now / 1000, dt, names, npcClock(now));
    if (!fpsStart) fpsStart = now;
    fpsFrames++;
    if (!fpsApplied && now - fpsStart > 5200) {
      fpsApplied = true;
      if (fpsFrames / ((now - fpsStart) / 1000) < 24 && !getPref('hs-quality') && quality.value === 'medium') {
        quality.value = 'low'; scene.quality('low');
        notify('Graphics switched to Low for smoother movement.');
      }
    }
  }
  if (now - lastUI > 84) { hud(now); lastUI = now; }
}
requestAnimationFrame(frame);
