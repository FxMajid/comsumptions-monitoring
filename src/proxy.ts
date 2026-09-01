import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAllowedRolesForPath, isStaffRole } from "@/lib/auth/roles";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  hasSupabaseConfig,
} from "@/lib/supabase/env";
import type { StaffRole } from "@/types/staff";

type StaffCheck = {
  role: StaffRole | null;
  response: NextResponse;
  isAuthenticated: boolean;
};

function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/unauthorized";
}

/**
 * Refreshes the Supabase session cookie and reads the caller's role.
 *
 * Next's own guidance is that the proxy should not be the authorisation
 * solution, only an optimistic check. It is used here to keep an unauthorised
 * request from rendering a protected page at all; `requireStaffProfile` in the
 * layout and row level security in Postgres are what actually enforce access.
 */
async function resolveStaff(
  request: NextRequest,
  response: NextResponse,
): Promise<StaffCheck> {
  if (!hasSupabaseConfig() || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { role: null, response, isAuthenticated: false };
  }

  let nextResponse = response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        nextResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          nextResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { role: null, response: nextResponse, isAuthenticated: false };
  }

  const { data } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null; is_active: boolean | null }>();

  const role =
    data && isStaffRole(data.role) && data.is_active !== false ? data.role : null;

  return { role, response: nextResponse, isAuthenticated: true };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const allowedRoles = getAllowedRolesForPath(pathname);
  const response = NextResponse.next({ request });

  if (!allowedRoles && !isAuthPage(pathname)) {
    return response;
  }

  const staff = await resolveStaff(request, response);

  if (pathname === "/login" && staff.isAuthenticated && staff.role) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!allowedRoles) {
    return staff.response;
  }

  if (!staff.isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);

    return NextResponse.redirect(loginUrl);
  }

  if (!staff.role || !allowedRoles.includes(staff.role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return staff.response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/anggaran/:path*",
    "/perencanaan/:path*",
    "/vendor/:path*",
    "/master/:path*",
    "/gudang/:path*",
    "/pengambilan/:path*",
    "/rekonsiliasi/:path*",
    "/pengguna/:path*",
    "/login",
  ],
};
