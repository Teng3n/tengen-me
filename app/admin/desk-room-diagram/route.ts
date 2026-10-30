import diagramHtml from "../../../desk_room_diagram.html?raw";
import { serveOwnerHtmlTool } from "../owner-html-tool";

export const dynamic = "force-dynamic";

export async function GET() {
  return serveOwnerHtmlTool(diagramHtml);
}
