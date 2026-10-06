import test from "node:test";
import assert from "node:assert/strict";
import {
  isWebTaintingTool,
  markToolUsage,
  isSessionTainted,
  taintSession,
  clearSession,
  resetSessionTrust,
} from "./sessionTrust.js";

test("isWebTaintingTool reconnaît les outils web", () => {
  resetSessionTrust();
  assert.equal(isWebTaintingTool("web_quick_search"), true);
  assert.equal(isWebTaintingTool("browser_research"), true);
  assert.equal(isWebTaintingTool("browser_read_content"), true);
  // Outils non-web : pas de teinte.
  assert.equal(isWebTaintingTool("write_project_file"), false);
  assert.equal(isWebTaintingTool("get_current_time"), false);
  assert.equal(isWebTaintingTool("save_memory"), false);
});

test("markToolUsage teinte une session dès un outil web", () => {
  resetSessionTrust();
  assert.equal(isSessionTainted("s1"), false);
  markToolUsage("s1", "get_current_time");
  assert.equal(isSessionTainted("s1"), false); // outil non-web
  markToolUsage("s1", "web_quick_search");
  assert.equal(isSessionTainted("s1"), true); // désormais teintée
});

test("la teinte est isolée par session", () => {
  resetSessionTrust();
  markToolUsage("a", "browser_search");
  assert.equal(isSessionTainted("a"), true);
  assert.equal(isSessionTainted("b"), false);
});

test("clearSession oublie la teinte (fermeture de connexion)", () => {
  resetSessionTrust();
  taintSession("x");
  assert.equal(isSessionTainted("x"), true);
  clearSession("x");
  assert.equal(isSessionTainted("x"), false);
});

test("un sessionId vide n'est jamais teinté", () => {
  resetSessionTrust();
  markToolUsage("", "web_quick_search");
  assert.equal(isSessionTainted(""), false);
});
