import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSISTANT_TOOLS,
  ATELIER_TOOLS,
  LEGACY_AGENT_TOOLS,
  isToolAllowedForProfile,
  isCustomSkill,
  resolveSessionProfile,
} from "./toolProfiles.js";

test("les profils assistant et atelier sont disjoints sur les outils de code et de web", () => {
  // Aucun outil de code de l'Atelier ne doit figurer dans l'assistant.
  for (const tool of ATELIER_TOOLS) {
    assert.equal(
      ASSISTANT_TOOLS.has(tool),
      false,
      `L'outil Atelier "${tool}" ne doit pas être exposé à l'assistant.`,
    );
  }
  // L'assistant possède bien le web ; l'Atelier ne doit pas l'avoir.
  assert.equal(ASSISTANT_TOOLS.has("browser_search"), true);
  assert.equal(ATELIER_TOOLS.has("browser_search"), false);
});

test("l'assistant n'a aucun outil d'écriture, de commande ou d'agent", () => {
  const forbiddenForAssistant = [
    "write_project_file",
    "modify_project_file",
    "patch_project_file",
    "delete_project_file",
    "run_project_command",
    "agent_orchestrate",
    "agent_delegate",
    "mission_create",
    "reasoning_think",
    "verify_typecheck",
    "security_audit",
  ];
  for (const tool of forbiddenForAssistant) {
    assert.equal(
      isToolAllowedForProfile("assistant", tool),
      false,
      `"${tool}" ne doit jamais être autorisé en profil assistant.`,
    );
  }
});

test("un appel forcé d'un outil Atelier est refusé côté assistant (garde d'exécution)", () => {
  // Simule un outil appelé malgré son absence des functionDeclarations.
  assert.equal(isToolAllowedForProfile("assistant", "write_project_file"), false);
  assert.equal(isToolAllowedForProfile("assistant", "run_project_command"), false);
});

test("l'assistant autorise bien ses outils web/mémoire/heure/météo/telegram", () => {
  const allowed = [
    "browser_search",
    "browser_research",
    "save_memory",
    "search_memory",
    "get_current_time",
    "get_weather",
    "create_rich_document",
    "generate_image",
    "telegram_notify",
    "list_list_all",
    "automation_search",
  ];
  for (const tool of allowed) {
    assert.equal(
      isToolAllowedForProfile("assistant", tool),
      true,
      `"${tool}" devrait être autorisé en profil assistant.`,
    );
  }
});

test("l'Atelier autorise les outils de code mais pas le web", () => {
  const atelierAllowed = [
    "read_project_file",
    "write_project_file",
    "run_project_command",
    "verify_typecheck",
    "security_audit",
    "graphify_query",
  ];
  for (const tool of atelierAllowed) {
    assert.equal(isToolAllowedForProfile("atelier", tool), true, `"${tool}" devrait être autorisé en Atelier.`);
  }
  // Le web est volontairement absent de l'Atelier (session « propre »).
  assert.equal(isToolAllowedForProfile("atelier", "browser_search"), false);
});

test("les custom skills sont autorisés dans les deux profils", () => {
  assert.equal(isCustomSkill("custom_mon_skill"), true);
  assert.equal(isCustomSkill("browser_search"), false);
  assert.equal(isToolAllowedForProfile("assistant", "custom_mon_skill"), true);
  assert.equal(isToolAllowedForProfile("atelier", "custom_mon_skill"), true);
});

test("les outils MCP ne sont tolérés qu'en assistant", () => {
  assert.equal(isToolAllowedForProfile("assistant", "mcp_outil_externe", { isMcp: true }), true);
  assert.equal(isToolAllowedForProfile("atelier", "mcp_outil_externe", { isMcp: true }), false);
});

test("les agents legacy respectent le flag et restent réservés à l'Atelier", () => {
  for (const tool of LEGACY_AGENT_TOOLS) {
    // Désactivés par défaut, même en Atelier.
    assert.equal(
      isToolAllowedForProfile("atelier", tool, { legacyAgentsEnabled: false }),
      false,
      `"${tool}" ne doit pas passer en Atelier quand le flag legacy est désactivé.`,
    );
    // Activés : autorisés en Atelier uniquement.
    assert.equal(isToolAllowedForProfile("atelier", tool, { legacyAgentsEnabled: true }), true);
    // Jamais en assistant, flag ou pas.
    assert.equal(isToolAllowedForProfile("assistant", tool, { legacyAgentsEnabled: true }), false);
  }
});

test("resolveSessionProfile : assistant par défaut, atelier verrouillé hors legacy-ide", () => {
  // Aucun paramètre → assistant.
  assert.equal(
    resolveSessionProfile({ profileParam: null, legacyMode: null, productMode: "assistant" }),
    "assistant",
  );
  // ?mode=ask → assistant (rétrocompat).
  assert.equal(
    resolveSessionProfile({ profileParam: null, legacyMode: "ask", productMode: "assistant" }),
    "assistant",
  );
  // ?profile=atelier sans jeton et hors legacy-ide → refusé → assistant.
  assert.equal(
    resolveSessionProfile({ profileParam: "atelier", legacyMode: null, productMode: "assistant" }),
    "assistant",
  );
  // ?profile=atelier avec jeton valide → atelier.
  assert.equal(
    resolveSessionProfile({
      profileParam: "atelier",
      legacyMode: null,
      productMode: "assistant",
      atelierTokenValid: true,
    }),
    "atelier",
  );
  // En mode legacy-ide, l'atelier est permis (migration).
  assert.equal(
    resolveSessionProfile({ profileParam: "atelier", legacyMode: null, productMode: "legacy-ide" }),
    "atelier",
  );
  // ?mode=full en legacy-ide → atelier (ancien comportement « tous outils »).
  assert.equal(
    resolveSessionProfile({ profileParam: null, legacyMode: "full", productMode: "legacy-ide" }),
    "atelier",
  );
});
