/**
 * selfedit.ts — Routes de l'Atelier (réorientation Phase 6).
 *
 * `POST /api/selfedit/token` émet un jeton Atelier à usage unique, requis pour
 * ouvrir une session Live en profil « atelier ». L'émission est réservée à une
 * action UI explicite et n'est possible que si l'auto-édition est activée
 * (`LEANNA_ENABLE_SELF_EDIT=true`).
 */

import { Router, Request, Response } from "express";
import { issueAtelierToken } from "../selfedit/selfEditToken.js";
import { getProductConfig } from "../config/environment.js";

export function createSelfEditRouter(): Router {
  const router = Router();

  // POST /api/selfedit/token — émet un jeton à usage unique pour ouvrir l'Atelier.
  router.post("/token", (_req: Request, res: Response) => {
    const { selfEditEnabled } = getProductConfig();
    if (!selfEditEnabled) {
      return res.status(403).json({
        error: "L'auto-modification (Atelier) est désactivée.",
        code: "SELF_EDIT_DISABLED",
        details: "Définissez LEANNA_ENABLE_SELF_EDIT=true pour activer l'Atelier.",
      });
    }
    const { token, expiresAt, ttlMs } = issueAtelierToken();
    return res.json({ token, expiresAt, ttlMs });
  });

  return router;
}
