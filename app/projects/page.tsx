import { SiteShell } from "../components/site-shell";
import { ProjectServerStatus } from "../components/project-server-status";
import { enshroudedServer } from "../lib/server-status";

export const metadata = { title: "Projects · tengen.me", description: "Projects, tools, and infrastructure experiments by Tengen." };

const projects = [
  {
    number: "01",
    label: "Guild operations",
    title: "Guild Tools",
    currentServer: null,
    text: "Guild sites and planning tools for rosters, progression, loot history, and officer workflows.",
    status: "Active",
    serverStatus: null,
    links: [
      { label: "Vitality MoP", href: "https://vitality-mop.pages.dev" },
      { label: "Might Forever", href: "https://might-forever.pages.dev" },
    ],
  },
  { number: "02", label: "Dedicated server", title: "Current server", currentServer: "Enshrouded", text: "A dedicated home for friends to explore, build, and keep the adventure going together.", status: "Active", serverStatus: enshroudedServer, links: [] },
  { number: "03", label: "Personal web", title: "tengen.me", currentServer: null, text: "My home on the web for game servers, current projects, notes, and whatever comes next.", status: "Active", serverStatus: null, links: [] },
];

export default function ProjectsPage() {
  return <SiteShell><main className="inner-page section-shell"><header className="page-heading"><p className="eyebrow"><span /> Projects</p><h1>Useful systems, built a piece at a time.</h1><p>A running catalog of the tools and infrastructure I maintain for communities, games, and myself.</p></header><section className="project-list">{projects.map((project) => <article key={project.number}><span className="project-number">{project.number}</span><div><p className="section-kicker">{project.label}</p><h2>{project.title}</h2>{project.currentServer ? <strong className="project-current-server">{project.currentServer}</strong> : null}<p>{project.text}</p>{project.links.length > 0 ? <nav className="project-links" aria-label={`${project.title} sites`}>{project.links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}<span aria-hidden="true">↗</span></a>)}</nav> : null}</div>{project.serverStatus ? <ProjectServerStatus server={project.serverStatus} /> : <span className={`project-status${project.status === "Active" ? " project-status-active" : ""}`}><i />{project.status}</span>}</article>)}</section></main></SiteShell>;
}
