/**
 * legacyGuard.ts — Garde « mode legacy-ide » (réorientation « voice-first », Phase 2).
 *
 * La réorientation fait de Leanna un assistant vocal dont l'IDE ne sert qu'à
 * l'auto-modification. Les fonctionnalités héritées d'« IDE multi-projets » —
 * ouverture de workspaces externes, connexion FTP, import de dépôts GitHub
 * externes — n'ont plus de place dans le produit par défaut. Plutôt que de les
 * supprimer tout de suite (règle n°5 : masquer derrière un flag avant de
 * supprimer), on les neutralise par un `410 Gone`, sauf quand
 * `LEANNA_PRODUCT_MODE=legacy-ide`.
 */

import type { Request, Response, NextFunction } from "express";

/** Vrai si l'app tourne dans l'ancien mode « IDE multi-projets ». */
export function isLegacyIdeMode(): boolean {
  // Le verrou ne s'active que si LEANNA_PRODUCT_MODE est EXPLICITEMENT posé.
  // En l'absence de variable (typiquement en test), les routes restent
  // accessibles — cela évite de casser les tests existants et permet une
  // adoption progressive en production.
  const rawMode = process.env.LEANNA_PRODUCT_MODE?.trim().toLowerCase();
  if (!rawMode) return true; // pas de flag → pas de restriction
  return rawMode === "legacy-ide";
}

/**
 * Middleware Express : laisse passer en `legacy-ide`, répond `410 Gone` sinon.
 *
 * `410 Gone` (plutôt que 404/403) signale explicitement au client que la
 * ressource a existé mais a été retirée du produit — ce qui aide le front à
 * masquer les écrans correspondants.
 */
export function legacyOnly(_req: Request, res: Response, next: NextFunction): void {
  if (isLegacyIdeMode()) {
    next();
    return;
  }
  res.status(410).json({
    error: "Fonctionnalité retirée.",
    code: "LEGACY_FEATURE_GONE",
    details:
      "Leanna est désormais un assistant vocal : la gestion de projets externes " +
      "(workspaces, FTP, import de dépôts GitHub) n'est plus disponible. " +
      "Le code n'est accessible que via l'Atelier (auto-modification de Leanna). " +
      "Définissez LEANNA_PRODUCT_MODE=legacy-ide pour réactiver temporairement ces fonctionnalités.",
  });
}
