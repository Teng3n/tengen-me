import { SiteShell } from "../components/site-shell";
import { palworldServer } from "../lib/server-status";

export const metadata = { title: "Status · tengen.me", description: "Current availability of tengen.me and the Palworld server." };

export default function StatusPage() {
  return <SiteShell><main className="inner-page section-shell"><header className="page-heading compact-heading"><p className="eyebrow"><span /> Status</p><h1>Current signal.</h1><p>A quick look at what&apos;s online.</p></header><section className="status-board"><div className="overall-status"><div><span className="status-orb"/><div><p>Website</p><h2>Operational</h2></div></div><span>All pages available</span></div><div className="status-row"><div><p>Palworld server</p><span>{palworldServer.region}</span></div><strong className="pending-label">Checking status</strong></div></section></main></SiteShell>;
}
