import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, hasApprovedIdentity } from "@/lib/auth/server";
import { recoverySchema, callbackSchema } from "@/lib/auth/validation";

export async function GET(request: NextRequest) {
  let path = "/password-reset?notice=reset_failed";
  let origin: string;
  try { origin = appOrigin(); } catch {
    return new NextResponse("Authentication is temporarily unavailable.", {
      status: 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  const params = request.nextUrl.searchParams;
  if (!params.has("error")) {
    try {
      const client = await createClient();
      let verified = false;
      if (params.has("token_hash")) {
        const parsed = recoverySchema.safeParse({ token_hash: params.get("token_hash"), type: params.get("type") });
        if (parsed.success) verified = !(await client.auth.verifyOtp(parsed.data)).error;
      } else {
        const parsed = callbackSchema.safeParse({ code: params.get("code") });
        if (parsed.success) {
          const { error } = await client.auth.exchangeCodeForSession(parsed.data.code);
          // Supabase verifies the code against the browser's PKCE verifier.
          // A session is still subject to live identity validation below.
          verified = !error;
        }
      }
      if (verified) {
        if (await hasApprovedIdentity(client)) path = "/update-password";
        else await client.auth.signOut({ scope: "local" });
      }
    } catch { /* Fixed failure destination; never reflect tokens or Auth errors. */ }
  }
  const response = NextResponse.redirect(new URL(path, origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
