 l'arborescence et les documents clés (README, SELF_IDE, ARCHITECTURE).J'ai parcouru l'arborescence, `selfRoot.ts`, `SELF_IDE.md`, le début de `LiveSocketHandler.ts` et le routage de `main.tsx`. Je n'ai pas ouvert les 270 000 lignes : les points ci-dessous sont à vérifier sur `useLiveAPI.ts`, `IdeView.tsx` et les prompts `.md`.

## Ce qui existe déjà

- **Voix** : Gemini Live est en place (`server/live/LiveSocketHandler.ts`, `useLiveAPI`, `useAudio`, `FloatingOrb`, `geminiTTS`).
- **Recherche web** : elle passe par les skills navigateur (`browser_search`, `browser_research`, `browser_summarize_page`) et le `BrowserPanel`. Je n'ai trouvé aucune trace du grounding Google Search de Gemini.
- **IDE au centre** : `/` redirige vers `/ide`, et l'orbe est masquée sur `/` et `/ide`. `SELF_ROOT` est un projet externe choisi par l'utilisateur (multi-workspace, FTP, import GitHub, `StartupProjectModal` de 1 552 lignes).
- **Garde-fous d'auto-modification** : ils existent déjà (checkpoint git, confirmation des fichiers critiques, `tsc` post-édition, redémarrage contrôlé, audit). Ils ont été conçus pour un projet tiers, pas pour l'app qui s'édite elle-même.

## Architecture cible

1. **Accueil = l'orbe vocale**, avec `/` comme page principale. Les vues (mémoires, historique, réglages) restent secondaires.
2. **Deux profils d'outils dans `LiveSocketHandler`**, aujourd'hui mélangés dans `TIER1_CORE_TOOLS` :
   - *Assistant* (par défaut) : web, heure, météo, mémoire, listes, Telegram, automatisations, documents. **Aucun outil d'écriture de code.**
   - *Atelier* (session explicite) : `modify_project_file`, `patch_project_file`, `write_project_file`, `run_project_command`, `verify_*`, etc.
3. **Atelier = seul endroit où l'IDE existe.** `SELF_ROOT` devient `Leanna_APP_ROOT` en dur, et `setSelfRoot` refuse tout autre chemin. On supprime le multi-workspace, FTP, l'import GitHub et le sélecteur de projet. On garde `normalizeSelfPath`, `isWriteForbidden` et `isCriticalFile`. `IdeView` ne s'ouvre que sur `/atelier`, avec le `SelfEditBanner` toujours visible.

## Le risque principal : web + auto-modification

Un assistant qui lit des pages web et peut aussi réécrire son code est exposé à l'injection de prompt : une page piégée pourrait lui faire modifier ses propres règles. Je recommande trois protections :

- Les outils d'écriture sont indisponibles dans la même session qu'une lecture web, ou verrouillés dès qu'une page a été lue (`promptInjectionGuard.ts` existe déjà).
- Toute écriture est validée par un **clic dans l'UI**, jamais par un « oui » vocal.
- L'élargissement de `CRITICAL_FILES` à ce que l'assistant ne doit pas modifier seul : `LiveSocketHandler.ts`, `security.ts`, `selfRoot.ts`, `confirmationBridge.ts`, `checkpoint.ts`, `postEditValidator.ts`, `serverRestart.ts`, `promptInjectionGuard.ts`, `electron/*`, `ecosystem.config.cjs`.

Pour la fiabilité de l'auto-édition, je propose aussi :

- une branche dédiée `self-edit/<date>` pour chaque session d'atelier ;
- `tsc` et les tests avant tout redémarrage ;
- un healthcheck après redémarrage, avec rollback automatique au dernier checkpoint si l'app ne démarre pas (PM2 est déjà présent).

## Recherche web adaptée à la voix

- Pour les questions courantes, ajouter le **grounding Google Search** de Gemini : plus rapide que d'ouvrir le navigateur. À vérifier : sa compatibilité avec `functionDeclarations` sur le modèle Live que vous utilisez.
- Garder `browser_research` pour les recherches approfondies, avec un message oral du type « je creuse, une seconde ».
- Réécrire `base.md` et `chat.md` pour la voix : réponses courtes, sources citées à l'oral, liens affichés à l'écran.

## Ordre de migration

2. Séparation des profils d'outils (petit diff dans `LiveSocketHandler`, le plus rentable).
3. Verrouillage de `SELF_ROOT` sur l'app et retrait du multi-workspace.
4. Nouvelle accueil orbe et route `/atelier`.
5. Grounding web et prompts vocaux.
6. Durcissement de l'auto-édition (branche, rollback, verrou web).
7. Nettoyage progressif : `server/agents`, `mission`, `knowledge` (AST, graphes) et `notebooks` pèsent des dizaines de milliers de lignes. Je les mettrais derrière un flag avant de supprimer quoi que ce soit.

Voulez-vous que je commence par le diff de l'étape 2 (profils d'outils dans `LiveSocketHandler`), ou que je mette ce plan dans un `REORIENTATION.md` ?