import { getCloudflareAccessUser } from "../cloudflare-access";
import { SiteShell } from "../components/site-shell";
import { OwnerDashboard } from "./owner-dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner console · tengen.me", description: "Protected operations console for tengen.me." };

export default async function AdminPage() {
  const user = await getCloudflareAccessUser();

  if (!user) {
    return (
      <SiteShell>
        <main className="inner-page section-shell">
          <header className="page-heading compact-heading">
            <p className="eyebrow"><span /> Owner</p>
            <h1>Owner access is being connected.</h1>
            <p>
              This route contains no private data or controls until Cloudflare
              Access is enabled for <strong>/admin*</strong> on tengen.me.
            </p>
          </header>
          <section className="admin-grid">
            <article><span className="feature-index">AUTHENTICATION</span><h2>Cloudflare Access</h2><p>The production login will use your Cloudflare identity and account security.</p></article>
            <article><span className="feature-index">PUBLIC SAFETY</span><h2>No data exposed</h2><p>Private health checks remain unavailable unless Access has authenticated the request.</p></article>
            <article><span className="feature-index">NEXT STEP</span><h2>Policy required</h2><p>Create an Access application for tengen.me/admin* and allow only your account.</p></article>
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
        <OwnerDashboard email={user.email} />
      </main>
    </SiteShell>
  );
}
