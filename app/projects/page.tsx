import { SiteShell } from "../components/site-shell";

export const metadata = { title: "Projects · tengen.me", description: "Projects, tools, and infrastructure experiments by Tengen." };

const projects = [
  { number: "01", label: "Guild operations", title: "Vitality Guild Tools", text: "A static-first operations site for raid planning, roster data, loot history, progression, and officer workflows.", status: "Active" },
  { number: "02", label: "Home infrastructure", title: "Game Server Status Bridge", text: "A safe way to publish live availability and player presence from servers inside a private home network.", status: "Building" },
  { number: "03", label: "Personal web", title: "tengen.me", text: "The connective tissue for projects, hosted services, notes, and owner-only operational views.", status: "Building" },
];

export default function ProjectsPage() {
  return <SiteShell><main className="inner-page section-shell"><header className="page-heading"><p className="eyebrow"><span /> Projects</p><h1>Useful systems, built a piece at a time.</h1><p>A running catalog of the tools and infrastructure I maintain for communities, games, and myself.</p></header><section className="project-list">{projects.map((project) => <article key={project.number}><span className="project-number">{project.number}</span><div><p className="section-kicker">{project.label}</p><h2>{project.title}</h2><p>{project.text}</p></div><span className="project-status"><i />{project.status}</span></article>)}</section></main></SiteShell>;
}
