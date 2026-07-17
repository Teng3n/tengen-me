import { SiteShell } from "../components/site-shell";

export const metadata = { title: "About · tengen.me", description: "About Tengen, the communities he supports, and the things he builds." };

export default function AboutPage() {
  return <SiteShell><main className="inner-page section-shell"><header className="page-heading"><p className="eyebrow"><span /> About</p><h1>I like making complicated systems feel calm.</h1><p>Games, communities, servers, and software all get better when the useful information is clear and the experience feels effortless.</p></header><section className="about-grid"><div className="about-monogram">TEN<br/><span>GEN</span></div><article><p className="section-kicker">The short version</p><h2>Community builder. Systems tinkerer. Longtime raid leader.</h2><p>I&apos;m Tengen. I run game servers, build tools for the communities around them, and spend a probably unreasonable amount of time turning messy ideas into things people can actually use.</p><p>This site is where I share the worlds I host, the tools I build, and the projects that keep me curious.</p></article></section></main></SiteShell>;
}
