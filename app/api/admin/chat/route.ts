import { NextResponse } from 'next/server';
import { getEnhancedAdminContext } from '@/lib/admin/ai-data-service';
import Replicate from "replicate";

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for AI inference

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 2. Fetch Real-time Admin Data (Enhanced)
    const { summary: stats, specificData, dataType, dataId } = await getEnhancedAdminContext(message);
    
    // 3. Construct Context Prompt
    let specificContext = "";
    if (specificData) {
      specificContext = `\n\n[SPECIFIC DATA DETECTED]\nThe user is asking about a specific ${dataType} (ID: ${dataId}).\nHere is the full database record:\n${JSON.stringify(specificData, null, 2)}\n\nINSTRUCTIONS FOR SPECIFIC DATA:\n- Analyze the data above deeply.\n- If it's an order, mention status, total, buyer name, and items.\n- If it's a user, mention their risk status, total orders, and join date.\n- If it's a withdrawal, check the bank details and status.\n- Do NOT show raw JSON keys, present it naturally.`;
    } else if (dataId) {
      specificContext = `\n\n[SEARCH RESULT]\nUser searched for ID ${dataId} but NO RECORD was found in orders, profiles, or withdrawals.\nPlease inform the user that the ID provided does not exist in the system.`;
    }

    const systemPrompt = `You are the "Admin Intelligence" for GoPocket.
You have access to REAL-TIME database access.

[SYSTEM SUMMARY STATUS]
- Orders Today: ${stats.orders_today}
- Sales Today: $${stats.sales_today.toFixed(2)}
- Pending Payments (Offline): ${stats.payments_pending}
- Open Disputes: ${stats.disputes_open}
- New Users Today: ${stats.users_new_today}
- Support Tickets Open: ${stats.support_pending}
- Withdrawals Pending: ${stats.withdrawals_pending}

[YOUR CAPABILITIES]
- You can analyze specific Orders, Users, Payments, and Withdrawals if the user provides an ID (UUID) or Email.
- You can detect fraud patterns (e.g. mismatched names, high velocity).
- You are helpful, professional, and concise.
- Answer in Spanish.

${specificContext}
`;

    // 4. Call AI
    const output = await replicate.run(
      "meta/meta-llama-3-70b-instruct",
      {
        input: {
          system_prompt: systemPrompt,
          prompt: message,
          max_tokens: 500,
          temperature: 0.3, // Lower temperature for more factual analysis
        }
      }
    );

    const reply = Array.isArray(output) ? output.join("").trim() : String(output);

    return NextResponse.json({ reply });
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    console.error(`[AdminChatError] [${timestamp}]`, {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      inputBody: req.body ? 'present' : 'missing' // Don't log full body if huge
    });
    
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        reply: 'Error consultando los datos del sistema.',
        debug_id: timestamp
      },
      { status: 500 }
    );
  }
}
