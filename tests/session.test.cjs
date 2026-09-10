const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../battle-core.js"),
  S = require("../battle-session.js");
const humans = () =>
  C.defaultParticipants().map((p) => ({ ...p, controller: "human" }));
function setup() {
  const a = new S.Authority({ participants: humans(), matchId: "test-match" }),
    clients = [];
  a.battle.start();
  for (let i = 0; i < 8; i++) {
    const peer = "peer" + i,
      welcome = a.attach(peer, a.battle.entities[i].id),
      r = new S.Replica();
    r.welcome(welcome);
    clients.push({ peer, welcome, r, seq: 0 });
  }
  return { a, clients };
}
function input(a, c, value = {}, extra = {}) {
  return {
    version: C.VERSION,
    type: "input",
    matchId: a.battle.matchId,
    epoch: a.battle.epoch,
    connection: c.welcome.connection,
    seq: c.seq++,
    clientTick: a.battle.tick + 1,
    input: value,
    ...extra,
  };
}
test("eight separately bound clients receive the same authoritative match", () => {
  const { a, clients } = setup();
  for (let tick = 0; tick < 90; tick++) {
    clients.forEach((c, i) =>
      assert.equal(
        a.receive(
          c.peer,
          input(a, c, { left: i % 2 === 0, right: i % 2 !== 0 }),
        ).ok,
        true,
      ),
    );
    a.step();
    const packet = JSON.stringify(a.statePacket());
    clients.forEach((c) => assert.equal(c.r.receive(packet).ok, true));
  }
  clients.forEach((c) => assert.deepEqual(c.r.current, a.battle.snapshot()));
  assert.notEqual(
    clients[0].r.current.entities[0].heading,
    clients[0].r.current.entities[1].heading,
  );
});
test("a peer cannot claim another entity or submit hp / weapon state", () => {
  const { a, clients } = setup(),
    c = clients[0];
  assert.equal(
    a.receive(c.peer, input(a, c, { fire: true }, { entityId: "bot1" })).ok,
    false,
  );
  assert.equal(a.receive(c.peer, input(a, c, { hp: 999 })).ok, false);
  assert.equal(a.receive("stranger", input(a, c, {})).ok, false);
  assert.throws(() => a.attach("new-peer", c.welcome.entityId));
});
test("duplicate, reordered, wrong-epoch and future input packets are rejected", () => {
  const { a, clients } = setup(),
    c = clients[0],
    old = input(a, c, { forward: true }),
    newer = input(a, c, { reverse: true });
  assert.equal(a.receive(c.peer, newer).ok, true);
  assert.equal(a.receive(c.peer, old).ok, false);
  assert.equal(a.receive(c.peer, newer).ok, false);
  assert.equal(a.receive(c.peer, input(a, c, {}, { epoch: 99 })).ok, false);
  assert.equal(
    a.receive(c.peer, input(a, c, {}, { clientTick: 9999 })).ok,
    false,
  );
});
test("lost input expires, clears fire and brakes instead of driving indefinitely", () => {
  const { a, clients } = setup(),
    c = clients[0],
    p = a.battle.entities[0];
  a.receive(c.peer, input(a, c, { forward: true, fire: true }));
  for (let i = 0; i < 120; i++) a.step();
  assert.equal(p.speed, 0);
  assert.ok(52 - p.z < 5);
  assert.equal(p.fireHeld, false);
});
test("disconnect releases control and reconnect rejects packets from the old connection", () => {
  const { a, clients } = setup(),
    c = clients[0],
    old = input(a, c, { forward: true });
  a.detach(c.peer);
  assert.equal(a.receive(c.peer, old).ok, false);
  const next = a.attach(c.peer, c.welcome.entityId);
  assert.notEqual(next.connection, c.welcome.connection);
  assert.equal(a.receive(c.peer, old).ok, false);
  c.welcome = next;
  assert.equal(a.receive(c.peer, input(a, c, { left: true })).ok, true);
});
test("snapshot packets cannot roll a replica backward, including equal-tick status changes", () => {
  const { a, clients } = setup(),
    r = clients[0].r;
  const old = a.statePacket();
  a.battle.pause();
  const newer = a.statePacket();
  assert.equal(r.receive(newer).ok, true);
  assert.equal(r.receive(old).ok, false);
  assert.equal(r.current.status, "paused");
});
test("event history repetition is deduplicated by event ID", () => {
  const { a, clients } = setup(),
    c = clients[0];
  a.receive(c.peer, input(a, c, { fire: true }));
  a.step();
  const first = c.r.receive(a.statePacket());
  assert.equal(first.ok, true);
  assert.ok(first.events.some((e) => e.type === "shot"));
  const again = c.r.receive(a.statePacket());
  assert.equal(again.ok, true);
  assert.deepEqual(again.events, []);
});
test("replicas reject malformed snapshots, oversized packets, wrong matches and epochs", () => {
  const { a, clients } = setup(),
    r = clients[0].r;
  const bad = a.statePacket();
  bad.snapshot.entities[0].hp = 9999;
  assert.equal(r.receive(bad).ok, false);
  const wrong = a.statePacket();
  wrong.epoch = 99;
  assert.equal(r.receive(wrong).ok, false);
  assert.equal(r.receive("x".repeat(70000)).ok, false);
  assert.equal(r.current, null);
});
test("replica copies cannot mutate authoritative or stored client state", () => {
  const { a, clients } = setup(),
    r = clients[0].r;
  r.receive(a.statePacket());
  const copy = r.renderState();
  copy.entities[0].hp = 1;
  assert.equal(r.current.entities[0].hp, 210);
  assert.equal(a.battle.entities[0].hp, 210);
});
test("30, 60 and 120 fps local drivers yield identical 60 Hz world states", () => {
  const result = [];
  for (const fps of [30, 60, 120]) {
    const s = new S.LocalSession({ participants: humans() });
    s.start();
    for (let i = 0; i < fps * 2; i++)
      s.advance(1 / fps, { forward: true, fire: true });
    result.push(s.current());
  }
  assert.equal(result[0].tick, 120);
  assert.deepEqual(result[0], result[1]);
  assert.deepEqual(result[1], result[2]);
});
test("restart creates a fresh epoch, loadout and rejects old state packets", () => {
  const s = new S.LocalSession();
  s.start();
  s.advance(0.1, { fire: true });
  const old = s.authority.statePacket();
  s.restart({ tankType: "heavy", weaponType: "laser" });
  assert.equal(s.current().entities[0].maxHp, 280);
  assert.equal(s.current().entities[0].weaponType, "laser");
  assert.equal(s.current().tick, 0);
  assert.equal(s.replica.receive(old).ok, false);
});
test("ramp height is validated and interpolated through authority snapshots", () => {
  const { a, clients } = setup(),
    p = a.battle.entities[0],
    c = clients[0];
  Object.assign(p, { x: -36, z: 32, floor: 0, y: 0 });
  for (let i = 0; i < 150; i++) {
    a.receive(c.peer, input(a, c, { forward: true }));
    a.step();
    assert.equal(c.r.receive(a.statePacket()).ok, true);
  }
  assert.ok(c.r.current.entities[0].rampId);
  assert.ok(c.r.current.entities[0].y > 0 && c.r.current.entities[0].y < 8);
  const rendered = c.r.renderState(0.5).entities[0];
  assert.ok(rendered.y <= p.y);
  const bad = a.statePacket();
  bad.snapshot.entities[0].y += 1;
  assert.equal(c.r.receive(bad).ok, false);
  for (let i = 0; i < 100; i++) {
    a.receive(c.peer, input(a, c, { forward: true }));
    a.step();
    assert.equal(c.r.receive(a.statePacket()).ok, true);
  }
  assert.equal(c.r.current.entities[0].floor, 1);
  assert.equal(c.r.current.entities[0].rampId, null);
});

test("live authority/replica delivery remains valid through a complete eight-vehicle match", () => {
  const s = new S.LocalSession();
  s.start();
  let transitions = 0,
    ends = 0,
    maxBytes = 0;
  for (
    let i = 0;
    i < C.RULES.duration / 2 && s.current().status === "playing";
    i++
  ) {
    for (const e of s.advance(1 / 30, {})) {
      if (e.type === "rampExit") transitions++;
      if (e.type === "end") ends++;
    }
    if (i % 90 === 0)
      maxBytes = Math.max(
        maxBytes,
        JSON.stringify(s.authority.statePacket()).length,
      );
  }
  assert.equal(s.current().status, "finished");
  assert.equal(ends, 1);
  assert.ok(maxBytes < 65536);
});
test("all sixteen local loadouts boot, move and fire through protocol validation", () => {
  for (const tankType of Object.keys(C.TANKS))
    for (const weaponType of Object.keys(C.WEAPONS)) {
      const s = new S.LocalSession({ loadout: { tankType, weaponType } });
      s.start();
      const events = [];
      for (let i = 0; i < 55; i++)
        events.push(...s.advance(1 / 30, { forward: true, fire: true }));
      assert.equal(s.current().entities[0].tankType, tankType);
      assert.equal(s.current().entities[0].weaponType, weaponType);
      assert.ok(events.some((e) => e.type === "shot" && e.id === "p1"));
    }
});

test("input timeout and disconnect cancel a charged laser without discharging", () => {
  for (const disconnect of [false, true]) {
    const participants = humans();
    participants[0].weaponType = "laser";
    const a = new S.Authority({ participants, matchId: "cancel-charge" });
    a.battle.start();
    const welcome = a.attach("peer0", "p1"),
      c = { peer: "peer0", welcome, seq: 0 };
    for (let i = 0; i < 35; i++) {
      a.receive(c.peer, input(a, c, { fire: true }));
      a.step();
    }
    assert.ok(a.battle.getEntity("p1").charge > 0);
    if (disconnect) a.detach(c.peer);
    const events = [];
    for (let i = 0; i < 40; i++) events.push(...a.step());
    assert.equal(a.battle.getEntity("p1").charge, 0);
    assert.equal(
      events.some((e) => e.type === "beam" && e.id === "p1"),
      false,
    );
  }
});
test("local pause cancels a held laser so resume does not fire unexpectedly", () => {
  const participants = humans();
  participants[0].weaponType = "laser";
  const s = new S.LocalSession({ participants });
  s.start();
  for (let i = 0; i < 20; i++) s.advance(1 / 60, { fire: true });
  s.pause();
  assert.equal(s.current().entities[0].charge, 0);
  s.start();
  assert.equal(
    s.advance(0.1, {}).some((e) => e.type === "shot" && e.id === "p1"),
    false,
  );
});
