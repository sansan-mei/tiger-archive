const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const C = require('../battle-core.js');
function setup() {
  const nodes = new Map();
  const element = () => ({ hidden: true, dataset: {}, children: [], textContent: '',
    addEventListener() {}, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; } });
  const $ = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../client/pve-ui.js'), 'utf8'), {
    window, document: { addEventListener() {}, createElement: element }, performance: { now: () => 0 },
  });
  let sounds = 0;
  const ui = window.TankClient.createPveUI({ C, $, choose() {}, onFormation: () => sounds++ });
  const state = { mode: 'pve', matchId: 'run', epoch: 1, status: 'playing', tick: 0,
    entities: [{ id: 'me', weaponType: 'pistol', alive: true }],
    pve: { choices: {}, choiceIds: {}, pending: {}, upgrades: { me: {}, other: {} },
      level: 1, xp: 0, wave: 1, teamSize: 1, queue: 0, boss: { stage: 0 } } };
  return { ui, $, state, sounds: () => sounds };
}
test('confirmed personal ultimate celebrates once, expires, and survives weapon switches in summary', () => {
  const { ui, $, state, sounds } = setup();
  ui.update(state, 'me', 0);
  state.pve.upgrades.other.thunder = 1;
  ui.update(state, 'me', 10);
  assert.equal(sounds(), 0);
  state.pve.upgrades.me.thunder = 1;
  ui.update(state, 'me', 20);
  assert.equal(sounds(), 1);
  assert.equal($('pve-formation').hidden, false);
  assert.match($('pve-formation-title').textContent, /雷电流成型 · 雷神降临/);
  assert.match($('pve-formation-detail').textContent, /最后一发/);
  ui.update(state, 'me', 21);
  assert.equal(sounds(), 1);
  ui.update(state, 'me', 5020);
  assert.equal($('pve-formation').hidden, true);
  state.entities[0].weaponType = 'rocket';
  ui.update(state, 'me', 5030);
  assert.match($('pve-formed').textContent, /换回对应武器/);
  assert.match(ui.summary(state, 'me'), /雷电流 · 雷神降临/);
  state.epoch++;
  state.pve.upgrades.me = {};
  ui.update(state, 'me', 5040);
  assert.equal($('pve-formed').hidden, true);
  assert.match(ui.summary(state, 'me'), /尚未/);
});
test('initial snapshot restores all five completed routes without replaying celebration', () => {
  const { ui, $, state, sounds } = setup();
  for (const key of ['thunder', 'judgment', 'metalStorm', 'stellar', 'doomsday']) state.pve.upgrades.me[key] = 1;
  ui.update(state, 'me', 0);
  assert.equal(sounds(), 0);
  assert.equal($('pve-formation').hidden, true);
  for (const name of ['雷电流', '重炮流', '压制流', '光棱流', '核爆流']) assert.ok(ui.summary(state, 'me').includes(name));
  state.mode = 'pvp';
  ui.update(state, 'me', 10);
  assert.equal($('pve-formed').hidden, true);
});
test('ultimate cards are distinguished and ending the run clears the toast', () => {
  const { ui, $, state } = setup();
  state.pve.choices.me = ['thunder', 'pierce', 'pistol'];
  state.pve.choiceIds.me = 1;
  state.pve.pending.me = 1;
  ui.update(state, 'me', 0);
  const cards = $('pve-choices').children;
  assert.equal(cards[0].dataset.ultimate, 'true');
  assert.match(cards[0].children[0].textContent, /终极进阶/);
  assert.equal(cards[1].dataset.ultimate, undefined);
  state.pve.upgrades.me.thunder = 1;
  ui.update(state, 'me', 10);
  state.status = 'finished';
  ui.update(state, 'me', 20);
  assert.equal($('pve-formation').hidden, true);
});
test('formation cue respects suspended audio and releases its three short notes', () => {
  const window = {}, oscillators = [], gains = [];
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const audio = { state: 'suspended', currentTime: 3, destination: {},
    createOscillator() { const node = { frequency: param(), connect() {},
      start(at) { this.started = at; }, stop(at) { this.stopped = at; },
      disconnect() { this.released = true; } }; oscillators.push(node); return node; },
    createGain() { const node = { gain: param(), connect() {}, disconnect() { this.released = true; } }; gains.push(node); return node; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../client/effects.js'), 'utf8'), { window });
  const effects = window.TankClient.createEffects({ getAudio: () => audio });
  effects.formationSound();
  assert.equal(oscillators.length, 0);
  audio.state = 'running';
  effects.formationSound();
  assert.equal(oscillators.length, 3);
  oscillators.forEach((node, i) => {
    assert.equal(node.started, 3 + i * 0.1);
    assert.ok(node.stopped - node.started < 0.5);
    node.onended();
    assert.equal(node.released, true);
    assert.equal(gains[i].released, true);
  });
});
