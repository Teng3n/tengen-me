import type { Metadata } from "next";
import { SiteShell } from "../../components/site-shell";
import { getOwnerNetworkUser } from "../../owner-access";
import { GiftAdmin } from "./gift-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gift editor · tengen.me",
  description: "Private gift registry editor.",
  robots: { index: false, follow: false },
};

export default async function GiftAdminPage() {
  const user = await getOwnerNetworkUser();

  if (!user) {
    return (
      <SiteShell>
        <main className="inner-page section-shell">
          <header className="page-heading compact-heading">
            <p className="eyebrow"><span /> Owner</p>
            <h1>Gift editing is limited to the home network.</h1>
            <p>No gift details or editing controls are loaded outside the approved owner network.</p>
          </header>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <main className="inner-page gift-admin-page section-shell">
        <header className="page-heading gift-admin-heading">
          <div>
            <p className="eyebrow"><span /> Owner · Gifts</p>
            <h1>Keep the list current.</h1>
          </div>
          <p>Add an idea from any retailer, tune its priority and price, or hide it without deleting it.</p>
        </header>
        <GiftAdmin />
      </main>
    </SiteShell>
  );
}
