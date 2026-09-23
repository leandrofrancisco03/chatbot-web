'use client';

// regenerator-runtime is required by react-speech-recognition
import 'regenerator-runtime/runtime';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition';

import ChatMessageBubble, {
  TypingIndicator,
  playBase64Audio,
} from './ChatMessage';
import type { ChatMessage, WebhookPayload, WebhookResponse } from './types';

// ─── Config ───────────────────────────────────────────────────────────────────
// Apunta al Route Handler local — las credenciales de n8n viven SOLO en el servidor.
const WEBHOOK_URL = '/api/chat';

const SESSION_KEY = 'velka_chat_session';

/**
 * How long (ms) of silence before we treat the user's speech as a complete
 * sentence and POST it to the webhook. 1800 ms feels natural — not too eager,
 * not too slow.
 */
const SILENCE_DELAY_MS = 1800;

/**
 * Minimum number of characters the transcript must have before we bother
 * sending. Avoids firing on "mm", "eh", stray clicks, etc.
 */
const MIN_CHARS_TO_SEND = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function getOrCreateSession(): string {
  if (typeof window === 'undefined') return generateId();
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = generateId();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  /** True while continuous voice-mode is active */
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [sessionId] = useState<string>(() => getOrCreateSession());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Holds the pending silence timer so we can cancel/reset it */
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * We need isLoading inside the silence callback without causing stale closure.
   * Keeping a ref in sync with the state solves this cleanly.
   */
  const isLoadingRef = useRef(false);

  // ─── Speech Recognition hook ──────────────────────────────────────────────
  const {
    transcript,          // confirmed (final) speech so far in this session
    interimTranscript,   // words still being processed (not final yet)
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

  // Focus text input when chat opens (only when not in voice mode)
  useEffect(() => {
    if (isOpen && !isVoiceMode) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isVoiceMode]);

  // Clean up the silence timer when the component unmounts
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ─── Send message to n8n webhook ──────────────────────────────────────────
  const sendToWebhook = useCallback(
    async (payload: WebhookPayload, userMsgId: string) => {
      setIsLoading(true);
      try {
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Normalize n8n response – may return an array ([{ output: "..." }]) or a plain object
        const bodyText = await res.text();
        if (!bodyText || bodyText.trim() === '') {
          throw new Error('El servidor devolvió una respuesta vacía.');
        }
        const parsed = JSON.parse(bodyText);
        // Unwrap array: n8n AI Agent node returns [{ output: "..." }]
        const raw = Array.isArray(parsed) ? parsed[0] : parsed;
        const responseText: string =
          raw?.ai_response_text ??
          raw?.output ??
          raw?.message ??
          raw?.text ??
          'Sin respuesta del servidor.';

        const data: WebhookResponse = {
          type: raw.type ?? 'text',
          ai_response_text: responseText,
          user_transcription: raw.user_transcription,
          ai_audio_base64: raw.ai_audio_base64,
        };

        // Mark the user bubble as sent (optionally update text if n8n corrected it)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsgId
              ? {
                ...m,
                status: 'sent',
                text: data.user_transcription ?? m.text,
              }
              : m,
          ),
        );

        // Add AI response bubble
        const aiMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          text: data.ai_response_text,
          type: data.type,
          status: 'sent',
          audioBase64: data.ai_audio_base64,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);

        if (data.ai_audio_base64) playBase64Audio(data.ai_audio_base64);
      } catch (err) {
        console.error('Webhook error:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsgId
              ? { ...m, status: 'error', text: m.text + ' ⚠️' }
              : m,
          ),
        );
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            text: 'Lo siento, hubo un problema al conectar. Por favor intenta de nuevo.',
            type: 'text',
            status: 'sent',
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // ─── Commit a transcript to the chat and fire the webhook ─────────────────
  const commitTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const msgId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          role: 'user',
          text: trimmed,
          type: 'audio',
          status: 'sending',
          timestamp: new Date(),
        },
      ]);

      sendToWebhook({ sessionId, type: 'audio', content: trimmed }, msgId);
    },
    [sessionId, sendToWebhook],
  );

  // ─── Silence detection ────────────────────────────────────────────────────
  //
  // Every time the FINAL transcript grows, we restart a countdown.
  // If it doesn't grow again within SILENCE_DELAY_MS, the user has paused →
  // we commit the message and reset the transcript so the next sentence starts
  // fresh. The mic keeps listening the whole time.
  //
  useEffect(() => {
    if (!isVoiceMode) return;           // only active in voice mode
    if (!transcript.trim()) return;     // nothing to send yet

    // Cancel the previous countdown
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    silenceTimerRef.current = setTimeout(() => {
      const text = transcript.trim();

      // Guard 1: minimum length
      if (text.length < MIN_CHARS_TO_SEND) {
        resetTranscript();
        return;
      }

      // Guard 2: don't pile up requests — if we're still waiting for the last
      // webhook response, skip this cycle (the transcript will keep growing
      // if the user keeps talking, resetting the timer again).
      if (isLoadingRef.current) return;

      // All good → commit and clear for the next sentence
      commitTranscript(text);
      resetTranscript();
    }, SILENCE_DELAY_MS);

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [transcript, isVoiceMode, resetTranscript, commitTranscript]);

  // ─── Voice mode toggle ────────────────────────────────────────────────────
  const toggleVoiceMode = useCallback(() => {
    if (!browserSupportsSpeechRecognition) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          text: '⚠️ Tu navegador no soporta entrada de voz. Prueba con Google Chrome.',
          type: 'text',
          status: 'sent',
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (!isMicrophoneAvailable) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          text: '🎤 No se pudo acceder al micrófono. Revisa los permisos del navegador.',
          type: 'text',
          status: 'sent',
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (isVoiceMode) {
      // ── Turn OFF voice mode ──────────────────────────────────────────────
      SpeechRecognition.stopListening();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      // Commit whatever was still in the buffer before stopping
      const pending = transcript.trim();
      if (pending.length >= MIN_CHARS_TO_SEND && !isLoadingRef.current) {
        commitTranscript(pending);
      }
      resetTranscript();
      setIsVoiceMode(false);
    } else {
      // ── Turn ON voice mode ───────────────────────────────────────────────
      resetTranscript();
      SpeechRecognition.startListening({
        continuous: true,
        language: 'es-ES',
        // interimResults: true is the default in react-speech-recognition;
        // it gives us the live interimTranscript preview.
      });
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

      const msgId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          role: 'user',
          text,
          type: 'text',
          status: 'sending',
          timestamp: new Date(),
        },
      ]);
      setInput('');
      sendToWebhook({ sessionId, type: 'text', content: text }, msgId);
    },
    [input, isLoading, sessionId, sendToWebhook],
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  // The live text to show in the preview bubble:
  // final transcript (confirmed) + interimTranscript (being processed)
  const livePreview =
    (transcript + (interimTranscript ? ' ' + interimTranscript : '')).trim();

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
            {/* Green "online" dot — turns into red pulse when listening */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-rose-600
                ${isVoiceMode && listening
                  ? 'bg-red-400 animate-pulse'
                  : 'bg-emerald-400'
                }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-none">Velka Spa IA</p>
            <p className="text-white/70 text-xs mt-0.5 truncate">
              {isLoading
                ? 'Procesando…'
                : isVoiceMode && listening
                  ? '🎤 Escuchando en tiempo real…'
                  : 'En línea'}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
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
                Escribe o activa el micrófono. En modo voz, te escucho continuamente y envío tu mensaje cuando detecte una pausa.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessageBubble key={msg.id} message={msg} />
          ))}

          {/* ── Live transcript preview bubble ── */}
          {isVoiceMode && livePreview && (
            <div className="flex flex-row-reverse items-end gap-2">
              <div
                className="
                  max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed
                  bg-rose-500/20 border border-rose-400/40 text-white/80
                "
              >
                {/* confirmed part */}
                <span>{transcript}</span>
                {/* interim part — slightly dimmed */}
                {interimTranscript && (
                  <span className="text-white/50"> {interimTranscript}</span>
                )}
                {/* blinking cursor */}
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

        {/* ── Input Area ── */}
        <form
          onSubmit={handleTextSubmit}
          className="flex items-center gap-2 px-3 py-3 bg-white/5 border-t border-white/10"
        >
          {/* ── Mic / Voice-mode toggle button ── */}
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
              /* Waveform / active icon */
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a1 1 0 0 0-1 1v16a1 1 0 0 0 2 0V4a1 1 0 0 0-1-1zm-4 3a1 1 0 0 0-1 1v10a1 1 0 0 0 2 0V7a1 1 0 0 0-1-1zm8 0a1 1 0 0 0-1 1v10a1 1 0 0 0 2 0V7a1 1 0 0 0-1-1zm-12 3a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0-1-1zm16 0a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0-1-1z" />
              </svg>
            ) : (
              /* Mic icon */
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

          {/* Send button (text mode) */}
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

        {/* ── Voice-mode status strip ── */}
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
