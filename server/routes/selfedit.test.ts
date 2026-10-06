import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createSelfEditRouter } from "./selfedit.js";
import { consumeAtelierToken } from "../selfedit/selfEditToken.js";

async function callTokenRoute(selfEditEnabled: boolean): Promise<{ status: number; body: any }> {
  const saved = process.env.LEANNA_ENABLE_SELF_EDIT;
  process.env.LEANNA_ENABLE_SELF_EDIT = selfEditEnabled ? "true" : "false";

  const app = express();
  app.use(express.json());
  app.use("/api/selfedit", createSelfEditRouter());
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.on("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/selfedit/token`, { method: "POST" });
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    server.close();
    if (saved !== undefined) process.env.LEANNA_ENABLE_SELF_EDIT = saved;
    else delete process.env.LEANNA_ENABLE_SELF_EDIT;
  }
}

test("POST /token émet un jeton valide quand l'auto-édition est activée", async () => {
  const { status, body } = await callTokenRoute(true);
  assert.equal(status, 200);
  assert.match(body.token, /^[0-9a-f]{64}$/);
  assert.ok(body.ttlMs > 0);
  // Le jeton émis est réellement consommable.
  assert.equal(consumeAtelierToken(body.token), true);
});

test("POST /token renvoie 403 quand l'auto-édition est désactivée", async () => {
  const { status, body } = await callTokenRoute(false);
  assert.equal(status, 403);
  assert.equal(body.code, "SELF_EDIT_DISABLED");
});
