import Link from "next/link";
import type { ReactNode } from "react";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-frame">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="tengen.me home">
          <span className="wordmark-block">T</span>
          <span>tengen<em>.me</em></span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          <Link href="/servers">Servers</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/about">About</Link>
          <Link href="/status">Status</Link>
        </nav>
        <Link className="login-link" href="/admin"><span className="status-dot" /> Owner login</Link>
      </header>
      {children}
      <footer className="site-footer">
        <div className="footer-wordmark">tengen<span>.me</span></div>
        <p>Personal systems, game servers, and projects from the Pacific Northwest.</p>
        <div><Link href="/status">System status</Link><span>© 2026 Tengen</span></div>
      </footer>
    </div>
  );
}
