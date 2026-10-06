/**
 * selfEditToken.ts — Jeton Atelier à usage unique (réorientation Phase 6).
 *
 * Pour passer une session Live en profil « atelier » (auto-modification du code
 * de Leanna), un client ne peut PAS se contenter de `?profile=atelier` : il doit
 * présenter un jeton à usage unique, émis uniquement par une action UI
 * explicite (clic « Ouvrir l'Atelier ») côté serveur. Ce jeton :
 *   - est aléatoire (crypto) et imprévisible ;
 *   - expire rapidement (fenêtre courte) ;
 *   - est consommé au premier usage (un seul passage en Atelier par jeton).
 *
 * C'est le complément du TODO laissé en Phase 1 dans `resolveSessionProfile`.
 */

import { randomBytes } from "node:crypto";

/** Durée de validité d'un jeton (ms). Court : le clic UI précède immédiatement l'ouverture. */
const TOKEN_TTL_MS = 5 * 60_000; // 5 minutes
/** Plafond de jetons actifs simultanés (évite une accumulation en cas d'abus). */
const MAX_ACTIVE_TOKENS = 20;

interface TokenEntry {
  expiresAt: number;
}

const activeTokens = new Map<string, TokenEntry>();

function purgeExpired(now = Date.now()): void {
  for (const [token, entry] of activeTokens) {
    if (now >= entry.expiresAt) activeTokens.delete(token);
  }
}

/**
 * Émet un nouveau jeton Atelier à usage unique.
 * À n'appeler que depuis une action serveur déclenchée par l'UI.
 */
export function issueAtelierToken(now = Date.now()): { token: string; expiresAt: number; ttlMs: number } {
  purgeExpired(now);

  // Garde anti-accumulation : si trop de jetons actifs, on purge le plus ancien.
  if (activeTokens.size >= MAX_ACTIVE_TOKENS) {
    const oldest = [...activeTokens.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) activeTokens.delete(oldest[0]);
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = now + TOKEN_TTL_MS;
  activeTokens.set(token, { expiresAt });
  return { token, expiresAt, ttlMs: TOKEN_TTL_MS };
}

/**
 * Consomme un jeton : retourne true s'il était valide (non expiré, non déjà
 * utilisé), puis l'invalide. Tout jeton inconnu/expiré/déjà consommé → false.
 */
export function consumeAtelierToken(token: string | null | undefined, now = Date.now()): boolean {
  if (!token) return false;
  purgeExpired(now);
  const entry = activeTokens.get(token);
  if (!entry) return false;
  // Usage unique : on supprime immédiatement, qu'il soit encore valide ou non.
  activeTokens.delete(token);
  return now < entry.expiresAt;
}

/** Nombre de jetons actifs (debug/monitoring/tests). */
export function activeTokenCount(now = Date.now()): number {
  purgeExpired(now);
  return activeTokens.size;
}

/** Réinitialise l'état (tests). */
export function resetAtelierTokens(): void {
  activeTokens.clear();
}
