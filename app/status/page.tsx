import { SiteShell } from "../components/site-shell";
import { palworldServer } from "../lib/server-status";

export const metadata = { title: "Status · tengen.me", description: "Current status of tengen.me and public game-server feeds." };

export default function StatusPage() {
  return <SiteShell><main className="inner-page section-shell"><header className="page-heading compact-heading"><p className="eyebrow"><span /> Status</p><h1>Current signal.</h1><p>Public summaries degrade gracefully when a server or integration is unavailable.</p></header><section className="status-board"><div className="overall-status"><div><span className="status-orb"/><div><p>Website</p><h2>Operational</h2></div></div><span>All public pages available</span></div><div className="status-row"><div><p>Palworld · {palworldServer.name}</p><span>Local status bridge</span></div><strong className="pending-label">Not connected</strong></div><div className="status-row"><div><p>Public status API</p><span>/api/server-status</span></div><strong>Operational</strong></div></section><p className="status-footnote">No incidents to report. Live Palworld telemetry will begin after the local bridge is paired.</p></main></SiteShell>;
}
