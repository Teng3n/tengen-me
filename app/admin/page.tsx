import Link from "next/link";
import { getCloudflareAccessUser } from "../cloudflare-access";
import { SiteShell } from "../components/site-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner · tengen.me", description: "Protected owner area for tengen.me." };

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
      <main className="inner-page section-shell">
        <header className="page-heading compact-heading">
          <p className="eyebrow"><span /> Owner</p>
          <h1>Welcome back.</h1>
          <p>This protected space is ready for private health checks and narrowly scoped server actions as integrations are added.</p>
        </header>
        <section className="admin-grid">
          <article><span className="feature-index">IDENTITY</span><h2>Signed in</h2><p>{user.email}</p><Link className="text-link" href="/cdn-cgi/access/logout">Sign out →</Link></article>
          <article><span className="feature-index">STATUS BRIDGE</span><h2>Awaiting pairing</h2><p>The public Palworld feed has not received its first sanitized snapshot.</p></article>
          <article><span className="feature-index">SAFE ACTIONS</span><h2>No controls enabled</h2><p>Future actions will be allowlisted, auditable, and separated from public status data.</p></article>
        </section>
      </main>
    </SiteShell>
  );
}
