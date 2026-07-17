import Link from "next/link";
import { ServerStatusCard } from "./components/server-status-card";
import { SiteShell } from "./components/site-shell";
import { palworldServer } from "./lib/server-status";

export default function Home() {
  return (
    <SiteShell>
      <main>
        <section className="hero section-shell">
          <div className="hero-copy">
            <p className="eyebrow"><span /> Personal systems · game servers · build notes</p>
            <h1>A home for the things I run, build, and keep online.</h1>
            <p className="lede">
              I&apos;m Tengen. This is the public front door to my game servers,
              infrastructure projects, and whatever I decide to build next.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/servers">Explore servers <span>↗</span></Link>
              <Link className="button button-secondary" href="/admin">Owner sign in <span>→</span></Link>
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-label"><span>01</span> Live server preview</div>
            <ServerStatusCard server={palworldServer} featured />
          </div>
        </section>

        <section className="signal-strip" aria-label="Site overview">
          <div><span className="signal-number">01</span><p><strong>Public status</strong>Sanitized server health</p></div>
          <div><span className="signal-number">02</span><p><strong>Owner access</strong>Protected admin surface</p></div>
          <div><span className="signal-number">03</span><p><strong>Built to grow</strong>One contract, many servers</p></div>
        </section>

        <section className="section-shell split-section">
          <div>
            <p className="section-kicker">What lives here</p>
            <h2>One place for the useful parts of my corner of the internet.</h2>
          </div>
          <p className="section-intro">
            The first version stays intentionally focused. Public visitors get
            clear, resilient status information. Private operations stay behind
            sign-in and can grow without leaking management details.
          </p>
        </section>

        <section className="section-shell feature-grid">
          <Link className="feature-card feature-card-wide" href="/servers">
            <span className="feature-index">A / SERVERS</span>
            <div>
              <h3>Game server directory</h3>
              <p>Availability, player count, connection details, and the people currently online.</p>
            </div>
            <span className="arrow">↗</span>
          </Link>
          <Link className="feature-card" href="/projects">
            <span className="feature-index">B / PROJECTS</span>
            <div><h3>Things I&apos;m building</h3><p>Guild tools, homelab automation, and experiments worth sharing.</p></div>
            <span className="arrow">↗</span>
          </Link>
          <Link className="feature-card" href="/status">
            <span className="feature-index">C / STATUS</span>
            <div><h3>A graceful status layer</h3><p>The site stays useful even when a machine or data feed is unavailable.</p></div>
            <span className="arrow">↗</span>
          </Link>
        </section>

      </main>
    </SiteShell>
  );
}
