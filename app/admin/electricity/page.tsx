import { SiteShell } from "../../components/site-shell";
import { getOwnerNetworkUser } from "../../owner-access";
import { OwnerElectricityOutlook } from "../owner-dashboard";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Electrical bill outlook · tengen.me",
  description: "Protected whole-home electricity and AC cost outlook.",
};

export default async function ElectricityOutlookPage() {
  const user = await getOwnerNetworkUser();

  if (!user) {
    return (
      <SiteShell>
        <main className="inner-page section-shell">
          <header className="page-heading compact-heading">
            <p className="eyebrow"><span /> Owner</p>
            <h1>Owner access is limited to the home network.</h1>
            <p>The electrical outlook is available only through the approved home connection.</p>
          </header>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <main className="inner-page owner-page section-shell">
        <header className="page-heading compact-heading owner-heading">
          <p className="eyebrow"><span /> Owner · Electricity</p>
          <h1>Electrical bill outlook.</h1>
          <p>Whole-home usage, billing-cycle projection, rate timing, and a measured AC contribution estimate.</p>
        </header>
        <OwnerElectricityOutlook ownerLabel={user.label} />
      </main>
    </SiteShell>
  );
}
