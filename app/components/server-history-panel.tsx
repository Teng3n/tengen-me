"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicServerHistoryDay } from "../lib/server-status";
import { serverScheduleDateKey } from "../../shared/server-schedule";

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shortDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function longDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function ServerHistoryPanel() {
  const [history, setHistory] = useState<PublicServerHistoryDay[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/server-status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { history?: PublicServerHistoryDay[] };
        if (active && Array.isArray(payload.history)) setHistory(payload.history);
      } catch {
        // Retain the most recently loaded history when the public status feed is unavailable.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const days = useMemo(() => {
    const end = new Date(`${serverScheduleDateKey(new Date())}T12:00:00Z`);
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(end);
      date.setUTCDate(end.getUTCDate() - (29 - index));
      return dateKey(date);
    });
  }, []);
  const byDate = useMemo(() => new Map(history.map((day) => [day.date, day])), [history]);
  const reported = days.map((day) => byDate.get(day)).filter((day): day is PublicServerHistoryDay => Boolean(day));
  const scheduledSamples = reported.reduce((sum, day) => sum + day.scheduledSamples, 0);
  const scheduledOnlineSamples = reported.reduce((sum, day) => sum + day.scheduledOnlineSamples, 0);
  const observedUptime = scheduledSamples ? Math.round(scheduledOnlineSamples / scheduledSamples * 100) : null;
  const peakPlayers = reported.reduce((peak, day) => Math.max(peak, day.peakPlayers), 0);

  return (
    <section className="server-history-panel" aria-labelledby="server-history-heading">
      <header>
        <div><p className="section-kicker">Last 30 days</p><h2 id="server-history-heading">Server history</h2></div>
      </header>
      <dl className="server-history-summary">
        <div><dt>Scheduled uptime</dt><dd>{observedUptime === null ? "—" : `${observedUptime}%`}</dd></div>
        <div><dt>Peak players</dt><dd>{reported.length ? peakPlayers : "—"}</dd></div>
        <div><dt>Days reporting</dt><dd>{reported.length}<span> / 30</span></dd></div>
      </dl>
      <div className="server-history-grid" aria-label="Daily scheduled uptime and peak players">
        {days.map((date) => {
          const day = byDate.get(date);
          const uptime = day?.scheduledSamples ? Math.round(day.scheduledOnlineSamples / day.scheduledSamples * 100) : null;
          const rawUptime = day ? Math.round(day.onlineSamples / day.totalSamples * 100) : null;
          const title = day
            ? `${longDate(date)}: ${uptime === null ? "no scheduled-window samples" : `${uptime}% uptime during scheduled hours`}; ${rawUptime}% across all observations; peak ${day.peakPlayers} of ${day.maximumPlayers} players.`
            : `${longDate(date)}: no bridge data.`;
          return (
            <div key={date} className={`server-history-day${day ? " server-history-day-reported" : ""}`} title={title} tabIndex={0}>
              <span>{shortDate(date)}</span>
              <div className="server-history-uptime" aria-hidden="true"><i style={{ height: `${uptime ?? 0}%` }} /></div>
              <strong>{day ? `${day.peakPlayers}/${day.maximumPlayers}` : "—"}</strong>
              <small>{day ? uptime === null ? "Off-hours only" : `${uptime}% up` : "No data"}</small>
            </div>
          );
        })}
      </div>
      <div className="server-history-legend"><span><i /> Uptime during scheduled hours</span><span>Number = daily peak players</span><span>Hover or focus for details</span></div>
    </section>
  );
}
