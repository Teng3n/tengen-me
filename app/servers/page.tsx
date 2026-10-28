import { ServerStatusCard } from "../components/server-status-card";
import { ServerHistoryPanel } from "../components/server-history-panel";
import { SiteShell } from "../components/site-shell";
import { enshroudedServer } from "../lib/server-status";

export const metadata = { title: "Servers · tengen.me", description: "Current dedicated-server status and availability." };

export default function ServersPage() {
  return (
    <SiteShell>
      <main className="inner-page section-shell">
        <header className="page-heading"><p className="eyebrow"><span /> Servers</p><h1>The machines behind the worlds.</h1></header>
        <div className="server-directory">
          <ServerStatusCard server={enshroudedServer} />
        </div>
        <ServerHistoryPanel />
      </main>
    </SiteShell>
  );
}
