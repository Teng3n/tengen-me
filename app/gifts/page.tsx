import type { Metadata } from "next";
import { SiteShell } from "../components/site-shell";
import { GiftList } from "./gift-list";

export const metadata: Metadata = {
  title: "Gift ideas · tengen.me",
  description: "A simple, current list of gift ideas for Tengen, from any retailer.",
};

export default function GiftsPage() {
  return (
    <SiteShell>
      <main className="inner-page gift-page section-shell">
        <header className="page-heading gift-heading">
          <div>
            <p className="eyebrow"><span /> Gift ideas</p>
            <h1>A few things I&apos;d genuinely love.</h1>
          </div>
          <p>
            Pick from any retailer below. If you decide on something, reserve it
            so other shoppers can avoid buying the same gift.
          </p>
        </header>
        <GiftList />
      </main>
    </SiteShell>
  );
}
