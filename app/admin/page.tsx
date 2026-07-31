import { getOwnerNetworkUser } from "../owner-access";
import { SiteShell } from "../components/site-shell";
import { OwnerDashboard } from "./owner-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner console · tengen.me", description: "Protected operations console for tengen.me." };

export default async function AdminPage() {
  const user = await getOwnerNetworkUser();

  if (!user) {
    return (
      <SiteShell>
        <main className="inner-page section-shell">
          <header className="page-heading compact-heading">
            <p className="eyebrow"><span /> Owner</p>
            <h1>Owner access is limited to the home network.</h1>
            <p>
              This route contains no private data or controls unless the request
              comes from the approved home public address.
            </p>
          </header>
          <section className="admin-grid">
            <article><span className="feature-index">NETWORK GATE</span><h2>Home IP only</h2><p>The Worker compares each request with a private allowlist before loading the dashboard.</p></article>
            <article><span className="feature-index">PUBLIC SAFETY</span><h2>No data exposed</h2><p>Private health checks and controls remain unavailable outside the approved network.</p></article>
            <article><span className="feature-index">REMOTE PHONE</span><h2>Tailscale exit node</h2><p>Route the phone through the home Pi when access is needed away from home.</p></article>
          </section>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <main className="inner-page owner-page section-shell">
        <header className="page-heading compact-heading owner-heading">
          <p className="eyebrow"><span /> Owner</p>
          <h1>Home operations, at a glance.</h1>
          <p>Private health, Palworld controls, house plans, maintenance, and an audit trail in one protected workspace.</p>
        </header>
        <OwnerDashboard ownerLabel={user.label} />
      </main>
    </SiteShell>
  );
}
