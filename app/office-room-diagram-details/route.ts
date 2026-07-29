import diagramHtml from "../../office_room_diagram.html?raw";

export const dynamic = "force-static";

export async function GET() {
  const detailsHtml = diagramHtml
    .replace(
      "<title>Office Room Lighting Study — Revision 08</title>",
      "<title>Office Room Detailed Lighting Analysis — Revision 08</title>",
    )
    .replace("<body>", '<body class="details-page">');

  return new Response(detailsHtml, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
