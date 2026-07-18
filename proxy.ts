import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

/** Clerk authentication middleware; protects all routes, returning 401 JSON for APIs instead of redirects. */
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    if (isApiRoute(req)) {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    } else {
      await auth.protect();
    }
  }
});

/** Next.js middleware matcher — runs on app routes, API routes, and Clerk endpoints. */
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API routes
    '/__clerk/(.*)',
  ],
};