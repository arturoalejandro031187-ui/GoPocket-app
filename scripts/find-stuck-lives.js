const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function fixStuckSessions() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing Supabase credentials');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find sessions for Fernanda (searching by name for safety if ID not known)
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%Fernanda%');

    if (!profiles || profiles.length === 0) {
        console.log('User not found by name.');
        return;
    }

    for (const profile of profiles) {
        console.log(`Checking sessions for: ${profile.full_name} (${profile.id})`);

        const { data: sessions } = await supabase
            .from('live_sessions')
            .select('id, title, status, created_at')
            .eq('host_id', profile.id)
            .in('status', ['live', 'scheduled']);

        if (!sessions || sessions.length === 0) {
            console.log('No stuck sessions found for this user.');
            continue;
        }

        console.log(`Found ${sessions.length} stuck sessions:`);
        for (const s of sessions) {
            console.log(`- [${s.status}] ${s.title} (ID: ${s.id}, Created: ${s.created_at})`);

            // To fix it, we need to set status to 'ended'
            // console.log(`To fix: UPDATE live_sessions SET status = 'ended', ended_at = now() WHERE id = '${s.id}';`);
        }
    }
}

fixStuckSessions();
