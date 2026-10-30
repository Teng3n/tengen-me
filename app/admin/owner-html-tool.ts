import { getOwnerNetworkUser } from "../owner-access";

const privateToolHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Content-Type": "text/html; charset=utf-8",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export async function serveOwnerHtmlTool(html: string) {
  const owner = await getOwnerNetworkUser();
  if (!owner) {
    return new Response("Not found", {
      status: 404,
      headers: privateToolHeaders,
    });
  }

  return new Response(html, { headers: privateToolHeaders });
}
