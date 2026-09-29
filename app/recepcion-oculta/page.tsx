'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SessionLastMsg {
  content: string;
  role: string;
  createdAt: string;
}

interface Session {
  id: string;
  isHumanMode: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
  messages: SessionLastMsg[];
}

interface DbMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'ai' | 'admin';
  content: string;
  type: string;
  createdAt: string;
}

// ─── SWR Fetcher ─────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────
function truncateId(id: string) {
  return id.slice(0, 8) + '…';
}

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

// ─── Password Gate ────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value }),
      });
      const { ok } = await res.json();

      if (ok) {
        onUnlock();
      } else {
        setError(true);
        setShake(true);
        setValue('');
        setTimeout(() => setShake(false), 600);
      }
    } catch {
      setError(true);
      setShake(true);
      setValue('');
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d0511] via-[#1a0a2e] to-[#0d0511] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 mx-auto flex items-center justify-center shadow-2xl shadow-rose-500/30 mb-4">
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Panel de Recepción</h1>
          <p className="text-white/40 text-sm mt-1">Velka Spa · Acceso Restringido</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className={`bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm transition-all ${shake ? 'animate-shake' : ''}`}
        >
          <label className="block text-sm text-white/70 mb-2 font-medium">
            Contraseña de acceso
          </label>
          <input
            type="password"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(false); }}
            placeholder="••••••••••"
            autoFocus
            className={`
              w-full bg-white/5 border rounded-xl px-4 py-3 text-white
              placeholder-white/20 outline-none text-base tracking-widest
              transition-all duration-200
              ${error
                ? 'border-red-500 ring-1 ring-red-500/50'
                : 'border-white/20 focus:border-rose-400 focus:ring-1 focus:ring-rose-400/30'
              }
            `}
          />
          {error && (
            <p className="text-red-400 text-xs mt-2">⚠️ Contraseña incorrecta. Intenta de nuevo.</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="
              w-full mt-4 py-3 rounded-xl font-semibold text-white
              bg-gradient-to-r from-rose-500 to-pink-600
              hover:from-rose-400 hover:to-pink-500
              active:scale-98 transition-all duration-200
              shadow-lg shadow-rose-500/25
              disabled:opacity-60 disabled:cursor-not-allowed
              flex items-center justify-center gap-2
            "
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeOpacity={0.25} />
                  <path d="M21 12a9 9 0 0 1-9 9" />
                </svg>
                Verificando…
              </>
            ) : (
              'Acceder'
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}

// ─── Message Bubble (CRM) ─────────────────────────────────────────────────────
function CrmMessageBubble({ msg }: { msg: DbMessage }) {
  const isUser = msg.role === 'user';
  const isAdmin = msg.role === 'admin';

  const time = new Date(msg.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Role label
  const roleLabel = isUser ? 'Cliente' : isAdmin ? 'Recepcionista' : 'IA Velka';

  // Bubble styles
  const containerClass = isUser ? 'flex-row' : 'flex-row-reverse';
  const bubbleClass = isUser
    ? 'bg-gray-800 text-gray-100 rounded-bl-sm'
    : isAdmin
      ? 'bg-rose-600 text-white rounded-br-sm border border-rose-400/40'
      : 'bg-purple-900/60 text-purple-100 rounded-br-sm border border-purple-500/30';

  return (
    <div className={`flex items-end gap-2 ${containerClass}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold
          ${isUser ? 'bg-gray-600' : isAdmin ? 'bg-rose-500' : 'bg-purple-600'}`}
      >
        {isUser ? '👤' : isAdmin ? '👩‍💼' : '🤖'}
      </div>

      {/* Bubble */}
      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${bubbleClass}`}>
        <span className="block text-[10px] font-semibold opacity-60 mb-1 uppercase tracking-wide">
          {roleLabel}
        </span>

        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none break-words text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" className="underline opacity-80">
                    {children}
                  </a>
                ),
                p: ({ children }) => (
                  <p className="whitespace-pre-wrap break-words mb-1 last:mb-0">{children}</p>
                ),
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        )}

        <span className="block text-right text-[10px] opacity-40 mt-1">{time}</span>
      </div>
    </div>
  );
}

// ─── Main CRM Page ────────────────────────────────────────────────────────────
export default function RecepcionOculta() {
  const [unlocked, setUnlocked] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [adminInput, setAdminInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch sessions (poll every 4s) ───────────────────────────────────────
  const { data: sessionsData, mutate: mutateSessions } = useSWR<{ sessions: Session[] }>(
    unlocked ? '/api/chat/sessions' : null,
    fetcher,
    { refreshInterval: 4000, revalidateOnFocus: true },
  );

  const sessions: Session[] = sessionsData?.sessions ?? [];

  // ── Fetch messages for selected session (poll every 2s) ──────────────────
  const { data: msgData, mutate: mutateMessages } = useSWR<{
    messages: DbMessage[];
    isHumanMode: boolean;
  }>(
    unlocked && selectedSessionId
      ? `/api/chat/messages?sessionId=${selectedSessionId}`
      : null,
    fetcher,
    { refreshInterval: 2000, revalidateOnFocus: false },
  );

  const chatMessages: DbMessage[] = msgData?.messages ?? [];
  const isHumanMode: boolean = msgData?.isHumanMode ?? false;

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Send admin message ───────────────────────────────────────────────────
  const handleAdminSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedSessionId || !adminInput.trim() || isSending) return;

      setIsSending(true);
      try {
        await fetch('/api/admin/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: selectedSessionId, content: adminInput.trim() }),
        });
        setAdminInput('');
        await Promise.all([mutateMessages(), mutateSessions()]);
      } catch (err) {
        console.error('[CRM] Error enviando mensaje:', err);
      } finally {
        setIsSending(false);
      }
    },
    [selectedSessionId, adminInput, isSending, mutateMessages, mutateSessions],
  );

  // ── Toggle IA mode ───────────────────────────────────────────────────────
  const handleToggleIA = useCallback(async () => {
    if (!selectedSessionId || isToggling) return;
    setIsToggling(true);
    try {
      await fetch('/api/admin/toggle-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedSessionId, isHumanMode: !isHumanMode }),
      });
      await Promise.all([mutateMessages(), mutateSessions()]);
    } catch (err) {
      console.error('[CRM] Error toggle IA:', err);
    } finally {
      setIsToggling(false);
    }
  }, [selectedSessionId, isHumanMode, isToggling, mutateMessages, mutateSessions]);

  // ── Password gate ─────────────────────────────────────────────────────────
  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  // ── Find selected session ─────────────────────────────────────────────────
  const activeSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  return (
    <div className="flex h-screen bg-[#0d0511] text-white overflow-hidden font-sans">
      {/* ════════════════════════════════════════════════
          SIDEBAR — Session List
      ════════════════════════════════════════════════ */}
      <aside className="w-[30%] min-w-[260px] max-w-[340px] flex flex-col border-r border-white/10 bg-[#110818]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-rose-600/20 to-purple-600/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Panel Chatbot</h1>
              <p className="text-[10px] text-white/40">Velka Spa · Recepción</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {sessions.length} sesiones activas
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
              </div>
              <p className="text-white/30 text-sm">Sin conversaciones aún</p>
            </div>
          ) : (
            sessions.map((session) => {
              const lastMsg = session.messages[0];
              const isSelected = session.id === selectedSessionId;

              return (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`
                    w-full text-left px-4 py-3.5 border-b border-white/5
                    transition-all duration-150 hover:bg-white/5
                    ${isSelected ? 'bg-rose-500/10 border-l-2 border-l-rose-400' : ''}
                  `}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-sm">
                        👤
                      </div>
                      {/* Red dot = human mode active */}
                      {session.isHumanMode && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 border-2 border-[#110818] animate-pulse" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-mono text-white/70 font-semibold">
                          #{truncateId(session.id)}
                        </span>
                        <span className="text-[10px] text-white/30 shrink-0">
                          {formatRelativeTime(session.updatedAt)}
                        </span>
                      </div>
                      {lastMsg && (
                        <p className="text-xs text-white/40 truncate mt-0.5 leading-snug">
                          <span className={`font-medium ${lastMsg.role === 'admin' ? 'text-rose-400' : lastMsg.role === 'ai' ? 'text-purple-400' : 'text-white/50'}`}>
                            {lastMsg.role === 'admin' ? 'Tú: ' : lastMsg.role === 'ai' ? 'IA: ' : ''}
                          </span>
                          {lastMsg.content}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                          ${session.isHumanMode
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-purple-500/20 text-purple-300'
                          }`}>
                          {session.isHumanMode ? '👤 Humano' : '🤖 IA'}
                        </span>
                        <span className="text-[10px] text-white/25">
                          {session._count.messages} msgs
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ════════════════════════════════════════════════
          MAIN CHAT AREA
      ════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!selectedSessionId ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-4 border border-white/10">
              <svg className="w-10 h-10 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white/40">Selecciona una conversación</h2>
            <p className="text-sm text-white/25 mt-1">
              Elige una sesión del panel izquierdo para ver el historial y responder.
            </p>
          </div>
        ) : (
          <>
            {/* ── Chat Header ──────────────────────────────────────────────── */}
            <header className="px-6 py-4 border-b border-white/10 bg-[#110818] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-lg shrink-0">
                  👤
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-white truncate">
                    Sesión <span className="font-mono text-rose-300">#{truncateId(selectedSessionId)}</span>
                  </h2>
                  <p className="text-xs text-white/40">
                    {activeSession ? formatRelativeTime(activeSession.updatedAt) : ''} ·{' '}
                    {chatMessages.length} mensajes
                  </p>
                </div>
              </div>

              {/* ── Toggle IA Button ── */}
              <button
                onClick={handleToggleIA}
                disabled={isToggling}
                className={`
                  shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-semibold text-sm
                  transition-all duration-200 active:scale-95
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${isHumanMode
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25 hover:from-purple-500 hover:to-indigo-500'
                    : 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/25 hover:from-rose-400 hover:to-pink-500'
                  }
                `}
              >
                {isToggling ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeOpacity={0.25} />
                    <path d="M21 12a9 9 0 0 1-9 9" />
                  </svg>
                ) : isHumanMode ? (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
                    </svg>
                    Activar IA
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                    </svg>
                    Tomar control
                  </>
                )}
              </button>
            </header>

            {/* ── Mode banner ──────────────────────────────────────────────── */}
            {isHumanMode ? (
              <div className="px-6 py-2 bg-rose-600/15 border-b border-rose-500/25 flex items-center gap-2 text-xs text-rose-300">
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                Modo Humano activo — La IA no responderá. Escribe tú abajo.
              </div>
            ) : (
              <div className="px-6 py-2 bg-purple-600/10 border-b border-purple-500/20 flex items-center gap-2 text-xs text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                Modo IA activo — n8n responde automáticamente.
              </div>
            )}

            {/* ── Messages area ────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-white/25 text-sm">
                  Sin mensajes en esta sesión.
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <CrmMessageBubble key={msg.id} msg={msg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Admin Input ──────────────────────────────────────────────── */}
            <footer className="px-6 py-4 border-t border-white/10 bg-[#110818]">
              {!isHumanMode && (
                <p className="text-xs text-amber-400/70 mb-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                  Enviar mensaje activará automáticamente el Modo Humano.
                </p>
              )}
              <form onSubmit={handleAdminSend} className="flex gap-3">
                <input
                  type="text"
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                  placeholder="Escribe tu respuesta como recepcionista…"
                  disabled={isSending}
                  className="
                    flex-1 bg-white/5 border border-white/15 rounded-xl
                    px-4 py-2.5 text-sm text-white placeholder-white/30
                    outline-none focus:border-rose-400/60 focus:ring-1 focus:ring-rose-400/20
                    disabled:opacity-40 transition-all duration-200
                  "
                />
                <button
                  type="submit"
                  disabled={!adminInput.trim() || isSending}
                  className="
                    shrink-0 px-5 py-2.5 rounded-xl font-semibold text-sm
                    bg-gradient-to-r from-rose-500 to-pink-600 text-white
                    hover:from-rose-400 hover:to-pink-500
                    active:scale-95 transition-all duration-200
                    disabled:opacity-40 disabled:cursor-not-allowed
                    shadow-lg shadow-rose-500/20
                    flex items-center gap-2
                  "
                >
                  {isSending ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M21 12a9 9 0 0 1-9 9" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 translate-x-px" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  )}
                  Enviar
                </button>
              </form>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
