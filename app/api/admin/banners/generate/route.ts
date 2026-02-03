import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateBanner } from '@/lib/replicate';

export async function POST(request: Request) {
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

    // 2. Admin check
    // Create admin client to check permissions
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Fallback if service key not set, but likely won't work for admin table if RLS is strict
    );
    // Ideally use SERVICE_ROLE_KEY for admin checks if RLS prevents reading admin_users
    // But let's stick to what we had or similar pattern.
    // The previous code used the SAME client (user context) to check admin_users.
    // If admin_users is readable by authenticated users (or the user themselves), it works.
    // Let's assume user context is enough for now to minimize risk, 
    // OR use the pattern from other files which creates a separate admin client?
    // Other files use: const adminClient = createClient(..., process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    // Let's try to use the user client first as before, but with the token.
    // Actually, other files use adminClient for the check. Let's use that if possible.
    // But I don't want to break it if SERVICE_ROLE_KEY is missing.
    // Let's stick to the user client first, as the original code did (it used `supabase` which was `createClient()` from server helpers).
    // Wait, the original used `createClient()` from lib/supabase/server, which was ANON key.
    // So it was definitely broken before (it had no user context).
    
    // Let's use the token-based client for the check.
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRow) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 3. Parse body
    const body = await request.json();
    const { prompt, aspectRatio } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 4. Generate image
    // Map UI aspect ratios to Replicate supported ones if needed
    // The UI in admin page supports many, but lib/replicate.ts types define specific ones.
    // valid: "16:9" | "1:1" | "21:9" | "3:2" | "4:5" | "9:16"
    
    // We'll let the client pass the valid one, or default to 21:9 for banners if not specified.
    // For mid4/mid5 (24:9), we might approximate with 21:9 or just pass it if the model supports it (Flux allows custom sometimes, but let's stick to the type definition in lib/replicate for safety or cast it).
    
    const output = await generateBanner({
      prompt,
      aspectRatio: aspectRatio || '21:9',
    });

    // Flux Schnell output is typically [ "https://..." ]
    const imageUrl = Array.isArray(output) ? output[0] : output;

    return NextResponse.json({ url: imageUrl });
  } catch (error: any) {
    console.error('Error generating banner:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate banner' },
      { status: 500 }
    );
  }
}
