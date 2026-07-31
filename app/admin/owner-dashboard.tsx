"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Service = { state: "operational" | "stale" | "pending"; detail: string };
type ChecklistItem = { id: string; title: string; detail: string; completed: boolean; updated_at: string };
type HistoryItem = {
  id: number;
  status: "online" | "offline";
  current_players: number;
  maximum_players: number;
  observed_at: string;
  received_at: string;
};
type OwnerAction = {
  id: string;
  action: "refresh-status" | "save-world";
  status: "queued" | "running" | "completed" | "failed" | "expired";
  requested_at: string;
  completed_at: string | null;
  result: string | null;
};
type AuditItem = {
  id: number;
  actor: string;
  event_type: string;
  target: string;
  outcome: string;
  detail: string;
  created_at: string;
};
type ToolLink = { href: string; label: string; detail: string };

type DashboardData = {
  generatedAt: string;
  owner: { label: string };
  services: { access: Service; website: Service; database: Service; bridge: Service };
  server: null | {
    status: "online" | "offline";
    currentPlayers: number;
    maximumPlayers: number;
    playerNames: string[];
    observedAt: string;
    receivedAt: string;
    bridgeAgeSeconds: number;
  };
  history: HistoryItem[];
  checklist: ChecklistItem[];
  actions: OwnerAction[];
  audit: AuditItem[];
  tools: ToolLink[];
};

function relativeTime(value: string | null) {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ServiceCard({ label, service }: { label: string; service: Service }) {
  return (
    <article className="owner-service-card">
      <div className="owner-service-topline">
        <span className={`owner-state-dot owner-state-${service.state}`} />
        <span>{label}</span>
      </div>
      <h2>{service.state === "operational" ? "Operational" : service.state === "stale" ? "Needs attention" : "Pending"}</h2>
      <p>{service.detail}</p>
    </article>
  );
}

export function OwnerDashboard({ ownerLabel }: { ownerLabel: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError("");
    try {
      const response = await fetch("/admin/api/dashboard", { cache: "no-store" });
      const payload = await response.json() as DashboardData | { error?: string };
      if (!response.ok || !("services" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Dashboard request failed");
      }
      setData(payload);
      setError("");
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "Dashboard request failed");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const pendingActions = useMemo(
    () => new Set(data?.actions.filter((action) => action.status === "queued" || action.status === "running").map((action) => action.action) ?? []),
    [data?.actions],
  );

  async function updateChecklist(item: ChecklistItem, completed: boolean) {
    setBusy(`checklist:${item.id}`);
    setError("");
    try {
      const response = await fetch(`/admin/api/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Checklist update failed");
      }
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checklist update failed");
    } finally {
      setBusy("");
    }
  }

  async function queueAction(action: "refresh-status" | "save-world") {
    if (action === "save-world" && !window.confirm("Ask the Palworld host to save the current world now?")) return;
    setBusy(`action:${action}`);
    setError("");
    try {
      const response = await fetch("/admin/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Action could not be queued");
      }
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action could not be queued");
    } finally {
      setBusy("");
    }
  }

  if (!data) {
    return (
      <section className="owner-loading" aria-live="polite">
        <span className="owner-loading-mark" />
        <div><h2>{error ? "Dashboard unavailable" : "Loading private systems"}</h2><p>{error || "Checking health, history, and owner controls."}</p></div>
        {error ? <button type="button" onClick={() => void load()}>Try again</button> : null}
      </section>
    );
  }

  const completedCount = data.checklist.filter((item) => item.completed).length;

  return (
    <div className="owner-dashboard">
      <div className="owner-session-bar">
        <div><span className="owner-state-dot owner-state-operational" /><strong>Protected owner session</strong><span>{ownerLabel} verified</span></div>
      </div>

      {error ? <div className="owner-alert" role="alert">{error}</div> : null}

      <section className="owner-service-grid" aria-label="Service health">
        <ServiceCard label="Home IP gate" service={data.services.access} />
        <ServiceCard label="Website and API" service={data.services.website} />
        <ServiceCard label="Owner database" service={data.services.database} />
        <ServiceCard label="Palworld bridge" service={data.services.bridge} />
      </section>

      <section className="owner-panel owner-server-panel">
        <div className="owner-panel-heading">
          <div><p className="section-kicker">Palworld host</p><h2>Server operations</h2></div>
          <span className={`owner-server-state owner-server-${data.server?.status ?? "pending"}`}>
            <i /> {data.server?.status ?? "Pending"}
          </span>
        </div>
        <div className="owner-server-layout">
          <dl className="owner-server-metrics">
            <div><dt>Players</dt><dd>{data.server ? `${data.server.currentPlayers} / ${data.server.maximumPlayers}` : "—"}</dd></div>
            <div><dt>Bridge report</dt><dd>{relativeTime(data.server?.receivedAt ?? null)}</dd></div>
            <div><dt>World status</dt><dd>{data.server?.status ?? "Awaiting host"}</dd></div>
          </dl>
          <div className="owner-actions">
            <button
              type="button"
              onClick={() => void queueAction("refresh-status")}
              disabled={busy !== "" || pendingActions.has("refresh-status")}
            >
              <span>Refresh status</span><small>{pendingActions.has("refresh-status") ? "Waiting for host" : "Safe · no server change"}</small>
            </button>
            <button
              type="button"
              onClick={() => void queueAction("save-world")}
              disabled={busy !== "" || pendingActions.has("save-world")}
            >
              <span>Save world</span><small>{pendingActions.has("save-world") ? "Waiting for host" : "Official Palworld save API"}</small>
            </button>
          </div>
        </div>
        <div className="owner-history">
          <div><span>Recent status history</span><span>{data.history.length ? `${relativeTime(data.history[0].received_at)} – ${relativeTime(data.history[data.history.length - 1].received_at)}` : "Collecting data"}</span></div>
          <div className="owner-history-strip" aria-label="Recent Palworld status samples">
            {data.history.length ? data.history.map((sample) => (
              <span
                key={sample.id}
                className={`owner-history-${sample.status}`}
                title={`${sample.status} · ${sample.current_players}/${sample.maximum_players} players · ${new Date(sample.received_at).toLocaleString()}`}
              />
            )) : <p>History begins after the updated bridge sends its first report.</p>}
          </div>
        </div>
      </section>

      <div className="owner-two-column">
        <section className="owner-panel">
          <div className="owner-panel-heading owner-panel-heading-small">
            <div><p className="section-kicker">House tools</p><h2>Plans and utilities</h2></div>
          </div>
          <div className="owner-tool-list">
            {data.tools.map((tool) => (
              <a key={tool.href} href={tool.href} target="_blank" rel="noreferrer">
                <span><strong>{tool.label}</strong><small>{tool.detail}</small></span><b>↗</b>
              </a>
            ))}
          </div>
        </section>

        <section className="owner-panel">
          <div className="owner-panel-heading owner-panel-heading-small">
            <div><p className="section-kicker">Maintenance</p><h2>{completedCount} of {data.checklist.length} complete</h2></div>
          </div>
          <div className="owner-checklist">
            {data.checklist.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={busy !== ""}
                  onChange={(event) => void updateChecklist(item, event.target.checked)}
                />
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
              </label>
            ))}
          </div>
        </section>
      </div>

      <section className="owner-panel">
        <div className="owner-panel-heading owner-panel-heading-small">
          <div><p className="section-kicker">Audit trail</p><h2>Recent owner activity</h2></div>
          <span className="owner-updated">Updated {relativeTime(data.generatedAt)}</span>
        </div>
        <div className="owner-audit-list">
          {data.audit.length ? data.audit.map((event) => (
            <article key={event.id}>
              <span className={`owner-audit-outcome owner-audit-${event.outcome}`}>{event.outcome}</span>
              <div><strong>{event.event_type.replaceAll(".", " ")}</strong><p>{event.detail}</p></div>
              <time dateTime={event.created_at}>{relativeTime(event.created_at)}</time>
            </article>
          )) : <p className="owner-empty-copy">Owner changes and host actions will appear here.</p>}
        </div>
      </section>
    </div>
  );
}
