# Leanna — Plan d'action de réorientation

**De « IDE agentique multi-projets » à « assistant vocal avec recherche web, qui modifie son propre code »**

> Basé sur la lecture de l'arborescence, `selfRoot.ts`, `SELF_IDE.md`, `LiveSocketHandler.ts` (début), `main.tsx` (routes). Les éléments marqués **\[À VÉRIFIER\]** n'ont pas été ouverts : contrôlez-les avant de coder.

---

## 1. Objectif et règles de conception

1. **Produit principal** : assistant vocal (Gemini Live) + recherche web fiable, rapide à l'oral.
2. **Code/IDE exclusif à l'auto-modification** : aucun outil ni écran de code n'est accessible hors du mode **Atelier**, et l'Atelier ne voit que le code source de Leanna.
3. **Règle de sécurité n°1** : contenu web = non fiable. Une session qui a lu du web ne peut pas écrire de code sans validation humaine par clic.
4. **Réversibilité** : toute modification passe par branche + checkpoint + validation + rollback automatique.
5. **Migration non destructive** : on masque derrière un flag avant de supprimer.

---

## 2. Architecture cible

```
                ┌──────────────── Mode ASSISTANT (défaut) ────────────────┐
Micro/Orbe ───► │ Gemini Live ─ outils : web, mémoire, heure, météo,      │
                │ listes, Telegram, automatisations, documents            │
                │ ✗ AUCUN outil fichier/commande/agent code               │
                └───────────────┬─────────────────────────────────────────┘
                                │ demande « modifie-toi » + clic UI
                ┌───────────────▼─────────── Mode ATELIER ────────────────┐
                │ SELF_ROOT = Leanna_APP_ROOT (figé)                       │
                │ outils code + verify_* ; web DÉSACTIVÉ ou session taint  │
                │ branche self-edit/<date> → tsc+tests → restart →         │
                │ healthcheck → OK (merge) | KO (rollback auto)            │
                └──────────────────────────────────────────────────────────┘
```

Routes cibles : `/` Assistant · `/memories` · `/history` · `/lists` · `/automation` · `/settings` · `/atelier` (IDE restreint) · `/observability`.

---

## 3. Plan par phases

### Phase 0 — Préparation (0,5 j)

- `git tag pre-reorientation` + branche `reorient/voice-first`.
- Lancer la suite de tests (`npm run test`, tests front) pour fixer la référence. README annonce 894 tests backend / 27 front.
- Ajouter `docs/REORIENTATION.md` (ce plan) et une entrée dans `ROADMAP.md`.
- Introduire les flags dans `.env.example` :
  - `LEANNA_PRODUCT_MODE=assistant` (valeurs : `assistant` | `legacy-ide`)
  - `LEANNA_ENABLE_SELF_EDIT=true`
  - `LEANNA_ENABLE_LEGACY_AGENTS=false`
  - `LEANNA_WEB_GROUNDING=true`

**Validation** : tests verts, flags lus via `server/config/environment.ts`.

### Phase 1 — Séparation des profils d'outils (1 j) — *le plus rentable*

**Problème** : `TIER1_CORE_TOOLS` et `ASK_MODE_ALLOWED_TOOLS` dans `LiveSocketHandler.ts` mélangent code, web, agents, Telegram.

**Actions**

- Créer `server/live/toolProfiles.ts` exportant :
  - `ASSISTANT_TOOLS` : `browser_search`, `browser_research`, `browser_summarize_page`, `browser_navigate`, `browser_read_content`, `get_current_time`, `get_weather`, `save_memory`, `search_memory`, `list_memories`, `delete_memory`, `list_list_*`, `automation_*`, `create_rich_document`, `generate_image`, `telegram_*`, `knowledge_memory_*`, custom skills.
  - `ATELIER_TOOLS` : `read_project_file`, `read_file_outline`, `list_project_files`, `search_in_files`, `modify_project_file`, `patch_project_file`, `write_project_file`, `rename/delete_*`, `run_project_command`, `verify_*`, `security_audit`, `knowledge_ast_*`, `graphify_*`, git local.
  - `LEGACY_AGENT_TOOLS` : `agent_*`, `mission_*` (derrière flag).
- Dans `attachLiveWebSocket`, remplacer la logique `sessionMode` (`ask`/`full`) par `sessionProfile` (`assistant`/`atelier`) lu depuis `?profile=`. Le client ne peut **pas** passer à `atelier` par simple paramètre : le serveur exige un jeton à usage unique émis par l'UI (voir Phase 6).
- Conserver le chargement des outils MCP, mais les classer : MCP en `assistant` uniquement si l'outil est explicitement allowlisté.
- Supprimer `request_tools` de la catégorie `selfImprovement` côté assistant.

**Tests** : nouveau `toolProfiles.test.ts` — vérifier qu'en `assistant`, aucun nom de `ATELIER_TOOLS` n'est déclaré et qu'un appel forcé est refusé côté exécution (pas seulement côté déclaration).

### Phase 2 — Verrouillage de `SELF_ROOT` sur l'application (1 j)

**Fichiers** : `server/utils/selfRoot.ts`, `server/routes/self-root.ts`, `server/routes/workspace.ts`, `server/routes/ftp.ts`, `server/routes/github.ts`, `server/utils/ftpSync.ts`, `server/utils/selfRoot.test.ts`, `server/selfRoot.test.ts`.

**Actions**

- `SELF_ROOT = Leanna_APP_ROOT` constant. `setSelfRoot()` rejette tout autre chemin (erreur explicite, journalisée dans `audit.ts`).
- Retirer de l'UI et masquer côté API (flag legacy) : `addOrUpdateWorkspace`, `listWorkspaces`, `removeWorkspace`, FTP (`listFtpServers`…), import GitHub de dépôts externes. Les routes répondent `410 Gone` sauf si `LEANNA_PRODUCT_MODE=legacy-ide`.
- **Conserver** `normalizeSelfPath`, `resolveRealPathWithinSelf`, `auditSymlinks`, `isWriteForbidden`, `isCriticalFile`.
- Ajouter à `FORBIDDEN_WRITE_TARGETS` : `.git/` (entier), `node_modules`, `.env*`, `.gemini-keys.json`, `.Leanna/` (état interne), `release/`, `dist/`.
- Les données long terme scopées par `getActiveProjectId()` (Supabase `memories`) : **\[À VÉRIFIER\]** que l'ID devient constant et que les mémoires existantes restent lisibles (migration d'ID si nécessaire — script dans `scripts/`).

**Tests** : tentative d'ouverture d'un chemin externe → refus ; symlink sortant → refus.

### Phase 3 — Nouvelle interface : accueil vocal + Atelier (2 j)

**Fichiers** : `src/main.tsx`, `src/components/UnifiedSidebar.tsx`, `src/config/ideSidebarConfig.ts`, `src/components/FloatingOrb.tsx`, `src/hooks/useOrbState.ts`, `src/views/IdeView.tsx`, `src/components/StartupProjectModal.tsx`, `src/components/LauncherModal.tsx`.

**Actions**

- **Créer** `src/views/AssistantView.tsx` : grande orbe centrale (réutiliser `useOrbState`, le code d'`OrbCore` est commenté dans `FloatingOrb.tsx` — **\[À VÉRIFIER\]** s'il existe), transcript en direct (`useTranscript`), panneau Sources, indicateur « je recherche… », bouton muet, push-to-talk, sélecteur de voix.
- `main.tsx` : `"/"` → `AssistantView` (au lieu de `Navigate to="/ide"`) ; ajouter `"/atelier"` → `IdeView` ; garder `"/ide"` en redirection vers `/atelier`.
- `IdeNavigationBridge` (événements `open-ide`) : n'ouvre `/atelier` que si une session Atelier est active ; sinon ignorer.
- `FloatingOrbWrapper` : visible partout sauf `/` et `/atelier`.
- `NavSidebar` / `UnifiedSidebar` : nouveaux items → Assistant, Mémoires, Historique, Listes, Automatisations, Réglages, **Atelier (auto-modification)**. Masquer : Notebooks, Documents, GitHub, Autonomy, Observability derrière `legacy`/« Avancé ».
- **Supprimer le modal de démarrage de projet** (`StartupProjectModal`, 1 552 lignes) du flux ; le remplacer par un écran d'accueil léger (clé API Gemini, micro, langue/voix).
- `IdeView` : retirer sélecteur de workspace, FTP, import ; ouvrir directement l'arbre de l'app. `SelfEditBanner` obligatoire et permanent.

### Phase 4 — Recherche web optimisée pour la voix (2 j)

**Constat** : le web passe par le navigateur (Playwright/Electron) — lent à l'oral. Aucun grounding Google Search détecté.

**Actions**

- Ajouter le **grounding Google Search** de Gemini pour les questions factuelles courtes (latence minimale). **\[À VÉRIFIER\]** : compatibilité `googleSearch` + `functionDeclarations` avec le modèle Live utilisé (`gemini-3.1-flash-live-preview` dans les tests). Si incompatible : outil serveur `web_quick_search` qui appelle `generateContent` avec grounding et renvoie `{answer, sources[]}` à la session Live.
- Créer `server/skills/webSearch.ts` (skill) avec 3 niveaux :
  1. `web_quick_search` — réponse sourcée en 1-3 s ;
  2. `browser_research` existant — multi-sources, consensus/contradictions (déjà en place) ;
  3. `browser_open` + lecture — pour ouvrir une page à l'écran sur demande.
- Politique d'orchestration dans le prompt : niveau 1 par défaut, niveau 2 si « approfondis / compare / vérifie », niveau 3 si « montre-moi ».
- **Sources à l'écran** : pousser un message WS `{sources:[{title,url,snippet}]}` ; `SourcesPanel.tsx` les affiche ; l'assistant les cite à l'oral par nom de site, jamais d'URL lue.
- Retours vocaux d'attente (« je regarde ça ») pendant les outils lents ; timeout et repli (`TOOL_MAX_RETRIES` déjà présent).
- Cache court (`server/notebooks/ResponseCache.ts` ou `utils/promptCache.ts`) pour les requêtes répétées ; limiter par `server/config/rateLimits.ts`.
- Conserver la policy réseau `PUBLIC_WEB_AND_LOCALHOST` (blocage IP privées).

### Phase 5 — Prompts et expérience vocale (1,5 j)

**Fichiers** : `server/runtime/prompts/base.md`, `chat.md`, `autonomy.md`, `browser.md`, `efficiency.md`, `agents-system.md`, `ai-studio-directives.md`, `server/prompts/promptConfig.ts`, `SystemPromptBuilder.ts`, `rules/core.ts`.

**Actions**

- Réécrire `base.md` pour la voix : phrases courtes, pas de markdown/listes lues à haute voix, confirmation orale brève, une question à la fois.
- `chat.md`/`browser.md` : règles de citation orale, honnêteté sur l'incertitude, jamais d'invention de source.
- **Séparer les prompts** : `SystemPromptBuilder` compose `base + browser + memory` en `assistant`, et `base + selfedit.md` en `atelier`. Créer `selfedit.md` (règles d'édition prudente, petits diffs, tests avant restart).
- Retirer de l'assistant : `agents-system.md`, `autonomy.md`, `ai-studio-directives.md` (réservés legacy).
- Voix : paramètre de voix/langue dans `UserProfileContext` + `server/utils/geminiTTS.ts` pour les lectures hors Live. Gestion d'interruption (barge-in) : **\[À VÉRIFIER\]** dans `useLiveAPI`/`useAudio`.
- Réveil/écoute : mode push-to-talk par défaut, « mots-clés » optionnels côté client.
- Continuité : résumé de contexte existant (`context_resume`, `summarizeWithLLM`) conservé ; réduire `CONTEXT_WINDOW` visuel dans l'UI vocale (indicateur discret).

### Phase 6 — Atelier : auto-modification sûre (3 j)

**Principe** : l'assistant propose, l'humain valide par clic, le système vérifie et peut revenir en arrière tout seul.

**Nouveaux modules**

- `server/selfedit/SelfEditSession.ts` : cycle de vie d'une session (ouvre branche `self-edit/<YYYYMMDD-HHmm>`, compte les écritures, expire après N minutes d'inactivité).
- `server/selfedit/selfEditToken.ts` : jeton à usage unique, émis uniquement par une action UI (clic « Ouvrir l'Atelier »), requis pour passer en profil `atelier`.
- `server/selfedit/Watchdog.ts` + `scripts/healthcheck.mjs` : après redémarrage, vérifie `/api/health` (route `health.ts` existante) sous X secondes ; sinon `git reset --hard` au checkpoint et relance.
- `server/utils/sessionTrust.ts` : marque une session **« teintée »** dès qu'un outil web a renvoyé du contenu.

**Règles**

1. **Verrou web ↔ code** : session teintée ⇒ outils d'écriture refusés. Pour écrire, ouvrir une session Atelier *propre* (le web y est désactivé). L'assistant peut résumer le besoin dans une « note de travail » en texte brut validée par l'utilisateur avant passage en Atelier.
2. **Validation par clic uniquement** : `utils/confirmationBridge.ts` (timeout 30 s → refus) ne doit pas accepter une confirmation vocale. Le front (`CriticalEditConfirm.tsx`, `InlineApproval.tsx`) affiche le diff (`DiffViewer.tsx`).
3. **Fichiers « noyau » non modifiables par l'assistant** (même avec confirmation) : `server/utils/selfRoot.ts`, `server/security.ts`, `server/utils/confirmationBridge.ts`, `server/utils/checkpoint.ts`, `server/utils/postEditValidator.ts`, `server/utils/serverRestart.ts`, `server/utils/promptInjectionGuard.ts`, `server/selfedit/**`, `server/runtime/PermissionPolicy.ts`, `AuthorizationGate.ts`, `electron/main.cjs`, `electron/preload.cjs`, `ecosystem.config.cjs`, `.env*`. Ils se modifient à la main.
4. **Fichiers critiques avec confirmation** (liste actuelle `CRITICAL_FILES` conservée + `server.ts`, `server/live/LiveSocketHandler.ts`, `package.json`, `vite.config.ts`, `tsconfig.json`).
5. **Pipeline obligatoire** après chaque lot d'écritures : checkpoint → `tsc --noEmit` (`postEditValidator`) → tests ciblés (Vitest front / node:test serveur selon fichiers touchés) → restart contrôlé (`serverRestart`) → healthcheck → merge manuel de la branche (bouton « Appliquer »).
6. **Quotas** : 30 écritures/min existantes + plafond par session (ex. 50 fichiers) + taille max de diff par écriture.
7. **Journal** : `audit.ts` enrichi (session, jeton, diff, résultat des tests), consultable dans l'Atelier.
8. **Dépendances** : interdire `npm install`/`run_project_command` arbitraire ; allowlist de commandes (`npm run test`, `npm run lint`, `tsc`). Toute nouvelle dépendance = demande explicite + confirmation.

**UI** : `AtelierView` (ou `IdeView` restreint) avec bandeau « Vous modifiez Leanna », liste des changements de la branche, bouton **Annuler tout** (rollback), **Appliquer** (merge), panneau checkpoints (`CheckpointPanel.tsx`, raccourcis `Ctrl+Shift+K/B/H` conservés).

### Phase 7 — Rétrécissement du périmètre (2 j, progressif)

| Zone | Poids approx. | Action |
| --- | --- | --- |
| `server/agents`, `server/runtime/agentic`, `server/mission`, `server/autonomy`, `server/core` (missions) | \~50 000 lignes | Derrière `LEANNA_ENABLE_LEGACY_AGENTS`; ne plus charger au démarrage si faux (`server/runtime/bootstrap.ts`, `server/lifecycle.ts`) |
| `server/knowledge` (AST, graphes, indexation) | \~18 700 | Garder seulement ce qui sert l'Atelier (AST de l'app, impact). Désactiver l'indexation continue hors Atelier |
| `server/notebooks`, `src/components/notebooks`, `DocumentsView` | \~12 000+ | Masquer (legacy). Réutiliser `geminiTTS`/`useTts` pour la voix |
| `server/marketplace`, `custom-agents*`, `agent-builder` | \~1 300+ | Masquer |
| `server/telegram` | 1 524 | **Garder** (notifications de l'assistant) |
| `server/mcp` | 1 945 | Garder, avec allowlist par profil |
| Docs d'audit d'autonomie (`docs/AUTONOMY_*`, `AUTONOMOUS_*`, etc.) | — | Archiver dans `docs/archive/` |

Les suppressions définitives se font **dans un second temps**, après 2 semaines d'usage sans régression.

### Phase 8 — Tests, doc, packaging (2 j)

- **Tests nouveaux** : profils d'outils, verrou `SELF_ROOT`, session teintée, jeton Atelier, rollback sur healthcheck KO, confirmation non vocale, routes `410`, `AssistantView` (Vitest), `SourcesPanel`.
- **Test d'intégration** `websocket.e2e.test.ts` : connexion `assistant` ⇒ tentative d'appel `modify_project_file` ⇒ refus.
- **Scénario manuel** : « cherche l'actu X » → réponse orale + sources ; « modifie ton prompt » → ouverture Atelier par clic → diff → tests → restart → healthcheck OK ; simuler un crash → rollback auto.
- **Documentation** : mettre à jour `README.md`, `ARCHITECTURE.md`, `SELF_IDE.md`, `API_DOCS.md`, `AUTONOMY.md`, `ROADMAP.md`, `agents.md`.
- **Packaging** : `electron/main.cjs`, `electron/splash.html`, titre/icônes ; permission micro Electron ; `ecosystem.config.cjs` (PM2) avec redémarrage automatique.

---

## 4. Idées d'ajouts supplémentaires (optionnelles)

- **Mémoire vocale** : « retiens que… » / « qu'est-ce que tu sais sur moi ? » avec écran de gestion (`MemoriesView`).
- **Briefing du matin** vocal (heure + météo + actus) via `automation` + `weather` + `web_quick_search`.
- **Rappels et minuteurs** vocaux via `TaskScheduler`/`automationScheduler`.
- **Notifications Telegram** de fin de modification (« modif appliquée, tests OK »).
- **Mode mains libres** (VAD + mot d'éveil) côté client.
- **Partage d'écran/caméra** à l'assistant (`ScreenShareContext`, `WebcamCapture` déjà présents) : à conserver, utile pour « regarde ça ».
- **Journal de recherches** consultable (`HistoryView`) avec sources.
- **Garde de coût** : compteur de tokens/appels grounding (`TokenCounter`, `tokensOptimization`).
- **Rapport hebdo d'auto-amélioration** : l'assistant propose des améliorations de son code, à valider en Atelier.

---

## 5. Tableau récapitulatif des fichiers

| Action | Fichiers |
| --- | --- |
| **Créer** | `server/live/toolProfiles.ts`, `server/skills/webSearch.ts`, `server/selfedit/{SelfEditSession,selfEditToken,Watchdog}.ts`, `server/utils/sessionTrust.ts`, `server/runtime/prompts/selfedit.md`, `scripts/healthcheck.mjs`, `src/views/AssistantView.tsx`, `src/components/assistant/SourcesPanel.tsx`, tests associés, `docs/REORIENTATION.md` |
| **Modifier fortement** | `server/live/LiveSocketHandler.ts`, `server/utils/selfRoot.ts`, `server/routes/self-root.ts`, `src/main.tsx`, `src/components/UnifiedSidebar.tsx`, `src/config/ideSidebarConfig.ts`, `src/views/IdeView.tsx`, `src/hooks/useLiveAPI.ts`, `server/runtime/prompts/{base,chat,browser}.md`, `SystemPromptBuilder.ts`, `utils/confirmationBridge.ts`, `utils/serverRestart.ts`, `utils/postEditValidator.ts`, `server/audit.ts`, `.env.example`, `server/config/environment.ts` |
| **Masquer (flag)** | agents, missions, autonomy, notebooks, documents, marketplace, FTP, import GitHub, `StartupProjectModal`, vues Autonomy/Observability/GitHub/Documents/Notebooks |
| **Conserver tel quel** | `server/security.ts`, `leannaignore`, `promptInjectionGuard`, `telegram`, `mcp` (avec allowlist), `geminiKeyPool`, `geminiTTS`, `ScreenShare/Webcam` |

---

## 6. Calendrier indicatif (≈ 15 jours ouvrés, 1 développeur)

| Semaine | Contenu |
| --- | --- |
| 1 | Phases 0, 1, 2, 3 (assistant utilisable sans code) |
| 2 | Phases 4, 5 (recherche vocale + prompts), début 6 |
| 3 | Phase 6 (Atelier sûr), 7, 8 |

**Jalons** : J3 assistant vocal sans outils code · J8 recherche web sourcée à l'oral · J12 première auto-modification validée de bout en bout avec rollback · J15 release.

---

## 7. Risques et points à vérifier avant de coder

1. **Grounding + outils Live** : compatibilité selon le modèle (sinon outil serveur).
2. **Barge-in / latence audio** : code de `useLiveAPI.ts` (805 lignes) et `useAudio.ts` non lu.
3. **Dépendances croisées** : `LiveSocketHandler` importe `Supervisor`, `knowledgeGraph`, `projectMemory`, `understandingEngine`. Les désactiver peut casser le démarrage ; prévoir des implémentations vides (null-objects) derrière le flag.
4. **Migration des mémoires** (ID projet) et de l'historique Supabase.
5. **Redémarrage depuis Electron** : vérifier que `serverRestart` fonctionne en app packagée (le code source n'est pas modifiable dans un `asar` ; l'Atelier n'a de sens qu'en mode dev/source — à décider).
6. **Auto-modification et mises à jour** : si l'app est distribuée, les modifications locales entrent en conflit avec les mises à jour (stratégie : branche locale + rebase manuel).
7. **Injection de prompt** : même avec le verrou web↔code, tester des scénarios hostiles (page piégée demandant d'ouvrir l'Atelier).
8. **Licence BUSL 1.1** : vérifier qu'aucune réorientation commerciale n'entre en conflit.

---

## 8. Définition de « terminé »

- Hors Atelier, **aucun** outil d'écriture n'est déclaré ni exécutable (testé).
- L'Atelier ne peut ouvrir que l'app ; tout autre chemin est refusé (testé).
- Une session ayant lu du web ne peut pas modifier le code sans passage par une session propre et un clic de validation.
- Un redémarrage cassé est annulé automatiquement.
- Une question vocale avec recherche web obtient une réponse orale sourcée en moins de \~4 s (cible à mesurer avec `latencyProbe.ts`).