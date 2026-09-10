"use strict";
const { randomBytes } = require("node:crypto");
// Lease and checkpoint are updated together, so an expired owner cannot overwrite a newer server.
const SAVE_SCRIPT =
  "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('PEXPIRE',KEYS[1],15000) redis.call('SET',KEYS[2],ARGV[2],'EX',86400) return 1";
// Check both the lease and the exact value read before replacing anything.
const RESET_SCRIPT =
  "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end if redis.call('GET',KEYS[2])~=ARGV[2] then return -1 end redis.call('SET',KEYS[3],ARGV[2],'EX',86400) redis.call('SET',KEYS[2],ARGV[3],'EX',86400) redis.call('PEXPIRE',KEYS[1],15000) return 1";
const DEFAULT_PREFIX = "tiger:rooms:production";
const RELEASE_SCRIPT =
  "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
class RedisStore {
  constructor(client, { prefix = DEFAULT_PREFIX, timeoutMs = 3000 } = {}) {
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
    this.loadedRaw = data;
    if (data === null) return null;
    const checkpoint = JSON.parse(data);
    if (checkpoint === null) throw new Error("Invalid Redis checkpoint data");
    return checkpoint;
  }
  async recover(rooms) {
    const checkpoint = await this.open();
    try {
      rooms.restore(checkpoint);
    } catch (error) {
      if (error.code !== "CHECKPOINT_INCOMPATIBLE") throw error;
      if (rooms.rooms.size)
        throw new Error("Cannot reset a populated room server");
      const result = await this.bounded(
        this.client.eval(RESET_SCRIPT, {
          keys: [
            this.prefix + ":lease",
            this.prefix + ":checkpoint",
            this.prefix + ":checkpoint:previous",
          ],
          arguments: [
            this.token,
            this.loadedRaw,
            JSON.stringify(rooms.checkpoint()),
          ],
        }),
      );
      if (result === 0)
        throw new Error("Redis authority lease lost during recovery");
      if (result !== 1)
        throw new Error("Redis checkpoint changed during recovery");
      return {
        status: "reset",
        backupKey: this.prefix + ":checkpoint:previous",
      };
    }
    await this.save(rooms.checkpoint());
    return { status: checkpoint === null ? "empty" : "restored" };
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
module.exports = {
  RedisStore,
  SAVE_SCRIPT,
  RELEASE_SCRIPT,
  RESET_SCRIPT,
  DEFAULT_PREFIX,
};
