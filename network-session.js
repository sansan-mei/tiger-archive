/* Browser WebSocket transport; simulation stays on the server. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(
    node ? require("./battle-core.js") : root.TankBattle,
    node ? require("./battle-session.js") : root.TankSession,
  );
  if (node) module.exports = api;
  else root.TankNetwork = api;
})(typeof window === "undefined" ? globalThis : window, function (C, S) {
  "use strict";
  const STATE_TIMEOUT_MS = 1500,
    RECONNECT_TIMEOUT_MS = 5000;
  class NetworkSession {
    constructor({
      url,
      WebSocketImpl = globalThis.WebSocket,
      now = () => performance.now(),
      onRoom = () => {},
      onMatch = () => {},
      onStatus = () => {},
      onError = () => {},
      onLeft = () => {},
      storage = globalThis.sessionStorage,
      schedule = setTimeout,
      cancel = clearTimeout,
    } = {}) {
      Object.assign(this, {
        url,
        WebSocketImpl,
        now,
        onRoom,
        onMatch,
        onStatus,
        onError,
        onLeft,
        storage,
        schedule,
        cancel,
      });
      this.online = true;
      this.replica = new S.Replica();
      this.events = [];
      this.room = null;
      this.credentials = null;
      this.socket = null;
      this.stopped = false;
      this.suspended = true;
      this.sequence = 0;
      this.lastSent = 0;
      this.receivedAt = 0;
      this.progressAt = 0;
      this.stale = false;
      this.lastInput = "";
      this.retry = 0;
    }
    connect(action) {
      this.cancel(this.timer);
      this.stopped = false;
      this.accepted = false;
      this.action = action;
      this.onStatus("正在连接服务器…");
      const ws = new this.WebSocketImpl(this.url);
      this.socket = ws;
      ws.addEventListener("open", () => {
        if (this.socket !== ws) return;
        this.retry = 0;
        this.onStatus("已连接");
        this.send({
          ...this.action,
          version: C.VERSION,
          pluginManifest: C.PLUGIN_MANIFEST,
        });
      });
      ws.addEventListener("message", (e) => {
        if (this.socket !== ws) return;
        this.message(e.data);
      });
      ws.addEventListener("error", () => {
        if (this.socket === ws)
          this.onStatus("连接异常，检查服务器地址与反向代理");
      });
      ws.addEventListener("close", () => {
        if (this.socket !== ws || this.stopped) return;
        this.suspended = true;
        this.onStatus("连接断开，正在重连（服务器保留席位 30 秒）");
        if (this.credentials) {
          this.timer = this.schedule(
            () => this.connect({ type: "resume", ...this.credentials }),
            Math.min(5000, 500 * 2 ** this.retry++),
          );
        } else {
          this.onError("连接失败，请确认通过服务器网址打开页面");
          this.stopped = true;
        }
      });
    }
    send(message) {
      const ws = this.socket;
      if (!ws || ws.readyState !== 1) return false;
      if (ws.bufferedAmount > 65536) {
        ws.close(4000, "Send queue full");
        return false;
      }
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    }
    message(raw) {
      try {
        const m = S.decode(raw);
        if (m.type === "joined") {
          this.accepted = true;
          this.credentials = { code: m.code, token: m.token };
          this.entityId = m.entityId;
          try {
            this.storage?.setItem(
              "tank-room",
              JSON.stringify(this.credentials),
            );
          } catch {}
          return;
        }
        if (m.type === "room") {
          this.room = m;
          this.onRoom(m);
          return;
        }
        if (m.type === "welcome") {
          this.replica.welcome(m);
          this.sequence = 0;
          this.events = [];
          this.lastInput = "";
          return;
        }
        if (m.type === "state") {
          const first = !this.replica.current,
            previousTick = this.replica.current?.tick;
          const result = this.replica.receive(m);
          if (!result.ok) throw new Error(result.reason);
          this.stableState = this.replica.current;
          this.receivedAt = this.now();
          if (
            first ||
            this.replica.current.tick > previousTick ||
            this.replica.current.status !== "playing"
          ) {
            this.progressAt = this.receivedAt;
            const recovered = this.stale;
            this.stale = false;
            if (recovered && !first)
              this.onStatus("战场同步已恢复，点击继续战斗");
          }
          if (!first) this.events.push(...result.events);
          if (first) {
            this.suspended = false;
            this.onMatch(this);
          }
          return;
        }
        if (m.type === "left") {
          this.forget();
          this.close();
          this.onLeft();
          return;
        }
        if (m.type === "error") {
          this.onError(m.message);
          if (!this.accepted) {
            this.forget();
            this.close();
            this.onLeft();
          }
          return;
        }
      } catch {
        this.onError("服务器数据不兼容，请刷新后重新加入");
        this.close();
      }
    }
    input(input = {}, force = false) {
      if (
        this.stopped ||
        this.stale ||
        !this.replica.current ||
        this.replica.current.status !== "playing"
      )
        return;
      const value = this.suspended ? { cancelFire: true } : input,
        serialized = JSON.stringify(value),
        now = this.now();
      // Changed controls (including release) go out immediately. Stable input is 30 Hz.
      // Aim-only changes are capped at 30 Hz so a high-refresh display cannot flood peers.
      const flags = JSON.stringify({
        ...value,
        aimYaw: undefined,
        aimPitch: undefined,
        moveYaw: undefined,
      });
      if (!force && flags === this.lastFlags && now - this.lastSent < 1000 / 30)
        return;
      if (
        this.send({
          version: C.VERSION,
          type: "input",
          matchId: this.replica.matchId,
          epoch: this.replica.epoch,
          connection: this.replica.connection,
          seq: this.sequence++,
          clientTick: this.replica.current.tick,
          input: value,
        })
      ) {
        this.lastInput = serialized;
        this.lastFlags = flags;
        this.lastSent = now;
      }
    }
    checkState() {
      if (
        this.stopped ||
        this.socket?.readyState !== 1 ||
        !this.replica.current ||
        this.replica.current.status !== "playing" ||
        this.room?.phase === "lobby"
      )
        return;
      const age = this.now() - this.progressAt;
      if (age >= STATE_TIMEOUT_MS && !this.stale) {
        // Cancel held actions once, then stop submitting inputs against an old server tick.
        this.pause();
        this.stale = true;
        this.onStatus("战场同步超时，操作已暂停，正在等待恢复…");
      }
      if (age >= RECONNECT_TIMEOUT_MS)
        this.socket?.close(4001, "State timeout");
    }
    advance(seconds, input) {
      this.checkState();
      this.input(input);
      return this.events.splice(0);
    }
    state() {
      if (!this.replica.current) return this.stableState;
      const gap = this.replica.previous
        ? ((this.replica.current.tick - this.replica.previous.tick) / 60) * 1000
        : 50;
      return this.replica.renderState(
        Math.min(1, (this.now() - this.receivedAt) / Math.max(1, gap)),
      );
    }
    current() {
      return this.replica.current || this.stableState;
    }
    get playerId() {
      return this.replica.entityId;
    }
    start() {
      this.checkState();
      if (
        this.stopped ||
        this.stale ||
        this.socket?.readyState !== 1 ||
        !this.replica.current ||
        this.replica.current.status !== "playing"
      )
        return false;
      this.suspended = false;
      return true;
    }
    pause() {
      this.suspended = true;
      this.input({ cancelFire: true }, true);
    }
    leave() {
      if (!this.send({ type: "leave" })) {
        this.forget();
        this.close();
        this.onLeft();
      }
    }
    forget() {
      this.credentials = null;
      try {
        this.storage?.removeItem("tank-room");
      } catch {}
    }
    close() {
      this.stopped = true;
      this.cancel(this.timer);
      const ws = this.socket;
      this.socket = null;
      ws?.close();
    }
  }
  return { NetworkSession, STATE_TIMEOUT_MS, RECONNECT_TIMEOUT_MS };
});
