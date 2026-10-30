import scaleToolHtml from "../../../office_desk_scale_tool.html?raw";
import { serveOwnerHtmlTool } from "../owner-html-tool";

export const dynamic = "force-dynamic";

export async function GET() {
  return serveOwnerHtmlTool(scaleToolHtml);
}
