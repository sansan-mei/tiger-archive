/* Small wave HUD and keyboard/touch reward choices; sends intentions only. */
(window.TankClient ??= {}).createPveUI = function ({ C, $, choose }) {
  const panel = $("pve-rewards"), cards = $("pve-choices");
  let current = null, signature = "";
  function select(index) {
    if (current?.options[index]) choose(current.wave, current.options[index]);
  }
  document.addEventListener("keydown", (event) => {
    if (event.repeat || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName)) return;
    const index = ["Digit1", "Digit2", "Digit3"].indexOf(event.code);
    if (index >= 0 && current && !panel.hidden) {
      event.preventDefault();
      select(index);
    }
  });
  return {
    update(state, id) {
      const pve = state.mode === "pve" ? state.pve : null;
      const options = pve?.choices[id];
      $("mission-title").textContent = pve ? "CO-OP SURVIVAL / 8" : "FREE FOR ALL / 8";
      $("mission-rule").textContent = pve
        ? pve.teamSize + " 人 / 血量×" + (1 + C.RULES.pveHealthPerPlayer * (pve.teamSize - 1)).toFixed(2) + " · 第 " + pve.wave + " 波 · " + (pve.nextWaveAt ? Math.max(0, Math.ceil((pve.nextWaveAt - state.tick) / 60)) + " 秒后下一波" : "待入场 " + pve.queue + " 只")
        : "8 分钟 · 先到 15 次击毁";
      $("score-title").textContent = pve ? "合作生存 · 撑满 8 分钟撤离" : "计分板 · 15 次击毁获胜";
      $("enemy-capacity").textContent = pve ? " / 16 僵尸" : " / 7";
      panel.hidden = !options || state.status !== "playing";
      if (panel.hidden) { current = null; signature = ""; return; }
      current = { wave: pve.wave, options };
      $("pve-reward-title").textContent = "第 " + pve.wave + " 波已清理 · 选择一项升级（1 / 2 / 3）";
      const next = state.epoch + ":" + pve.wave + ":" + options.join(",");
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
