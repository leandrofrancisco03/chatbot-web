import { NextResponse } from 'next/server';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL ?? 'NO DEFINIDA';
  // Solo mostramos host y puerto, nunca la contraseña
  let safeUrl = 'NO DEFINIDA';
  try {
    const url = new URL(dbUrl);
    safeUrl = `${url.protocol}//*****:*****@${url.hostname}:${url.port}${url.pathname}`;
  } catch { /* ignore */ }

  return NextResponse.json({
    DATABASE_URL_safe: safeUrl,
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL ?? 'NO DEFINIDA',
    ADMIN_PASSWORD_set: !!process.env.ADMIN_PASSWORD,
  });
}
