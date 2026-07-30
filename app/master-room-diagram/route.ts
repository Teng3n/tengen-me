import diagramHtml from "../../master_room_diagram.html?raw";

export const dynamic = "force-static";

export async function GET() {
  return new Response(diagramHtml, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
