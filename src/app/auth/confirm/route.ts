import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, isEligible } from "@/lib/auth/server";
import { confirmationSchema } from "@/lib/auth/validation";

export async function GET(request: NextRequest) {
  let path = "/sign-in?notice=confirmation_failed";
  let origin: string;
  try { origin = appOrigin(); } catch {
    return new NextResponse("Authentication is temporarily unavailable.", { status: 503 });
  }
  const result = confirmationSchema.safeParse({
    token_hash: request.nextUrl.searchParams.get("token_hash"),
    type: request.nextUrl.searchParams.get("type"),
  });
  if (result.success) {
    try {
      const client = await createClient();
      const { error } = await client.auth.verifyOtp(result.data);
      if (!error) path = await isEligible(client) ? "/profile" : "/account-status";
    } catch { /* Only the fixed friendly failure destination is returned. */ }
  }
  const response = NextResponse.redirect(new URL(path, origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
