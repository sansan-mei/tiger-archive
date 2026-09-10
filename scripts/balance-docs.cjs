/* Documentation generation only; does not bundle code or start a service. */
const fs = require("node:fs");
const path = require("node:path");
const C = require("../battle-core.js");
function renderBalance() {
  const rows = Object.values(C.TANKS).map(
    (t) =>
      `| ${t.name} | ${t.hp} | ${t.shield} | ${t.speed} | ${C.describeAbility(t.ability)} |`,
  );
  const units = [
    "| 单位 | 装甲 | 基础护盾 | 速度 m/s | Shift 技能 |",
    "|---|---:|---:|---:|---|",
    ...rows,
  ].join("\n");
  const weapons = [
    "| 武器 | 直击 | 爆炸上限 | 装填秒 | 预热/蓄力秒 | 轻型 / 中型 / 重型 / 人类击毁命中数 |",
    "|---|---:|---:|---:|---:|---|",
    ...Object.values(C.WEAPONS).map((w) => {
      const hits = ["light", "medium", "heavy", "human"]
        .map((id) => {
          let remaining = C.TANKS[id].hp + C.TANKS[id].shield,
            hits = 0;
          while (remaining > 0) {
            hits++;
            const critical =
              w.criticalHits && hits % (w.criticalHits + 1) === 0;
            remaining -=
              w.damage * (critical ? w.criticalMultiplier : 1) +
              (w.splashDamage || 0);
          }
          return hits;
        })
        .join(" / ");
      return `| ${w.name} | ${w.damage}${w.criticalHits ? " / 强化 " + w.damage * w.criticalMultiplier : ""} | ${w.splashDamage || 0} | ${w.cooldown / C.TICK_RATE} | ${w.charge / C.TICK_RATE} | ${hits} |`;
    }),
  ].join("\n");
  return `${units}\n\n${weapons}\n\n枪数基准：满装甲满基础护盾、无技能或补给、连续满威力直接命中，不触发脱战恢复；火箭直击目标追加满额爆炸伤害；标准炮从零进度开始，每两次普通命中后的下一发强化。`;
}
const start = "<!-- BALANCE:START -->",
  end = "<!-- BALANCE:END -->";
function update(source) {
  const a = source.indexOf(start),
    b = source.indexOf(end);
  if (a < 0 || b < a) throw new Error("README balance markers missing");
  return (
    source.slice(0, a + start.length) +
    "\n" +
    renderBalance() +
    "\n" +
    source.slice(b)
  );
}
if (require.main === module) {
  const file = path.join(__dirname, "../README.md"),
    source = fs.readFileSync(file, "utf8"),
    next = update(source);
  if (process.argv.includes("--write")) fs.writeFileSync(file, next);
  else if (source !== next) {
    console.error(
      "Balance documentation is stale: node scripts/balance-docs.cjs --write",
    );
    process.exitCode = 1;
  }
}
module.exports = { renderBalance, update };
