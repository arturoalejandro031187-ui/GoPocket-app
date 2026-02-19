import { NextResponse } from 'next/server';
import { getEnhancedAdminContext } from '@/lib/admin/ai-data-service';
import { PLATFORM_KNOWLEDGE_BASE } from '@/lib/admin/ai-knowledge-base';
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
    const { 
      summary: stats, 
      specificData, 
      dataType, 
      dataId,
      recentOrders,
      recentUsers,
      recentWithdrawals,
      recentDisputes,
      walletStats,
      searchResults
    } = await getEnhancedAdminContext(message);
    
    // 3. Construct Context Prompt
    let specificContext = "";
    if (specificData) {
      specificContext = `\n\n[SPECIFIC DATA DETECTED]\nThe user is asking about a specific ${dataType} (ID: ${dataId}).\nHere is the full database record:\n${JSON.stringify(specificData, null, 2)}\n\nINSTRUCTIONS FOR SPECIFIC DATA:\n- Analyze the data above deeply.\n- If it's an order, mention status, total, buyer name, and items.\n- If it's a user, mention their risk status, total orders, and join date.\n- If it's a withdrawal, check the bank details and status.\n- Do NOT show raw JSON keys, present it naturally.`;
    } else if (searchResults) {
      specificContext = `\n\n[SEARCH RESULTS]\nUser query: "${searchResults.query}"\nFound ${searchResults.users.length} users and ${searchResults.listings.length} listings.\n\nUSERS FOUND:\n${JSON.stringify(searchResults.users, null, 2)}\n\nLISTINGS FOUND:\n${JSON.stringify(searchResults.listings, null, 2)}\n\nINSTRUCTIONS:\n- Summarize what was found.\n- If there is a clear match, provide details.\n- If multiple matches, list them briefly.`;
    } else if (dataId) {
      specificContext = `\n\n[SEARCH RESULT]\nUser searched for ID ${dataId} but NO RECORD was found in orders, profiles, or withdrawals.\nPlease inform the user that the ID provided does not exist in the system.`;
    }

    // 4. Construct Lists Context (if intent detected)
    let listsContext = "";
    if (recentOrders && recentOrders.length > 0) {
      listsContext += `\n\n[RECENT ORDERS/OPERATIONS]\n${JSON.stringify(recentOrders, null, 2)}`;
    }
    if (recentUsers && recentUsers.length > 0) {
      listsContext += `\n\n[RECENT USERS]\n${JSON.stringify(recentUsers, null, 2)}`;
    }
    if (recentWithdrawals && recentWithdrawals.length > 0) {
      listsContext += `\n\n[PENDING WITHDRAWALS]\n${JSON.stringify(recentWithdrawals, null, 2)}`;
    }
    if (recentDisputes && recentDisputes.length > 0) {
      listsContext += `\n\n[OPEN DISPUTES]\n${JSON.stringify(recentDisputes, null, 2)}`;
    }
    if (walletStats) {
      listsContext += `\n\n[WALLET/ACCOUNTING STATS]\n${JSON.stringify(walletStats, null, 2)}`;
    }

    const systemPrompt = `You are the "Admin Intelligence" for GoPocket.
You have access to REAL-TIME database access (READ-ONLY).
You can see Operations, Sales, Users, Accounting, and Processes.

[SYSTEM SUMMARY STATUS]
- Orders Today: ${stats.orders_today}
- Sales Today: $${stats.sales_today.toFixed(2)}
- Pending Payments (Offline): ${stats.payments_pending}
- Open Disputes: ${stats.disputes_open}
- New Users Today: ${stats.users_new_today}
- Support Tickets Open: ${stats.support_pending}
- Withdrawals Pending: ${stats.withdrawals_pending}

[RECENT DATA LISTS]
${listsContext || "No specific lists requested (mention keywords like 'orders', 'users', 'accounting' to see lists)."}

[YOUR CAPABILITIES]
- You have READ-ONLY access to the platform's data.
- If the user asks for a list (e.g., "Show me recent orders"), use the [RECENT DATA LISTS] section.
- If the user provides an ID, use the [SPECIFIC DATA DETECTED] section.
- You can analyze fraud patterns, accounting discrepancies, and user status.
- Answer in Spanish.
- Be precise with IDs and amounts.

${PLATFORM_KNOWLEDGE_BASE}

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
