/**
 * Profils d'outils par session (réorientation « voice-first », Phase 1).
 *
 * Historiquement, `LiveSocketHandler.ts` mélangeait dans un seul `Set`
 * (`TIER1_CORE_TOOLS`) des outils de code, de web, d'agents, de missions, de
 * mémoire et de Telegram. Ce module sépare explicitement les outils en trois
 * profils, pour que :
 *
 *   - l'**assistant vocal** (profil par défaut) n'ait AUCUN outil de code, de
 *     commande ou d'agent — uniquement web, mémoire, heure, météo, listes,
 *     automatisations, documents, image, Telegram et knowledge_memory ;
 *   - l'**Atelier** (auto-modification) n'ait que les outils de code, de
 *     vérification, d'audit de sécurité, d'AST/knowledge et de graphify ;
 *   - les outils **agents/missions legacy** restent derrière un flag.
 *
 * Les fonctions exportées sont PURES et testables unitairement, et servent à la
 * fois au filtrage *à la déclaration* (quels outils sont annoncés à Gemini) et
 * au refus *à l'exécution* (une garde dans `handleToolCall`, car le chemin Live
 * court-circuite `PermissionPolicy` quand un contexte est fourni).
 */

/** Profil d'une session Live. */
export type SessionProfile = "assistant" | "atelier";

/**
 * Outils de l'assistant vocal (profil par défaut).
 *
 * Aucun outil d'écriture de fichier, de commande, d'agent ou de mission n'y
 * figure : c'est l'invariant central de la réorientation.
 */
export const ASSISTANT_TOOLS: ReadonlySet<string> = new Set([
  // Recherche et navigation web
  "browser_search",
  "browser_research",
  "browser_summarize_page",
  "browser_navigate",
  "browser_open",
  "browser_close",
  "browser_read_content",
  "browser_scroll",
  "browser_back",
  "browser_forward",
  "browser_reload",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_inspect",
  "browser_get_links",
  "browser_open_link",
  "browser_get_accessibility_snapshot",
  "browser_click_by_role",
  "browser_type_by_label",
  "browser_wait_for",
  "browser_get_element_text",
  "browser_get_element_attribute",
  "browser_fill_form",
  "browser_select_option",
  // Mémoire long terme
  "save_memory",
  "search_memory",
  "list_memories",
  "delete_memory",
  "knowledge_memory_search",
  "knowledge_memory_add",
  "knowledge_memory_list",
  // Heure, météo, environnement
  "get_current_time",
  "get_weather",
  "system_info",
  // Listes
  "list_list_all",
  "list_get",
  // Automatisations
  "automation_search",
  "automation_list_scheduled_tasks",
  // Historique de conversation
  "search_history",
  "list_conversations",
  "get_conversation_messages",
  // Documents et génération d'image
  "create_rich_document",
  "generate_image",
  // Telegram (notifications de l'assistant)
  "telegram_notify",
  "telegram_send_message",
  "telegram_send_photo",
  "telegram_send_document",
  "telegram_send_from_workspace",
  "telegram_broadcast",
  "telegram_get_status",
  "telegram_list_users",
  "telegram_get_chat_info",
]);

/**
 * Outils de l'Atelier (auto-modification du code source de Leanna).
 *
 * Le web y est volontairement ABSENT : une session Atelier est « propre » (voir
 * le verrou web↔code de la Phase 6). On y trouve lecture/écriture de fichiers,
 * commande projet, vérification, audit de sécurité, AST/knowledge et graphify.
 */
export const ATELIER_TOOLS: ReadonlySet<string> = new Set([
  // Lecture / exploration du code
  "read_project_file",
  "read_file_outline",
  "list_project_files",
  "search_in_files",
  "analyze_project_file",
  "open_project_file",
  "open_ide",
  "get_workspace_info",
  // Écriture / mutation du code
  "modify_project_file",
  "patch_project_file",
  "write_project_file",
  "rename_project_file",
  "delete_project_file",
  "delete_project_folder",
  "create_project_directory",
  "project_scaffold",
  "project_list_frameworks",
  // Commande projet (allowlist appliquée côté skill)
  "run_project_command",
  // Vérification et audit
  "verify_file",
  "verify_syntax",
  "verify_typecheck",
  "security_audit",
  // Knowledge / AST / impact
  "knowledge_build_context",
  "knowledge_semantic_search",
  "knowledge_search_entities",
  "knowledge_status",
  "knowledge_impact_analyze",
  "knowledge_reindex",
  // Graphify — graphe d'architecture
  "graphify_query",
  "graphify_path",
  "graphify_explain",
  "graphify_affected",
  "graphify_god_nodes",
  "graphify_read_report",
  "graphify_update",
]);

/**
 * Outils agents / missions historiques. Désactivés par défaut dans le mode
 * assistant (`LEANNA_ENABLE_LEGACY_AGENTS=false`). Même activés, ils ne sont
 * exposés qu'au profil Atelier.
 */
export const LEGACY_AGENT_TOOLS: ReadonlySet<string> = new Set([
  "agent_delegate",
  "agent_orchestrate",
  "agent_status",
  "agent_create",
  "agent_list_tasks",
  "agent_list_roles",
  "agent_cancel",
  "agent_cancel_orchestration",
  "agent_stats",
  "mission_create",
  "mission_status",
  "reasoning_think",
]);

/** Préfixes d'outils toujours réservés à l'Atelier, quel que soit le profil. */
const CODE_TOOL_PREFIXES = ["git_"] as const;

/** Options contextuelles d'un outil pour l'évaluation d'autorisation. */
export interface ToolAllowanceContext {
  /** L'outil provient d'un serveur MCP (allowlisté par profil). */
  isMcp?: boolean;
  /** L'outil est un custom skill utilisateur (`custom_*`). */
  isCustom?: boolean;
  /** Les outils agents/missions legacy sont-ils activés (flag) ? */
  legacyAgentsEnabled?: boolean;
}

/** Vrai si `toolName` est un custom skill (`custom_*`). */
export function isCustomSkill(toolName: string): boolean {
  return toolName.startsWith("custom_");
}

/**
 * Détermine si un outil est autorisé pour un profil de session donné.
 *
 * Règles :
 *   - Les custom skills (`custom_*`) sont autorisés dans les deux profils.
 *   - Les outils MCP sont autorisés UNIQUEMENT en profil assistant, et
 *     seulement s'ils sont explicitement allowlistés (le filtrage de l'allowlist
 *     est fait en amont ; ici on considère qu'un `isMcp` reçu est déjà filtré).
 *   - En profil **assistant** : seuls les `ASSISTANT_TOOLS` (hors code/agents).
 *   - En profil **atelier** : les `ATELIER_TOOLS`, plus les `LEGACY_AGENT_TOOLS`
 *     si le flag `legacyAgentsEnabled` est vrai.
 */
export function isToolAllowedForProfile(
  profile: SessionProfile,
  toolName: string,
  ctx: ToolAllowanceContext = {},
): boolean {
  // Custom skills : toujours disponibles (contenu utilisateur, marqué non fiable
  // par ailleurs). Ils ne contournent pas les gardes d'écriture existantes.
  if (isCustomSkill(toolName)) return true;

  if (profile === "assistant") {
    // Les outils MCP allowlistés sont tolérés côté assistant.
    if (ctx.isMcp) return true;
    return ASSISTANT_TOOLS.has(toolName);
  }

  // Profil atelier.
  // Les outils MCP ne sont PAS exposés à l'Atelier (session de code « propre »).
  if (ctx.isMcp) return false;
  if (ATELIER_TOOLS.has(toolName)) return true;
  if (ctx.legacyAgentsEnabled && LEGACY_AGENT_TOOLS.has(toolName)) return true;
  // Les préfixes de code réservés (ex. git_) ne sont jamais ouverts ici non plus
  // sans entrée explicite : la garde git_* dédiée reste la source de vérité.
  if (CODE_TOOL_PREFIXES.some((p) => toolName.startsWith(p))) return false;
  return false;
}

/**
 * Résout le profil de session à partir des paramètres de connexion.
 *
 * Compatibilité : l'ancien paramètre `?mode=` (`ask`/`full`) continue de
 * fonctionner. Le nouveau paramètre `?profile=` (`assistant`/`atelier`) prime
 * s'il est fourni.
 *
 * Sécurité : un client ne peut PAS passer en `atelier` par simple paramètre.
 * Tant que le jeton Atelier à usage unique (Phase 6) n'est pas en place, le
 * passage à `atelier` n'est honoré que si `productMode === 'legacy-ide'` OU si
 * un jeton valide est explicitement fourni (`atelierTokenValid`). Sinon on
 * retombe sur `assistant`.
 */
export function resolveSessionProfile(input: {
  profileParam?: string | null;
  legacyMode?: string | null;
  productMode: "assistant" | "legacy-ide";
  atelierTokenValid?: boolean;
}): SessionProfile {
  const requested = normalizeRequestedProfile(input.profileParam, input.legacyMode);

  if (requested === "atelier") {
    const allowed = input.productMode === "legacy-ide" || input.atelierTokenValid === true;
    return allowed ? "atelier" : "assistant";
  }

  return "assistant";
}

/**
 * Normalise le profil demandé à partir de `?profile=` (prioritaire) puis du
 * `?mode=` legacy. Le mode `full` est traité comme une demande d'Atelier (il
 * exposait l'ensemble des outils de code), `ask` comme assistant.
 */
function normalizeRequestedProfile(
  profileParam: string | null | undefined,
  legacyMode: string | null | undefined,
): SessionProfile {
  const p = profileParam?.trim().toLowerCase();
  if (p === "assistant" || p === "atelier") return p;

  const m = legacyMode?.trim().toLowerCase();
  if (m === "full") return "atelier";
  // `ask` et tout le reste → assistant.
  return "assistant";
}
