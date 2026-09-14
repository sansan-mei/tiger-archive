/* Preload in parallel; execute sequentially and stop at the first failed dependency. */
(async () => {
  try {
    for (const href of window.TankAppManifest.scripts) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "script";
      link.href = href;
      document.head.appendChild(link);
    }
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
