import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, safeNextPath } from "@/lib/auth/navigation";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Keep the server client scoped to this request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // Preserve SSR's cache protection when it refreshes a session.
          Object.entries(headers).forEach(([name, value]) =>
            supabaseResponse.headers.set(name, value),
          );
        },
      },
    },
  );

  // Refresh and verify the token before server rendering reads the cookies.
  // The server layout/DAL checks too; Proxy is not database authorization.
  let destination: string | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (isProtectedPath(request.nextUrl.pathname)) {
      if (error || !data?.claims.sub) {
        destination = `/sign-in?next=${encodeURIComponent(safeNextPath(request.nextUrl.pathname + request.nextUrl.search))}`;
      } else {
        const eligibility = await supabase.rpc("jomlepakz_current_user_is_eligible");
        if (eligibility.error || eligibility.data !== true) destination = "/account-status";
      }
    }
  } catch {
    if (isProtectedPath(request.nextUrl.pathname)) destination = "/sign-in?notice=unavailable";
  }

  if (destination) {
    const response = NextResponse.redirect(new URL(destination, request.url), 303);
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = supabaseResponse.headers.get(header);
      if (value) response.headers.set(header, value);
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (isProtectedPath(request.nextUrl.pathname) || request.nextUrl.pathname.startsWith("/auth/") ||
    request.nextUrl.pathname === "/account-status" || request.nextUrl.pathname === "/update-password") {
    supabaseResponse.headers.set("Cache-Control", "private, no-store");
  }

  // Return the response containing the refreshed cookies and cache headers.
  return supabaseResponse;
}
