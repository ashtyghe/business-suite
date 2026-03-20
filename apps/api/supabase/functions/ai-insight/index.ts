import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://fieldops.netlify.app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are an expert business analyst for a construction and trades company called FieldOps. You have deep knowledge of the construction industry, cash flow management, job costing, project management, and trade business operations in Australia.

You are given live KPI data from the business. Use this data to provide specific, actionable advice. Always reference actual numbers from the data. Be direct and practical — this is a busy tradie, not a corporate executive.

When answering follow-up questions:
- Dive deeper into the specific area asked about
- Provide concrete recommendations with numbers
- Suggest specific actions they can take today
- If asked about trends or comparisons, work with what the data shows
- Keep responses concise but thorough (2-4 paragraphs max)
- Use bullet points where helpful but don't overdo it
- Do not use markdown formatting — use plain text with bullet points (•)`;

const INITIAL_PROMPT = `Analyse these KPIs and give 3-4 short, actionable bullet points about what needs attention and how we can improve. Be direct, specific, and use the actual numbers. Keep it under 200 words total. Use bullet points (•) not markdown.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Verify the caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const anonClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const {
    data: { user: caller },
  } = await anonClient.auth.getUser();
  if (!caller) {
    return json({ error: "Invalid or expired token" }, 401);
  }

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

  try {
    const body = await req.json();
    const { kpis, messages, question } = body;

    if (!kpis) {
      return json({ error: "Missing kpis data" }, 400);
    }

    const kpiContext = `\n\nCurrent KPIs:\n${JSON.stringify(kpis, null, 2)}`;

    // Build the messages array for the API call
    const apiMessages: { role: string; content: string }[] = [];

    if (messages && messages.length > 0 && question) {
      // Chat mode: include conversation history + new question
      // First message is always the initial KPI analysis request
      apiMessages.push({
        role: "user",
        content: INITIAL_PROMPT + kpiContext,
      });

      // Add conversation history (assistant responses and user follow-ups)
      for (const msg of messages) {
        apiMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }

      // Add the new question
      apiMessages.push({
        role: "user",
        content: question,
      });
    } else {
      // Initial insight mode (no conversation history)
      apiMessages.push({
        role: "user",
        content: INITIAL_PROMPT + kpiContext,
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: question ? 800 : 400,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return json({ error: `Anthropic API error: ${response.status}`, details: err }, 502);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "No response generated.";

    // Return as 'insight' for backwards compat, plus 'reply' for chat mode
    return json({ insight: text, reply: text });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
