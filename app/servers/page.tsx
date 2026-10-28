import { ServerStatusCard } from "../components/server-status-card";
import { ServerHistoryPanel } from "../components/server-history-panel";
import { SiteShell } from "../components/site-shell";
import { enshroudedServer } from "../lib/server-status";
import { SERVER_SCHEDULE } from "../../shared/server-schedule";

export const metadata = { title: "Servers · tengen.me", description: "Current dedicated-server status and availability." };

export default function ServersPage() {
  return (
    <SiteShell>
      <main className="inner-page section-shell">
        <header className="page-heading"><p className="eyebrow"><span /> Servers</p><h1>The machines behind the worlds.</h1></header>
        <div className="server-directory">
          <ServerStatusCard server={enshroudedServer} />
        </div>
        <section className="server-schedule-panel" aria-labelledby="server-schedule-heading">
          <header>
            <div><p className="section-kicker">Expected availability</p><h2 id="server-schedule-heading">Server schedule</h2></div>
            <span>{SERVER_SCHEDULE.timeZoneLabel}</span>
          </header>
          <dl>
            <div><dt>Daily startup</dt><dd>{SERVER_SCHEDULE.dailyStartLabel}</dd></div>
            <div><dt>Sunday–Thursday nights</dt><dd>{SERVER_SCHEDULE.weekdayShutdownLabel}</dd></div>
            <div><dt>Friday–Saturday nights</dt><dd>{SERVER_SCHEDULE.weekendShutdownLabel}</dd></div>
          </dl>
          <p>Planned overnight shutdowns are recorded but excluded from the scheduled-uptime calculation below.</p>
        </section>
        <ServerHistoryPanel />
      </main>
    </SiteShell>
  );
}
