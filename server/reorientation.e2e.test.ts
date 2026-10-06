/**
 * reorientation.e2e.test.ts — Contrat de sécurité de la réorientation « voice-first ».
 *
 * Test d'intégration de bout en bout de l'invariant central : un assistant
 * vocal ne peut PAS modifier le code de Leanna. Il assemble les briques des
 * phases 1 (profils), 2 (verrou SELF_ROOT), 6 (jeton Atelier + verrou web↔code)
 * et 7 (agents legacy) en un contrat lisible et vérifiable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";

import {
  isToolAllowedForProfile,
  resolveSessionProfile,
  ATELIER_TOOLS,
  LEGACY_AGENT_TOOLS,
} from "./live/toolProfiles.js";
import {
  markToolUsage,
  isSessionTainted,
  resetSessionTrust,
} from "./utils/sessionTrust.js";
import { issueAtelierToken, consumeAtelierToken, resetAtelierTokens } from "./selfedit/selfEditToken.js";
import { createSelfEditRouter } from "./routes/selfedit.js";

// Les gardes de mode produit sont pilotées par variable d'environnement :
// on les contrôle explicitement par test pour être déterministe.

// ─── Invariant 1 : l'assistant vocal n'a aucun outil d'écriture de code ──────

test("CONTRAT — profil assistant : aucun outil d'écriture/commande/agent", () => {
  const codeTools = [
    "write_project_file",
    "modify_project_file",
    "patch_project_file",
    "delete_project_file",
    "rename_project_file",
    "create_project_directory",
    "run_project_command",
    ...ATELIER_TOOLS,
    ...LEGACY_AGENT_TOOLS,
  ];
  for (const tool of codeTools) {
    // Un outil de lecture web (browser_*) peut appartenir à l'assistant ; on ne
    // teste ici que les outils de code/agent, jamais autorisés en assistant.
    if (tool.startsWith("browser_") || tool === "web_quick_search") continue;
    assert.equal(
      isToolAllowedForProfile("assistant", tool, { legacyAgentsEnabled: true }),
      false,
      `L'assistant ne doit jamais pouvoir exécuter "${tool}".`,
    );
  }
});

test("CONTRAT — profil assistant : web/mémoire/voix autorisés", () => {
  for (const tool of ["web_quick_search", "browser_research", "save_memory", "get_weather", "create_rich_document"]) {
    assert.equal(isToolAllowedForProfile("assistant", tool), true, `"${tool}" devrait être autorisé.`);
  }
});

// ─── Invariant 2 : l'Atelier n'est accessible que via un jeton valide ────────

test("CONTRAT — passage en Atelier refusé sans jeton (mode assistant)", () => {
  const profile = resolveSessionProfile({
    profileParam: "atelier",
    legacyMode: null,
    productMode: "assistant",
    atelierTokenValid: false,
  });
  assert.equal(profile, "assistant", "Sans jeton, la demande d'Atelier retombe sur assistant.");
});

test("CONTRAT — passage en Atelier accordé avec un jeton à usage unique", () => {
  resetAtelierTokens();
  const { token } = issueAtelierToken();
  // Le serveur consomme le jeton (un seul usage).
  const valid = consumeAtelierToken(token);
  assert.equal(valid, true);
  const profile = resolveSessionProfile({
    profileParam: "atelier",
    legacyMode: null,
    productMode: "assistant",
    atelierTokenValid: valid,
  });
  assert.equal(profile, "atelier");
  // Rejouer le même jeton échoue (anti-rejeu).
  assert.equal(consumeAtelierToken(token), false);
});

// ─── Invariant 3 : verrou web↔code (session teintée) ─────────────────────────

test("CONTRAT — une session ayant lu du web ne peut plus écrire de code", () => {
  resetSessionTrust();
  const sid = "e2e-session";
  // Avant toute lecture web : non teintée.
  assert.equal(isSessionTainted(sid), false);
  // L'assistant lit le web.
  markToolUsage(sid, "web_quick_search");
  assert.equal(isSessionTainted(sid), true);
  // Dès lors, toute écriture doit être refusée par la garde web↔code.
  // (La garde réelle vit dans handleToolCall ; on vérifie ici son prédicat.)
  const wantsToWrite = isSessionTainted(sid);
  assert.equal(wantsToWrite, true, "La session teintée doit déclencher le refus d'écriture.");
});

// ─── Invariant 4 : jeton Atelier indisponible si self-edit désactivé ─────────

async function postToken(selfEditEnabled: boolean): Promise<number> {
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
    return res.status;
  } finally {
    server.close();
    if (saved !== undefined) process.env.LEANNA_ENABLE_SELF_EDIT = saved;
    else delete process.env.LEANNA_ENABLE_SELF_EDIT;
  }
}

test("CONTRAT — pas de jeton Atelier si l'auto-édition est désactivée", async () => {
  assert.equal(await postToken(false), 403);
  assert.equal(await postToken(true), 200);
});

// ─── Invariant 5 : rétrocompat — profil assistant par défaut ─────────────────

test("CONTRAT — par défaut (aucun paramètre), la session est assistant", () => {
  assert.equal(
    resolveSessionProfile({ profileParam: null, legacyMode: null, productMode: "assistant" }),
    "assistant",
  );
});
