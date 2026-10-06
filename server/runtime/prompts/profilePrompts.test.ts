import test from "node:test";
import assert from "node:assert/strict";
import { getProfilePromptSections, clearProfilePromptCache } from "./profilePrompts.js";

test("getProfilePromptSections(assistant) renvoie la section voice", () => {
  clearProfilePromptCache();
  const sections = getProfilePromptSections("assistant");
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, "profile-voice");
  // Contenu attendu : règles orales.
  assert.match(sections[0].content, /Phrases courtes/i);
  assert.match(sections[0].content, /nom du site/i);
  // Pas de front-matter résiduel.
  assert.ok(!sections[0].content.startsWith("<!--"));
});

test("getProfilePromptSections(atelier) renvoie la section selfedit", () => {
  clearProfilePromptCache();
  const sections = getProfilePromptSections("atelier");
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, "profile-selfedit");
  assert.match(sections[0].content, /Lire avant d'écrire/i);
  assert.match(sections[0].content, /selfRoot\.ts/);
  assert.ok(!sections[0].content.startsWith("<!--"));
});

test("les deux profils produisent des contenus distincts", () => {
  clearProfilePromptCache();
  const voice = getProfilePromptSections("assistant")[0]?.content ?? "";
  const atelier = getProfilePromptSections("atelier")[0]?.content ?? "";
  assert.notEqual(voice, atelier);
  // Le prompt voix ne doit pas parler d'auto-modification de fichiers noyau.
  assert.ok(!/selfRoot\.ts/.test(voice));
});
