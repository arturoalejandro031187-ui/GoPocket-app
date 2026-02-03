import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';

  // We simply redirect to the destination.
  // The client-side Supabase client handles the session establishment
  // when it detects the code/hash in the URL (if configured with detectSessionInUrl: true).
  
  const redirectUrl = new URL(next, requestUrl.origin);
  
  // Pass through auth parameters so client can handle them
  if (code) {
    redirectUrl.searchParams.set('code', code);
  }
  
  const error = requestUrl.searchParams.get('error');
  const error_description = requestUrl.searchParams.get('error_description');
  if (error) redirectUrl.searchParams.set('error', error);
  if (error_description) redirectUrl.searchParams.set('error_description', error_description);

  return NextResponse.redirect(redirectUrl);
}
