import seatedViewHtml from "../../../office_monitor_option_1_seated_view.html?raw";
import { serveOwnerHtmlTool } from "../owner-html-tool";

export const dynamic = "force-dynamic";

export async function GET() {
  return serveOwnerHtmlTool(seatedViewHtml);
}
