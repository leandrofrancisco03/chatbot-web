import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/admin/archive
 * Body: { sessionId: string }
 * Marks a ChatSession as archived (isArchived: true).
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId requerido.' }, { status: 400 });
    }

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { isArchived: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/admin/archive]', err);
    return NextResponse.json({ error: 'Error al archivar la sesión.' }, { status: 500 });
  }
}
