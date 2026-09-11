/* Rendering consumes replica snapshots; inputs go through the same authority boundary as future peers. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    startButton = $("start-button");
  function failure(message) {
    $("game-overlay").hidden = false;
    $("load-error").hidden = false;
    $("load-error").textContent = message;
    startButton.disabled = true;
    startButton.textContent = "战场未能加载";
  }
  if (!window.THREE || !window.TankSession || !window.createTankModel) {
    failure("3D 组件加载失败，请联网后刷新页面。");
    return;
  }
  const T = window.THREE,
    C = window.TankBattle,
    canvas = $("battle-canvas");
  const {
    renderer,
    scene,
    camera,
    sun,
    floorGroups,
    clouds,
    mat,
    block,
    stripe,
  } = window.TankClient.createScene({ T, C, canvas, failure });
  if (!renderer) return;
  let session = new window.TankSession.LocalSession(),
    network = null;
  let snapshot = session.current(),
    playerId = session.playerId;
  const effects = [],
    sphere = new T.IcosahedronGeometry(1, 0),
    shellMat = new T.MeshBasicMaterial({ color: 0xffd18a });
  const pveEffects = window.TankClient.createPveEffects({ T, scene });
  const units = window.TankClient.createUnits({
    T,
    C,
    scene,
    floorGroups,
    labelHost: $("enemy-labels"),
    sphere,
    shellMat,
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    effects,
    sound: (...args) => sound(...args),
    getEntities: () => session.current().entities,
    getMode: () => session.current().mode || "pvp",
    getPlayerId: () => playerId,
  });
  const { views, bullets, createViews } = units;
  createViews();
  let hitTime = 0,
    damageTime = 0,
    noticeTime = 0,
    audio = null,
    deathShown = false,
    observing = false,
    attackerId = null,
    engine = null;
  const pickupViews = C.MAP.pickups.map((p) => {
    const group = new T.Group(),
      material = mat(p.kind === "repair" ? 0x73cfa2 : 0xefbe62);
    block(1.5, 1.5, 1.5, 0, 0, 0, material, group);
    if (p.kind === "repair") {
      block(0.25, 1, 0.04, 0, 0, 0.77, stripe, group);
      block(1, 0.25, 0.04, 0, 0, 0.78, stripe, group);
    } else {
      block(0.25, 1, 0.04, -0.25, 0, 0.77, stripe, group);
      block(0.25, 1, 0.04, 0.25, 0, 0.77, stripe, group);
    }
    group.position.set(p.x, C.MAP.levels[p.floor].y + 1.3, p.z);
    floorGroups[p.floor].add(group);
    return group;
  });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cameraRig = window.TankClient.createCameraRig({
    T,
    C,
    camera,
    reduced,
    getPlayerId: () => playerId,
  });
  const { sound, puff, beam } = window.TankClient.createEffects({
    T,
    scene,
    sphere,
    effects,
    getAudio: () => audio,
  });
  function notify(message) {
    $("event-notice").textContent = message;
    $("event-notice").dataset.critical = "false";
    noticeTime = 3;
  }
  function eventsReceived(events) {
    for (const e of events) {
      if (e.type === "shot") {
        const view = views.get(e.id);
        if (view) view.recoil = window.TankClient.recoil.kick(view.recoil, e.critical ? 1.15 : 1);
        puff(e, 0.5, 3);
        const me = session.current().entities.find((p) => p.id === playerId);
        sound(
          C.WEAPONS[e.weaponType].sound === "energy",
          e.id === playerId
            ? 1
            : Math.max(0.05, 1 - Math.hypot(e.x - me.x, e.z - me.z) / 70) * 0.5,
        );
      }
      if (e.type === "beam") beam(e);
      if (e.type === "explosion") {
        puff(e, 3, 16);
        sound(false, 0.8);
      }
      if (e.type === "impact") {
        puff(e, 0.7, 5);
        if (e.owner === playerId && e.targetId) {
          hitTime = 0.22;
          notify("命中 " + e.targetId);
        }
      }
      if (e.type === "damage" && e.id === playerId) {
        damageTime = 0.6;
        attackerId = e.owner;
        notify("受到攻击 −" + Math.ceil(e.amount) + " · 寻找掩体");
        sound(false, 0.5);
      }
      if (e.type === "damage" && e.owner === playerId) {
        hitTime = 0.4;
        notify(
          (e.critical ? "强化命中！ " : "命中 ") +
            e.id +
            " · −" +
            Math.ceil(e.amount),
        );
        $("event-notice").dataset.critical = String(e.critical === true);
      }
      if (e.type === "ability") {
        if (e.id === playerId) {
          notify(C.describeAbility(e.ability));
          sound(true, 0.6);
        }
      }
      if (e.type === "respawn" && e.id === playerId) {
        clearInput();
        deathShown = false;
        observing = false;
        cameraRig.update(
          session.current().entities.find((p) => p.id === playerId),
          0,
          true,
        );
        notify("已复活 · 保护 2 秒，开炮解除");
      }
      if (e.type === "pickup" && e.id === playerId) {
        notify(
          e.kind === "repair"
            ? "维修补给 · 恢复 " + C.RULES.repair + " 装甲"
            : "加速补给 · 6 秒内极速 +35%",
        );
        sound(true, 0.4);
      }
      if (e.type === "destroy") {
        puff(e, 2.3, 12);
        notify(e.id === playerId ? "你已被击毁" : e.owner + " 击毁 " + e.id);
      }
      if (e.type === "fallStart" && e.id === playerId)
        notify("下落中 · 可瞄准开火，落地后恢复驾驶");
      if (e.type === "land") {
        puff(e, 1.2, 6);
        if (e.id === playerId) notify("已落地 · 无摔落伤害");
      }
      if (e.type === "rampEnter" && e.id === playerId)
        notify("驶入斜坡 · 可停车、倒车和交战");
      if (e.type === "rampExit" && e.id === playerId)
        notify("已驶出斜坡 · " + (e.floor + 1) + " 楼");
    }
  }
  const input = window.TankClient.createInput({
    T,
    C,
    canvas,
    $,
    cameraRig,
    getSession: () => session,
    getPlayerId: () => playerId,
    notify,
    pause,
    resume,
  });
  const {
    pointer,
    ray,
    plane,
    aimWorld,
    status,
    clearInput,
    command,
    lockMouse,
  } = input;
  const hud = window.TankClient.createHUD({
    C,
    $,
    getPlayerId: () => playerId,
  });
  for (const [id, catalog, selected] of [
    ["tank-select", C.PLAYER_TANKS, "medium"],
    ["weapon-select", C.WEAPONS, "standard"],
  ]) {
    $(id).replaceChildren(
      ...Object.entries(catalog).map(([value, spec]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = spec.name;
        option.selected = value === selected;
        return option;
      }),
    );
  }
  const pveUI = window.TankClient.createPveUI({ C, $, choose: (wave, choice, offerId) => {
    if (session.online && !session.suspended) {
      clearInput();
      network.send({ type: "upgrade", epoch: session.current().epoch, wave, choice, offerId });
    }
  } });
  function config() {
    return {
      tankType: $("tank-select").value,
      weaponType: $("weapon-select").value,
    };
  }
  function updateLoadout() {
    const value = config(),
      tank = C.TANKS[value.tankType],
      weapon = C.WEAPONS[value.weaponType];
    $("loadout-summary").textContent =
      tank.name +
      " · " +
      tank.hp +
      " 装甲 / " +
      Math.round(tank.speed * 3.6) +
      " km/h；" +
      weapon.name +
      " · " +
      weapon.damage +
      (weapon.splashDamage
        ? " 直击 + " +
          weapon.splashDamage +
          " 爆炸 / 半径 " +
          weapon.splashRadius +
          " 米"
        : " 基础伤害") +
      (weapon.trigger === "delayed"
        ? " / 点击后 " + (weapon.charge / 60).toFixed(1) + " 秒自动发射"
        : weapon.charge
          ? " / 按住蓄力，松开发射"
          : " / " + (weapon.cooldown / 60).toFixed(2) + " 秒装填");

    if (weapon.criticalHits)
      $("loadout-summary").textContent +=
        " / 命中 " +
        weapon.criticalHits +
        " 次，下一发强化至 " +
        weapon.damage * weapon.criticalMultiplier +
        " 伤害";
    $("loadout-summary").textContent +=
      "。Shift：" +
      C.describeAbility(tank.ability) +
      "。无常驻护盾；仅中型机甲技能提供临时屏障。";
  }
  for (const id of ["tank-select", "weapon-select"])
    $(id).addEventListener("change", updateLoadout);
  updateLoadout();
  function clearEffects() {
    $("match-results").hidden = true;
    for (const m of bullets.values()) scene.remove(m);
    bullets.clear();
    for (const e of effects) {
      scene.remove(e.m);
      e.m.material.dispose();
      if (e.beam) e.m.geometry.dispose();
    }
    effects.length = 0;
  }
  function newMatch() {
    if (session.online) return;
    session.restart(config());
    playerId = session.playerId;
    snapshot = session.current();
    createViews();
    clearEffects();
    clearInput();
    deathShown = false;
    observing = false;
    input.state.mouseKnown = false;
    input.state.activeAim = null;
    hitTime = damageTime = noticeTime = 0;
    $("event-notice").textContent = "";
    const p = snapshot.entities.find((e) => e.id === playerId);
    cameraRig.update(p, 0, true);
  }
  function pause() {
    engine?.mute();
    session.pause();
    clearInput();
    showMenu("paused");
  }
  function resume() {
    if (session.start() === false) return;
    clearInput();
    $("game-overlay").hidden = true;
    canvas.focus({ preventScroll: true });
    try {
      if (!audio) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (Audio) {
          audio = new Audio();
          engine = window.TankClient.createEngineAudio({
            audio,
            C,
            onError: () => notify("行驶音效暂时不可用，可暂停后继续重试"),
          });
        }
      }
      audio?.resume().catch(() => {});
      engine?.load();
    } catch {}
  }
  function showMenu(kind) {
    clearInput();
    $("game-overlay").hidden = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    $("aim-reticle").style.display = "none";
    $("garage").hidden = kind === "paused" || !!session.online;
    $("restart-button").hidden = false;
    startButton.hidden = kind === "finished";
    if (kind !== "finished") $("match-results").hidden = true;
    if (kind === "paused") {
      $("menu-title").textContent = "本地暂停";
      $("menu-description").textContent = "本地比赛已暂停，点击继续返回战场。";
      startButton.textContent = "继续战斗 →";
      $("restart-button").textContent = "重新开局 / 当前配置";
    }
    if (kind === "eliminated") {
      $("menu-title").textContent = "你已出局";
      $("menu-description").textContent =
        "自由混战仍在继续。可观战剩余坦克，或选择新配置重新开局。";
      startButton.textContent = "继续观战 →";
      $("restart-button").textContent = "用所选配置重新出击 →";
    }
    if (kind === "finished") {
      const s = session.current(),
        p = s.entities.find((e) => e.id === playerId);
      $("menu-title").textContent =
        s.mode === "pve" ? (s.pve.result === "victory" ? "撤离成功" : "挑战失败") :
          s.winnerId === playerId ? "本局冠军" : "对局结束";
      $("match-results").hidden = false;
      $("match-results").replaceChildren(
        ...s.entities
          .filter((e) => e.tankType !== "zombie")
          .slice()
          .sort(
            (a, b) =>
              b.kills - a.kills ||
              a.deaths - b.deaths ||
              a.id.localeCompare(b.id),
          )
          .map((e, i) => {
            const row = document.createElement("p");
            row.textContent =
              i +
              1 +
              ". " +
              e.id +
              " · " +
              e.kills +
              " 击毁 / " +
              e.deaths +
              " 死亡";
            return row;
          }),
      );
      $("menu-description").textContent =
        (s.mode === "pve" ? "存活至第 " + s.pve.wave + " 波" : "获胜者：" + (s.winnerId || "平局")) +
        " · 用时 " +
        Math.floor(s.tick / 60) +
        " 秒 · 你的击毁数 " +
        p.kills;
      $("restart-button").textContent = "用所选配置再战一局 →";
    }
    if (session.online) {
      $("restart-button").hidden = true;
      $("network-panel").hidden = false;
      if (kind === "paused") {
        $("menu-title").textContent = "操作已暂停";
        $("menu-description").textContent =
          "战斗仍在继续，你仍可能被命中。点击继续返回战场。";
      }
      if (kind === "eliminated")
        $("menu-description").textContent =
          "战斗仍在继续，可继续观战，或离开房间。";
    }
    (startButton.hidden ? $("leave-room") : startButton).focus({
      preventScroll: true,
    });
  }
  startButton.addEventListener("click", () => {
    if (status() === "ready") newMatch();
    if (deathShown) observing = true;
    resume();
    if (!window.matchMedia("(pointer: coarse)").matches) lockMouse();
  });
  $("restart-button").addEventListener("click", () => {
    newMatch();
    resume();
    if (!window.matchMedia("(pointer: coarse)").matches) lockMouse();
  });
  $("pause-btn").addEventListener("click", () => {
    if (status() === "playing") pause();
  });
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();
  cameraRig.update(
    session.current().entities.find((e) => e.id === playerId),
    0,
    true,
  );
  const aimAssist = window.TankClient.createAimAssist();
  const assistRay = new T.Raycaster(),
    assistPoint = new T.Vector3();
  function projectAim(point) {
    assistPoint.set(point.x, point.y, point.z).project(camera);
    return {
      x: (assistPoint.x + 1) * 50,
      y: (1 - assistPoint.y) * 50,
      distance: Math.hypot(
        (assistPoint.x * window.innerWidth) / 2,
        (assistPoint.y * window.innerHeight) / 2,
      ),
      visible:
        assistPoint.z >= -1 &&
        assistPoint.z <= 1 &&
        Math.abs(assistPoint.x) <= 1 &&
        Math.abs(assistPoint.y) <= 1,
    };
  }
  let last = 0,
    hudTime = 0,
    frameSeconds = 1 / 60;
  function frame(time) {
    requestAnimationFrame(frame);
    const seconds = Math.max(0, (time - last) / 1000),
      dt = Math.min(seconds, 0.05);
    last = time;
    frameSeconds += (Math.min(1, seconds) - frameSeconds) * 0.1;
    if (document.hidden) return;
    roomBrowser.update(time, !$("game-overlay").hidden && !network?.room);
    const before = session.current(),
      localBefore = before.entities.find((e) => e.id === playerId);
    input.state.activeAim = null;
    let targetedId = null;
    if (input.state.mouseKnown && !input.state.freeLook) {
      ray.setFromCamera(pointer, camera);
      const hit = units.aimHit(
        ray,
        floorGroups.filter((g) => g.visible),
      );
      targetedId = hit?.object.userData.entityId || null;
      if (hit)
        input.state.activeAim = {
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
        };
      else {
        plane.constant = -(localBefore.y + 2.2);
        if (!ray.ray.intersectPlane(plane, aimWorld)) ray.ray.at(120, aimWorld);
        input.state.activeAim = { x: aimWorld.x, y: aimWorld.y, z: aimWorld.z };
      }
    }
    const weapon = C.WEAPONS[localBefore.weaponType];
    const assisted = aimAssist.update({
      time,
      inputRevision: input.state.aimRevision,
      enabled:
        !input.state.freeLook &&
        input.state.mouseKnown &&
        localBefore.alive &&
        status() === "playing" &&
        $("game-overlay").hidden,
      player: localBefore,
      entities: before.entities.filter((e) => before.mode !== "pve" || e.tankType === "zombie").map((e) => ({
        ...e,
        height: C.TANKS[e.tankType].height || 3,
      })),
      hitId: targetedId,
      range: Math.min(
        140,
        weapon.delivery === "ray"
          ? weapon.range
          : (weapon.speed * weapon.life) / C.TICK_RATE,
      ),
      project: projectAim,
      visible: (entity, point) => {
        const direction = new T.Vector3(point.x, point.y, point.z).sub(
          camera.position,
        );
        assistRay.set(camera.position, direction.normalize());
        const hit = units.aimHit(
          assistRay,
          floorGroups.filter((g) => g.visible),
        );
        if (hit?.object.userData.entityId !== entity.id) return false;
        return !window.TankSystems.world.collision(
          { map: C.MAP, entities: before.entities },
          { x: localBefore.x, y: localBefore.y + 2.2, z: localBefore.z },
          point,
          localBefore.id,
          { bodies: false },
        );
      },
    });
    if (assisted) {
      targetedId = assisted.id;
      input.state.activeAim = assisted.point;
    }
    const events = session.advance(seconds, command(localBefore));
    eventsReceived(events);
    const state = session.state(),
      truth = session.current(),
      p = truth.entities.find((e) => e.id === playerId);
    snapshot = state;
    if (!p.alive && !deathShown && truth.status === "playing") {
      deathShown = true;
      observing = true;
      clearInput();
    }
    if (events.some((e) => e.type === "end")) showMenu("finished");
    pveUI.update(truth, playerId);
    const renderPlayer = state.entities.find((e) => e.id === playerId);
    const target =
      !p.alive && observing
        ? state.entities.find((e) => e.id === attackerId && e.alive) ||
          state.entities.find((e) => e.alive) ||
          renderPlayer
        : renderPlayer;
    const cameraFloor = target.rampId
      ? C.MAP.ramps.find((r) => r.id === target.rampId).b.floor
      : target.floor;
    floorGroups.forEach((g, i) => {
      g.visible = i <= cameraFloor;
    });
    if (truth.status === "playing") {
      cameraRig.update(target, dt);
    }
    camera.lookAt(cameraRig.look);
    sun.position.set(target.x - 25, target.y + 52, target.z + 20);
    sun.target.position.set(target.x, target.y, target.z);
    units.update({ state, truth, cameraFloor, camera, dt, time, targetedId });
    pveEffects.update(truth, cameraFloor);
    const reticlePosition = assisted
      ? projectAim(assisted.point)
      : { x: 50, y: 50 };
    $("aim-reticle").style.left = reticlePosition.x + "%";
    $("aim-reticle").style.top = reticlePosition.y + "%";
    $("aim-reticle").dataset.assisted = String(Boolean(assisted));
    $("aim-reticle").dataset.targeted = String(
      Boolean(targetedId) && p.alive && truth.status === "playing",
    );
    if (!reduced) {
      clouds.rotation.y = time * 0.000004;
    }
    if (truth.status !== "paused") {
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        e.age += dt;
        if (e.age >= e.life) {
          scene.remove(e.m);
          e.m.material.dispose();
          if (e.beam) e.m.geometry.dispose();
          effects.splice(i, 1);
          continue;
        }
        e.m.position.x += e.dx * dt;
        e.m.position.z += e.dz * dt;
        e.m.position.y += e.dy * dt;
        e.m.material.opacity = (e.opacity ?? 1) * (1 - e.age / e.life);
        if (!e.beam) e.m.scale.setScalar(e.size * (0.25 + e.age));
      }
      hitTime = Math.max(0, hitTime - dt);
      damageTime = Math.max(0, damageTime - dt);
      noticeTime = Math.max(0, noticeTime - dt);
    }
    $("hit-marker").style.opacity = hitTime > 0 ? "1" : "0";
    $("damage-vignette").style.opacity = reduced
      ? "0"
      : String(damageTime * 0.65);
    $("aim-reticle").style.display =
      !session.suspended &&
      !input.state.freeLook &&
      input.state.mouseKnown &&
      truth.status === "playing" &&
      p.alive
        ? "block"
        : "none";
    if (!noticeTime) $("event-notice").textContent = "";
    $("respawn-status").hidden = p.alive || truth.status !== "playing";
    $("respawn-status").textContent =
      "已被击毁 · " +
      Math.max(0, Math.ceil((p.respawnAt - truth.tick) / 60)) +
      " 秒后复活 · 跟随击毁者观战";
    if (truth.mode === "pve" && !p.alive) $("respawn-status").textContent = "已倒下 · 等待队友清波后复活";
    $("boost-status").textContent =
      p.boostUntil > truth.tick
        ? "极速 +35% · " + Math.ceil((p.boostUntil - truth.tick) / 60) + "s"
        : p.protectedUntil > truth.tick
          ? "复活保护 · 开炮解除"
          : "";
    const attacker = truth.entities.find((e) => e.id === attackerId);
    $("damage-direction").style.opacity =
      damageTime > 0 && attacker ? "1" : "0";
    if (attacker)
      $("damage-direction").style.transform =
        "translate(-50%,-50%) rotate(" +
        C.wrap(
          cameraRig.cameraHeading -
            Math.atan2(attacker.z - p.z, -(attacker.x - p.x)),
        ) +
        "rad)";
    engine?.update(p, truth.status === "playing" && !session.suspended);
    truth.pickups.forEach((pickup, i) => {
      const view = pickupViews[i];
      view.visible = pickup.readyAt <= truth.tick;
      if (!reduced) {
        view.rotation.y = time * 0.001;
        view.position.y =
          C.MAP.levels[pickup.floor].y + 1.3 + Math.sin(time * 0.002 + i) * 0.2;
      }
    });
    hudTime += dt;
    if (hudTime > 0.08) {
      hudTime = 0;
      hud.update({ truth, p, state, target });
      const quality = $("network-quality");
      if (quality) {
        quality.hidden = !session.online;
        quality.textContent = session.online
          ? Math.round(1 / Math.max(0.001, frameSeconds)) + " FPS · 延迟 " +
            (session.rtt === null ? "测量中" : Math.round(session.rtt) + " ms") +
            " · 距收包 " + Math.round(Math.max(0, performance.now() - session.receivedAt)) + " ms"
          : "";
      }
    }
    renderer.render(scene, camera);
  }
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    session.pause();
    clearInput();
    failure("3D 画面已中断，请刷新重新进入。");
  });
  function resetLocal() {
    roomBrowser.setBusy(false);
    network?.close();
    network = null;
    session = new window.TankSession.LocalSession({ loadout: config() });
    playerId = session.playerId;
    snapshot = session.current();
    createViews();
    clearEffects();
    clearInput();
    deathShown = false;
    observing = false;
    input.state.mouseKnown = false;
    input.state.activeAim = null;
    $("game-overlay").hidden = false;
    $("network-entry").hidden = false;
    $("room-lobby").hidden = true;
    $("garage").hidden = false;
    $("garage").disabled = false;
    $("menu-title").textContent = "派萌大战僵尸";
    $("menu-description").textContent =
      "选好装备，开始训练或加入联机大厅。";
    startButton.hidden = false;
    startButton.disabled = false;
    startButton.textContent = "进入本地训练 →";
    $("restart-button").hidden = true;
    $("create-room").disabled = false;
    $("join-room").disabled = false;
  }
  function roomChanged(room) {
    $("network-panel").open = true;
    $("network-entry").hidden = true;
    $("room-lobby").hidden = false;
    $("current-room-code").textContent = room.code;
    const me = room.players.find((p) => p.id === network.entityId),
      host = room.host === me?.id;
    $("room-players").replaceChildren(
      ...room.players.map((p) => {
        const li = document.createElement("li");
        li.textContent =
          p.name +
          (p.id === room.host ? " [房主]" : "") +
          " · " +
          C.TANKS[p.tankType].name +
          " / " +
          C.WEAPONS[p.weaponType].name +
          " · " +
          (!p.connected ? "断线，等待重连" : p.ready ? "已准备" : "未准备");
        return li;
      }),
    );
    $("ready-room").hidden = room.phase !== "lobby";
    $("ready-room").textContent = me?.ready ? "取消准备" : "准备";
    $("start-room").hidden = !host || room.phase !== "lobby";
    $("start-room").disabled =
      room.players.length < (room.mode === "pve" ? 1 : 2) ||
      room.players.some((p) => !p.connected || !p.ready);
    $("rematch-room").hidden = !host || room.phase !== "finished";
    $("garage").disabled = room.phase !== "lobby" || room.mode === "pve";
    if (room.phase === "lobby") {
      if (session.online) session.pause();
      $("game-overlay").hidden = false;
      $("garage").hidden = false;
      startButton.hidden = true;
      $("restart-button").hidden = true;
      $("menu-title").textContent = "准备大厅";
      $("menu-description").textContent =
        room.mode === "pve" ? "合作生存 · 1–8 人 · 人类＋小手枪开局，击杀共享经验，按 1 / 2 / 3 升级、U 暂存；8 分钟内击败最终 Boss。" :
          "分享房间码，所有人准备后由房主开局（2–8 人，8 分钟）。";
      if (me) {
        $("tank-select").value = me.tankType;
        $("weapon-select").value = me.weaponType;
        updateLoadout();
      }
    }
  }
  const roomBrowser = window.TankClient.createRoomBrowser({
    $,
    C,
    onJoin: (code) => {
      $("room-code").value = code;
      connectRoom({
        type: "join",
        code,
        name: $("player-name").value,
        loadout: config(),
      });
    },
  });
  function connectRoom(action) {
    if (!/^https?:$/.test(location.protocol)) {
      $("network-status").textContent =
        "请通过 Docker 服务的网址打开页面后再联机。";
      return;
    }
    roomBrowser.setBusy(true);
    network?.close();
    session.pause();
    clearInput();
    startButton.hidden = true;
    $("create-room").disabled = true;
    $("join-room").disabled = true;
    network = new window.TankNetwork.NetworkSession({
      url:
        (location.protocol === "https:" ? "wss://" : "ws://") +
        location.host +
        "/ws",
      onRoom: roomChanged,
      onLeft: resetLocal,
      onStatus: (message) => {
        $("network-status").textContent = message;
        if (session.online && session.suspended) {
          clearInput();
          showMenu("paused");
        }
      },
      onError: (message) => {
        roomBrowser.setBusy(false);
        $("network-status").textContent = message;
        $("create-room").disabled = false;
        $("join-room").disabled = false;
      },
      onMatch: (next) => {
        session = next;
        playerId = session.playerId;
        snapshot = session.current();
        createViews();
        clearEffects();
        clearInput();
        deathShown = false;
        observing = false;
        input.state.mouseKnown = false;
        input.state.activeAim = null;
        const p = snapshot.entities.find((e) => e.id === playerId);
        cameraRig.update(p, 0, true);
        startButton.hidden = false;
        startButton.disabled = false;
        if (snapshot.status === "finished") showMenu("finished");
        else resume();
      },
    });
    network.connect(action);
  }
  $("create-room").addEventListener("click", () =>
    connectRoom({
      type: "create",
      mode: $("room-mode").value,
      name: $("player-name").value,
      loadout: config(),
    }),
  );
  $("join-room").addEventListener("click", () =>
    connectRoom({
      type: "join",
      code: $("room-code").value.trim().toUpperCase(),
      name: $("player-name").value,
      loadout: config(),
    }),
  );
  $("ready-room").addEventListener("click", () =>
    network?.send({
      type: "ready",
      ready: !network.room.players.find((p) => p.id === network.entityId)
        ?.ready,
    }),
  );
  $("start-room").addEventListener("click", () =>
    network?.send({ type: "start" }),
  );
  $("rematch-room").addEventListener("click", () =>
    network?.send({ type: "rematch" }),
  );
  $("leave-room").addEventListener("click", () => network?.leave());
  for (const id of ["tank-select", "weapon-select"])
    $(id).addEventListener("change", () => {
      if (network?.room?.phase === "lobby")
        network.send({ type: "loadout", loadout: config() });
    });
  try {
    const saved = JSON.parse(sessionStorage.getItem("tank-room"));
    if (saved?.code && saved?.token) {
      $("reconnect-room").hidden = false;
      $("reconnect-room").addEventListener("click", () =>
        connectRoom({ type: "resume", ...saved }),
      );
    }
  } catch {}
  startButton.disabled = false;
  startButton.textContent = "进入本地训练 →";
  requestAnimationFrame(frame);
})();
