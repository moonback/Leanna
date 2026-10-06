import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { legacyOnly, isLegacyIdeMode } from "./legacyGuard.js";

// ── isLegacyIdeMode ──────────────────────────────────────────────────────────

test("isLegacyIdeMode retourne true si la variable n'est pas posée (rétrocompat)", () => {
  const saved = process.env.LEANNA_PRODUCT_MODE;
  delete process.env.LEANNA_PRODUCT_MODE;
  try {
    assert.equal(isLegacyIdeMode(), true);
  } finally {
    if (saved !== undefined) process.env.LEANNA_PRODUCT_MODE = saved;
  }
});

test("isLegacyIdeMode retourne true en mode legacy-ide", () => {
  const saved = process.env.LEANNA_PRODUCT_MODE;
  process.env.LEANNA_PRODUCT_MODE = "legacy-ide";
  try {
    assert.equal(isLegacyIdeMode(), true);
  } finally {
    if (saved !== undefined) process.env.LEANNA_PRODUCT_MODE = saved;
    else delete process.env.LEANNA_PRODUCT_MODE;
  }
});

test("isLegacyIdeMode retourne false en mode assistant", () => {
  const saved = process.env.LEANNA_PRODUCT_MODE;
  process.env.LEANNA_PRODUCT_MODE = "assistant";
  try {
    assert.equal(isLegacyIdeMode(), false);
  } finally {
    if (saved !== undefined) process.env.LEANNA_PRODUCT_MODE = saved;
    else delete process.env.LEANNA_PRODUCT_MODE;
  }
});

// ── Middleware legacyOnly (410 Gone) ─────────────────────────────────────────

async function fetchRoute(envMode: string | undefined): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.get("/test", legacyOnly, (_req, res) => res.json({ ok: true }));

  const saved = process.env.LEANNA_PRODUCT_MODE;
  if (envMode !== undefined) process.env.LEANNA_PRODUCT_MODE = envMode;
  else delete process.env.LEANNA_PRODUCT_MODE;

  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.on("listening", resolve));
    const addr = server.address() as import("net").AddressInfo;
    const res = await fetch(`http://127.0.0.1:${addr.port}/test`);
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    server.close();
    if (saved !== undefined) process.env.LEANNA_PRODUCT_MODE = saved;
    else delete process.env.LEANNA_PRODUCT_MODE;
  }
}

test("legacyOnly laisse passer sans variable LEANNA_PRODUCT_MODE", async () => {
  const { status, body } = await fetchRoute(undefined);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test("legacyOnly laisse passer en mode legacy-ide", async () => {
  const { status, body } = await fetchRoute("legacy-ide");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test("legacyOnly renvoie 410 Gone en mode assistant", async () => {
  const { status, body } = await fetchRoute("assistant");
  assert.equal(status, 410);
  assert.equal(body.code, "LEGACY_FEATURE_GONE");
});
