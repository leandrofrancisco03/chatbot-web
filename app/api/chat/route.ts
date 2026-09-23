import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/chat
 *
 * Proxy seguro hacia el webhook de n8n.
 * Las variables de entorno NO tienen prefijo NEXT_PUBLIC_, por lo que
 * jamás son expuestas al bundle del navegador.
 */
export async function POST(req: NextRequest) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const apiKey     = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookUrl) {
    console.error('[/api/chat] N8N_WEBHOOK_URL no está definida.');
    return NextResponse.json(
      { error: 'Configuración de servidor incompleta.' },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Cuerpo de la solicitud inválido.' },
      { status: 400 },
    );
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    const n8nRes = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const responseText = await n8nRes.text();

    if (!n8nRes.ok) {
      console.error(`[/api/chat] n8n respondió con HTTP ${n8nRes.status}:`, responseText);
      return NextResponse.json(
        { error: `Error del servidor n8n: ${n8nRes.status}` },
        { status: n8nRes.status },
      );
    }

    // Reenvía la respuesta de n8n tal cual al cliente
    return new NextResponse(responseText, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[/api/chat] Error al contactar n8n:', err);
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor de IA.' },
      { status: 500 },
    );
  }
}
