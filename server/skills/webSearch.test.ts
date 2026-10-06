import test from "node:test";
import assert from "node:assert/strict";
import {
  webSearchSkill,
  extractSources,
  domainFromUrl,
  clearWebSearchCache,
} from "./webSearch.js";

test("webSearchSkill: metadata", () => {
  assert.equal(webSearchSkill.name, "webSearch");
  const declNames = webSearchSkill.declarations.map((d: any) => d.name);
  assert.ok(declNames.includes("web_quick_search"));
  assert.deepEqual(webSearchSkill.permissions, ["network"]);
});

test("domainFromUrl extrait le domaine sans www", () => {
  assert.equal(domainFromUrl("https://www.lemonde.fr/article/123"), "lemonde.fr");
  assert.equal(domainFromUrl("https://en.wikipedia.org/wiki/X"), "en.wikipedia.org");
  assert.equal(domainFromUrl("pas-une-url"), null);
});

test("extractSources lit groundingMetadata.groundingChunks[].web", () => {
  const response = {
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: "https://www.example.com/a", title: "Exemple A", snippet: "extrait A" } },
            { web: { uri: "https://autre.org/b", title: "Autre B" } },
            // Doublon d'URL : ignoré.
            { web: { uri: "https://www.example.com/a", title: "Exemple A bis" } },
            // Chunk sans web : ignoré.
            { foo: "bar" },
          ],
        },
      },
    ],
  };
  const sources = extractSources(response);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0], {
    title: "Exemple A",
    url: "https://www.example.com/a",
    snippet: "extrait A",
  });
  assert.equal(sources[1].title, "Autre B");
  assert.equal(sources[1].snippet, undefined);
});

test("extractSources retourne [] sans groundingMetadata", () => {
  assert.deepEqual(extractSources({ candidates: [{}] }), []);
  assert.deepEqual(extractSources({}), []);
  assert.deepEqual(extractSources(null), []);
});

test("web_quick_search refuse quand le grounding est désactivé", async () => {
  clearWebSearchCache();
  const saved = process.env.LEANNA_WEB_GROUNDING;
  process.env.LEANNA_WEB_GROUNDING = "false";
  try {
    const result: any = await webSearchSkill.handleToolCall("web_quick_search", { query: "météo Paris" });
    assert.ok(result?.error);
    assert.match(result.error, /désactiv/i);
  } finally {
    if (saved !== undefined) process.env.LEANNA_WEB_GROUNDING = saved;
    else delete process.env.LEANNA_WEB_GROUNDING;
  }
});

test("web_quick_search valide l'argument query (Zod)", async () => {
  const saved = process.env.LEANNA_WEB_GROUNDING;
  // Grounding activé pour que la validation s'exécute avant tout appel réseau.
  process.env.LEANNA_WEB_GROUNDING = "true";
  try {
    await assert.rejects(
      () => Promise.resolve(webSearchSkill.handleToolCall("web_quick_search", { query: "" })),
      /query|requête/i,
    );
  } finally {
    if (saved !== undefined) process.env.LEANNA_WEB_GROUNDING = saved;
    else delete process.env.LEANNA_WEB_GROUNDING;
  }
});

test("web_quick_search ignore les outils inconnus", async () => {
  const result = await webSearchSkill.handleToolCall("autre_outil", {});
  assert.equal(result, undefined);
});
