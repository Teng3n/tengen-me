"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

export function SiteShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("tengen-theme");
    const initialTheme: Theme = savedTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = initialTheme;
    const frame = window.requestAnimationFrame(() => setTheme(initialTheme));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("tengen-theme", nextTheme);
    setTheme(nextTheme);
  }

  return (
    <div className="site-frame">
      <header className="site-header">
        <div className="wordmark">
          <button
            className="wordmark-block theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-pressed={theme === "dark"}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            T
          </button>
          <Link className="wordmark-home" href="/" aria-label="tengen.me home">
            tengen<em>.me</em>
          </Link>
        </div>
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
        <div><Link href="/status">System status</Link><span>© 2026 Tengen</span></div>
      </footer>
    </div>
  );
}
