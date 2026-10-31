import elevationHtml from "../../../office_option_b_elevation.html?raw";
import { serveOwnerHtmlTool } from "../owner-html-tool";

export const dynamic = "force-dynamic";

export async function GET() {
  return serveOwnerHtmlTool(elevationHtml);
}
