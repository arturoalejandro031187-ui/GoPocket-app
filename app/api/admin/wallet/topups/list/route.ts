import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 1. Validar autenticación vía Header (Bearer Token)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Cliente para verificar sesión
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Verificar rol de Admin
    // Usamos Service Role para consultar la tabla de perfiles/admins si es necesario, 
    // o consultamos directamente si tenemos una tabla de admins.
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verificar si es admin (asumiendo que hay una tabla admin_users o campo is_admin en profiles)
    // Opción A: Tabla admin_users
    const { data: adminUser } = await adminClient
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // Opción B: Campo role/is_admin en profiles
    // Por ahora, si no existe la tabla admin_users, podrías verificar profiles.
    // Asumiremos que la política de seguridad o la tabla admin_users es la fuente de verdad.
    // Si la tabla admin_users no existe, esto fallará. Verifiquemos con un fallback o asumimos la estructura.
    // Basado en archivos previos, existe 'admin_users'.

    if (!adminUser) {
       // Fallback: verificar en profiles si tiene is_admin (común en algunos setups)
       const { data: profile } = await adminClient
         .from('profiles')
         .select('is_admin')
         .eq('id', user.id)
         .single();
         
       if (!profile?.is_admin) {
         return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
       }
    }

    // 3. Obtener topups usando Service Role (para ignorar RLS de "solo propios")
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = adminClient
      .from('wallet_topups')
      .select(`
        *,
        user:profiles!inner(email, first_name, last_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      if (status === 'pending') {
        // Incluir todos los estados considerados "pendientes"
        query = query.in('status', ['pending', 'pending_proof', 'pending_approval']);
      } else {
        query = query.eq('status', status);
      }
    }

    const { data: topups, error } = await query;

    if (error) {
      console.error('[ADMIN TOPUPS LIST] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ topups });

  } catch (error) {
    console.error('[ADMIN TOPUPS LIST] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
