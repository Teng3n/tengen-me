import Link from "next/link";
import { requireChatGPTUser, chatGPTSignOutPath } from "../chatgpt-auth";
import { SiteShell } from "../components/site-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner · tengen.me", description: "Protected owner area for tengen.me." };

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  return <SiteShell><main className="inner-page section-shell"><header className="page-heading compact-heading"><p className="eyebrow"><span /> Owner</p><h1>Welcome back, {user.displayName}.</h1><p>This protected space is ready for private health checks and narrowly scoped server actions as integrations are added.</p></header><section className="admin-grid"><article><span className="feature-index">IDENTITY</span><h2>Signed in</h2><p>{user.email}</p><Link className="text-link" href={chatGPTSignOutPath("/")}>Sign out →</Link></article><article><span className="feature-index">STATUS BRIDGE</span><h2>Awaiting pairing</h2><p>The public Palworld feed has not received its first sanitized snapshot.</p></article><article><span className="feature-index">SAFE ACTIONS</span><h2>No controls enabled</h2><p>Future actions will be allowlisted, auditable, and separated from public status data.</p></article></section></main></SiteShell>;
}
