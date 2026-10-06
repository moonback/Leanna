/**
 * AssistantView — Vue d'accueil vocale (réorientation « voice-first », Phase 3).
 *
 * Grande orbe centrale + transcript en direct + indicateur de statut.
 * Aucun outil de code, aucun panneau IDE — c'est l'entrée par défaut de Leanna.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Wrench, Settings, MessageCircle, Globe } from 'lucide-react';
import { useOrbState } from '../hooks/useOrbState.js';
import { useLiveAPIContext } from '../context/LiveAPIContext.js';
import type { ContextSource } from '../hooks/useTranscript.js';

/** Panneau Sources — affiche les sources web citées (titre + domaine, pas d'URL lue). */
function SourcesPanel({ sources }: { sources: ContextSource[] }) {
  const domain = (url?: string) => {
    if (!url) return '';
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };
  return (
    <div className="mt-1.5 flex flex-col gap-1 max-w-[85%]">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Sources
      </span>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s) => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors hover:underline"
            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}
            title={s.title || s.url}
          >
            <Globe size={11} />
            <span className="max-w-[160px] truncate">{s.title || domain(s.url)}</span>
            <span style={{ color: 'var(--text-muted)' }}>· {domain(s.url)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function AssistantView() {
  const orb = useOrbState();
  const { transcript } = useLiveAPIContext();
  const navigate = useNavigate();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const handleOrbClick = useCallback(() => {
    orb.toggleConnection();
  }, [orb]);

  // Orb visual size reacts to audio amplitude
  const orbScale = 1 + orb.amp * 0.25;

  return (
    <div
      className="flex flex-col h-full w-full items-center"
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header className="w-full flex items-center justify-between px-6 py-3 flex-shrink-0">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          Leanna
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/atelier')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Ouvrir l'Atelier (auto-modification)"
          >
            <Wrench size={14} />
            <span className="hidden sm:inline">Atelier</span>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Paramètres"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* ── Central area: orb + status ───────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full max-w-2xl px-6">
        {/* Orb */}
        <motion.button
          onClick={handleOrbClick}
          className="relative rounded-full flex items-center justify-center select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{
            width: 140,
            height: 140,
            background: `radial-gradient(circle at 40% 35%, ${orb.accentColor}, rgba(0,0,0,0.6))`,
            boxShadow: orb.isConnected
              ? `0 0 60px ${orb.accentColor}40, 0 0 120px ${orb.accentColor}20`
              : '0 0 40px rgba(0,0,0,0.3)',
            cursor: orb.isConnecting ? 'wait' : 'pointer',
          }}
          animate={{ scale: orbScale }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          whileHover={{ scale: orbScale * 1.05 }}
          whileTap={{ scale: orbScale * 0.95 }}
          aria-label={`Leanna ${orb.statusLabel}. Cliquer pour ${orb.isConnected ? 'déconnecter' : 'connecter'}.`}
          role="button"
        >
          {/* Inner icon */}
          <AnimatePresence mode="wait">
            {orb.isConnected ? (
              orb.muted ? (
                <motion.div key="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <MicOff size={36} style={{ color: 'rgba(255,255,255,0.7)' }} />
                </motion.div>
              ) : (
                <motion.div key="mic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Mic size={36} style={{ color: 'rgba(255,255,255,0.9)' }} />
                </motion.div>
              )
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <MessageCircle size={36} style={{ color: 'rgba(255,255,255,0.6)' }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pulse ring when connected */}
          {orb.isConnected && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `2px solid ${orb.accentColor}` }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </motion.button>

        {/* Status label */}
        <motion.p
          className="mt-4 text-sm font-semibold uppercase tracking-widest"
          style={{ color: orb.accentColor }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {orb.statusLabel}
        </motion.p>

        {/* Mute / wake button */}
        {orb.isConnected && (
          <button
            onClick={orb.muted ? orb.wake : undefined}
            className="mt-2 text-xs px-3 py-1 rounded-full transition-colors"
            style={{
              color: orb.muted ? 'var(--text-primary)' : 'var(--text-muted)',
              backgroundColor: orb.muted ? 'var(--accent-subtle)' : 'transparent',
            }}
          >
            {orb.muted ? 'Appuyer pour parler' : 'Micro actif'}
          </button>
        )}

        {/* Hint when disconnected */}
        {!orb.isConnected && !orb.isConnecting && (
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Cliquez sur l'orbe pour démarrer une conversation vocale
          </p>
        )}
      </div>

      {/* ── Transcript panel ─────────────────────────────────────── */}
      <div
        className="w-full max-w-2xl flex-shrink-0 border-t overflow-y-auto px-6 py-4"
        style={{
          borderColor: 'var(--border-base)',
          maxHeight: '40vh',
          minHeight: transcript.length > 0 ? 120 : 0,
        }}
      >
        {transcript.length === 0 ? (
          <p className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>
            La conversation apparaîtra ici…
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {transcript.map((entry) => {
              const webSources = (entry.sources ?? []).filter((s) => s.url);
              return (
                <div
                  key={entry.id}
                  className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className="rounded-2xl px-4 py-2 max-w-[85%] text-sm leading-relaxed"
                    style={{
                      backgroundColor:
                        entry.role === 'user'
                          ? 'var(--accent-subtle, rgba(14,165,233,0.15))'
                          : 'var(--bg-secondary, rgba(255,255,255,0.05))',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {entry.text}
                  </div>
                  {webSources.length > 0 && (
                    <SourcesPanel sources={webSources} />
                  )}
                </div>
              );
            })}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* ── Bottom nav ───────────────────────────────────────────── */}
      <nav
        className="w-full flex items-center justify-center gap-6 py-3 border-t flex-shrink-0"
        style={{ borderColor: 'var(--border-base)' }}
      >
        {[
          { label: 'Mémoires', path: '/memories' },
          { label: 'Historique', path: '/history' },
          { label: 'Listes', path: '/lists' },
          { label: 'Automatisations', path: '/automation' },
        ].map(({ label, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: 'var(--text-secondary)' }}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
