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
  state.mouseKnown = cameraRig.isTouchLayout?.() === true;
  state.activeAim = null;
  state.aimRevision = 0;
  let mouseFire = false,
    keys = new Set(),
    touch = new Map();
  const joystick = $("move-joystick"), thumb = $("joystick-thumb");
  let stickPointer = null, stickX = 0, stickY = 0, stickUsed = false;
  function resetStick() {
    stickPointer = null; stickX = stickY = 0;
    thumb.style.transform = "translate(-50%, -50%)";
    joystick.classList.remove("held");
  }
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
    resetStick(); stickUsed = false;
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
    cameraRig.lastPointer = null;
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
      cameraRig.lastPointer = null;
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
        22,
        Math.min(52, cameraRig.zoom + e.deltaY * 0.025),
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
    KeyC: "brake",
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
  function sendStick() {
    const session = getSession(), player = session.current().entities.find(e => e.id === getPlayerId());
    if (session.online && player) session.input(command(player), true);
  }
  function moveStick(e) {
    const rect = joystick.getBoundingClientRect(), radius = rect.width * .32;
    const dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(dx, dy), scale = distance > radius ? radius / distance : 1;
    stickX = dx * scale / radius; stickY = dy * scale / radius;
    thumb.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
  }
  joystick.addEventListener("pointerdown", e => {
    if (status() !== "playing" || stickPointer !== null || e.button > 0) return;
    e.preventDefault(); stickPointer = e.pointerId; stickUsed = true;
    joystick.setPointerCapture(e.pointerId); joystick.classList.add("held");
    moveStick(e); sendStick();
  });
  joystick.addEventListener("pointermove", e => {
    if (e.pointerId !== stickPointer) return;
    e.preventDefault(); moveStick(e);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    joystick.addEventListener(name, e => {
      if (e.pointerId !== stickPointer) return;
      resetStick(); sendStick();
    });
  window.addEventListener("resize", () => { if (stickPointer !== null) { resetStick(); sendStick(); } });
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
    if (stickUsed && !["forward", "reverse", "left", "right"].some(action =>
      [...keys].some(key => bindings[key] === action))) {
      if (Math.hypot(stickX, stickY) > .16) {
        const yaw = C.wrap((cameraRig.viewYaw ?? player.heading) - Math.atan2(stickX, -stickY));
        if (C.TANKS[player.tankType].movement === "strafe") {
          input.moveYaw = yaw; input.forward = true;
        } else {
          // Preserve tank turning speed while steering toward the screen-relative stick direction.
          const delta = C.wrap(yaw - player.heading), reverse = Math.abs(delta) > Math.PI / 2;
          const turn = reverse ? C.wrap(delta + Math.PI) : delta;
          input.left = turn > .06; input.right = turn < -.06;
          input.forward = !reverse && Math.abs(turn) < .8;
          input.reverse = reverse && Math.abs(turn) < .8;
        }
      } else input.brake = true;
    }
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
      const origin = C.shotOrigin({ ...player, aim: input.aimYaw });
      input.aimPitch = Math.max(
        -0.55,
        Math.min(
          0.55,
          Math.atan2(state.activeAim.y - origin.y,
            Math.hypot(state.activeAim.x - origin.x, state.activeAim.z - origin.z)),
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
