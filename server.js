"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { performance } = require("node:perf_hooks");
const { WebSocketServer } = require("ws");
const { RoomServer } = require("./room-server.js");
const C = require("./battle-core.js");
const ROOT = __dirname;
function assetPath(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://local").pathname);
  } catch {
    return null;
  }
  if (pathname === "/") pathname = "/index.html";
  const allowed = new Set([
    "/index.html",
    "/battle.html",
    "/battle.css",
    "/app-manifest.js",
    "/client/bootstrap.js",
    ...require("./app-manifest.js").scripts.map((file) => "/" + file),
  ]);
  if (!allowed.has(pathname)) return null;
  return pathname === "/vendor/three.min.js"
    ? path.join(ROOT, "node_modules/three/build/three.min.js")
    : path.join(ROOT, pathname);
}
function originAllowed(req, publicOrigin) {
  try {
    const origin = new URL(req.headers.origin);
    if (!["http:", "https:"].includes(origin.protocol)) return false;
    return publicOrigin
      ? origin.origin === new URL(publicOrigin).origin
      : origin.host === req.headers.host;
  } catch {
    return false;
  }
}
function createApp({
  publicOrigin = process.env.PUBLIC_ORIGIN || "",
  maxRooms = 16,
} = {}) {
  const rooms = new RoomServer({ maxRooms });
  const server = http.createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({ ok: true, rooms: rooms.rooms.size }),
      );
      return;
    }
    if (req.url === "/api/rooms") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({
              version: C.VERSION,
              rooms: rooms.publicRooms(),
            }),
      );
      return;
    }
    const file = assetPath(req.url);
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
      };
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)],
        "Content-Length": stat.size,
        "Cache-Control": "no-cache",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = fs.createReadStream(file);
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16384,
    perMessageDeflate: false,
  });
  server.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/ws" ||
      !originAllowed(req, publicOrigin) ||
      rooms.clients.size >= rooms.maxClients
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws) => {
    const id = rooms.connect({
      get bufferedAmount() {
        return ws.bufferedAmount;
      },
      send: (data) => {
        if (ws.readyState !== 1) throw new Error("Closed");
        ws.send(data);
      },
      close: (code, reason) => {
        ws.close(code, reason);
        setTimeout(() => ws.terminate(), 1000).unref();
      },
    });
    if (!id) return;
    ws.alive = true;
    ws.on("pong", () => {
      ws.alive = true;
    });
    ws.on("message", (data, binary) => {
      if (binary) {
        ws.close(1003, "Text only");
        return;
      }
      rooms.receive(id, data.toString());
    });
    ws.on("close", () => rooms.disconnect(id));
    ws.on("error", () => rooms.disconnect(id));
  });
  let simulation, heartbeat;
  function start(port = 8080, host = "0.0.0.0") {
    let last = performance.now();
    simulation = setInterval(() => {
      const now = performance.now();
      rooms.advance((now - last) / 1000);
      last = now;
    }, 1000 / 60);
    heartbeat = setInterval(() => {
      for (const ws of wss.clients) {
        if (!ws.alive) {
          ws.terminate();
          continue;
        }
        ws.alive = false;
        ws.ping();
      }
    }, 10000);
    return server.listen(port, host);
  }
  function close() {
    clearInterval(simulation);
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close();
    server.closeIdleConnections();
  }
  return { server, wss, rooms, start, close };
}
async function main() {
  const port = Number(process.env.PORT || 8080),
    maxRooms = Number(process.env.MAX_ROOMS || 16);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(maxRooms) ||
    maxRooms < 1 ||
    maxRooms > 100
  )
    throw new Error("Invalid PORT / MAX_ROOMS");
  const app = createApp({ maxRooms });
  let store,
    timer,
    pending,
    stopping = false;
  async function stop(failed = false) {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    app.close();
    try {
      await pending;
      if (store && !failed) {
        await store.save(app.rooms.checkpoint());
        await store.close();
      } else store?.abort();
    } catch {
      store?.abort();
      failed = true;
    }
    if (failed) process.exitCode = 1;
  }
  try {
    if (process.env.REDIS_URL) {
      const { createClient } = require("redis"),
        { RedisStore } = require("./redis-store.js");
      const client = createClient({
        url: process.env.REDIS_URL,
        disableOfflineQueue: true,
        socket: { connectTimeout: 3000, reconnectStrategy: false },
      });
      client.on("error", () => console.error("Redis connection error")); // Never log a URL or credential.
      store = new RedisStore(client, {
        prefix: process.env.REDIS_PREFIX || "tiger:rooms:v9",
      });
      app.rooms.restore(await store.open());
      await store.save(app.rooms.checkpoint());
      timer = setInterval(() => {
        if (pending) return;
        pending = store.save(app.rooms.checkpoint());
        pending
          .catch(() => {
            console.error("Redis checkpoint/lease failed; stopping authority");
            stop(true);
          })
          .finally(() => {
            pending = null;
          });
      }, 1000);
    }
    app
      .start(port)
      .on("listening", () =>
        console.log(
          "Tank server listening on port " +
            port +
            (store ? " with Redis recovery" : " in memory mode"),
        ),
      )
      .on("error", () => {
        console.error("HTTP listen failed");
        stop(true);
      });
    for (const signal of ["SIGTERM", "SIGINT"])
      process.once(signal, () => stop());
  } catch {
    await stop(true);
    throw new Error(
      "Startup failed: check port, Redis connectivity, plugin version and exclusive REDIS_PREFIX",
    );
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { createApp, assetPath, originAllowed };
