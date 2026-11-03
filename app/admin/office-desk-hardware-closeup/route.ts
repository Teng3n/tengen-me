import hardwareCloseupHtml from "../../../office_desk_hardware_closeup.html?raw";
import { serveOwnerHtmlTool } from "../owner-html-tool";

export const dynamic = "force-dynamic";

export async function GET() {
  return serveOwnerHtmlTool(hardwareCloseupHtml);
}
