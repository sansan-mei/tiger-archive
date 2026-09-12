/* Small wave HUD and keyboard/touch reward choices; sends intentions only. */
(window.TankClient ??= {}).createPveUI = function ({ C, $, choose }) {
  const panel = $("pve-rewards"), cards = $("pve-choices");
  let current = null, signature = "", deferred = false, match = null;
  const toggle = $("pve-toggle");
  toggle.addEventListener("click", () => { deferred = !deferred; });
  function select(index) {
    if (current?.options[index]) choose(current.wave, current.options[index], current.offerId);
  }
  document.addEventListener("keydown", (event) => {
    if (event.repeat || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName)) return;
    if (event.code === "KeyU" && current) { deferred = !deferred; event.preventDefault(); }
    const index = ["Digit1", "Digit2", "Digit3"].indexOf(event.code);
    if (index >= 0 && current && !panel.hidden) {
      event.preventDefault();
      select(index);
    }
  });
  return {
    update(state, id) {
      const pve = state.mode === "pve" ? state.pve : null,
        boss = pve ? state.entities.find(e => ['boss','titan'].includes(e.zombieType) && e.alive) : null,
        bossName = boss ? C.ZOMBIE_SPECS[boss.zombieType].name : "";
      const options = pve?.choices[id];
      const matchKey = state.matchId + ":" + state.epoch;
      if (match !== matchKey) { match = matchKey; deferred = false; }
      $("pve-progress").hidden = !pve;
      if (pve) {
        $("pve-level").textContent = "团队 Lv." + pve.level + " · 经验 " + pve.xp + "/" + C.PVE.progression.xpNeeded(pve.level);
        $("pve-xp").max = C.PVE.progression.xpNeeded(pve.level); $("pve-xp").value = pve.xp;
        $("pve-build").textContent = Object.entries(pve.upgrades[id]).filter(([,level])=>level>0).map(([key,level])=>C.PVE.rewards[key].name+" "+level).join(" · ") || "击杀升级，打造自己的流派";
        $("pve-boss").textContent = boss ? bossName + " " + Math.ceil(boss.hp) + "/" + boss.maxHp +
          (pve.boss.telegraph ? " · 红圈即将爆发，离开落点！" : boss.hp < boss.maxHp/2 ? " · 狂暴" : "") :
          pve.boss.stage < 1 ? "第 8 波：零号感染体" : pve.boss.stage < 2 ? "第 16 波：泰坦感染体" : "泰坦已击败";
      }
      const healthScale = pve ? (1 + C.RULES.pveHealthPerPlayer * (pve.teamSize - 1)) *
        (1 + C.RULES.pveHealthPerWave * (Math.max(1, pve.wave) - 1)) : 1;
      $("mission-title").textContent = pve ? "CO-OP SURVIVAL / 16" : "FREE FOR ALL / 8";
      $("mission-rule").textContent = pve
        ? pve.teamSize + " 人 / 血量×" + healthScale.toFixed(2) + " · 第 " + pve.wave + " 波 · " +
          (boss?.alive ? bossName + " 战" : pve.nextWaveAt ? Math.max(0, Math.ceil((pve.nextWaveAt - state.tick) / 60)) + " 秒后下一波" : "待入场 " + pve.queue + " 只")
        : "8 分钟 · 先到 15 次击毁";
      $("score-title").textContent = pve ? "合作肉鸽 · 击败第 16 波泰坦" : "计分板 · 15 次击毁获胜";
      $("enemy-capacity").textContent = pve ? " / 16 僵尸" : " / 7";
      const alive = state.entities.find(e=>e.id===id)?.alive;
      toggle.hidden = !options || state.status !== "playing" || !alive;
      toggle.textContent = (deferred ? "U 展开升级" : "U 暂存升级") + " · 待选 " + (pve?.pending[id] || 0);
      panel.hidden = toggle.hidden || deferred;
      if (!options || state.status !== "playing") { current = null; signature = ""; return; }
      current = { wave: pve.wave, options, offerId: pve.choiceIds[id] };
      if (panel.hidden) return;
      $("pve-reward-title").textContent = "升级！剩余 " + pve.pending[id] + " 次 · 三选一（1 / 2 / 3）";
      const next = state.epoch + ":" + current.offerId + ":" + options.join(",");
      if (signature === next) return;
      signature = next;
      cards.replaceChildren(...options.map((key, index) => {
        const button = document.createElement("button"), title = document.createElement("strong"), detail = document.createElement("span");
        button.type = "button";
        title.textContent = (index + 1) + " · " + C.PVE.rewards[key].name;
        detail.textContent = C.PVE.rewards[key].description;
        button.append(title, detail);
        button.addEventListener("click", () => select(index));
        return button;
      }));
    },
  };
};
