import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/admin/toggle-ia
 *
 * Toggles the isHumanMode flag on a session.
 * Body: { sessionId: string; isHumanMode: boolean }
 */
export async function POST(req: NextRequest) {
  let body: { sessionId: string; isHumanMode: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido.' }, { status: 400 });
  }

  const { sessionId, isHumanMode } = body;

  if (!sessionId || typeof isHumanMode !== 'boolean') {
    return NextResponse.json(
      { error: 'sessionId (string) e isHumanMode (boolean) son requeridos.' },
      { status: 400 },
    );
  }

  try {
    const session = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { isHumanMode, updatedAt: new Date() },
    });

    return NextResponse.json({ success: true, isHumanMode: session.isHumanMode });
  } catch (err) {
    console.error('[POST /api/admin/toggle-ia] Error:', err);
    return NextResponse.json({ error: 'Error al actualizar el modo de la sesión.' }, { status: 500 });
  }
}
