/* Input ownership and pointer lock; sends commands through the active session. */
(window.TankClient ??= {}).createInput = function ({
  T,
  C,
  canvas,
  $,
  cameraRig,
  getSession,
  getPlayerId,
  notify,
  pause,
  resume,
  refreshAim = () => {},
}) {
  const pointer = new T.Vector2(),
    ray = new T.Raycaster(),
    plane = new T.Plane(new T.Vector3(0, 1, 0), -2.2),
    aimWorld = new T.Vector3();
  const state = {};
  state.freeLook = false;
  const isMac = /Mac|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || "");
  const lookKeys = new Set(isMac ? ["MetaLeft", "MetaRight"] : ["AltLeft", "AltRight"]);
  const heldLookKeys = new Set();
  let savedLook = null;
  function freeLook(active) {
    if (active === state.freeLook) return;
    const player = getSession().current().entities.find(e => e.id === getPlayerId());
    if (active) {
      if (!player?.alive) return;
      const aim = command(player);
      savedLook = {yaw: cameraRig.viewYaw ?? player.heading, pitch: cameraRig.viewPitch,
        aimYaw: aim.aimYaw ?? player.aim, aimPitch: aim.aimPitch ?? player.pitch};
    } else if (savedLook) {
      cameraRig.viewYaw = cameraRig.cameraHeading = savedLook.yaw;
      cameraRig.viewPitch = cameraRig.cameraElevation = savedLook.pitch;
    }
    state.freeLook = active;
    state.activeAim = null;
    state.aimRevision++;
    cameraRig.lastPointer = null;
  }
  state.mouseKnown = false;
  state.activeAim = null;
  state.aimRevision = 0;
  let mouseFire = false,
    keys = new Set(),
    touch = new Map();
  const status = () =>
    getSession().online && getSession().suspended
      ? "paused"
      : getSession().current().status;
  function clearInput() {
    freeLook(false);
    heldLookKeys.clear();
    state.aimRevision++;
    state.activeAim = null;
    cameraRig.lastPointer = null;
    keys.clear();
    touch.clear();
    mouseFire = false;
    document
      .querySelectorAll(".held")
      .forEach((b) => b.classList.remove("held"));
  }
  function updatePointer(e) {
    const body = getSession()
      .current()
      .entities.find((e) => e.id === getPlayerId());
    if (!body?.alive) {
      freeLook(false);
      cameraRig.lastPointer = null;
      return;
    }
    const locked = document.pointerLockElement === canvas;
    const dx = locked
      ? e.movementX || 0
      : cameraRig.lastPointer
        ? e.clientX - cameraRig.lastPointer.x
        : 0;
    const dy = locked
      ? e.movementY || 0
      : cameraRig.lastPointer
        ? e.clientY - cameraRig.lastPointer.y
        : 0;
    if (dx || dy) {
      state.aimRevision++;
      state.activeAim = null;
      cameraRig.viewYaw = C.wrap(
        (cameraRig.viewYaw ?? body.heading) - dx * 0.004,
      );
      cameraRig.viewPitch = Math.max(
        -0.12,
        Math.min(0.8, cameraRig.viewPitch + dy * 0.003),
      );
    }
    cameraRig.lastPointer = { x: e.clientX, y: e.clientY };
    pointer.set(0, 0);
    state.mouseKnown = true;
    $("aim-reticle").style.left = "50%";
    $("aim-reticle").style.top = "50%";
  }
  function lockMouse() {
    if (document.pointerLockElement === canvas) return;
    if (!canvas.requestPointerLock) {
      notify("浏览器不支持鼠标锁定，可拖动视角");
      return;
    }
    try {
      canvas
        .requestPointerLock()
        ?.catch(() => notify("请点击战场启用鼠标锁定"));
    } catch {
      notify("请点击战场启用鼠标锁定");
    }
  }
  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas && status() === "playing")
      updatePointer(e);
  });
  document.addEventListener("pointerlockchange", () => {
    cameraRig.lastPointer = null;
    if (document.pointerLockElement === canvas) {
      state.mouseKnown = true;
      pointer.set(0, 0);
      $("aim-reticle").style.left = "50%";
      $("aim-reticle").style.top = "50%";
    } else if (status() === "playing" && $("game-overlay").hidden) pause();
  });
  document.addEventListener("pointerlockerror", () =>
    notify("鼠标锁定失败，请点击战场重试"),
  );
  canvas.addEventListener("pointermove", (e) => {
    if (status() === "playing" && document.pointerLockElement !== canvas)
      updatePointer(e);
  });
  canvas.addEventListener("pointerleave", () => {
    cameraRig.lastPointer = null;
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (status() !== "playing") return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (
      e.pointerType !== "touch" &&
      document.pointerLockElement !== canvas &&
      canvas.requestPointerLock
    ) {
      lockMouse();
      return;
    }
    updatePointer(e);
    if (document.pointerLockElement !== canvas)
      canvas.setPointerCapture(e.pointerId);
    if (e.pointerType !== "touch" && e.button === 0) {
      mouseFire = true;
      if (getSession().online)
        getSession().input(
          command(
            getSession()
              .current()
              .entities.find((e) => e.id === getPlayerId()),
          ),
          true,
        );
    }
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(name, () => {
      mouseFire = false;
      if (getSession().online)
        getSession().input(
          command(
            getSession()
              .current()
              .entities.find((e) => e.id === getPlayerId()),
          ),
          true,
        );
    });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (status() !== "playing") return;
      e.preventDefault();
      cameraRig.zoom = Math.max(
        8,
        Math.min(18, cameraRig.zoom + e.deltaY * 0.01),
      );
    },
    { passive: false },
  );
  const bindings = {
    KeyW: "forward",
    ArrowUp: "forward",
    KeyS: "reverse",
    ArrowDown: "reverse",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    Space: "fire",
    KeyF: "fire",
    ShiftLeft: "ability",
    ShiftRight: "ability",
  };
  window.addEventListener("keydown", (e) => {
    if (lookKeys.has(e.code) && status() === "playing" && document.activeElement === canvas) {
      e.preventDefault();
      heldLookKeys.add(e.code);
      freeLook(true);
      return;
    }
    if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) {
      e.preventDefault();
      if (status() === "playing") pause();
      else if (status() === "paused" && e.code === "KeyP") {
        resume();
        if (!window.matchMedia("(pointer: coarse)").matches) lockMouse();
      }
      return;
    }
    if (
      status() !== "playing" ||
      document.activeElement !== canvas ||
      !bindings[e.code]
    )
      return;
    e.preventDefault();
    keys.add(e.code);
    if (getSession().online && !e.repeat)
      getSession().input(
        command(
          getSession()
            .current()
            .entities.find((e) => e.id === getPlayerId()),
        ),
        true,
      );
  });
  window.addEventListener("keyup", (e) => {
    if (lookKeys.has(e.code)) {
      heldLookKeys.delete(e.code);
      if (!heldLookKeys.size) freeLook(false);
      // macOS can swallow keyup for keys released while Command was held.
      if (isMac && !heldLookKeys.size) keys.clear();
      return;
    }
    keys.delete(e.code);
    if (getSession().online && bindings[e.code])
      getSession().input(
        command(
          getSession()
            .current()
            .entities.find((e) => e.id === getPlayerId()),
        ),
        true,
      );
  });
  window.addEventListener("blur", () => {
    if (status() === "playing") pause();
    else clearInput();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && status() === "playing") pause();
  });
  for (const b of [
    ...document.querySelectorAll("[data-action]"),
    $("fire-button"),
  ]) {
    b.addEventListener("pointerdown", (e) => {
      if (status() !== "playing") return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      touch.set(e.pointerId, b.dataset.action || "fire");
      b.classList.add("held");
      if (getSession().online)
        getSession().input(
          command(
            getSession()
              .current()
              .entities.find((e) => e.id === getPlayerId()),
          ),
          true,
        );
    });
    const release = (e) => {
      touch.delete(e.pointerId);
      b.classList.remove("held");
      if (getSession().online)
        getSession().input(
          command(
            getSession()
              .current()
              .entities.find((e) => e.id === getPlayerId()),
          ),
          true,
        );
    };
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      b.addEventListener(name, release);
  }
  function command(player) {
    const input = { fire: mouseFire };
    if (C.TANKS[player.tankType].movement === "strafe") {
      cameraRig.viewYaw ??= player.heading;
      input.moveYaw = state.freeLook ? savedLook.yaw : cameraRig.viewYaw;
    }
    for (const key of keys) input[bindings[key]] = true;
    for (const v of touch.values()) input[v] = true;
    if (input.fire && state.mouseKnown && !state.freeLook && !state.activeAim)
      refreshAim(player);
    if (state.freeLook && savedLook) {
      input.aimYaw = savedLook.aimYaw;
      input.aimPitch = savedLook.aimPitch;
      return input;
    }
    if (state.activeAim) {
      const dx = state.activeAim.x - player.x,
        dz = state.activeAim.z - player.z;
      input.aimYaw = Math.atan2(dz, -dx);
      input.aimPitch = Math.max(
        -0.55,
        Math.min(
          0.55,
          Math.atan2(state.activeAim.y - player.y - 2.2, Math.hypot(dx, dz)),
        ),
      );
    }
    return input;
  }
  return {
    state,
    pointer,
    ray,
    plane,
    aimWorld,
    status,
    clearInput,
    command,
    lockMouse,
  };
};
