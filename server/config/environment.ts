const BOOLEAN_VARIABLES = [
  "ENABLE_CHAIN_OF_THOUGHT",
  "FORCE_TIERED_TOOLS",
  "SELF_HEAL_READONLY",
  "ALLOW_FTP_PRIVATE_IPS",
  // Réorientation « voice-first » — flags de produit (Phase 0).
  "LEANNA_ENABLE_SELF_EDIT",
  "LEANNA_ENABLE_LEGACY_AGENTS",
  "LEANNA_WEB_GROUNDING",
] as const;

/** Modes de produit valides pour LEANNA_PRODUCT_MODE. */
export const PRODUCT_MODES = ["assistant", "legacy-ide"] as const;
export type ProductMode = (typeof PRODUCT_MODES)[number];

const URL_VARIABLES = ["APP_URL", "SUPABASE_URL", "REDIS_URL"] as const;

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

function isValidUrl(value: string, protocols: string[]): boolean {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol);
  } catch {
    return false;
  }
}

export function validateEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  const errors: string[] = [];

  const supabaseUrl = environment.SUPABASE_URL?.trim();
  const supabaseKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (isSet(supabaseUrl) !== isSet(supabaseKey)) {
    errors.push("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies ensemble.");
  }
  if (isSet(supabaseUrl) && !isValidUrl(supabaseUrl!, ["http:", "https:"])) {
    errors.push("SUPABASE_URL doit être une URL HTTP(S) valide.");
  }

  for (const variable of URL_VARIABLES) {
    const value = environment[variable]?.trim();
    if (!isSet(value)) continue;
    const protocols = variable === "REDIS_URL" ? ["redis:", "rediss:"] : ["http:", "https:"];
    if (!isValidUrl(value!, protocols)) {
      errors.push(`${variable} doit être une URL ${variable === "REDIS_URL" ? "Redis" : "HTTP(S)"} valide.`);
    }
  }

  for (const variable of BOOLEAN_VARIABLES) {
    const value = environment[variable]?.trim().toLowerCase();
    if (value && value !== "true" && value !== "false") {
      errors.push(`${variable} doit valoir "true" ou "false".`);
    }
  }

  const ttl = environment.LEANNA_KNOWLEDGE_CACHE_TTL_SECONDS?.trim();
  if (isSet(ttl) && (!/^\d+$/.test(ttl!) || Number(ttl) < 1)) {
    errors.push("LEANNA_KNOWLEDGE_CACHE_TTL_SECONDS doit être un entier positif.");
  }

  const sandboxExitCode = environment.SANDBOX_EXIT_CODE?.trim();
  if (isSet(sandboxExitCode) && !/^\d{6}$/.test(sandboxExitCode!)) {
    errors.push("SANDBOX_EXIT_CODE doit contenir exactement 6 chiffres.");
  }

  const logLevel = environment.LOG_LEVEL?.trim().toLowerCase();
  if (logLevel && !["debug", "info", "warn", "error"].includes(logLevel)) {
    errors.push('LOG_LEVEL doit valoir "debug", "info", "warn" ou "error".');
  }

  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase();
  if (nodeEnvironment && !["development", "production", "test"].includes(nodeEnvironment)) {
    errors.push('NODE_ENV doit valoir "development", "production" ou "test".');
  }

  const productMode = environment.LEANNA_PRODUCT_MODE?.trim().toLowerCase();
  if (productMode && !PRODUCT_MODES.includes(productMode as ProductMode)) {
    errors.push(`LEANNA_PRODUCT_MODE doit valoir "${PRODUCT_MODES.join('" ou "')}".`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration d'environnement invalide :\n- ${errors.join("\n- ")}`);
  }
}

/**
 * Configuration de produit issue de la réorientation « voice-first » (Phase 0).
 *
 * Centralise la lecture des flags d'orientation du produit afin que le reste
 * du code ne lise jamais `process.env` directement pour ces valeurs.
 */
export interface ProductConfig {
  /** Mode de produit : assistant vocal (défaut) ou IDE multi-projets legacy. */
  productMode: ProductMode;
  /** Autorise l'ouverture de sessions Atelier (auto-modification). */
  selfEditEnabled: boolean;
  /** Charge les sous-systèmes agents/missions/autonomie legacy. */
  legacyAgentsEnabled: boolean;
  /** Active le grounding de recherche web pour les réponses vocales. */
  webGroundingEnabled: boolean;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (!isSet(value)) return fallback;
  const normalized = value!.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

/**
 * Lit les flags de produit depuis l'environnement en appliquant les valeurs
 * par défaut de la réorientation : assistant vocal, auto-édition activée,
 * agents legacy désactivés, grounding web activé.
 */
export function getProductConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ProductConfig {
  const rawMode = environment.LEANNA_PRODUCT_MODE?.trim().toLowerCase();
  const productMode: ProductMode = PRODUCT_MODES.includes(rawMode as ProductMode)
    ? (rawMode as ProductMode)
    : "assistant";

  return {
    productMode,
    selfEditEnabled: parseBooleanFlag(environment.LEANNA_ENABLE_SELF_EDIT, true),
    legacyAgentsEnabled: parseBooleanFlag(environment.LEANNA_ENABLE_LEGACY_AGENTS, false),
    webGroundingEnabled: parseBooleanFlag(environment.LEANNA_WEB_GROUNDING, true),
  };
}
