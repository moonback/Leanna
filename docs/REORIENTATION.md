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
| 2 | Verrouillage de `SELF_ROOT` sur l'application | ✅ Terminée |
| 3 | Nouvelle interface : accueil vocal + Atelier | ✅ Terminée |
| 4 | Recherche web optimisée pour la voix | ✅ Terminée |
| 5 | Prompts et expérience vocale | ✅ Terminée |
| 6 | Atelier : auto-modification sûre | 🟡 Partielle (voir note git) |
| 7 | Rétrécissement du périmètre (legacy derrière flags) | ✅ Terminée |
| 8 | Tests, doc, packaging | ✅ Terminée |

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

### Phase 2 — Verrouillage de `SELF_ROOT` sur l'application

Approche **non destructive** (règle n°5 : masquer derrière un flag avant de
supprimer). Le verrou n'est actif que si `LEANNA_PRODUCT_MODE` est explicitement
posé ; en son absence (typiquement en test), le comportement reste inchangé.

- **`server/utils/selfRoot.ts`** :
  - `FORBIDDEN_WRITE_TARGETS` enrichi : `.git` (dossier entier), `node_modules`,
    `.gemini-keys.json`, `.Leanna` (état interne), `release`, `dist`. Les
    variantes `.env*` (`.env`, `.env.test`, `.env.example`, `.env.local`…) sont
    bloquées par une règle dédiée dans `isWriteForbidden`.
  - `setSelfRoot` durci : hors `legacy-ide`, seul `Leanna_APP_ROOT` est accepté ;
    tout chemin externe est refusé et journalisé via `appendAuditEvent`
    (`.Leanna-audit.log` ancré sur `Leanna_APP_ROOT`, import dynamique pour
    éviter un cycle). `normalizeSelfPath`, `resolveRealPathWithinSelf`,
    `auditSymlinks`, `isCriticalFile` restent inchangés.
- **`server/routes/legacyGuard.ts`** (nouveau) : `isLegacyIdeMode()` et le
  middleware `legacyOnly` qui répond `410 Gone` (`code: LEGACY_FEATURE_GONE`)
  hors `legacy-ide`.
- **Routes neutralisées (410 hors legacy-ide)** :
  - `/api/ftp/*` (tout le routeur FTP) ;
  - `/api/self-root` : `GET/POST /workspaces*`, `/change`, `/new`, `/scaffold`,
    `/clone` (les routes `GET /status` et `POST /clear` restent disponibles) ;
  - `/api/github` : `repos`, `user`, `repo-info`, `issues`, `pulls`,
    `notifications`, `search`, `ingest-repository`, `repo-files` (les
    opérations git **locales** `status`/`commit`/`push`/`commits` restent
    disponibles pour l'Atelier).
- **Tests** : `server/routes/legacyGuard.test.ts` (6 cas) et
  `server/utils/selfRootPhase2.test.ts` (11 cas). Les tests existants de
  `selfRoot` restent verts (ils tournent sans `LEANNA_PRODUCT_MODE`).
- **Régression (2026-10-06)** : backend **926 tests, 923 réussis, 3 échecs**
  (toujours les 3 `graphify`), soit +17 tests et aucune régression. Typecheck
  et typecheck:test verts.
- **Point à suivre [À VÉRIFIER]** : `getActiveProjectId()` devient constant une
  fois `SELF_ROOT` figé sur `Leanna_APP_ROOT`, mais dépend du chemin
  d'installation. Un déplacement de l'app changerait l'ID et masquerait les
  mémoires Supabase écrites sous l'ancien `project_id` (les mémoires globales
  `project_id=''` restent visibles). Prévoir un script de migration ou un ID
  stable indépendant du chemin (hors périmètre Phase 2).

### Phase 3 — Nouvelle interface : accueil vocal + Atelier

- **Nouvelle vue `src/views/AssistantView.tsx`** : grande orbe centrale animée
  (réactive à l'amplitude audio via `useOrbState`), icône de micro dynamique
  (connecté/muet/idle), label de statut, bouton push-to-talk, transcript en
  direct via `useLiveAPIContext`, barre de navigation rapide (Mémoires,
  Historique, Listes, Automatisations), bouton Atelier + Paramètres en header.
- **Routes recâblées** (`src/main.tsx` → `AnimatedRoutes`) :
  - `/` → `AssistantView` (au lieu de `Navigate to="/ide"`).
  - `/atelier` → `IdeView` (nouvelle route).
  - `/ide` → redirige vers `/atelier` (rétrocompat).
- **`IdeNavigationBridge`** adapté : `open-ide` navigue vers `/atelier` (pas
  `/ide`), et ne s'active pas depuis `/` (assistant home).
- **`FloatingOrbWrapper`** : masqué sur `/`, `/atelier` et `/ide` (chacun a sa
  propre gestion de l'orbe/ChatPanel).
- **`NavSidebar`** : masquée sur `/`, `/atelier`, `/ide` et `/settings`.
- **`StartupProjectModal`** : masquée en mode assistant (`VITE_LEANNA_PRODUCT_MODE=
  assistant`) et quand l'utilisateur est sur l'accueil vocal (`/`).
- **`UnifiedSidebar`** : le BrandLogo navigue vers `/` (accueil vocal) au lieu
  de `/ide`.
- **Régression (2026-10-06)** : front **27/27** (vitest), backend spot-check
  **36/36** (tous tests Phase 0-2). Typecheck vert.

### Phase 4 — Recherche web optimisée pour la voix

- **Nouveau skill `server/skills/webSearch.ts`** : outil `web_quick_search`
  (permission `network`). Appelle Gemini (`gemini-3.8-flash`) avec le
  **grounding Google Search** (`tools: [{ googleSearch: {} }]`) via
  `withGeminiRetry` (rotation de clés), et renvoie `{ answer, sources[] }`. Les
  sources sont extraites de `groundingMetadata.groundingChunks[].web` (helper
  `extractSources`, tolérant aux variations du SDK). Cache court en mémoire
  (TTL 60 s, 50 entrées max) pour réduire la latence des requêtes répétées.
  Piloté par `LEANNA_WEB_GROUNDING` : si `false`, renvoie une erreur invitant à
  `browser_research`.
  - Les 3 niveaux de recherche web du plan : (1) `web_quick_search` [nouveau],
    (2) `browser_research` [existant], (3) `browser_open` + lecture [existant].
- **Enregistrement** : `webSearchSkill` ajouté au bootstrap (`server.ts`) ;
  `web_quick_search` ajouté à `ASSISTANT_TOOLS` (toolProfiles) et à
  `TIER1_CORE_TOOLS` (LiveSocketHandler).
- **Sources à l'écran** : le LiveSocketHandler pousse un message WS
  `{ web_sources: [...] }` à la fin d'un `web_quick_search`. Le client
  (`useLiveAPI`) les attache au prochain message de l'assistant (via
  `pendingSourcesRef`), et `AssistantView` les affiche dans un petit
  `SourcesPanel` (titre + domaine, jamais l'URL lue à voix haute). Le type
  `ContextSource` a été étendu (`url`, `title`, `snippet`).
- **Tests** : `server/skills/webSearch.test.ts` (7 cas : metadata, parsing des
  sources, domaine, flag désactivé, validation Zod).
- **Régression (2026-10-06)** : backend **933 tests, 930 réussis, 3 échecs**
  (toujours les 3 `graphify`), soit +7 tests ; front **27/27**. Typecheck vert.
- **Point à suivre [À VÉRIFIER]** : compatibilité `googleSearch` +
  `functionDeclarations` dans une session **Live** non vérifiée côté API — c'est
  pourquoi on a choisi la voie serveur `web_quick_search` (`generateContent`
  hors session Live), robuste quel que soit le modèle Live.

### Correctif démarrage (post-Phase 3/4)

- **Symptôme** : au démarrage, l'écran de sélection de workspace s'affichait au
  lieu de l'accueil vocal.
- **Causes** : (1) la suppression des modals dépendait de
  `VITE_LEANNA_PRODUCT_MODE`, absent du `.env` (seul `LEANNA_PRODUCT_MODE`,
  non préfixé, y figurait — non exposé au front par Vite) ; (2) le
  `LauncherModal` (écran immersif) n'avait pas été traité en Phase 3.
- **Corrigé** :
  - Ajout de `VITE_LEANNA_PRODUCT_MODE` dans `.env` (miroir front).
  - Nouveau helper `src/config/productMode.ts` (`isAssistantProductMode()`,
    défaut assistant).
  - `LauncherModal` et `StartupProjectModal` masqués en mode assistant.
  - `initSelfRoot` (serveur) : en mode assistant, `SELF_ROOT` est verrouillé
    directement sur `Leanna_APP_ROOT` au démarrage (plus d'écran de sélection ;
    l'assistant dispose d'un root valide immédiatement).
- **Rappel** : après modification du `.env`, redémarrer le serveur dev + Vite.

### Phase 5 — Prompts et expérience vocale

- **Nouveaux prompts** :
  - `server/runtime/prompts/voice.md` : règles orales — phrases courtes, pas de
    markdown/listes lues à voix haute, citation des sources par nom de site
    (jamais l'URL), une question à la fois, honnêteté sur l'incertitude, jamais
    inventer de source, barge-in.
  - `server/runtime/prompts/selfedit.md` : règles d'édition prudente de l'Atelier
    — lire avant d'écrire, petits diffs, vérifier avant de redémarrer, liste des
    fichiers « noyau » non modifiables, validation humaine par clic, verrou
    web↔code.
  - Ces deux fichiers portent un `scope` non reconnu par le pipeline automatique
    (`voice`/`atelier`) : ils restent **inactifs par défaut** et ne sont injectés
    qu'explicitement selon le profil.
- **Injection** : `server/runtime/prompts/profilePrompts.ts`
  (`getProfilePromptSections`) lit le bon fichier selon le profil ;
  `LiveSocketHandler` l'ajoute au prompt système (voice pour `assistant`,
  selfedit pour `atelier`).
- **Tests** : `profilePrompts.test.ts` (3 cas). Plusieurs tests `setSelfRoot`
  sur dossiers temporaires ont été rendus déterministes face à une fuite
  d'environnement `LEANNA_PRODUCT_MODE` entre fichiers (`delete` en tête :
  `selfRoot.test.ts`, `security.test.ts`, `sandbox.test.ts`,
  `knowledge.test.ts`, `codebase.test.ts`, `leannaignore.test.ts`,
  `safeguards.ignore.test.ts`).
- **Régression (2026-10-06)** : backend **936 tests, 933 réussis, 3 échecs**
  (toujours les 3 `graphify`), soit +3 tests ; front **27/27**. Typecheck vert.

### Phase 6 — Atelier : auto-modification sûre (partielle)

> **Contrainte structurante** : dans ce projet, **git est volontairement
> désactivé** (`server/utils/checkpoint.ts` est un no-op documenté ;
> `createCheckpoint` renvoie `null`, `rollbackToCheckpoint` renvoie `false` ;
> les routes git répondent « Git est entièrement désactivé »). Le pipeline
> « branche self-edit + `git reset --hard` » décrit par le plan **n'est donc pas
> applicable tel quel**. La réversibilité réelle de l'app passe par le
> **sandbox transactionnel** existant (`server/utils/sandbox.ts`, checkpoint +
> rollback), pas par git. On a donc livré les briques de sécurité réelles et
> évité de construire un Watchdog/rollback git factice.

**Livré** :
- **`server/utils/sessionTrust.ts`** — verrou web↔code. Une session Live qui a
  utilisé un outil web (`web_quick_search`, `browser_*` de lecture) est
  « teintée ». Teinte isolée par `sessionId`, oubliée à la fermeture.
- **`server/selfedit/selfEditToken.ts`** — jeton Atelier à usage unique
  (`randomBytes(32)`, TTL 5 min, consommé au premier usage). Complète le TODO
  de Phase 1.
- **`server/routes/selfedit.ts`** — `POST /api/selfedit/token` émet un jeton
  (403 `SELF_EDIT_DISABLED` si `LEANNA_ENABLE_SELF_EDIT=false`). Monté dans
  `server.ts` après `requireAuth`.
- **`LiveSocketHandler`** :
  - un `sessionId` est créé par connexion ; sa teinte est nettoyée à `close` ;
  - `resolveSessionProfile` reçoit désormais `atelierTokenValid =
    selfEditEnabled && consumeAtelierToken(?atelier_token)` — le passage en
    profil atelier exige un jeton valide (le TODO de Phase 1 est levé) ;
  - garde d'exécution **web↔code** dans `handleToolCall` : chaque outil web
    teinte la session ; un outil d'écriture (`WRITE_TOOLS`) sur une session
    teintée est refusé (`blockedByWebTaint`).
- La confirmation reste **par clic** (`confirmationBridge`, timeout 30 s, jamais
  vocale) et `validateBuild()` (tsc) fournit la vérification réelle.
- **Tests** : `sessionTrust.test.ts` (5), `selfEditToken.test.ts` (5),
  `selfedit.test.ts` (2).
- **Régression (2026-10-06)** : backend **948 tests, 944 réussis, 4 échecs**
  (3 `graphify` + 1 `DistributedLock`), soit +12 tests ; front **27/27**.
  Typecheck vert. `DistributedLock.test.ts` (« renew extends the TTL while
  held ») est un **flake de timing préexistant** : il passe en isolation et
  n'a aucun lien avec les changements de la Phase 6 (ni timers, ni verrous, ni
  Redis touchés).

**Reporté / non applicable (git désactivé)** :
- `SelfEditSession.ts` (branche git par session), `Watchdog.ts` +
  `scripts/healthcheck.mjs` (rollback `git reset --hard` après redémarrage KO)
  et le merge/annulation de branche. Une version adossée au sandbox
  transactionnel (plutôt qu'à git) serait le bon chemin si l'on veut un
  rollback automatisé ; c'est une décision d'architecture à prendre
  explicitement, hors du périmètre « non destructif » de cette passe.

### Phase 7 — Rétrécissement du périmètre

Approche non destructive, pilotée par `LEANNA_ENABLE_LEGACY_AGENTS`. Point
rassurant confirmé par l'investigation : tous les consommateurs de
`missionExecutor`/`leannaCore` sont déjà **null-safe**, donc ne pas initialiser
ces sous-systèmes dégrade proprement sans casser le démarrage.

- **`server.ts`** :
  - `legacyAgentsEnabled` lu une fois en tête (`getProductConfig()`).
  - Le bloc d'initialisation du **Mission System** (`onReady`) n'est exécuté
    qu'avec le flag. Sinon `skillManager.missionExecutor` reste `null` → routes
    missions en 503, `LeannaCore.executeMission` en escalade.
  - **`leannaCore.start()`** n'est appelé qu'avec le flag : hors flag, aucun
    heartbeat ni tâche autonome (leannaCore reste instancié pour servir les
    getters WS/metrics null-safe).
  - Le `setInterval` du broadcaster missions n'est pas armé hors flag (évite un
    timer tournant à vide).
- **`server/routes/legacyGuard.ts`** : `areLegacyAgentsEnabled()` +
  middleware `legacyAgentsOnly` (410 `LEGACY_AGENTS_GONE`). La restriction ne
  s'active que si le flag est explicitement posé (défaut : pas de restriction).
- **Routes gardées** : `/api/agents` et `/api/v2/agents` (via `legacyAgentsOnly`).
  `/api/missions` est monté sur `/api` (préfixe partagé) et ne peut pas recevoir
  le middleware sans bloquer d'autres routes ; il dégrade déjà en 503 quand
  `missionExecutor` est null. `/api/v2/metrics` reste disponible.
- **Non touché** (requis par le chemin vocal) : `Supervisor`,
  `understandingEngine`/`knowledgeGraph`/`projectMemory`, MCP.
- **Smoke test de démarrage** : serveur lancé avec
  `LEANNA_ENABLE_LEGACY_AGENTS=false` → log `⏭️ Mission System désactivé`,
  `Server running on http://127.0.0.1:4000`, `GET /api/health` → `200
  {"status":"ok"}`. Le risque « désactiver les agents casse le démarrage » est
  écarté.
- **Tests** : `legacyGuard.test.ts` étendu (+3 : `areLegacyAgentsEnabled`,
  `legacyAgentsOnly` pass/410). `github.test.ts` et `self-root.test.ts` rendus
  déterministes (neutralisation des flags en tête, comme en Phase 5).
- **Régression (2026-10-06)** : backend **951 tests, 947 réussis, 4 échecs**
  (3 `graphify` + 1 `DistributedLock`, flakes connus) ; front **27/27**.
  Typecheck vert.

**Non fait (plus intrusif, risque élevé)** : déchargement complet de la flotte
d'agents de délégation (`agentOrchestrator` enregistre toujours 20 rôles au
démarrage) et masquage UI des vues legacy (Notebooks/Documents/Observability/
Autonomy derrière « Avancé »). Ces éléments relèvent d'un travail UI/bootstrap
plus profond ; la désactivation du **runtime autonome** (la partie coûteuse et
à risque) est, elle, effective.

### Phase 8 — Tests, doc, packaging

- **Test d'intégration du contrat de sécurité** : `server/reorientation.e2e.test.ts`
  (7 cas) assemble en un contrat lisible les invariants des phases 1/2/6/7 :
  l'assistant n'a aucun outil d'écriture/code/agent ; l'Atelier exige un jeton à
  usage unique (anti-rejeu) ; une session ayant lu du web ne peut plus écrire ;
  pas de jeton si l'auto-édition est désactivée (403) ; profil assistant par
  défaut.
- **Documentation produit** : bannière « Réorientation voice-first » dans
  `README.md` et avertissement en tête de `SELF_IDE.md`, tous deux pointant vers
  ce document (source faisant autorité).
- **Packaging Electron** (`electron/main.cjs`) : ajout d'un
  `setPermissionRequestHandler` + `setPermissionCheckHandler` sur la session du
  renderer accordant `media`/`audioCapture`/`videoCapture`/`display-capture` —
  indispensable pour que `getUserMedia(microphone)` de l'assistant vocal
  fonctionne (notamment sous Windows). `askForMediaAccess` macOS déjà présent,
  conservé.
- **`.env.example`** : documentation de `VITE_LEANNA_PRODUCT_MODE` (miroir front).
- **Régression finale (2026-10-06)** : backend **958 tests, 955 réussis, 3
  échecs** (uniquement les 3 `graphify`, binaire externe absent) ; front
  **27/27**. Typecheck vert.
  - Note : un flake de timing `DistributedLock.test.ts` apparaît par
    intermittence selon la charge du processus de test ; il passe en isolation
    et est sans lien avec la réorientation. Un run propre (après nettoyage des
    processus orphelins du smoke test) donne 955/958.

---

## Récapitulatif global

| Phase | Intitulé | État | Tests ajoutés |
| --- | --- | --- | --- |
| 0 | Préparation (baseline, flags, docs) | ✅ | +6 |
| 1 | Profils d'outils (assistant/atelier/legacy) | ✅ | +9 |
| 2 | Verrouillage `SELF_ROOT` | ✅ | +17 |
| 3 | Interface : accueil vocal + Atelier | ✅ | (front) |
| 4 | Recherche web vocale (grounding) | ✅ | +7 |
| 5 | Prompts et expérience vocale | ✅ | +3 |
| 6 | Atelier sûr (verrou web↔code, jeton) | 🟡 partielle (git off) | +12 |
| 7 | Rétrécissement du périmètre (legacy off) | ✅ | +3 |
| 8 | Tests, doc, packaging | ✅ | +7 |

**Invariant central livré et testé** : en mode assistant (défaut), aucun outil
d'écriture de code n'est déclaré ni exécutable ; l'Atelier n'est accessible que
via un jeton à usage unique ; une session ayant lu du web ne peut pas modifier
le code. Le serveur démarre proprement avec les agents legacy désactivés
(vérifié par smoke test + healthcheck 200).

**Limite assumée** : le rollback automatisé par git (Watchdog) n'est pas
livré car git est désactivé dans le projet ; la réversibilité repose sur le
sandbox transactionnel existant. Un rollback adossé au sandbox serait le
prolongement naturel de la Phase 6.
