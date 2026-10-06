/**
 * productMode.ts — Lecture du mode produit côté front (réorientation Phase 3/4).
 *
 * Le serveur lit `LEANNA_PRODUCT_MODE` ; Vite n'expose au navigateur que les
 * variables préfixées `VITE_`. On lit donc `VITE_LEANNA_PRODUCT_MODE`, qui doit
 * refléter la valeur serveur. En l'absence de variable, on applique le défaut
 * « voice-first » (assistant), cohérent avec `getProductConfig()` côté serveur.
 */

export type FrontProductMode = 'assistant' | 'legacy-ide';

/** Mode produit effectif côté front (défaut : assistant). */
export function getFrontProductMode(): FrontProductMode {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env?.VITE_LEANNA_PRODUCT_MODE?.trim().toLowerCase();
  return raw === 'legacy-ide' ? 'legacy-ide' : 'assistant';
}

/** Vrai en mode assistant vocal (produit par défaut). */
export function isAssistantProductMode(): boolean {
  return getFrontProductMode() === 'assistant';
}
