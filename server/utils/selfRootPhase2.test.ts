/**
 * Tests Phase 2 — verrouillage de SELF_ROOT et enrichissement de FORBIDDEN_WRITE_TARGETS.
 *
 * N'interfère pas avec les tests existants de selfRoot.test.ts / selfRoot.test.ts
 * (ceux-ci tournent sans LEANNA_PRODUCT_MODE, donc le verrou ne s'engage pas).
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  isWriteForbidden,
  setSelfRoot,
  Leanna_APP_ROOT,
  FORBIDDEN_WRITE_TARGETS,
} from "./selfRoot.js";

// ── Bootstrap : on pointe SELF_ROOT sur l'app (sans engager le verrou) ───────
setSelfRoot(path.resolve(Leanna_APP_ROOT));

// ── FORBIDDEN_WRITE_TARGETS enrichis ─────────────────────────────────────────

test("FORBIDDEN_WRITE_TARGETS contient les cibles durci de la Phase 2", () => {
  const expected = [".git", "node_modules", ".gemini-keys.json", ".Leanna", "release", "dist"];
  for (const target of expected) {
    assert.ok(
      FORBIDDEN_WRITE_TARGETS.includes(target),
      `FORBIDDEN_WRITE_TARGETS devrait contenir "${target}".`,
    );
  }
});

test("isWriteForbidden bloque .git entier (pas seulement .git/config et .git/HEAD)", () => {
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".git")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".git", "objects", "pack", "foo")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".git", "hooks", "pre-commit")), true);
});

test("isWriteForbidden bloque .env et ses variantes", () => {
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".env")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".env.test")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".env.example")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".env.local")), true);
});

test("isWriteForbidden bloque .gemini-keys.json", () => {
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".gemini-keys.json")), true);
});

test("isWriteForbidden bloque .Leanna (état interne)", () => {
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".Leanna")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, ".Leanna", "core", "ledger", "actions.jsonl")), true);
});

test("isWriteForbidden bloque release et dist", () => {
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, "release")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, "release", "win-unpacked", "Leanna.exe")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, "dist")), true);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, "dist", "server.cjs")), true);
});

test("isWriteForbidden autorise toujours les fichiers sources normaux", () => {
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, "server", "live", "toolProfiles.ts")), false);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, "src", "main.tsx")), false);
  assert.equal(isWriteForbidden(path.join(Leanna_APP_ROOT, "README.md")), false);
});

// ── setSelfRoot durci (verrou voice-first) ───────────────────────────────────

test("setSelfRoot accepte Leanna_APP_ROOT même en mode assistant", () => {
  const saved = process.env.LEANNA_PRODUCT_MODE;
  process.env.LEANNA_PRODUCT_MODE = "assistant";
  try {
    assert.doesNotThrow(() => setSelfRoot(Leanna_APP_ROOT));
  } finally {
    if (saved !== undefined) process.env.LEANNA_PRODUCT_MODE = saved;
    else delete process.env.LEANNA_PRODUCT_MODE;
  }
});

test("setSelfRoot rejette un chemin externe en mode assistant", () => {
  const saved = process.env.LEANNA_PRODUCT_MODE;
  process.env.LEANNA_PRODUCT_MODE = "assistant";
  try {
    assert.throws(
      () => setSelfRoot("C:\\nonexistent\\path\\that\\does\\not\\exist"),
      /SELF_ROOT verrouillé/,
    );
  } finally {
    if (saved !== undefined) process.env.LEANNA_PRODUCT_MODE = saved;
    else delete process.env.LEANNA_PRODUCT_MODE;
  }
});

test("setSelfRoot accepte un chemin quelconque en mode legacy-ide", () => {
  const saved = process.env.LEANNA_PRODUCT_MODE;
  process.env.LEANNA_PRODUCT_MODE = "legacy-ide";
  try {
    // Le chemin doit exister et être un dossier — Leanna_APP_ROOT convient.
    assert.doesNotThrow(() => setSelfRoot(Leanna_APP_ROOT));
  } finally {
    if (saved !== undefined) process.env.LEANNA_PRODUCT_MODE = saved;
    else delete process.env.LEANNA_PRODUCT_MODE;
  }
});

test("setSelfRoot ne bloque pas si aucune variable LEANNA_PRODUCT_MODE (rétrocompat tests)", () => {
  const saved = process.env.LEANNA_PRODUCT_MODE;
  delete process.env.LEANNA_PRODUCT_MODE;
  try {
    assert.doesNotThrow(() => setSelfRoot(Leanna_APP_ROOT));
  } finally {
    if (saved !== undefined) process.env.LEANNA_PRODUCT_MODE = saved;
  }
});
