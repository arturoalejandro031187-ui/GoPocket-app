import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();
  const discrepancies: any[] = [];
  
  try {
    // 1. Check PRO Consistency
    // Users with plan='pro' but expired subscription
    const now = new Date().toISOString();
    const { data: expiredPros } = await admin
      .from('profiles')
      .select('id, email, full_name, pro_subscription_end')
      .eq('plan_type', 'pro')
      .lt('pro_subscription_end', now);

    if (expiredPros && expiredPros.length > 0) {
      for (const user of expiredPros) {
        discrepancies.push({
          severity: 'critical',
          entity_type: 'user',
          entity_id: user.id,
          message: `Usuario PRO vencido detectado: ${user.email || 'Sin email'}`,
          details: { end_date: user.pro_subscription_end, issue: 'plan_pro_but_expired' }
        });
      }
    }

    // Users with active subscription but plan='basic'
    const { data: mislabeledPros } = await admin
      .from('profiles')
      .select('id, email, full_name, plan_type, pro_subscription_end')
      .neq('plan_type', 'pro')
      .gt('pro_subscription_end', now);

    if (mislabeledPros && mislabeledPros.length > 0) {
      for (const user of mislabeledPros) {
        discrepancies.push({
          severity: 'warning',
          entity_type: 'user',
          entity_id: user.id,
          message: `Suscripción Activa sin Plan PRO: ${user.email || 'Sin email'}`,
          details: { end_date: user.pro_subscription_end, current_plan: user.plan_type, issue: 'active_sub_but_basic' }
        });
      }
    }

    // 2. Check Official Stores
    // Users with official_store_name but is_official_store=false
    const { data: brokenStores } = await admin
      .from('profiles')
      .select('id, email, official_store_name')
      .neq('official_store_name', null)
      .eq('is_official_store', false);

    if (brokenStores && brokenStores.length > 0) {
      for (const store of brokenStores) {
        discrepancies.push({
          severity: 'warning',
          entity_type: 'user',
          entity_id: store.id,
          message: `Tienda Oficial desincronizada: ${store.official_store_name}`,
          details: { email: store.email, issue: 'store_name_but_flag_false' }
        });
      }
    }

    // 3. Log discrepancies to DB
    if (discrepancies.length > 0) {
      try {
        const { error } = await admin.from('audit_logs').insert(discrepancies);
        if (error) {
          console.error('Failed to write audit logs (Table likely missing):', error);
          // Return special error to prompt user to create table
          return NextResponse.json({ 
            status: 'error', 
            error: 'La tabla audit_logs no existe. Por favor ejecuta el SQL de migración.',
            discrepancies 
          });
        }
      } catch (insertError) {
        console.error('Insert error', insertError);
      }
    }

    return NextResponse.json({
      status: discrepancies.length > 0 ? 'alert' : 'clean',
      discrepancies
    });

  } catch (err: any) {
    console.error('Audit run error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}