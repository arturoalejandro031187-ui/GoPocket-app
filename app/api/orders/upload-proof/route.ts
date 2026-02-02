import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await req.formData();
    const orderId = formData.get('orderId') as string;
    const file = formData.get('file') as File;

    if (!orderId || !file) {
      return NextResponse.json({ error: 'Faltan datos (orderId o file)' }, { status: 400 });
    }

    // Validar que la orden pertenezca al vendedor
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, seller_id, status, shipping_option_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    if (order.seller_id !== user.id) {
      return NextResponse.json({ error: 'No tienes permiso para modificar esta orden' }, { status: 403 });
    }

    // Subir archivo a Storage
    // Usamos un bucket llamado 'delivery-proofs'. Si no existe, esto fallará si no se ha creado previamente.
    // Asumimos que existe o que usaremos 'public' u otro bucket común si este falla.
    // Intentaremos 'delivery-proofs' primero.
    const fileExt = file.name.split('.').pop();
    const fileName = `${orderId}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('delivery-proofs')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Error uploading proof:', uploadError);
      // Si el error es porque el bucket no existe, podríamos intentar crearlo (si tuviéramos permisos de admin)
      // O usar un bucket genérico. Por ahora retornamos error.
      return NextResponse.json({ error: 'Error al subir la imagen. Verifica que el bucket exista.' }, { status: 500 });
    }

    // Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from('delivery-proofs')
      .getPublicUrl(filePath);

    // Actualizar orden
    // Marcamos como 'delivered' porque ya se entregó (evidencia subida)
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        delivery_proof_url: publicUrl,
        status: 'delivered',
        shipping_carrier: 'pickup', // Aseguramos que sea pickup
        tracking_number: 'ENTREGA_PERSONAL', // Valor por defecto para pickup
        shipped_at: new Date().toISOString(), // Fecha de "envío/entrega"
      })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: 'Error al actualizar la orden' }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl, status: 'delivered' });
  } catch (error: any) {
    console.error('Error en upload-proof:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
