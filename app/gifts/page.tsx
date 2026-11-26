import type { Metadata } from "next";
import { SiteShell } from "../components/site-shell";
import { GiftList } from "./gift-list";

export const metadata: Metadata = {
  title: "Gift ideas · tengen.me",
  description: "A simple, current list of gift ideas for Tengen.",
};

export default function GiftsPage() {
  return (
    <SiteShell minimal>
      <main className="inner-page gift-page section-shell">
        <header className="page-heading gift-heading">
          <div>
            <p className="eyebrow"><span /> Gift ideas</p>
            <h1>A few gift ideas.</h1>
          </div>
        </header>
        <GiftList />
      </main>
    </SiteShell>
  );
}
