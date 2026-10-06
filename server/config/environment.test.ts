import test from "node:test";
import assert from "node:assert/strict";
import { validateEnvironment, getProductConfig } from "./environment.js";

test("validateEnvironment accepts optional and valid configuration", () => {
  assert.doesNotThrow(() => validateEnvironment({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    REDIS_URL: "redis://localhost:6379",
    LEANNA_KNOWLEDGE_CACHE_TTL_SECONDS: "86400",
    SANDBOX_EXIT_CODE: "123456",
    ENABLE_CHAIN_OF_THOUGHT: "true",
    LOG_LEVEL: "info",
    NODE_ENV: "development",
  }));
});

test("validateEnvironment reports invalid values together", () => {
  assert.throws(
    () => validateEnvironment({
      SUPABASE_URL: "not-a-url",
      ENABLE_CHAIN_OF_THOUGHT: "yes",
      LEANNA_KNOWLEDGE_CACHE_TTL_SECONDS: "0",
      SANDBOX_EXIT_CODE: "123",
      LOG_LEVEL: "verbose",
    }),
    (error: unknown) => {
      assert.match(String(error), /SUPABASE_URL/);
      assert.match(String(error), /ENABLE_CHAIN_OF_THOUGHT/);
      assert.match(String(error), /LEANNA_KNOWLEDGE_CACHE_TTL_SECONDS/);
      assert.match(String(error), /SANDBOX_EXIT_CODE/);
      assert.match(String(error), /LOG_LEVEL/);
      return true;
    },
  );
});

test("validateEnvironment requires the Supabase variables as a pair", () => {
  assert.throws(
    () => validateEnvironment({ SUPABASE_SERVICE_ROLE_KEY: "service-role-key" }),
    /SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies ensemble/,
  );
});

test("validateEnvironment accepts valid product flags", () => {
  assert.doesNotThrow(() => validateEnvironment({
    LEANNA_PRODUCT_MODE: "assistant",
    LEANNA_ENABLE_SELF_EDIT: "true",
    LEANNA_ENABLE_LEGACY_AGENTS: "false",
    LEANNA_WEB_GROUNDING: "true",
  }));
  assert.doesNotThrow(() => validateEnvironment({ LEANNA_PRODUCT_MODE: "legacy-ide" }));
});

test("validateEnvironment rejects an unknown product mode", () => {
  assert.throws(
    () => validateEnvironment({ LEANNA_PRODUCT_MODE: "voice" }),
    /LEANNA_PRODUCT_MODE/,
  );
});

test("validateEnvironment rejects a non-boolean self-edit flag", () => {
  assert.throws(
    () => validateEnvironment({ LEANNA_ENABLE_SELF_EDIT: "maybe" }),
    /LEANNA_ENABLE_SELF_EDIT/,
  );
});

test("getProductConfig applies voice-first defaults on an empty environment", () => {
  const config = getProductConfig({});
  assert.equal(config.productMode, "assistant");
  assert.equal(config.selfEditEnabled, true);
  assert.equal(config.legacyAgentsEnabled, false);
  assert.equal(config.webGroundingEnabled, true);
});

test("getProductConfig reads explicit flag values", () => {
  const config = getProductConfig({
    LEANNA_PRODUCT_MODE: "legacy-ide",
    LEANNA_ENABLE_SELF_EDIT: "false",
    LEANNA_ENABLE_LEGACY_AGENTS: "true",
    LEANNA_WEB_GROUNDING: "0",
  });
  assert.equal(config.productMode, "legacy-ide");
  assert.equal(config.selfEditEnabled, false);
  assert.equal(config.legacyAgentsEnabled, true);
  assert.equal(config.webGroundingEnabled, false);
});

test("getProductConfig falls back to defaults on invalid values", () => {
  const config = getProductConfig({
    LEANNA_PRODUCT_MODE: "nonsense",
    LEANNA_ENABLE_SELF_EDIT: "nope",
  });
  assert.equal(config.productMode, "assistant");
  assert.equal(config.selfEditEnabled, true);
});
