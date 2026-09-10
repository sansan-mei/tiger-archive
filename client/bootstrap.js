/* Classic scripts load sequentially without a bundler or development server. */
(async () => {
  try {
    for (const src of window.TankAppManifest.scripts)
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error("组件加载失败：" + src));
        document.head.appendChild(script);
      });
  } catch (error) {
    const message = document.getElementById("load-error"),
      start = document.getElementById("start-button");
    message.hidden = false;
    message.textContent = error.message + "，请刷新重试。";
    start.disabled = true;
    start.textContent = "战场未能加载";
  }
})();
