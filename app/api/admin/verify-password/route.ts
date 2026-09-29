import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('[verify-password] ADMIN_PASSWORD no está definida en .env.local');
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    if (typeof password !== 'string' || password.length === 0) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const ok = password === adminPassword;

    // Pequeño delay para evitar ataques de fuerza bruta por timing
    if (!ok) {
      await new Promise((r) => setTimeout(r, 300));
    }

    return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
