import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL!;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

/**
 * POST /api/admin/send
 *
 * Allows the receptionist/admin to send a message to a session.
 * Side effects:
 *  1. Saves the message with role: 'admin' to Prisma.
 *  2. Sets isHumanMode = true on the session (admin taking over).
 *  3. Notifies n8n (fire-and-forget) so it can log/skip AI.
 */
export async function POST(req: NextRequest) {
  let body: { sessionId: string; content: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { sessionId, content } = body;

  if (!sessionId || !content?.trim()) {
    return NextResponse.json({ error: 'sessionId y content son requeridos.' }, { status: 400 });
  }

  try {
    // ── 1. Set isHumanMode = true and save admin message ────────────────────
    const [session] = await prisma.$transaction([
      prisma.chatSession.update({
        where: { id: sessionId },
        data: { isHumanMode: true, updatedAt: new Date() },
      }),
      prisma.chatMessage.create({
        data: {
          sessionId,
          role: 'admin',
          content: content.trim(),
          type: 'text',
        },
      }),
    ]);

    // ── 2. Notify n8n (fire-and-forget, n8n should close without calling AI) ──
    if (N8N_WEBHOOK_URL) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (N8N_WEBHOOK_SECRET) headers['x-api-key'] = N8N_WEBHOOK_SECRET;

      fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId,
          role: 'admin',
          isHumanMode: true,
          content: content.trim(),
        }),
      }).catch((err) => console.warn('[/api/admin/send] n8n notify failed:', err));
    }

    return NextResponse.json({ success: true, sessionId: session.id });
  } catch (err) {
    console.error('[POST /api/admin/send] Error:', err);
    return NextResponse.json({ error: 'Error al guardar mensaje del admin.' }, { status: 500 });
  }
}
