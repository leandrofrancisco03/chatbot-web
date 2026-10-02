'use client';

// regenerator-runtime is required by react-speech-recognition
import 'regenerator-runtime/runtime';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition';

import ChatMessageBubble, {
  TypingIndicator,
  playBase64Audio,
} from './ChatMessage';
import type { WebhookPayload, WebhookResponse } from './types';

// ─── Config ───────────────────────────────────────────────────────────────────
const CHAT_API_URL = '/api/chat';
const SESSION_KEY = 'velka_chat_session';
const SILENCE_DELAY_MS = 1800;
const MIN_CHARS_TO_SEND = 5;
/** SWR polling interval while chat is open (3 s) */
const POLL_INTERVAL_MS = 3000;

// ─── DB Message type (from Prisma) ───────────────────────────────────────────
export interface DbMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'ai' | 'admin';
  content: string;
  type: string;
  createdAt: string;
}

// ─── SWR fetcher ─────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function getOrCreateSession(): string {
  if (typeof window === 'undefined') return generateId();
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = generateId();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

// ─── TTS Helpers ──────────────────────────────────────────────────────────────
const PREFERRED_VOICE = 'Google español';

function cleanTextForSpeech(text: string): string {
  return text
    .replace(
      /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{E0000}-\u{E01FF}]/gu,
      '',
    )
    .replace(/[*_]{1,3}/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[[\]<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const preferred = voices.find((v) => v.name === PREFERRED_VOICE);
  if (preferred) return preferred;
  const anySpanish = voices.find((v) => v.lang.startsWith('es'));
  return anySpanish ?? null;
}

function speakText(text: string): void {
  if (typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const clean = cleanTextForSpeech(text);
  if (!clean) return;
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'es-ES';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  const voice = pickSpanishVoice();
  if (voice) {
    utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } else {
    const onVoicesChanged = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      const resolvedVoice = pickSpanishVoice();
      if (resolvedVoice) utterance.voice = resolvedVoice;
      window.speechSynthesis.speak(utterance);
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Chatbot() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [sessionId] = useState<string>(() => getOrCreateSession());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);
  /** Track the IDs of messages we've already read aloud to avoid re-speaking */
  const spokenIdsRef = useRef<Set<string>>(new Set());

  // ─── SWR: poll messages from DB ─────────────────────────────────────────────
  const { data, mutate } = useSWR<{ messages: DbMessage[]; isHumanMode: boolean }>(
    isOpen ? `/api/chat/messages?sessionId=${sessionId}` : null,
    fetcher,
    { refreshInterval: POLL_INTERVAL_MS, revalidateOnFocus: false },
  );

  const messages: DbMessage[] = data?.messages ?? [];
  const isHumanMode: boolean = data?.isHumanMode ?? false;

  // ─── Speech Recognition hook ──────────────────────────────────────────────
  const {
    transcript,
    interimTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();

  // Keep isLoadingRef in sync
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, transcript, interimTranscript]);

  // Focus text input when chat opens
  useEffect(() => {
    if (isOpen && !isVoiceMode) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isVoiceMode]);

  // Cleanup silence timer on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── TTS: speak new AI messages when voice mode is active ──────────────────
  useEffect(() => {
    if (!isVoiceMode) return;
    messages.forEach((msg) => {
      if (msg.role === 'ai' && !spokenIdsRef.current.has(msg.id)) {
        spokenIdsRef.current.add(msg.id);
        speakText(msg.content);
      }
    });
  }, [messages, isVoiceMode]);

  // ─── Send message ─────────────────────────────────────────────────────────
  const sendToWebhook = useCallback(
    async (payload: WebhookPayload) => {
      setIsLoading(true);
      try {
        const res = await fetch(CHAT_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const bodyText = await res.text();
        if (!bodyText || bodyText.trim() === '') {
          throw new Error('El servidor devolvió una respuesta vacía.');
        }

        const parsed: WebhookResponse & { isHumanMode?: boolean; output?: string } =
          JSON.parse(bodyText);

        // If in human mode, just refresh messages (admin will reply)
        if (parsed.isHumanMode) {
          await mutate();
          return;
        }

        // Play audio if present
        if (parsed.ai_audio_base64) playBase64Audio(parsed.ai_audio_base64);

        // Refresh SWR to show new messages from DB
        await mutate();
      } catch (err) {
        console.error('Webhook error:', err);
        // Still refresh to show the user message that was saved
        await mutate();
      } finally {
        setIsLoading(false);
      }
    },
    [mutate],
  );

  // ─── Commit transcript (voice mode) ──────────────────────────────────────
  const commitTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      sendToWebhook({ sessionId, type: 'audio', content: trimmed });
    },
    [sessionId, sendToWebhook],
  );

  // ─── Silence detection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isVoiceMode) return;
    if (!transcript.trim()) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      const text = transcript.trim();
      if (text.length < MIN_CHARS_TO_SEND) {
        resetTranscript();
        return;
      }
      if (isLoadingRef.current) return;
      commitTranscript(text);
      resetTranscript();
    }, SILENCE_DELAY_MS);
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [transcript, isVoiceMode, resetTranscript, commitTranscript]);

  // ─── Voice mode toggle ────────────────────────────────────────────────────
  const toggleVoiceMode = useCallback(() => {
    if (!browserSupportsSpeechRecognition) return;
    if (!isMicrophoneAvailable) return;
    if (isVoiceMode) {
      SpeechRecognition.stopListening();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      const pending = transcript.trim();
      if (pending.length >= MIN_CHARS_TO_SEND && !isLoadingRef.current) {
        commitTranscript(pending);
      }
      resetTranscript();
      setIsVoiceMode(false);
    } else {
      resetTranscript();
      SpeechRecognition.startListening({ continuous: true, language: 'es-ES' });
      setIsVoiceMode(true);
    }
  }, [
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    isVoiceMode,
    transcript,
    resetTranscript,
    commitTranscript,
  ]);

  // ─── Text submission ──────────────────────────────────────────────────────
  const handleTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;
      setInput('');
      sendToWebhook({ sessionId, type: 'text', content: text });
    },
    [input, isLoading, sessionId, sendToWebhook],
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  const livePreview =
    (transcript + (interimTranscript ? ' ' + interimTranscript : '')).trim();

  // Ocultar el widget flotante en el panel de administración
  if (pathname?.startsWith('/recepcion-oculta')) return null;

  return (
    <>
      {/* ── Floating Toggle Button ── */}
      <button
        id="chatbot-toggle-btn"
        onClick={() => setIsOpen((o) => !o)}
        aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
        className={`
          fixed bottom-6 right-6 z-50
          w-14 h-14 rounded-full shadow-2xl
          bg-gradient-to-br from-rose-500 to-pink-600
          flex items-center justify-center text-white
          transition-all duration-300 ease-in-out
          hover:scale-110 hover:shadow-rose-500/40 hover:shadow-2xl
          active:scale-95
          ${isOpen ? 'rotate-45' : 'rotate-0'}
        `}
      >
        {isOpen ? (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 10H6V10h12v2zm0-3H6V7h12v2z" />
          </svg>
        )}
        {!isOpen && (
          <span className="absolute w-full h-full rounded-full bg-rose-400 opacity-30 animate-ping pointer-events-none" />
        )}
      </button>

      {/* ── Chat Window ── */}
      <div
        id="chatbot-window"
        className={`
          fixed bottom-24 right-6 z-50
          w-[360px] max-w-[calc(100vw-3rem)]
          flex flex-col rounded-2xl overflow-hidden
          shadow-[0_25px_60px_rgba(0,0,0,0.5)]
          border border-white/10
          bg-gradient-to-b from-[#1a0a1e] to-[#0d0511]
          transition-all duration-300 ease-in-out origin-bottom-right
          ${isOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Asistente virtual Velka Spa"
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-rose-600 to-pink-600 shadow-md">
          <div className="relative w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z" />
            </svg>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-rose-600
                ${isVoiceMode && listening ? 'bg-red-400 animate-pulse' : isHumanMode ? 'bg-amber-400' : 'bg-emerald-400'}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-none">Velka Spa</p>
            <p className="text-white/70 text-xs mt-0.5 truncate">
              {isLoading
                ? 'Procesando…'
                : isHumanMode
                  ? '👤 Atendido por recepción'
                  : isVoiceMode && listening
                    ? '🎤 Escuchando en tiempo real…'
                    : 'En línea'}
            </p>
          </div>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
              }
              setIsOpen(false);
            }}
            aria-label="Minimizar chat"
            className="text-white/60 hover:text-white transition-colors shrink-0"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>

        {/* ── Messages ── */}
        <div
          id="chatbot-messages"
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-[320px] max-h-[420px] scrollbar-thin scrollbar-thumb-white/10"
        >
          {messages.length === 0 && !livePreview && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center pt-8">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
                <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 13h-2v-6h2v6zm0-8h-2V5h2v2z" />
                </svg>
              </div>
              <p className="text-white font-semibold text-sm">¡Hola! Soy tu asistente de Velka Spa 💆‍♀️</p>
              <p className="text-white/50 text-xs leading-relaxed max-w-[220px]">
                Escribe o activa el micrófono. En modo voz, te escucho continuamente.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessageBubble key={msg.id} message={msg} />
          ))}

          {/* Live transcript preview */}
          {isVoiceMode && livePreview && (
            <div className="flex flex-row-reverse items-end gap-2">
              <div className="max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed bg-rose-500/20 border border-rose-400/40 text-white/80">
                <span>{transcript}</span>
                {interimTranscript && (
                  <span className="text-white/50"> {interimTranscript}</span>
                )}
                <span className="inline-block w-0.5 h-3.5 ml-1 bg-rose-400 rounded animate-pulse align-middle" />
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-end gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md shrink-0">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z" />
                </svg>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl rounded-bl-sm">
                <TypingIndicator />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Human mode banner ── */}
        {isHumanMode && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border-t border-amber-500/30 text-xs text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Ahora te atiende un agente de recepción
          </div>
        )}

        {/* ── Input Area ── */}
        <form
          onSubmit={handleTextSubmit}
          className="flex items-center gap-2 px-3 py-3 bg-white/5 border-t border-white/10"
        >
          {/* Mic button */}
          <button
            type="button"
            id="chatbot-mic-btn"
            onClick={toggleVoiceMode}
            disabled={isLoading}
            aria-label={isVoiceMode ? 'Desactivar modo voz' : 'Activar modo voz continuo'}
            className={`
              relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center
              transition-all duration-200
              ${isVoiceMode
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 scale-110'
                : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
              }
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
          >
            {isVoiceMode ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a1 1 0 0 0-1 1v16a1 1 0 0 0 2 0V4a1 1 0 0 0-1-1zm-4 3a1 1 0 0 0-1 1v10a1 1 0 0 0 2 0V7a1 1 0 0 0-1-1zm8 0a1 1 0 0 0-1 1v10a1 1 0 0 0 2 0V7a1 1 0 0 0-1-1zm-12 3a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0-1-1zm16 0a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0-1-1z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2z" />
              </svg>
            )}
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            id="chatbot-text-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isVoiceMode ? '🎤 Modo voz activo…' : 'Escribe tu mensaje…'}
            disabled={isLoading || isVoiceMode}
            className="
              flex-1 bg-white/10 border border-white/20 rounded-xl
              px-3 py-2 text-sm text-white placeholder-white/40
              outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400/50
              transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          />

          {/* Send button */}
          <button
            type="submit"
            id="chatbot-send-btn"
            disabled={!input.trim() || isLoading || isVoiceMode}
            aria-label="Enviar mensaje"
            className="
              shrink-0 w-9 h-9 rounded-full
              bg-gradient-to-br from-rose-500 to-pink-600
              flex items-center justify-center text-white
              shadow-md shadow-rose-500/30
              transition-all duration-200
              hover:scale-105 hover:shadow-rose-500/50 hover:shadow-lg active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
            "
          >
            <svg className="w-4 h-4 translate-x-px" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>

        {/* Voice-mode status strip */}
        {isVoiceMode && (
          <div className="flex items-center justify-between px-4 py-1.5 bg-red-500/15 border-t border-red-500/25 text-xs text-red-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              {isLoading
                ? 'Enviando… (el micrófono seguirá activo)'
                : `Envío automático tras ${SILENCE_DELAY_MS / 1000}s de silencio`}
            </div>
            <button
              type="button"
              onClick={toggleVoiceMode}
              className="text-red-400 hover:text-red-200 underline underline-offset-2 transition-colors"
            >
              Detener
            </button>
          </div>
        )}
      </div>
    </>
  );
}
