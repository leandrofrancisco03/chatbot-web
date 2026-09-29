import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/chat/sessions
 * Returns all ChatSessions ordered by updatedAt descending.
 */
export async function GET() {
  try {
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    });

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('[GET /api/chat/sessions]', err);
    return NextResponse.json({ error: 'Error al obtener sesiones.' }, { status: 500 });
  }
}
