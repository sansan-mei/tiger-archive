/* External script so registration works with script-src 'self'. */
(() => {
  if (!window.navigator?.serviceWorker) return;
  const register = () => window.navigator.serviceWorker.register("/service-worker.js", {
    updateViaCache: "none",
  }).catch((error) => console.warn("PWA 注册失败：", error));
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
})();
