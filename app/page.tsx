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
            <p className="eyebrow"><span /> Tengen.me · Servers · Projects</p>
            <h1>A home for the things I run, build, and keep online.</h1>
            <p className="lede">
              I&apos;m Tengen. Welcome to my corner of the internet—home to my game
              servers, projects, and whatever I decide to build next.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/servers">Explore servers <span>↗</span></Link>
              <Link className="button button-secondary" href="/about">About me <span>→</span></Link>
            </div>
          </div>

          <div className="hero-panel">
            <ServerStatusCard server={palworldServer} featured />
          </div>
        </section>

        <section className="section-shell split-section">
          <div>
            <p className="section-kicker">Explore</p>
            <h2>Servers, projects, and a little bit about me.</h2>
          </div>
          <p className="section-intro">
            Check in on the worlds we share, see what I&apos;ve been working on,
            or get to know the person behind the name.
          </p>
        </section>

        <section className="section-shell feature-grid">
          <Link className="feature-card feature-card-wide" href="/servers">
            <span className="feature-index">A / SERVERS</span>
            <div>
              <h3>Join the next adventure</h3>
              <p>See the current Palworld server status, player count, and who&apos;s already online.</p>
            </div>
            <span className="arrow">↗</span>
          </Link>
          <Link className="feature-card" href="/projects">
            <span className="feature-index">B / PROJECTS</span>
            <div><h3>Things I&apos;m building</h3><p>Tools, experiments, and projects worth sharing.</p></div>
            <span className="arrow">↗</span>
          </Link>
          <Link className="feature-card" href="/about">
            <span className="feature-index">C / ABOUT</span>
            <div><h3>Meet Tengen</h3><p>Community builder, systems tinkerer, and longtime raid leader.</p></div>
            <span className="arrow">↗</span>
          </Link>
        </section>

      </main>
    </SiteShell>
  );
}
