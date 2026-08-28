import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { getSupabaseServerAuthEnv } from "@/lib/env";

// Never let the session-refresh network call hang longer than this.
// Vercel kills middleware after ~25s with MIDDLEWARE_INVOCATION_TIMEOUT,
// which takes the whole site down with a 504.
const SUPABASE_AUTH_TIMEOUT_MS = 2500;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  let supabaseAuthEnv: ReturnType<typeof getSupabaseServerAuthEnv>;

  try {
    supabaseAuthEnv = getSupabaseServerAuthEnv();
  } catch {
    return supabaseResponse;
  }

  // Skip the network round-trip entirely when there is no session to refresh.
  // Actual authorization is enforced per-page by requireAdmin().
  const hasAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("auth-token"));

  if (!hasAuthCookie) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseAuthEnv.supabaseUrl, supabaseAuthEnv.supabaseAuthKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Supabase auth timed out")), SUPABASE_AUTH_TIMEOUT_MS);
    });

    await Promise.race([supabase.auth.getUser(), timeoutPromise]).finally(() => {
      clearTimeout(timeout);
    });
  } catch {
    // Fail open: a slow/unreachable Supabase must not take the site down.
    // If the session is actually invalid, requireAdmin() redirects to /login.
  }

  return supabaseResponse;
}
