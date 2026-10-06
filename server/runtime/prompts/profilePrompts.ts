/**
 * profilePrompts.ts — Sections de prompt propres au profil de session
 * (réorientation « voice-first », Phase 5).
 *
 * Charge les prompts `voice.md` (assistant vocal) et `selfedit.md` (Atelier)
 * et les expose comme sections à injecter via `extraSections` du
 * SystemPromptBuilder. Ces fichiers portent un `scope` non reconnu par le
 * pipeline automatique (`voice`/`atelier`) : ils restent donc inactifs par
 * défaut et ne sont ajoutés que lorsqu'on les injecte explicitement ici, selon
 * le profil de la session Live.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname_compat: string = (() => {
  if (typeof __dirname !== "undefined") return __dirname;
  try {
    const url = import.meta.url;
    if (url) return path.dirname(fileURLToPath(url));
  } catch {
    /* import.meta.url absent en CJS */
  }
  return process.cwd();
})();

/** Localise le dossier des prompts `.md` (dev + bundle), comme le builder. */
function resolvePromptsDir(): string {
  const candidates = [
    __dirname_compat,
    path.join(__dirname_compat, "prompts"),
    path.join(process.cwd(), "dist", "prompts"),
    path.join(process.cwd(), "server", "runtime", "prompts"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "base.md"))) return dir;
    } catch {
      /* ignore */
    }
  }
  return __dirname_compat;
}

/** Retire la ligne de front-matter HTML-comment en tête du fichier. */
function stripFrontMatter(raw: string): string {
  const lines = raw.split("\n");
  const first = lines[0]?.trim();
  if (first?.startsWith("<!--") && first.endsWith("-->")) {
    return lines.slice(1).join("\n").trimStart();
  }
  return raw;
}

const contentCache = new Map<string, string>();

function readPromptFile(id: string): string {
  if (contentCache.has(id)) return contentCache.get(id)!;
  try {
    const dir = resolvePromptsDir();
    const raw = fs.readFileSync(path.join(dir, `${id}.md`), "utf-8");
    const content = stripFrontMatter(raw);
    contentCache.set(id, content);
    return content;
  } catch {
    return "";
  }
}

/** Vide le cache (tests). */
export function clearProfilePromptCache(): void {
  contentCache.clear();
}

export interface ProfilePromptSection {
  id: string;
  content: string;
}

/**
 * Retourne les sections de prompt à injecter pour un profil de session.
 *   - `assistant` → `voice.md` (règles orales) ;
 *   - `atelier`   → `selfedit.md` (édition prudente).
 * Retourne `[]` si le fichier est introuvable (dégradation silencieuse).
 */
export function getProfilePromptSections(
  profile: "assistant" | "atelier",
): ProfilePromptSection[] {
  const id = profile === "atelier" ? "selfedit" : "voice";
  const content = readPromptFile(id);
  if (!content.trim()) return [];
  return [{ id: `profile-${id}`, content }];
}
