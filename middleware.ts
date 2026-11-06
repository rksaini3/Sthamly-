import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ये रास्ते सिर्फ लॉग-इन यूज़र के लिए हैं
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  // Session cookies को refresh करने के लिए response बनाना पड़ता है
  let response = NextResponse.next({ request });

  // env न हो तो middleware crash न करे। सिर्फ सुरक्षित पन्ने login पर जाएंगे।
  if (!url || !anonKey) {
    console.error("middleware: NEXT_PUBLIC_SUPABASE_URL या ANON_KEY सेट नहीं है");
    return redirectIfProtected(request, response, false);
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // getUser() server पर session की जांच करता है (getSession() cookie पर भरोसा करता है)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return redirectIfProtected(request, response, Boolean(user));
  } catch (error) {
    // Supabase तक न पहुंचे तो भी पेज खुले, बस सुरक्षित पन्ने पर login दिखे
    console.error("middleware: auth check failed", error);
    return redirectIfProtected(request, response, false);
  }
}

function redirectIfProtected(request: NextRequest, response: NextResponse, loggedIn: boolean) {
  if (isProtected(request.nextUrl.pathname) && !loggedIn) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = {
  // स्टैटिक फाइलें, PWA की फाइलें और Next.js के internal रास्ते छोड़कर बाकी पर चलेगा
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|icons/|fonts/|api/).*)",
  ],
};
