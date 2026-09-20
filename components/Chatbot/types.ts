// ─── Chatbot Types ────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant';
export type MessageType = 'text' | 'audio';
export type MessageStatus = 'sending' | 'sent' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  /** Display text. For audio messages this starts as a placeholder and gets replaced by transcription. */
  text: string;
  type: MessageType;
  status: MessageStatus;
  /** Base64-encoded audio returned by the AI (optional) */
  audioBase64?: string;
  timestamp: Date;
}

// ─── Webhook Contract ─────────────────────────────────────────────────────────

export interface WebhookPayload {
  sessionId: string;
  type: MessageType;
  /**
   * For type='text': the user's typed message.
   * For type='audio': the browser transcript from react-speech-recognition.
   * (No longer Base64 — transcription is done natively in the browser.)
   */
  content: string;
}

export interface WebhookResponse {
  type: MessageType;
  /** Transcription of the user's audio (returned only when type === 'audio') */
  user_transcription?: string;
  ai_response_text: string;
  /** Base64-encoded audio reply from the AI (optional) */
  ai_audio_base64?: string;
}
