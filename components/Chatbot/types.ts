// ─── Chatbot Types ────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'audio';

// ─── Webhook Contract ─────────────────────────────────────────────────────────

export interface WebhookPayload {
  sessionId: string;
  type: MessageType;
  /**
   * For type='text': the user's typed message.
   * For type='audio': the browser transcript from react-speech-recognition.
   */
  content: string;
}

export interface WebhookResponse {
  type?: MessageType;
  isHumanMode?: boolean;
  /** Transcription of the user's audio (returned only when type === 'audio') */
  user_transcription?: string;
  ai_response_text?: string;
  /** Base64-encoded audio reply from the AI (optional) */
  ai_audio_base64?: string;
  output?: string;
}
