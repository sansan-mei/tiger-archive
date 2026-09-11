/* Public room discovery is separate from the active match WebSocket. */
(window.TankClient ??= {}).createRoomBrowser = function ({
  $,
  C,
  onJoin,
  fetchImpl = globalThis.fetch,
}) {
  const list = $("room-list"),
    status = $("room-list-status"),
    refresh = $("refresh-rooms");
  let loading = false,
    busy = false,
    nextRefresh = 0,
    rows = [];
  function setBusy(value) {
    busy = value;
    for (const { button, room } of rows)
      button.disabled = busy || !room.joinable;
    refresh.disabled = busy || loading;
  }
  async function load() {
    if (loading || busy) return;
    loading = true;
    refresh.disabled = true;
    status.textContent = "正在刷新房间…";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchImpl("/api/rooms", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("房间列表暂时不可用，请稍后刷新。");
      const data = await response.json();
      if (data.version !== C.VERSION)
        throw new Error("版本已更新，请刷新整个页面。");
      if (!Array.isArray(data.rooms))
        throw new Error("房间列表格式异常，请稍后刷新。");
      rows = [];
      list.replaceChildren();
      for (const room of data.rooms) {
        const card = document.createElement("div"),
          info = document.createElement("div"),
          title = document.createElement("strong"),
          detail = document.createElement("span"),
          button = document.createElement("button");
        card.className = "room-card";
        title.textContent = (room.mode === "pve" ? "[合作生存] " : "[自由混战] ") + room.hostName + "的房间";
        const phase =
          { lobby: "等待玩家", playing: "战斗中", finished: "已结束" }[
            room.phase
          ] || "不可用";
        detail.textContent =
          room.code +
          " · " +
          room.players +
          " / " +
          room.capacity +
          " 人 · " +
          phase;
        info.append(title, detail);
        button.type = "button";
        button.textContent = room.joinable
          ? "加入房间 →"
          : room.players >= room.capacity
            ? "已满员"
            : phase;
        button.disabled = busy || !room.joinable;
        button.addEventListener("click", () => {
          if (!busy && room.joinable) onJoin(room.code);
        });
        card.append(info, button);
        list.appendChild(card);
        rows.push({ room, button });
      }
      status.textContent = data.rooms.length
        ? "共 " + data.rooms.length + " 个房间 · 每 5 秒更新"
        : "暂无房间，创建一个邀请朋友来玩吧。";
    } catch (error) {
      rows = [];
      list.replaceChildren();
      status.textContent =
        error.name === "AbortError"
          ? "连接超时，点击刷新重试。"
          : error.message || "无法获取房间，请刷新重试。";
    } finally {
      clearTimeout(timer);
      loading = false;
      refresh.disabled = busy;
    }
  }
  refresh.addEventListener("click", () => {
    nextRefresh = 0;
    void load();
  });
  return {
    setBusy,
    refresh: load,
    update(time, visible) {
      if (!visible || loading || busy || time < nextRefresh) return;
      nextRefresh = time + 5000;
      void load();
    },
  };
};
