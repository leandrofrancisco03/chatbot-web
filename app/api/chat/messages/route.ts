import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/chat/messages?sessionId=...
 * Returns all messages for the given session plus the session's isHumanMode flag.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId es requerido.' }, { status: 400 });
  }

  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      isHumanMode: session?.isHumanMode ?? false,
      messages,
    });
  } catch (err) {
    console.error('[GET /api/chat/messages]', err);
    return NextResponse.json({ error: 'Error al obtener mensajes.' }, { status: 500 });
  }
}
