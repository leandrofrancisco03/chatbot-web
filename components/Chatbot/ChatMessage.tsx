'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from './types';

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
  message: ChatMessage;
}

export default function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSending = message.status === 'sending';

  return (
    <div
      className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md">
          <svg
            className="w-4 h-4 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
          </svg>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`
          relative max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm
          ${
            isUser
              ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white rounded-br-sm'
              : 'bg-white/10 backdrop-blur-sm border border-white/20 text-white rounded-bl-sm'
          }
          ${isSending ? 'opacity-60' : 'opacity-100'}
          transition-opacity duration-300
        `}
      >
        {/* Audio icon badge */}
        {message.type === 'audio' && isSending && (
          <span className="inline-flex items-center gap-1 text-xs mb-1 opacity-70">
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2z" />
            </svg>
            Procesando audio…
          </span>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Open all links in a new tab
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
                // Keep paragraphs consistent with the bubble's leading-relaxed
                p: ({ children }) => (
                  <p className="whitespace-pre-wrap break-words mb-1 last:mb-0">{children}</p>
                ),
              }}
            >
              {message.text}
            </ReactMarkdown>
          </div>
        )}

        {/* Timestamp */}
        <span
          className={`block text-right text-[10px] mt-1 ${
            isUser ? 'text-white/60' : 'text-white/40'
          }`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}
