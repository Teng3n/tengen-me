import { SiteShell } from "../components/site-shell";

export const metadata = { title: "About · tengen.me", description: "About Tengen and the systems behind tengen.me." };

export default function AboutPage() {
  return <SiteShell><main className="inner-page section-shell"><header className="page-heading"><p className="eyebrow"><span /> About</p><h1>I like making complicated systems feel calm.</h1><p>Games, communities, servers, and software all get better when the useful information is clear and the fragile parts stay safely out of sight.</p></header><section className="about-grid"><div className="about-monogram">TEN<br/><span>GEN</span></div><article><p className="section-kicker">The short version</p><h2>Community builder. Systems tinkerer. Longtime raid leader.</h2><p>I&apos;m Tengen. I run game servers, build tools for the communities around them, and spend a probably unreasonable amount of time turning messy operational data into interfaces people can actually use.</p><p>This site is the public home for that work. It will grow gradually: server status first, then project notes, infrastructure write-ups, and a private owner dashboard.</p></article></section></main></SiteShell>;
}
