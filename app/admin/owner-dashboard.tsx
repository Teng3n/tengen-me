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

type ElectricityAnalytics = {
  asOfDate: string;
  cycle: {
    start: string;
    expectedEnd: string;
    daysElapsed: number;
    daysRemaining: number;
    totalDays: number;
    usageToDateKwh: number;
    averageDailyKwh: number;
    projectedKwh: number;
    previousBillKwh: number;
    previousBillAverageDailyKwh: number;
    previousSummerBillKwh: number;
    projectedVsPreviousBillPercent: number;
    projectedVsPreviousSummerPercent: number;
    usageToDateVsPreviousBillPercent: number;
    risk: "high" | "elevated" | "normal";
    riskLabel: string;
  };
  cost: {
    grossToDate: number;
    projectedGross: number;
    lifelineKwh: number;
    aboveLifelineKwh: number;
    lifelineRate: number;
    aboveLifelineRate: number;
    ratePlan: "Standard Domestic";
    solarCreditsIncluded: false;
  };
  ac: null | {
    availableFrom: string;
    trackedDays: number;
    runtimeHours: number;
    estimatedKwh: number;
    estimatedKwhLow: number;
    estimatedKwhHigh: number;
    estimatedCost: number;
    estimatedCostLow: number;
    estimatedCostHigh: number;
    baselineDailyKwh: number;
    kwhPerRuntimeHour: number;
    modelFitPercent: number;
    confidence: "low" | "medium" | "high";
    confidenceLabel: string;
    trackingCoveragePercent: number;
    fullCycleEstimate: boolean;
    shareOfTrackedUsagePercent: number;
    recentTrendPercent: number;
    trend: "spiking" | "easing" | "steady";
    trendLabel: string;
  };
  trends: {
    asOfDate: string;
    month: {
      start: string;
      end: string;
      daysElapsed: number;
      totalKwh: number;
      dailyAverageKwh: number;
      previousPeriodStart: string;
      previousPeriodEnd: string;
      previousPeriodDailyAverageKwh: number | null;
      vsPreviousPeriodPercent: number | null;
      priorYearStart: string;
      priorYearEnd: string;
      priorYearDailyAverageKwh: number | null;
      vsPriorYearPercent: number | null;
    };
    billingPeriod: {
      start: string;
      end: string;
      expectedEnd: string;
      daysElapsed: number;
      totalDays: number;
      totalKwh: number;
      dailyAverageKwh: number;
      projectedKwh: number;
      previousPeriodStart: string;
      previousPeriodEnd: string;
      previousPeriodDailyAverageKwh: number | null;
      vsPreviousPeriodPercent: number | null;
      priorYearStart: string;
      priorYearEnd: string;
      priorYearDailyAverageKwh: number | null;
      vsPriorYearPercent: number | null;
    };
  };
  daily: Array<{
    date: string;
    kwh: number;
    previousYearKwh: number | null;
    coolingHours: number | null;
  }>;
  yearlyDaily: Array<{
    year: number;
    days: Array<{
      date: string;
      kwh: number;
    }>;
  }>;
  monthly: Array<{
    month: string;
    label: string;
    usageKwh: number;
    modeledCost: number;
    coveredDays: number;
    partial: boolean;
  }>;
  yearlyMonthly: Array<{
    year: number;
    months: Array<{
      month: string;
      monthIndex: number;
      usageKwh: number;
      coveredDays: number;
      partial: boolean;
    }>;
  }>;
  billingHistory: Array<{
    periodStart: string;
    periodEnd: string;
    label: string;
    usageKwh: number;
    electricCost: number;
    costKind: "actual" | "modeled" | "forecast";
    exportedSolarKwh: number | null;
    solarBankKwh: number | null;
    source: string;
  }>;
  solar: {
    latestBankKwh: number | null;
    asOfDate: string | null;
    source: string | null;
    appliedToCosts: false;
    history: Array<{
      periodEnd: string;
      label: string;
      exportedKwh: number;
      bankKwh: number;
    }>;
  };
  methodology: { forecast: string; cost: string; ac: string; solar: string };
};

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
  electricity: ElectricityAnalytics | null;
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

const kwhFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateRange(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const startLabel = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel}–${endLabel}`;
}

function percentChange(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function DailyTrendComparison({
  label,
  period,
  dailyAverageKwh,
  changePercent,
}: {
  label: string;
  period: string;
  dailyAverageKwh: number | null;
  changePercent: number | null;
}) {
  const tone = changePercent === null
    ? "neutral"
    : changePercent > 2 ? "higher" : changePercent < -2 ? "lower" : "steady";

  return (
    <div className="owner-trend-comparison">
      <div><span>{label}</span><small>{period}</small></div>
      <div className="owner-trend-comparison-value">
        <strong className={`owner-trend-delta owner-trend-delta-${tone}`}>
          {changePercent === null ? "—" : percentChange(changePercent)}
        </strong>
        <small>{dailyAverageKwh === null ? "No data" : `${dailyAverageKwh.toFixed(1)} kWh/day`}</small>
      </div>
    </div>
  );
}

type YearUsageSeries = {
  year: number;
  points: Array<{
    x: number;
    value: number;
    label: string;
    partial?: boolean;
  }>;
};

const comparisonMonthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function calendarDayIndex(date: string) {
  const monthDay = date.slice(5);
  return Math.round((Date.parse(`2000-${monthDay}T00:00:00Z`) - Date.parse("2000-01-01T00:00:00Z")) / 86_400_000);
}

function comparisonYearLabel(year: number, currentYear: number) {
  const difference = currentYear - year;
  if (difference === 0) return `${year} · current`;
  if (difference === 1) return `${year} · last year`;
  return `${year} · ${difference} years ago`;
}

function YearUsageLineChart({
  series,
  kind,
}: {
  series: YearUsageSeries[];
  kind: "daily" | "monthly";
}) {
  const [visibleYears, setVisibleYears] = useState(() => new Set(series.map((item) => item.year)));
  const visibleSeries = series.filter((item) => visibleYears.has(item.year));
  if (!series.length) return <p className="owner-chart-empty">No year-over-year usage history is available yet.</p>;
  const width = 960;
  const height = kind === "daily" ? 270 : 300;
  const left = 62;
  const right = 18;
  const top = 22;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = visibleSeries.flatMap((item) => item.points.map((point) => point.value));
  const interval = kind === "daily" ? 10 : 500;
  const maxKwh = Math.max(interval, Math.ceil(Math.max(...values, interval) / interval) * interval);
  const plotRanges = kind === "daily"
    ? [
      { label: "January–June", start: 0, end: 181, firstMonth: 0, lastMonth: 5 },
      { label: "July–December", start: 182, end: 365, firstMonth: 6, lastMonth: 11 },
    ]
    : [{ label: "", start: 0, end: 11, firstMonth: 0, lastMonth: 11 }];
  const currentYear = Math.max(...series.map((item) => item.year));

  const toggleYear = (year: number) => {
    setVisibleYears((current) => {
      if (current.has(year) && current.size === 1) return current;
      const next = new Set(current);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <div className="owner-usage-chart">
      <div className="owner-chart-legend owner-chart-year-legend" aria-label="Toggle comparison years">
        {series.map((item, index) => (
          <button
            key={item.year}
            type="button"
            className={`owner-chart-year-button owner-chart-year-series-${Math.min(index, 3)}`}
            aria-pressed={visibleYears.has(item.year)}
            onClick={() => toggleYear(item.year)}
          >
            <i className={`owner-chart-year-series-${Math.min(index, 3)}`} />
            {comparisonYearLabel(item.year, currentYear)}
          </button>
        ))}
      </div>
      <div className={kind === "daily" ? "owner-year-periods" : undefined}>
        {plotRanges.map((range) => {
          const point = (xValue: number, value: number) => ({
            x: left + ((xValue - range.start) / (range.end - range.start)) * plotWidth,
            y: top + plotHeight - (value / maxKwh) * plotHeight,
          });
          const xTicks = comparisonMonthLabels
            .map((label, monthIndex) => ({
              label,
              monthIndex,
              x: kind === "daily" ? calendarDayIndex(`2000-${String(monthIndex + 1).padStart(2, "0")}-01`) : monthIndex,
            }))
            .filter((tick) => tick.monthIndex >= range.firstMonth && tick.monthIndex <= range.lastMonth);

          return (
            <section className={kind === "daily" ? "owner-year-period" : undefined} key={range.label || kind}>
              {range.label ? <h4>{range.label}</h4> : null}
              <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${kind === "daily" ? `${range.label} daily` : "Monthly"} electricity usage by calendar position and year`}>
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const y = top + plotHeight * ratio;
                  return (
                    <g key={ratio}>
                      <line className="owner-chart-gridline" x1={left} x2={width - right} y1={y} y2={y} />
                      <text className="owner-chart-axis" x={left - 10} y={y + 4} textAnchor="end">{Math.round(maxKwh * (1 - ratio))}</text>
                    </g>
                  );
                })}
                <text className="owner-chart-axis-title" x={14} y={top + plotHeight / 2} transform={`rotate(-90 14 ${top + plotHeight / 2})`} textAnchor="middle">{kind === "daily" ? "kWh / day" : "kWh / month"}</text>
                {visibleSeries.map((item) => {
                  const index = series.findIndex((candidate) => candidate.year === item.year);
                  const rangePoints = item.points.filter((value) => value.x >= range.start && value.x <= range.end);
                  const path = rangePoints.map((value, pointIndex) => {
                    const p = point(value.x, value.value);
                    return `${pointIndex ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  }).join(" ");
                  return path
                    ? <path key={item.year} className={`owner-chart-line owner-chart-year-line owner-chart-year-series-${Math.min(index, 3)}`} d={path} />
                    : null;
                })}
                {visibleSeries.flatMap((item) => {
                  const index = series.findIndex((candidate) => candidate.year === item.year);
                  return item.points
                    .filter((value) => value.x >= range.start && value.x <= range.end)
                    .map((value) => {
                      const p = point(value.x, value.value);
                      return (
                        <circle
                          key={`${item.year}-${value.label}`}
                          className={`${kind === "daily" ? "owner-chart-hit-point" : "owner-chart-year-point"} owner-chart-year-series-${Math.min(index, 3)}`}
                          cx={p.x}
                          cy={p.y}
                          r={kind === "daily" ? 6 : 4}
                        >
                          <title>{value.label}: {value.value.toFixed(1)} kWh{value.partial ? " (month to date)" : ""}</title>
                        </circle>
                      );
                    });
                })}
                {xTicks.map((tick, index) => (
                  <text key={tick.label} className="owner-chart-axis" x={point(tick.x, 0).x} y={height - 12} textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}>{tick.label}</text>
                ))}
              </svg>
            </section>
          );
        })}
      </div>
    </div>
  );
}

type CalendarComparisonPoint = {
  year: number;
  monthIndex: number;
  label: string;
  primaryValue: number;
  secondaryValue: number;
  estimated?: boolean;
};

function CalendarYearOverlayChart({
  points,
  primaryLegend,
  secondaryLegend,
  primaryAxis,
  secondaryAxis,
  primaryStep,
  secondaryStep,
  secondaryKind,
  description,
}: {
  points: CalendarComparisonPoint[];
  primaryLegend: string;
  secondaryLegend: string;
  primaryAxis: string;
  secondaryAxis: string;
  primaryStep: number;
  secondaryStep: number;
  secondaryKind: "money" | "kwh";
  description: string;
}) {
  const years = [...new Set(points.map((point) => point.year))].sort((a, b) => b - a).slice(0, 4);
  const [visibleYears, setVisibleYears] = useState(() => new Set(years));
  const visiblePoints = points.filter((point) => visibleYears.has(point.year) && years.includes(point.year));
  if (!points.length) return <p className="owner-chart-empty">No comparison history is available yet.</p>;
  const width = 960;
  const height = 320;
  const left = 62;
  const right = 62;
  const top = 24;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxPrimary = Math.max(primaryStep, Math.ceil(Math.max(...visiblePoints.map((point) => point.primaryValue), primaryStep) / primaryStep) * primaryStep);
  const maxSecondary = Math.max(secondaryStep, Math.ceil(Math.max(...visiblePoints.map((point) => point.secondaryValue), secondaryStep) / secondaryStep) * secondaryStep);
  const slotWidth = plotWidth / 12;
  const groupWidth = Math.min(58, slotWidth * 0.82);
  const barWidth = Math.min(22, groupWidth / Math.max(1, years.length - 0.5));
  const barStep = years.length > 1 ? (groupWidth - barWidth) / (years.length - 1) : 0;
  const x = (monthIndex: number, year: number) => {
    const yearIndex = years.indexOf(year);
    return left + slotWidth * monthIndex + slotWidth / 2 - groupWidth / 2 + barWidth / 2 + yearIndex * barStep;
  };
  const primaryY = (value: number) => top + plotHeight - (value / maxPrimary) * plotHeight;
  const secondaryY = (value: number) => top + plotHeight - (value / maxSecondary) * plotHeight;
  const formatSecondary = (value: number) => secondaryKind === "money" ? moneyFormatter.format(value) : `${kwhFormatter.format(value)} kWh`;
  const toggleYear = (year: number) => {
    setVisibleYears((current) => {
      if (current.has(year) && current.size === 1) return current;
      const next = new Set(current);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <div className="owner-usage-chart owner-overlay-chart owner-calendar-overlay-chart">
      <div className="owner-chart-legend owner-chart-year-legend" aria-label="Toggle comparison years">
        {years.map((year, index) => (
          <button
            key={year}
            type="button"
            className={`owner-chart-year-button owner-chart-year-series-${index}`}
            aria-pressed={visibleYears.has(year)}
            onClick={() => toggleYear(year)}
          >
            <i />
            {comparisonYearLabel(year, years[0])}
          </button>
        ))}
      </div>
      <div className="owner-chart-legend owner-chart-calendar-metric-legend" aria-hidden="true">
        <span><i className="owner-chart-primary-bar" />{primaryLegend}</span>
        <span><i className="owner-chart-secondary-line" />{secondaryLegend}</span>
        <span><i className="owner-chart-estimated" />Modeled / forecast</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={description}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + plotHeight * ratio;
          return (
            <g key={ratio}>
              <line className="owner-chart-gridline" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="owner-chart-axis" x={left - 10} y={y + 4} textAnchor="end">{kwhFormatter.format(maxPrimary * (1 - ratio))}</text>
              <text className="owner-chart-axis owner-chart-axis-cost" x={width - right + 10} y={y + 4} textAnchor="start">{secondaryKind === "money" ? "$" : ""}{kwhFormatter.format(maxSecondary * (1 - ratio))}</text>
            </g>
          );
        })}
        <text className="owner-chart-axis-title" x={15} y={top + plotHeight / 2} transform={`rotate(-90 15 ${top + plotHeight / 2})`} textAnchor="middle">{primaryAxis}</text>
        <text className="owner-chart-axis-title" x={width - 14} y={top + plotHeight / 2} transform={`rotate(90 ${width - 14} ${top + plotHeight / 2})`} textAnchor="middle">{secondaryAxis}</text>
        {visiblePoints.map((point) => {
          const yearIndex = years.indexOf(point.year);
          return (
          <rect
            key={`${point.year}-${point.monthIndex}-bar`}
            className={`owner-calendar-bar owner-calendar-year-series-${yearIndex}${point.estimated ? " owner-calendar-estimated" : ""}`}
            x={x(point.monthIndex, point.year) - barWidth / 2}
            y={primaryY(point.primaryValue)}
            width={barWidth}
            height={Math.max(2, top + plotHeight - primaryY(point.primaryValue))}
          >
            <title>{point.label}: {kwhFormatter.format(point.primaryValue)} kWh; {formatSecondary(point.secondaryValue)}{point.estimated ? " (modeled / forecast)" : ""}</title>
          </rect>
          );
        })}
        {years.filter((year) => visibleYears.has(year)).map((year) => {
          const yearPoints = visiblePoints.filter((point) => point.year === year).sort((a, b) => a.monthIndex - b.monthIndex);
          const path = yearPoints.map((point, pointIndex) => `${pointIndex ? "L" : "M"}${x(point.monthIndex, year).toFixed(1)},${secondaryY(point.secondaryValue).toFixed(1)}`).join(" ");
          return <path key={`${year}-line`} className={`owner-chart-line owner-calendar-line owner-calendar-year-series-${years.indexOf(year)}`} d={path} />;
        })}
        {visiblePoints.map((point) => {
          const yearIndex = years.indexOf(point.year);
          return (
            <circle key={`${point.year}-${point.monthIndex}-point`} className={`owner-calendar-point owner-calendar-year-series-${yearIndex}${point.estimated ? " owner-calendar-estimated" : ""}`} cx={x(point.monthIndex, point.year)} cy={secondaryY(point.secondaryValue)} r="4">
              <title>{point.label}: {formatSecondary(point.secondaryValue)}{point.estimated ? " (modeled / forecast)" : ""}</title>
            </circle>
          );
        })}
        {comparisonMonthLabels.map((label, monthIndex) => (
          <text key={label} className="owner-chart-axis" x={left + slotWidth * monthIndex + slotWidth / 2} y={height - 14} textAnchor="middle">{label}</text>
        ))}
      </svg>
    </div>
  );
}

function ElectricityPanel({ analytics }: { analytics: ElectricityAnalytics }) {
  const dailyYearSeries: YearUsageSeries[] = analytics.yearlyDaily.map((item) => ({
    year: item.year,
    points: item.days.map((day) => ({
      x: calendarDayIndex(day.date),
      value: day.kwh,
      label: new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    })),
  }));
  const monthlyYearSeries: YearUsageSeries[] = analytics.yearlyMonthly.map((item) => ({
    year: item.year,
    points: item.months.map((month) => ({
      x: month.monthIndex,
      value: month.usageKwh,
      label: new Date(`${month.month}-01T12:00:00`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      partial: month.partial,
    })),
  }));
  const billingCalendarPoints: CalendarComparisonPoint[] = analytics.billingHistory.map((bill) => ({
    year: Number(bill.periodEnd.slice(0, 4)),
    monthIndex: Number(bill.periodEnd.slice(5, 7)) - 1,
    label: bill.label,
    primaryValue: bill.usageKwh,
    secondaryValue: bill.electricCost,
    estimated: bill.costKind !== "actual",
  }));
  const solarCalendarPoints: CalendarComparisonPoint[] = analytics.solar.history.map((item) => ({
    year: Number(item.periodEnd.slice(0, 4)),
    monthIndex: Number(item.periodEnd.slice(5, 7)) - 1,
    label: item.label,
    primaryValue: item.exportedKwh,
    secondaryValue: item.bankKwh,
  }));
  const projectedTotal = analytics.cost.lifelineKwh + analytics.cost.aboveLifelineKwh;
  const lifelinePercent = projectedTotal > 0 ? analytics.cost.lifelineKwh / projectedTotal * 100 : 0;

  return (
    <section className="owner-panel owner-energy-panel">
      <div className="owner-panel-heading">
        <div><p className="section-kicker">Electricity bill</p><h2>August bill outlook</h2></div>
        <span className={`owner-energy-risk owner-energy-risk-${analytics.cycle.risk}`}>
          {analytics.cycle.riskLabel}
        </span>
      </div>

      <div className="owner-energy-alert">
        <strong>This bill is on pace to be materially higher.</strong>
        <p>
          Through {shortDate(analytics.asOfDate)}, you have already used {percentChange(analytics.cycle.usageToDateVsPreviousBillPercent)} more electricity than the entire June bill. At the recent pace, the cycle projects to {kwhFormatter.format(analytics.cycle.projectedKwh)} kWh by {shortDate(analytics.cycle.expectedEnd)}.
        </p>
      </div>

      <dl className="owner-energy-metrics">
        <div><dt>Used so far</dt><dd>{kwhFormatter.format(analytics.cycle.usageToDateKwh)} <span>kWh</span></dd><small>{analytics.cycle.daysElapsed} of {analytics.cycle.totalDays} days</small></div>
        <div><dt>Projected usage</dt><dd>{kwhFormatter.format(analytics.cycle.projectedKwh)} <span>kWh</span></dd><small>{percentChange(analytics.cycle.projectedVsPreviousBillPercent)} vs June bill</small></div>
        <div><dt>Gross electric estimate*</dt><dd>{moneyFormatter.format(analytics.cost.projectedGross)}</dd><small>Before solar credits</small></div>
        <div><dt>Daily pace</dt><dd>{analytics.cycle.averageDailyKwh.toFixed(1)} <span>kWh</span></dd><small>June bill: {analytics.cycle.previousBillAverageDailyKwh.toFixed(1)} / day</small></div>
      </dl>

      <section className="owner-trends" aria-labelledby="owner-trends-heading">
        <div className="owner-chart-heading">
          <h3 id="owner-trends-heading">Daily pace trends</h3>
          <span>Like-for-like kWh per day · through {shortDate(analytics.trends.asOfDate)}</span>
        </div>
        <div className="owner-trend-grid">
          <article className="owner-trend-card">
            <header>
              <div><p>Current month</p><h4>{new Date(`${analytics.trends.month.start}T12:00:00`).toLocaleDateString("en-US", { month: "long" })} to date</h4></div>
              <span>{analytics.trends.month.daysElapsed} days</span>
            </header>
            <div className="owner-trend-primary">
              <strong>{analytics.trends.month.dailyAverageKwh.toFixed(1)}</strong><span>kWh/day</span>
            </div>
            <p className="owner-trend-total">{kwhFormatter.format(analytics.trends.month.totalKwh)} kWh used through {shortDate(analytics.trends.month.end)}</p>
            <div className="owner-trend-comparisons">
              <DailyTrendComparison
                label="Versus previous month"
                period={dateRange(analytics.trends.month.previousPeriodStart, analytics.trends.month.previousPeriodEnd)}
                dailyAverageKwh={analytics.trends.month.previousPeriodDailyAverageKwh}
                changePercent={analytics.trends.month.vsPreviousPeriodPercent}
              />
              <DailyTrendComparison
                label="Versus same dates last year"
                period={dateRange(analytics.trends.month.priorYearStart, analytics.trends.month.priorYearEnd)}
                dailyAverageKwh={analytics.trends.month.priorYearDailyAverageKwh}
                changePercent={analytics.trends.month.vsPriorYearPercent}
              />
            </div>
          </article>

          <article className="owner-trend-card">
            <header>
              <div><p>Current billing period</p><h4>{shortDate(analytics.trends.billingPeriod.start)}–{shortDate(analytics.trends.billingPeriod.expectedEnd)} <small>est.</small></h4></div>
              <span>{analytics.trends.billingPeriod.daysElapsed} of {analytics.trends.billingPeriod.totalDays} days</span>
            </header>
            <div className="owner-trend-primary">
              <strong>{analytics.trends.billingPeriod.dailyAverageKwh.toFixed(1)}</strong><span>kWh/day</span>
            </div>
            <p className="owner-trend-total">{kwhFormatter.format(analytics.trends.billingPeriod.totalKwh)} kWh used since {shortDate(analytics.trends.billingPeriod.start)}</p>
            <div className="owner-trend-comparisons">
              <DailyTrendComparison
                label="Versus previous bill period"
                period={dateRange(analytics.trends.billingPeriod.previousPeriodStart, analytics.trends.billingPeriod.previousPeriodEnd)}
                dailyAverageKwh={analytics.trends.billingPeriod.previousPeriodDailyAverageKwh}
                changePercent={analytics.trends.billingPeriod.vsPreviousPeriodPercent}
              />
              <DailyTrendComparison
                label="Versus same point last year"
                period={dateRange(analytics.trends.billingPeriod.priorYearStart, analytics.trends.billingPeriod.priorYearEnd)}
                dailyAverageKwh={analytics.trends.billingPeriod.priorYearDailyAverageKwh}
                changePercent={analytics.trends.billingPeriod.vsPriorYearPercent}
              />
            </div>
          </article>
        </div>
        <p className="owner-trends-note">Positive percentages mean the home is using more electricity per day. The previous-period comparison uses the full prior period; last year uses the same number of elapsed days. The current bill period is still an early sample.</p>
      </section>

      <div className="owner-energy-chart-grid">
        <article className="owner-energy-chart-block owner-energy-chart-wide">
          <div className="owner-chart-heading"><h3>Daily usage by year</h3><span>Two six-month views · shared scale and year toggles</span></div>
          <YearUsageLineChart series={dailyYearSeries} kind="daily" />
        </article>
        <article className="owner-energy-chart-block owner-energy-chart-wide">
          <div className="owner-chart-heading"><h3>Month-to-month usage by year</h3><span>January through December aligned across every available year</span></div>
          <YearUsageLineChart series={monthlyYearSeries} kind="monthly" />
          <p className="owner-chart-footnote">The current month is month-to-date; completed prior-year months show full totals.</p>
        </article>
        <article className="owner-energy-chart-block owner-energy-chart-wide">
          <div className="owner-chart-heading"><h3>Bill-to-bill usage + electric cost</h3><span>January–December · years grouped by bill-ending month</span></div>
          <CalendarYearOverlayChart
            points={billingCalendarPoints}
            primaryLegend="Delivered usage"
            secondaryLegend="Gross electric cost"
            primaryAxis="usage kWh"
            secondaryAxis="gross cost"
            primaryStep={500}
            secondaryStep={100}
            secondaryKind="money"
            description="Twelve-month calendar comparison with delivered electricity bars and gross electric cost lines grouped by year"
          />
          <p className="owner-chart-footnote">Costs through April 2026 are actual Electricity Cost values from your workbook. June is modeled from your 1,170 kWh figure; August is forecast. August is {percentChange(analytics.cycle.projectedVsPreviousSummerPercent)} versus August 2025 usage.</p>
        </article>
        <article className="owner-energy-chart-block owner-energy-breakdown">
          <div className="owner-chart-heading"><h3>Standard Domestic model</h3><span>Projected 60-day bill · before solar</span></div>
          <div className="owner-rate-bar" aria-label={`${lifelinePercent.toFixed(0)}% lifeline usage and ${(100 - lifelinePercent).toFixed(0)}% above-lifeline usage`}>
            <span className="owner-rate-lifeline" style={{ width: `${lifelinePercent}%` }} />
            <span className="owner-rate-above" style={{ width: `${100 - lifelinePercent}%` }} />
          </div>
          <dl className="owner-tou-values owner-rate-values">
            <div><dt><i className="owner-rate-lifeline" />Lifeline @ ${analytics.cost.lifelineRate.toFixed(2)}</dt><dd>{kwhFormatter.format(analytics.cost.lifelineKwh)} kWh</dd></div>
            <div><dt><i className="owner-rate-above" />Above @ ${analytics.cost.aboveLifelineRate.toFixed(4)}</dt><dd>{kwhFormatter.format(analytics.cost.aboveLifelineKwh)} kWh</dd></div>
          </dl>
          <p className="owner-chart-footnote">The estimate also includes Anaheim&apos;s customer charge, underground surcharge, PCA, EMA, and California energy surcharge.</p>
        </article>
        <article className="owner-energy-chart-block owner-energy-breakdown owner-solar-status">
          <div className="owner-chart-heading"><h3>Solar bank status</h3><span>Tracked separately · never netted against cost</span></div>
          <div className="owner-solar-bank-value">
            <strong>{analytics.solar.latestBankKwh === null ? "Unknown" : kwhFormatter.format(analytics.solar.latestBankKwh)}</strong>
            {analytics.solar.latestBankKwh === null ? null : <span>kWh banked</span>}
          </div>
          <p>{analytics.solar.asOfDate ? `Last known balance on ${shortDate(analytics.solar.asOfDate)}, from your Utilities workbook.` : "No bank balance has been imported yet."}</p>
          <p className="owner-chart-footnote">SmartStats delivered usage is live. Exported energy and bank balance are historical through the latest workbook row, so this value is deliberately marked as last-known—not current.</p>
        </article>
        <article className="owner-energy-chart-block owner-energy-chart-wide">
          <div className="owner-chart-heading"><h3>Solar export + bank history</h3><span>January–December · years grouped by bill-ending month</span></div>
          <CalendarYearOverlayChart
            points={solarCalendarPoints}
            primaryLegend="Exported solar"
            secondaryLegend="Bank balance"
            primaryAxis="exported kWh"
            secondaryAxis="bank kWh"
            primaryStep={500}
            secondaryStep={1000}
            secondaryKind="kwh"
            description="Twelve-month calendar comparison with exported solar bars and solar bank balance lines grouped by year"
          />
          <p className="owner-chart-footnote">Export is excess energy Anaheim received from the property; it is not total panel production. The bank line is the cumulative kWh credit shown in your records.</p>
        </article>
      </div>

      {analytics.ac ? (
        <div className="owner-ac-summary">
          <div>
            <p className="section-kicker">Air conditioning</p>
            <h3>Estimated full-cycle AC contribution</h3>
            <p>This bill began before complete Nest tracking. The estimate extrapolates the AC share learned from {analytics.ac.trackedDays} matched days across the projected {kwhFormatter.format(analytics.cycle.projectedKwh)} kWh billing cycle, then prices it at the above-lifeline marginal Standard Domestic rate. The next cycle will have complete APU and Nest coverage from day one.</p>
          </div>
          <dl>
            <div><dt>Full-cycle AC estimate</dt><dd>{moneyFormatter.format(analytics.ac.estimatedCost)}</dd></div>
            <div><dt>Full-cycle cost range</dt><dd>{moneyFormatter.format(analytics.ac.estimatedCostLow)}–{moneyFormatter.format(analytics.ac.estimatedCostHigh)}</dd></div>
            <div><dt>Full-cycle AC energy</dt><dd>{kwhFormatter.format(analytics.ac.estimatedKwh)} kWh</dd></div>
            <div><dt>Tracking coverage</dt><dd>{analytics.ac.trackedDays} / {analytics.cycle.totalDays} days</dd></div>
            <div><dt>Learned home baseline</dt><dd>{analytics.ac.baselineDailyKwh.toFixed(1)} kWh/day</dd></div>
            <div><dt>Runtime energy rate</dt><dd>{analytics.ac.kwhPerRuntimeHour.toFixed(2)} kWh/h</dd></div>
            <div><dt>Model fit</dt><dd>{analytics.ac.modelFitPercent.toFixed(0)}%</dd></div>
            <div><dt>Estimate basis</dt><dd>{analytics.ac.confidenceLabel}</dd></div>
          </dl>
        </div>
      ) : null}

      <div className="owner-energy-notes">
        <p><strong>*Not the final utility bill.</strong> The estimate follows Anaheim&apos;s <a href="https://www.anaheim.net/6535/Residential-Bill-Calculator" target="_blank" rel="noreferrer">Residential Bill Calculator</a> for Standard Domestic electricity. It is gross: solar credits are not deducted, and water, sewer, trash, and other utility charges are excluded.</p>
        <details><summary>How this forecast is calculated</summary><p>{analytics.methodology.forecast} {analytics.methodology.cost} {analytics.methodology.ac}</p></details>
        <details><summary>Solar data status</summary><p>{analytics.methodology.solar}</p></details>
      </div>
    </section>
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

  return (
    <div className="owner-dashboard">
      <div className="owner-session-bar">
        <div><span className="owner-state-dot owner-state-operational" /><strong>Protected owner session</strong><span>{ownerLabel} verified</span></div>
        <nav className="owner-admin-tabs" aria-label="Owner sections">
          <a className="owner-admin-tab-active" href="/admin">Overview</a>
          <a href="/admin/electricity">Electrical bill outlook</a>
        </nav>
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

      <div className="owner-two-column owner-two-column-tools">
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

export function OwnerElectricityOutlook({ ownerLabel }: { ownerLabel: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/admin/api/dashboard", { cache: "no-store" });
      const payload = await response.json() as DashboardData | { error?: string };
      if (!response.ok || !("services" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Dashboard request failed");
      }
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dashboard request failed");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!data) {
    return (
      <section className="owner-loading" aria-live="polite">
        <span className="owner-loading-mark" />
        <div><h2>{error ? "Outlook unavailable" : "Loading electrical outlook"}</h2><p>{error || "Matching meter use with cooling runtime."}</p></div>
        {error ? <button type="button" onClick={() => { setError(""); void load(); }}>Try again</button> : null}
      </section>
    );
  }

  return (
    <div className="owner-dashboard">
      <div className="owner-session-bar">
        <div><span className="owner-state-dot owner-state-operational" /><strong>Protected owner session</strong><span>{ownerLabel} verified</span></div>
        <nav className="owner-admin-tabs" aria-label="Owner sections">
          <a href="/admin">Overview</a>
          <a className="owner-admin-tab-active" href="/admin/electricity">Electrical bill outlook</a>
        </nav>
      </div>
      {data.electricity ? <ElectricityPanel analytics={data.electricity} /> : (
        <section className="owner-panel owner-energy-unavailable">
          <p className="section-kicker">Electricity bill</p>
          <h2>Usage analytics are temporarily unavailable.</h2>
          <p>The private household database could not be reached.</p>
        </section>
      )}
    </div>
  );
}
