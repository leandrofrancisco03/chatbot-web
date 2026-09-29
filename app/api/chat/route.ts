import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL!;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

/**
 * POST /api/chat
 *
 * Main chat controller — stateful. Next.js is the source of truth.
 * Flow:
 *  1. Find or create ChatSession (upsert by sessionId from client).
 *  2. Save incoming user message to Prisma.
 *  3. Build history context from last 8 messages.
 *  4. Forward to n8n webhook (stateless AI processor).
 *  5. If NOT in human mode: save AI response to Prisma and return it.
 *  6. If in human mode: return 200 with empty output (admin handles reply).
 */
export async function POST(req: NextRequest) {
  if (!N8N_WEBHOOK_URL) {
    console.error('[POST /api/chat] N8N_WEBHOOK_URL no está definida.');
    return NextResponse.json({ error: 'Configuración de servidor incompleta.' }, { status: 500 });
  }

  let body: { sessionId: string; type: string; content: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { sessionId, type = 'text', content } = body;

  if (!sessionId || !content) {
    return NextResponse.json({ error: 'sessionId y content son requeridos.' }, { status: 400 });
  }

  try {
    // ── 1. Find or create the ChatSession ────────────────────────────────────
    const session = await prisma.chatSession.upsert({
      where: { id: sessionId },
      update: { updatedAt: new Date() },
      create: { id: sessionId, isHumanMode: false },
    });

    // ── 2. Persist user message ───────────────────────────────────────────────
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content, type },
    });

    // Update session's updatedAt
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    // ── 3. Build history (last 8 msgs ordered chronologically) ───────────────
    const recentMsgs = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    // Reverse to chronological order for LLM context
    const history = recentMsgs.reverse().map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // ── 4. Forward to n8n webhook ─────────────────────────────────────────────
    const n8nHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (N8N_WEBHOOK_SECRET) n8nHeaders['x-api-key'] = N8N_WEBHOOK_SECRET;

    const n8nPayload = {
      sessionId: session.id,
      role: 'user',
      isHumanMode: session.isHumanMode,
      content,
      history,
    };

    // ── 5. Human mode: return success without waiting for AI ──────────────────
    if (session.isHumanMode) {
      // Fire-and-forget to n8n so it knows about the message (can log, etc.)
      fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: n8nHeaders,
        body: JSON.stringify(n8nPayload),
      }).catch((err) => console.warn('[/api/chat] n8n notify failed (human mode):', err));

      return NextResponse.json({ isHumanMode: true, output: null });
    }

    // ── 6. AI mode: await n8n response ────────────────────────────────────────
    const n8nRes = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: n8nHeaders,
      body: JSON.stringify(n8nPayload),
    });

    const responseText = await n8nRes.text();

    if (!n8nRes.ok) {
      console.error(`[/api/chat] n8n respondió con HTTP ${n8nRes.status}:`, responseText);
      return NextResponse.json(
        { error: `Error del servidor n8n: ${n8nRes.status}` },
        { status: n8nRes.status },
      );
    }

    // Parse n8n response
    let parsed: Record<string, unknown>;
    try {
      const raw = JSON.parse(responseText);
      parsed = Array.isArray(raw) ? raw[0] : raw;
    } catch {
      parsed = {};
    }

    const aiText: string =
      (parsed?.ai_response_text as string) ??
      (parsed?.output as string) ??
      (parsed?.message as string) ??
      (parsed?.text as string) ??
      'Sin respuesta del servidor.';

    // ── 7. Persist AI response ────────────────────────────────────────────────
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'ai', content: aiText, type: 'text' },
    });

    // Touch updatedAt again after AI response
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    // Return structured response to client
    return NextResponse.json({
      isHumanMode: false,
      type: parsed?.type ?? 'text',
      ai_response_text: aiText,
      user_transcription: parsed?.user_transcription,
      ai_audio_base64: parsed?.ai_audio_base64,
      output: aiText,
    });
  } catch (err) {
    const error = err as Error;
    console.error('[POST /api/chat] Error detallado:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    return NextResponse.json({ error: 'No se pudo conectar con el servidor de IA.' }, { status: 500 });
  }
}
