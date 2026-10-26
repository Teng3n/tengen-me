import { SiteShell } from "../../components/site-shell";
import { getOwnerNetworkUser } from "../../owner-access";
import { NutritionDashboard } from "./nutrition-dashboard";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Nutrition dashboard · tengen.me",
  description: "Private nutrition, calorie, and sugar tracking dashboard.",
};

export default async function NutritionPage() {
  const user = await getOwnerNetworkUser();

  if (!user) {
    return (
      <SiteShell>
        <main className="inner-page section-shell">
          <header className="page-heading compact-heading">
            <p className="eyebrow"><span /> Owner</p>
            <h1>Nutrition data stays private.</h1>
            <p>This dashboard is available only through the approved owner network.</p>
          </header>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <main className="inner-page owner-page nutrition-page section-shell">
        <header className="page-heading compact-heading owner-heading nutrition-heading">
          <p className="eyebrow"><span /> Owner · Health</p>
          <h1>Nutrition, without the guesswork.</h1>
          <p>Daily energy, nutrient detail, and the sugar trend since switching to black coffee.</p>
        </header>
        <NutritionDashboard ownerLabel={user.label} />
      </main>
    </SiteShell>
  );
}
