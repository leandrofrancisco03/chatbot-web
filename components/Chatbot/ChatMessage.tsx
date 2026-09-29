'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DbMessage } from './Chatbot';

// ─── Small helper to play base64 audio ───────────────────────────────────────
export function playBase64Audio(base64: string): void {
  try {
    const audio = new Audio(`data:audio/mp3;base64,${base64}`);
    audio.play().catch(console.error);
  } catch (e) {
    console.error('Audio playback error:', e);
  }
}

// ─── Typing Indicator ────────────────────────────────────────────────────────
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-2 h-2 rounded-full bg-rose-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ─── Single Chat Bubble ───────────────────────────────────────────────────────
interface ChatMessageBubbleProps {
  message: DbMessage;
}

export default function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAdmin = message.role === 'admin';
  const isAI = message.role === 'ai';

  // User: right-aligned | AI/Admin: left-aligned
  const alignRight = isUser;

  const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // ── Bubble color scheme ──────────────────────────────────────────────────
  // user  → rose gradient (right)
  // ai    → translucent white (left)
  // admin → rose/red dark bg (left, clearly different from AI)
  const bubbleClass = isUser
    ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white rounded-br-sm'
    : isAdmin
      ? 'bg-rose-600 text-white rounded-bl-sm border border-rose-400/40'
      : 'bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-bl-sm';

  return (
    <div className={`flex items-end gap-2 ${alignRight ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar (AI or Admin) */}
      {!isUser && (
        <div
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-md
            ${isAdmin
              ? 'bg-gradient-to-br from-rose-600 to-red-700'
              : 'bg-gradient-to-br from-rose-500 to-pink-600'
            }`}
        >
          {isAdmin ? (
            /* Human icon for admin */
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          ) : (
            /* AI robot icon */
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={`
          relative max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm
          ${bubbleClass}
          transition-opacity duration-300
        `}
      >
        {/* Admin label */}
        {isAdmin && (
          <span className="block text-xs font-semibold text-rose-200 mb-1 uppercase tracking-wide">
            Recepcionista
          </span>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, ...props }) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-rose-300 hover:text-rose-200"
                  >
                    {children}
                  </a>
                ),
                p: ({ children }) => (
                  <p className="whitespace-pre-wrap break-words mb-1 last:mb-0">{children}</p>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Timestamp */}
        <span
          className={`block text-right text-[10px] mt-1 ${
            isUser ? 'text-white/60' : 'text-white/40'
          }`}
        >
          {timestamp}
        </span>
      </div>
    </div>
  );
}
