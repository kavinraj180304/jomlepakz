import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, isEligible, hasApprovedIdentity } from "@/lib/auth/server";
import { callbackSchema } from "@/lib/auth/validation";

// Supports the default Supabase PKCE confirmation link. The configured
// token-hash template (/auth/confirm) also works across browsers/devices.
export async function GET(request: NextRequest) {
  let path = "/sign-in?notice=auth_failed";
  let origin: string;
  try { origin = appOrigin(); } catch {
    return new NextResponse("Authentication is temporarily unavailable.", { status: 503 });
  }
  const result = callbackSchema.safeParse({ code: request.nextUrl.searchParams.get("code") });
  if (result.success && !request.nextUrl.searchParams.has("error")) {
    try {
      const client = await createClient();
      const { error } = await client.auth.exchangeCodeForSession(result.data.code);
      if (!error) {
        if (await hasApprovedIdentity(client)) {
          path = await isEligible(client) ? "/profile" : "/account-status";
        } else {
          await client.auth.signOut({ scope: "local" });
          path = "/sign-in?notice=account_denied";
        }
      }
    } catch { /* Do not reflect provider errors, codes or tokens. */ }
  }
  const response = NextResponse.redirect(new URL(path, origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
