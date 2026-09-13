(window.TankClient ??= {}).createHUD = function ({ C, $, getPlayerId }) {
  const map = $("battle-map"),
    mc = map.getContext("2d");
  function drawMap(state, viewer) {
    const floor = viewer.floor, modeMap = C.mapForMode(state.mode);
    mc.fillStyle = "#d2ddc0";
    mc.fillRect(0, 0, 260, 260);
    mc.save();
    mc.translate(130, 130);
    const mapScale = 116 / modeMap.levels[floor].bound;
    mc.scale(mapScale, mapScale);
    const b = modeMap.levels[floor].bound;
    mc.strokeStyle = floor > 0 ? "#e79e35" : "#718974";
    mc.lineWidth = 1;
    mc.strokeRect(-b, -b, b * 2, b * 2);
    mc.fillStyle = "#a88e73";
    for (const o of modeMap.obstacles)
      if (o.floor === floor)
        mc.fillRect(o.x - o.w / 2, o.z - o.d / 2, o.w, o.d);
    mc.fillStyle = "#8ef5d2";
    for (const s of modeMap.ramps)
      for (const p of [s.a, s.b])
        if (p.floor === floor) mc.fillRect(p.x - 2, p.z - 2, 4, 4);
    mc.fillStyle = "#e79e35";
    for (const exit of modeMap.dropExits || [])
      if (exit.floor === floor)
        mc.fillRect(
          exit.x - exit.width / 2,
          exit.side * b - 1.5,
          exit.width,
          3,
        );
    for (const p of state.pickups)
      if (p.floor === floor && p.readyAt <= state.tick) {
        mc.fillStyle = p.kind === "repair" ? "#238454" : "#c28a27";
        mc.fillRect(p.x - 1.5, p.z - 1.5, 3, 3);
      }
    for (const e of state.entities) {
      if (e.floor !== floor || (e.tankType === "zombie" && !e.alive)) continue;
      mc.save();
      mc.translate(e.x, e.z);
      mc.rotate(Math.PI - e.heading);
      mc.scale(1.5 / mapScale, 1.5 / mapScale);
      mc.fillStyle = e.rampId
        ? "#9bffff"
        : !e.alive
          ? "#484d41"
          : e.id === getPlayerId()
            ? "#d7e8ae"
            : state.mode === "pve" && e.tankType !== "zombie" ? "#4faed0" : "#f68d69";
      mc.beginPath();
      mc.moveTo(4, 0);
      mc.lineTo(-3, -2.6);
      mc.lineTo(-2, 0);
      mc.lineTo(-3, 2.6);
      mc.closePath();
      mc.fill();
      mc.restore();
    }
    mc.restore();
    $("map-floor").textContent = floor + 1 + "F / FLOOR";
  }
  // Mouse orbit is independent of the chassis; a centered reticle guides turret aim.
  function update({ truth, p, state, target }) {
    const weapon = C.WEAPONS[p.weaponType],
      tank = C.TANKS[p.tankType];
    $("hp-number").textContent = Math.ceil(p.hp);
    $("shield-readout").hidden = p.barrier <= 0;
    $("shield-bar").hidden = p.barrier <= 0;
    $("shield-number").textContent = Math.ceil(p.barrier);
    $("shield-bar").max = C.ABILITIES.barrier.barrier;
    $("shield-bar").value = p.barrier;
    const ability = C.ABILITIES[tank.ability];
    $("ability-status").textContent =
      "Shift · " +
      ability.name +
      " · " +
      (p.abilityUntil > truth.tick
        ? "生效中 " + ((p.abilityUntil - truth.tick) / 60).toFixed(1) + "s"
        : p.abilityCooldown
          ? "冷却 " + Math.ceil(p.abilityCooldown / 60) + "s"
          : "就绪");
    $("max-hp").textContent = p.maxHp;
    $("hp-bar").max = p.maxHp;
    $("hp-bar").value = p.hp;
    $("vehicle-label").textContent = tank.name + " / " + p.id;
    $("speed").textContent = Math.round(Math.abs(p.speed) * 3.6);
    $("enemy-count").textContent = truth.entities.filter(
      (e) => e.id !== getPlayerId() && e.alive && (truth.mode !== "pve" || e.tankType === "zombie"),
    ).length;
    $("weapon-label").textContent = weapon.name +
      (weapon.magazineSize ? ` · ${p.ammo}/${weapon.magazineSize}` : "");
    const reloading = weapon.magazineSize && p.ammo === 0;
    $("reload-label").textContent = p.cooldown
      ? (reloading ? "换弹 " : weapon.magazineSize ? "射击间隔 " : "装填 ") + (p.cooldown / 60).toFixed(1) + "s"
      : p.charge
        ? (weapon.trigger === "delayed" ? "预热 " : "蓄力 ") +
          Math.round((p.charge / weapon.charge) * 100) +
          "%"
        : weapon.trigger === "delayed"
          ? "点击预热发射"
          : weapon.charge
            ? "按住蓄力"
            : "主炮就绪";
    $("reload-bar").value = p.charge
      ? p.charge / weapon.charge
      : 1 - p.cooldown / (reloading ? weapon.reloadTicks : weapon.cooldown);
    $("weapon-description").textContent = weapon.splashDamage
      ? "直击 " +
        weapon.damage +
        " + 爆炸最高 " +
        weapon.splashDamage +
        " · 近距离会自伤"
      : weapon.trigger === "delayed"
        ? "点击后 " +
          (weapon.charge / 60).toFixed(1) +
          " 秒发射 · 固定 " +
          weapon.damage +
          " 基础伤害"
        : weapon.charge
          ? "蓄满自动发射；也可松开提前发射"
          : weapon.magazineSize
            ? `${weapon.magazineSize} 发弹匣 · 打空自动换弹 ${(weapon.reloadTicks / 60).toFixed(1)} 秒`
            : "按住连续开火 · 弹药无限";
    if (weapon.criticalHits)
      $("weapon-description").textContent =
        p.criticalProgress >= weapon.criticalHits
          ? "强化弹就绪 · 下一发 " +
            weapon.damage * weapon.criticalMultiplier +
            " 伤害"
          : "强化弹进度 " +
            p.criticalProgress +
            "/" +
            weapon.criticalHits +
            " · 直接命中积攒";
    const seconds = truth.mode === "pve"
      ? Math.floor(truth.tick / 60)
      : Math.max(0, Math.ceil((C.RULES.duration - truth.tick) / 60));
    $("battle-clock").textContent =
      (truth.mode === "pve" ? "已进行 " : "") +
      String(Math.floor(seconds / 60)).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0");
    $("scoreboard").replaceChildren(
      ...truth.entities
        .filter((e) => e.tankType !== "zombie")
        .slice()
        .sort(
          (a, b) =>
            b.kills - a.kills ||
            a.deaths - b.deaths ||
            a.id.localeCompare(b.id),
        )
        .map((e) => {
          const row = document.createElement("div");
          row.textContent =
            (e.id === getPlayerId() ? "▶ " : "") +
            e.id +
            " · " +
            e.kills +
            " 击毁 / " +
            e.deaths +
            " 死亡" +
            (e.forfeited ? " · 离场" : "");
          return row;
        }),
    );
    $("ramp-status").textContent = p.falling
      ? "下落中 · 保持惯性 / 可开火"
      : p.rampId
        ? "斜坡行驶 · 可停车 / 倒车 / 交战"
        : p.floor > 0
          ? "平台四周可直接驶出下落 · 注意边缘"
          : "直接驾驶上坡 · 无需按键";
    drawMap(state, target);
  }
  return { update };
};
