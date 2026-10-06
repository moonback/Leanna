/**
 * webSearch.ts — Recherche web rapide pour la voix (réorientation « voice-first », Phase 4).
 *
 * `web_quick_search` répond à une question factuelle courte en 1-3 s via le
 * grounding Google Search de Gemini, et renvoie `{ answer, sources[] }`. Pensé
 * pour l'oral : l'assistant cite les sources par nom de site, jamais l'URL.
 *
 * Trois niveaux de recherche web (voir le plan de réorientation) :
 *   1. `web_quick_search`  — ici : réponse sourcée rapide (grounding) ;
 *   2. `browser_research`  — existant (skill browser) : multi-sources, consensus ;
 *   3. `browser_open` + lecture — existant : ouvrir une page à l'écran.
 *
 * Piloté par le flag `LEANNA_WEB_GROUNDING` : si désactivé, l'outil renvoie une
 * erreur explicite invitant à utiliser `browser_research`.
 */

import { Skill, validateArgs } from "./base.js";
import { z } from "zod";
import { withGeminiRetry } from "../utils/geminiKeyPool.js";
import { getProductConfig } from "../config/environment.js";

/** Source citée, telle que remontée à la session Live et au panneau Sources. */
export interface WebSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface WebQuickSearchResult {
  answer: string;
  sources: WebSource[];
  cached?: boolean;
}

// ── Cache court en mémoire ───────────────────────────────────────────────────
// Les questions factuelles répétées (ex. « quelle heure est-il à Tokyo »)
// reviennent souvent dans une même session vocale. Un cache court évite un
// aller-retour réseau et réduit la latence perçue.
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 50;
const cache = new Map<string, { expires: number; value: WebQuickSearchResult }>();

function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

function getCached(query: string): WebQuickSearchResult | null {
  const entry = cache.get(cacheKey(query));
  if (!entry) return null;
  if (Date.now() >= entry.expires) {
    cache.delete(cacheKey(query));
    return null;
  }
  return { ...entry.value, cached: true };
}

function setCached(query: string, value: WebQuickSearchResult): void {
  // Éviction simple : si plein, supprimer la plus ancienne entrée insérée.
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(cacheKey(query), { expires: Date.now() + CACHE_TTL_MS, value });
}

/** Vide le cache (utilisé par les tests). */
export function clearWebSearchCache(): void {
  cache.clear();
}

// ── Extraction des sources depuis la réponse Gemini ──────────────────────────

/**
 * Extrait les sources (`title`, `url`, `snippet`) depuis le `groundingMetadata`
 * d'une réponse Gemini. Tolérant aux variations de forme du SDK : les sources
 * peuvent apparaître dans `groundingChunks[].web` ou `groundingSupports`.
 */
export function extractSources(response: unknown): WebSource[] {
  const sources: WebSource[] = [];
  const seen = new Set<string>();

  const candidate = (response as any)?.candidates?.[0];
  const metadata = candidate?.groundingMetadata;
  if (!metadata) return sources;

  const chunks: any[] = Array.isArray(metadata.groundingChunks)
    ? metadata.groundingChunks
    : [];

  for (const chunk of chunks) {
    const web = chunk?.web ?? chunk?.retrievedContext;
    if (!web) continue;
    const url: string = web.uri ?? web.url ?? "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      title: web.title ?? domainFromUrl(url) ?? "Source",
      url,
      snippet: typeof web.snippet === "string" ? web.snippet : undefined,
    });
  }

  return sources;
}

/** Extrait le domaine lisible d'une URL (pour l'affichage et la citation orale). */
export function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function extractAnswerText(response: unknown): string {
  const r = response as any;
  if (typeof r?.text === "string" && r.text.trim()) return r.text.trim();
  const parts = r?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
}

// ── Skill ────────────────────────────────────────────────────────────────────

const QUICK_SEARCH_MODEL = "gemini-3.8-flash";

export const webSearchSkill: Skill = {
  name: "webSearch",
  permissions: ["network"],
  declarations: [
    {
      name: "web_quick_search",
      description:
        "Recherche web rapide pour une question factuelle courte (actualité, " +
        "fait, définition, chiffre). Renvoie une réponse concise et sourcée en " +
        "quelques secondes. À privilégier pour la voix. Pour une recherche " +
        "approfondie multi-sources, utiliser browser_research ; pour montrer " +
        "une page à l'écran, utiliser browser_open.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "La question ou les mots-clés à rechercher sur le web.",
          },
        },
        required: ["query"],
      },
    },
  ],
  inputSchemas: {
    web_quick_search: z.object({
      query: z.string().min(1, "La requête de recherche est requise."),
    }),
  },
  handleToolCall: async (name, args) => {
    if (name !== "web_quick_search") return undefined;

    const { query } = validateArgs(webSearchSkill.inputSchemas!["web_quick_search"], args);

    // Flag produit : le grounding peut être désactivé explicitement.
    if (!getProductConfig().webGroundingEnabled) {
      return {
        error:
          "La recherche web rapide (grounding) est désactivée (LEANNA_WEB_GROUNDING=false). " +
          "Utilise browser_research pour une recherche multi-sources.",
      };
    }

    const cached = getCached(query);
    if (cached) return cached;

    try {
      const response = await withGeminiRetry(async (ai) =>
        ai.models.generateContent({
          model: QUICK_SEARCH_MODEL,
          contents: query,
          config: {
            // Grounding Google Search : réponses factuelles ancrées + sources.
            tools: [{ googleSearch: {} }],
            temperature: 0.2,
          },
        }),
      );

      const answer = extractAnswerText(response);
      const sources = extractSources(response);

      if (!answer) {
        return { error: "Aucune réponse obtenue de la recherche web." };
      }

      const result: WebQuickSearchResult = { answer, sources };
      setCached(query, result);
      return result;
    } catch (e: any) {
      return {
        error: `Recherche web échouée : ${e?.message ?? String(e)}`,
        suggestion: "Réessaie ou utilise browser_research pour une recherche approfondie.",
      };
    }
  },
};
