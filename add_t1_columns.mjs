import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check seller profile address fields
const { data, error } = await s
  .from('profiles')
  .select('*')
  .eq('id', 'a036f83d-9f84-42e6-91b0-1c08d3cfc635')
  .maybeSingle();

if (error) console.log('Error:', error.message);
else {
  // Print all address-related fields
  const keys = Object.keys(data).filter(k =>
    k.includes('address') || k.includes('street') || k.includes('city') ||
    k.includes('state') || k.includes('zip') || k.includes('colonia') ||
    k.includes('phone') || k.includes('name') || k.includes('neighborhood') ||
    k.includes('ext') || k.includes('int') || k.includes('number')
  );
  for (const k of keys) {
    console.log(`${k}: ${JSON.stringify(data[k])}`);
  }
}
