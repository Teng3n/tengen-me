import elevationHtml from "../../../office_option_b_elevation.html?raw";
import { serveOwnerHtmlTool } from "../owner-html-tool";
import { renderMonitorOption1Elevation } from "./transform";

export const dynamic = "force-dynamic";

export async function GET() {
  return serveOwnerHtmlTool(renderMonitorOption1Elevation(elevationHtml));
}
