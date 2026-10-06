/**
 * sessionTrust.ts — Verrou web ↔ code (réorientation « voice-first », Phase 6).
 *
 * Règle de sécurité n°1 de la réorientation : le contenu web est NON FIABLE.
 * Une session qui a lu du web est « teintée » (tainted) et ne peut plus écrire
 * de code sans passer par une session Atelier propre. Ce module suit l'état de
 * teinte par identifiant de session Live.
 *
 * Pourquoi un module dédié plutôt qu'un simple booléen dans le handler :
 *   - testable unitairement (fonctions pures sur un état isolé) ;
 *   - réutilisable par la garde d'exécution et par de futurs points de contrôle ;
 *   - sémantique explicite (teinte = fait de sécurité, pas un détail d'UI).
 */

/**
 * Outils dont le RÉSULTAT contient du contenu web non fiable. Les déclencher
 * teinte la session. (La simple navigation sans lecture pourrait être tolérée,
 * mais par prudence on teinte dès qu'un outil web est utilisé.)
 */
const WEB_TAINTING_TOOLS: ReadonlySet<string> = new Set([
  "web_quick_search",
  "browser_search",
  "browser_research",
  "browser_open",
  "browser_navigate",
  "browser_read_content",
  "browser_summarize_page",
  "browser_get_links",
  "browser_open_link",
  "browser_snapshot",
  "browser_inspect",
  "browser_get_element_text",
  "browser_get_element_attribute",
  "browser_get_accessibility_snapshot",
]);

/** Ensemble des identifiants de session actuellement teintés. */
const taintedSessions = new Set<string>();

/** Vrai si l'outil nommé teinte la session (contenu web non fiable). */
export function isWebTaintingTool(toolName: string): boolean {
  return WEB_TAINTING_TOOLS.has(toolName);
}

/**
 * Marque une session comme teintée si l'outil appelé est un outil web.
 * Retourne true si la session vient d'être (ou était déjà) teintée.
 */
export function markToolUsage(sessionId: string, toolName: string): boolean {
  if (!sessionId) return false;
  if (isWebTaintingTool(toolName)) {
    taintedSessions.add(sessionId);
    return true;
  }
  return taintedSessions.has(sessionId);
}

/** Teinte explicitement une session (ex. contenu web injecté hors outil). */
export function taintSession(sessionId: string): void {
  if (sessionId) taintedSessions.add(sessionId);
}

/** Vrai si la session a lu du web et ne peut donc pas écrire de code. */
export function isSessionTainted(sessionId: string): boolean {
  return !!sessionId && taintedSessions.has(sessionId);
}

/** Oublie l'état d'une session (à la fermeture de la connexion). */
export function clearSession(sessionId: string): void {
  taintedSessions.delete(sessionId);
}

/** Réinitialise tout l'état (tests). */
export function resetSessionTrust(): void {
  taintedSessions.clear();
}

/** Nombre de sessions teintées (debug/monitoring). */
export function taintedSessionCount(): number {
  return taintedSessions.size;
}
