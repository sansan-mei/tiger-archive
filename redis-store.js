"use strict";
const { randomBytes } = require("node:crypto");
// Lease and checkpoint are updated together, so an expired owner cannot overwrite a newer server.
const SAVE_SCRIPT =
  "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('PEXPIRE',KEYS[1],15000) redis.call('SET',KEYS[2],ARGV[2],'EX',86400) return 1";
const RELEASE_SCRIPT =
  "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
class RedisStore {
  constructor(client, { prefix = "tiger:rooms:v10", timeoutMs = 3000 } = {}) {
    if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix))
      throw new Error("Invalid REDIS_PREFIX");
    this.client = client;
    this.prefix = prefix;
    this.token = randomBytes(24).toString("hex");
    this.timeoutMs = timeoutMs;
  }
  async bounded(promise) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Redis operation timed out")),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async open() {
    await this.bounded(this.client.connect());
    const lock = await this.bounded(
      this.client.set(this.prefix + ":lease", this.token, {
        NX: true,
        PX: 15000,
      }),
    );
    if (lock !== "OK")
      throw new Error(
        "Another game server owns this REDIS_PREFIX; wait for its lease to expire",
      );
    const data = await this.bounded(
      this.client.get(this.prefix + ":checkpoint"),
    );
    return data ? JSON.parse(data) : null;
  }
  async save(checkpoint) {
    const result = await this.bounded(
      this.client.eval(SAVE_SCRIPT, {
        keys: [this.prefix + ":lease", this.prefix + ":checkpoint"],
        arguments: [this.token, JSON.stringify(checkpoint)],
      }),
    );
    if (result !== 1) throw new Error("Redis authority lease lost");
  }
  async close() {
    try {
      await this.bounded(
        this.client.eval(RELEASE_SCRIPT, {
          keys: [this.prefix + ":lease"],
          arguments: [this.token],
        }),
      );
    } finally {
      if (this.client.isOpen) this.client.destroy();
    }
  }
  abort() {
    if (this.client.isOpen) this.client.destroy();
  }
}
module.exports = { RedisStore, SAVE_SCRIPT, RELEASE_SCRIPT };
