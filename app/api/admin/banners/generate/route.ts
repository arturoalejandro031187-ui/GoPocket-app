import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateBanner } from '@/lib/replicate';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    
    // 1. Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Admin check
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
