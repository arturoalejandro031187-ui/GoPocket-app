
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manual dotenv parsing
const envPath = path.join(process.cwd(), '.env.local');
console.log('Reading env from:', envPath);

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["'](.*)["']$/, '$1');
      process.env[key] = value;
    }
  });
} else {
  console.log('Env file not found');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars:', { supabaseUrl, hasKey: !!supabaseServiceKey });
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function debugOrders() {
  console.log('--- Debugging Orders Table ---');

  // 2. Creating dummy order
  console.log('\n2. Creating dummy order...');
  
  // Get a user ID
  const { data: users, error: usersError } = await admin.from('profiles').select('id').limit(1);
  if (usersError || !users || users.length === 0) {
    console.log('No users found or error:', usersError);
    return;
  }
  const userId = users[0].id;
  console.log('Using userId:', userId);
  
  const { data: order, error: createError } = await admin
    .from('orders')
    .insert({
      buyer_id: userId,
      seller_id: userId, 
      total: 100,
      status: 'pending_payment'
    })
    .select()
    .single();
    
  if (createError) {
    console.error('Error creating order:', createError);
    return;
  }
  console.log('Order created:', order.id, order.status);
  
  // 3. Updating order
  console.log('\n3. Updating order to paid (using .in())...');
  const now = new Date().toISOString();
  
  // Simulate array of IDs
  const orderIds = [order.id];
  
  const upd = await admin
    .from('orders')
    .update({ 
      status: 'paid',
      paid_at: now
    })
    .in('id', orderIds)
    .select('id,status,paid_at');
  
  // 4. Cleaning up
  console.log('\n4. Cleaning up...');
  await admin.from('orders').delete().eq('id', order.id);
}

debugOrders();
