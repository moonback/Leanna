# Réorientation « voice-first » de Leanna

> Document de suivi de la réorientation du produit : d'un « IDE agentique
> multi-projets » vers un **assistant vocal (Gemini Live) + recherche web
> fiable**, où l'IDE/code n'existe plus que pour l'**auto-modification** de
> Leanna (mode « Atelier »).
>
> Le plan détaillé et faisant autorité est le fichier
> [`../Plan d'action — Réorientation Leanna.md`](../Plan%20d'action%20—%20Réorientation%20Leanna.md)
> à la racine du dépôt. Ce document-ci sert de journal d'avancement par phase.

## Objectif

1. **Produit principal** : assistant vocal rapide à l'oral + recherche web sourcée.
2. **Code/IDE réservé à l'auto-modification** : aucun outil ni écran de code hors
   du mode Atelier ; l'Atelier ne voit que le code source de Leanna.
3. **Sécurité n°1** : le contenu web est non fiable. Une session ayant lu du web
   ne peut pas écrire de code sans validation humaine par clic.
4. **Réversibilité** : toute modification passe par branche + checkpoint +
   validation + rollback automatique.
5. **Migration non destructive** : on masque derrière un flag avant de supprimer.

## Flags de produit (Phase 0)

Introduits dans `.env.example` et lus de façon centralisée via
`server/config/environment.ts` (`getProductConfig`). Ne jamais lire `process.env`
directement ailleurs pour ces valeurs.

| Flag | Valeurs | Défaut | Rôle |
| --- | --- | --- | --- |
| `LEANNA_PRODUCT_MODE` | `assistant` \| `legacy-ide` | `assistant` | Orientation générale du produit. |
| `LEANNA_ENABLE_SELF_EDIT` | `true` \| `false` | `true` | Autorise les sessions Atelier (auto-modification). |
| `LEANNA_ENABLE_LEGACY_AGENTS` | `true` \| `false` | `false` | Charge les sous-systèmes agents/missions/autonomie legacy. |
| `LEANNA_WEB_GROUNDING` | `true` \| `false` | `true` | Active le grounding de recherche web pour la voix. |

`validateEnvironment()` rejette un `LEANNA_PRODUCT_MODE` inconnu et une valeur
non booléenne pour les trois autres flags. `getProductConfig()` applique les
défauts « voice-first » ci-dessus et retombe sur ces défauts en cas de valeur
invalide.

## Avancement par phase

| Phase | Intitulé | Statut |
| --- | --- | --- |
| 0 | Préparation (baseline git, tests de référence, flags, docs) | ✅ Terminée |
| 1 | Séparation des profils d'outils (assistant / atelier / legacy) | ✅ Terminée |
| 2 | Verrouillage de `SELF_ROOT` sur l'application | 📋 Planifié |
| 3 | Nouvelle interface : accueil vocal + Atelier | 📋 Planifié |
| 4 | Recherche web optimisée pour la voix | 📋 Planifié |
| 5 | Prompts et expérience vocale | 📋 Planifié |
| 6 | Atelier : auto-modification sûre | 📋 Planifié |
| 7 | Rétrécissement du périmètre (legacy derrière flags) | 📋 Planifié |
| 8 | Tests, doc, packaging | 📋 Planifié |

## Journal

### Phase 0 — Préparation

- **Point de restauration git** : tag `pre-reorientation` posé sur `main` ;
  travail mené sur la branche `reorient/voice-first`.
- **Flags de produit** : ajoutés à `.env.example`, validés et exposés via
  `getProductConfig()` dans `server/config/environment.ts`, couverts par
  `server/config/environment.test.ts`.
- **Documentation** : création de ce fichier et entrée datée dans `ROADMAP.md`.
- **Tests de référence (baseline, 2026-10-06)** :
  - Backend (`npm run test`) : **900 tests, 897 réussis, 3 échecs**. Les 3 échecs
    sont dans `server/skills/graphify.test.ts` et dépendent du binaire externe
    `graphify` (`GRAPHIFY_BIN`) non installé dans cet environnement — ils sont
    préexistants et sans lien avec la réorientation.
  - Front (`npm run test:ui`) : **27 tests, 27 réussis**.
  - `npm run typecheck` : vert.
  - Les 6 nouveaux tests de `getProductConfig`/validation des flags sont inclus
    dans le total backend et passent.

### Phase 1 — Séparation des profils d'outils

- **Nouveau module** `server/live/toolProfiles.ts` :
  - `ASSISTANT_TOOLS` : web, mémoire, heure, météo, listes, automatisations,
    historique, documents, image, Telegram, `knowledge_memory_*` — **aucun**
    outil de fichier, de commande ou d'agent.
  - `ATELIER_TOOLS` : lecture/écriture de code, `run_project_command`,
    `verify_*`, `security_audit`, `knowledge_*` (AST/impact), `graphify_*`. Le
    web y est volontairement absent (session de code « propre »).
  - `LEGACY_AGENT_TOOLS` : `agent_*`, `mission_*`, `reasoning_think` — derrière
    le flag `LEANNA_ENABLE_LEGACY_AGENTS`, et réservés à l'Atelier.
  - Helpers purs testables : `isToolAllowedForProfile`, `resolveSessionProfile`,
    `isCustomSkill`.
- **`server/live/LiveSocketHandler.ts`** :
  - Résolution d'un `sessionProfile` (`assistant` | `atelier`) via
    `resolveSessionProfile` + `getProductConfig()`. Le `?mode=` (`ask`/`full`)
    legacy reste supporté. Le passage à l'Atelier par simple paramètre est
    refusé hors `legacy-ide` (jeton Atelier à usage unique = Phase 6, TODO
    `atelier_token`).
  - Filtrage **à la déclaration** par profil (les custom skills et les outils
    MCP allowlistés sont préservés) ; `request_tools` retiré en profil assistant.
  - Garde **à l'exécution** par profil dans `handleToolCall` : un outil
    non autorisé est refusé même s'il a été appelé malgré son absence des
    `functionDeclarations` (nécessaire car le chemin Live court-circuite
    `PermissionPolicy` quand un contexte est fourni).
- **Tests** : `server/live/toolProfiles.test.ts` (9 cas) ; l'ancien
  `toolVisibility.test.ts` reste vert.
- **Régression (2026-10-06)** : backend **909 tests, 906 réussis, 3 échecs**
  (toujours les 3 `graphify`), soit +9 tests et aucune régression. Typecheck
  vert.
