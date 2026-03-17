import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Verify the caller is authenticated by checking their JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  // Create an anon client to verify the caller's identity
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

  // Check that the caller is an admin
  const { data: callerStaff } = await anonClient
    .from("staff")
    .select("role")
    .eq("auth_user_id", caller.id)
    .single();
  if (!callerStaff || callerStaff.role !== "admin") {
    return json({ error: "Only admins can invite users" }, 403);
  }

  // Parse request body
  let body: { email: string; fullName: string; role: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { email, fullName, role, password } = body;
  if (!email || !fullName) {
    return json({ error: "email and fullName are required" }, 400);
  }
  if (role && !["admin", "staff"].includes(role)) {
    return json({ error: "role must be 'admin' or 'staff'" }, 400);
  }

  // Use service role client for admin operations
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create the auth user
  const tempPassword = password || crypto.randomUUID().slice(0, 12) + "A1!";
  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

  if (authError) {
    return json({ error: authError.message }, 400);
  }

  // Create the linked staff record
  const { data: staffRow, error: staffError } = await adminClient
    .from("staff")
    .insert({
      auth_user_id: authData.user.id,
      full_name: fullName,
      email,
      role: role || "staff",
      active: true,
    })
    .select()
    .single();

  if (staffError) {
    // Clean up the auth user if staff insert fails
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return json({ error: `Staff record failed: ${staffError.message}` }, 500);
  }

  return json({
    success: true,
    user: {
      id: staffRow.id,
      authUserId: authData.user.id,
      email,
      fullName,
      role: role || "staff",
      temporaryPassword: tempPassword,
    },
  });
});
