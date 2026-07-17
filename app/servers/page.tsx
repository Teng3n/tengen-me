import { ServerStatusCard } from "../components/server-status-card";
import { SiteShell } from "../components/site-shell";
import { palworldServer } from "../lib/server-status";

export const metadata = { title: "Servers · tengen.me", description: "Live Palworld server status and player information." };

export default function ServersPage() {
  return (
    <SiteShell>
      <main className="inner-page section-shell">
        <header className="page-heading"><p className="eyebrow"><span /> Servers</p><h1>The machines behind the worlds.</h1></header>
        <div className="server-directory">
          <ServerStatusCard server={palworldServer} />
        </div>
      </main>
    </SiteShell>
  );
}
