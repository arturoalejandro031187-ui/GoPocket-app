const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function closeSessions() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Search for Fernanda's ID again carefully
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Fernanda%');

    if (!profiles || profiles.length === 0) {
        console.log('User not found.');
        return;
    }

    const hostId = profiles[0].id;
    console.log(`Closing sessions for ${profiles[0].full_name} (${hostId})`);

    const { data, error } = await supabase
        .from('live_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('host_id', hostId)
        .in('status', ['live', 'scheduled']);

    if (error) {
        console.error('Error closing sessions:', error);
    } else {
        console.log('Successfully closed sessions.');
    }
}

closeSessions();
