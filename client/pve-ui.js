/* Small wave HUD and keyboard/touch reward choices; sends intentions only. */
(window.TankClient ??= {}).createPveUI = function ({ C, $, choose, onFormation = () => {} }) {
  const compact = () => window.matchMedia?.("(max-width: 700px), (pointer: coarse) and (max-height: 600px), (max-width: 1000px) and (max-height: 500px)").matches === true;
  const panel = $("pve-rewards"), cards = $("pve-choices");
  let current = null, signature = "", deferred = false, match = null;
  const branches = C.PVE.progression.branches;
  const routes = branches.routes.map(route => ({ key: route.keys.at(-1), label: route.label,
    ...C.PVE.rewards[route.keys.at(-1)] }));
  const toast = $("pve-formation"), badge = $("pve-formed");
  let seen = null, toastUntil = 0;
  function formed(state, id) {
    return routes.filter(route => state.pve?.upgrades[id]?.[route.key] > 0);
  }
  const toggle = $("pve-toggle");
  toggle.addEventListener("click", () => { deferred = !deferred; });
  function select(index) {
    if (current?.options[index]) {
      choose(current.wave, current.options[index], current.offerId);
      if (compact()) deferred = true;
    }
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
    summary(state, id) {
      const completed = formed(state, id);
      return completed.length ? "本局成型 · " + completed.map(route =>
        route.label + " · " + C.PVE.rewards[route.key].name).join(" ｜ ") : "本局尚未解锁终极进阶";
    },
    update(state, id, time = performance.now()) {
      const pve = state.mode === "pve" ? state.pve : null,
        boss = pve ? state.entities.find(e => ['boss','titan'].includes(e.zombieType) && e.alive) : null,
        bossName = boss ? C.ZOMBIE_SPECS[boss.zombieType].name : "";
      const options = pve?.choices[id];
      const matchKey = state.mode + ":" + state.matchId + ":" + state.epoch + ":" + id;
      if (match !== matchKey) {
        match = matchKey; deferred = compact(); signature = ""; seen = null; toastUntil = 0;
      }
      const completed = pve ? formed(state, id) : [];
      const fresh = completed.filter(route => seen && !seen.has(route.key));
      // First snapshot establishes a baseline, including when joining an existing run.
      if (pve) {
        if (!seen) seen = new Set();
        for (const route of completed) seen.add(route.key);
      }
      if (fresh.length && state.status === "playing") {
        $("pve-formation-title").textContent = fresh.map(route => route.label + "成型 · " + route.name).join(" ｜ ");
        $("pve-formation-detail").textContent = fresh.map(route => route.description).join("；");
        toastUntil = time + 5000;
        onFormation();
      }
      if (!pve || state.status !== "playing") toastUntil = 0;
      toast.hidden = !toastUntil || time >= toastUntil;
      const weapon = state.entities.find(e => e.id === id)?.weaponType;
      badge.hidden = !pve || !completed.length;
      badge.textContent = completed.map(route => route.label + "已成型" +
        (route.weapon === weapon ? " · " + route.name : "（换回对应武器生效）")).join(" ｜ ");
      $("pve-progress").hidden = !pve;
      if (pve) {
        $("pve-level").textContent = compact()
          ? "第 " + pve.wave + " 波 · Lv." + pve.level
          : "团队 Lv." + pve.level + " · 经验 " + pve.xp + "/" + C.PVE.progression.xpNeeded(pve.level);
        $("pve-progress").dataset.bossActive = String(!!boss);
        $("pve-xp").max = C.PVE.progression.xpNeeded(pve.level); $("pve-xp").value = pve.xp;
        const acquired=Object.entries(pve.upgrades[id]).filter(([,level])=>level>0);
        const selected=branches.routes.filter(route=>acquired.some(([key])=>route.keys.includes(key)));
        const ordinary=acquired.filter(([key])=>!C.PVE.rewards[key]?.module)
          .map(([key,level])=>C.PVE.rewards[key].name+" "+level);
        const modules=acquired.filter(([key])=>C.PVE.rewards[key]?.module)
          .map(([key,level])=>C.PVE.rewards[key].name+(C.PVE.progression.caps[key]>1?" "+level+"级":""));
        $("pve-build").textContent=[selected.length?"路线："+selected.map(route=>route.label).join(" / "):"",ordinary.length?ordinary.join(" · "):"",
          modules.length?"通用模块 "+modules.length+"："+modules.join(" · "):""].filter(Boolean).join(" ｜ ") || "击杀升级，打造自己的流派";
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
      $("enemy-capacity").textContent = pve ? ` / ${C.PVE.MAX_ZOMBIES - 1} 僵尸` : " / 7";
      const alive = state.entities.find(e=>e.id===id)?.alive;
      toggle.hidden = !options || state.status !== "playing" || !alive;
      toggle.textContent = (deferred ? (compact() ? "升级" : "U 展开升级") : (compact() ? "收起" : "U 暂存升级")) + " · 待选 " + (pve?.pending[id] || 0);
      panel.hidden = toggle.hidden || deferred;
      if (!options || state.status !== "playing") { current = null; signature = ""; return; }
      current = { wave: pve.wave, options, offerId: pve.choiceIds[id] };
      if (panel.hidden) return;
      $("pve-reward-title").textContent = "升级！剩余 " + pve.pending[id] + (compact() ? " 次 · 三选一" : " 次 · 三选一（1 / 2 / 3）");
      const next = state.epoch + ":" + current.offerId + ":" + options.join(",");
      if (signature === next) return;
      signature = next;
      cards.replaceChildren(...options.map((key, index) => {
        const button = document.createElement("button"), title = document.createElement("strong"), detail = document.createElement("span");
        button.type = "button";
        const ultimate = routes.find(route => route.key === key);
        if (ultimate) button.dataset.ultimate = "true";
        title.textContent = (index + 1) + " · " + (ultimate ? "终极进阶｜" : C.PVE.rewards[key].module ? "通用模块｜" : "") + C.PVE.rewards[key].name;
        const branch = branches.routeFor(key), fork = branch?.keys[0] === key;
        if (fork) {
          button.dataset.branch = "true";
          title.textContent = (index + 1) + " · 分支：" + branch.label + "｜" + C.PVE.rewards[key].name;
        }
        detail.textContent = C.PVE.rewards[key].description + (fork
          ? "。选择后锁定本武器路线。后续：" + branch.keys.slice(1).map(k => C.PVE.rewards[k].name).join(" → ") +
            "。终极：" + C.PVE.rewards[branch.keys.at(-1)].description : "");
        button.append(title, detail);
        button.addEventListener("click", () => select(index));
        return button;
      }));
    },
  };
};
