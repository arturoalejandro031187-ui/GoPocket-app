const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function applyMigration() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing Supabase credentials in .env.local');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // We can't run raw SQL directly through supabase-js unless we use a RPC or have a specific setup.
    // However, if we don't have a SQL executor RPC, we might not be able to run it this way.
    // Let's check if there's an existing RPC for running SQL.

    console.log('Attempting to add ingress_id column via RPC or direct update if possible...');

    // Since we don't know if a SQL RPC exists, we'll try a common one or just suggest the user to run it.
    // Alternatively, we can try to use the 'pg' library if available, but it might not be.

    try {
        // Attempt a simple query to see if we can at least interact
        const { error } = await supabase.from('live_sessions').select('ingress_id').limit(1);
        if (!error) {
            console.log('Column ingress_id already exists!');
            return;
        }

        if (error.code === '42703') { // Undefined column
            console.log('Column is missing. Since I cannot run raw SQL via supabase-js without an RPC, please run the SQL file manually in the Supabase Dashboard SQL Editor.');
            console.log('SQL File: supabase/migrations/20260221_add_ingress_id_to_live_sessions.sql');
        } else {
            console.error('Error checking column:', error);
        }
    } catch (e) {
        console.error('Unexpected error:', e);
    }
}

applyMigration();
