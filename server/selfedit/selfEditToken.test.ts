import test from "node:test";
import assert from "node:assert/strict";
import {
  issueAtelierToken,
  consumeAtelierToken,
  activeTokenCount,
  resetAtelierTokens,
} from "./selfEditToken.js";

test("un jeton émis est consommable une seule fois", () => {
  resetAtelierTokens();
  const { token } = issueAtelierToken();
  assert.equal(consumeAtelierToken(token), true);
  // Deuxième usage : refusé (usage unique).
  assert.equal(consumeAtelierToken(token), false);
});

test("un jeton inconnu ou vide est refusé", () => {
  resetAtelierTokens();
  assert.equal(consumeAtelierToken("inexistant"), false);
  assert.equal(consumeAtelierToken(""), false);
  assert.equal(consumeAtelierToken(null), false);
  assert.equal(consumeAtelierToken(undefined), false);
});

test("un jeton expiré est refusé", () => {
  resetAtelierTokens();
  const now = 1_000_000;
  const { token, expiresAt } = issueAtelierToken(now);
  // Juste avant l'expiration : valide.
  assert.equal(consumeAtelierToken(token, expiresAt - 1), true);
  // (consommé) ; un nouveau jeton pour tester l'expiration stricte.
  const { token: t2, expiresAt: e2 } = issueAtelierToken(now);
  assert.equal(consumeAtelierToken(t2, e2), false); // à l'instant exact d'expiration
});

test("les jetons sont imprévisibles et distincts", () => {
  resetAtelierTokens();
  const a = issueAtelierToken().token;
  const b = issueAtelierToken().token;
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{64}$/); // 32 octets hex
});

test("activeTokenCount reflète les jetons non consommés et purge les expirés", () => {
  resetAtelierTokens();
  const now = 500;
  issueAtelierToken(now);
  issueAtelierToken(now);
  assert.equal(activeTokenCount(now), 2);
  // Bien après l'expiration (TTL 5 min = 300000ms) : purgés.
  assert.equal(activeTokenCount(now + 10 * 60_000), 0);
});
