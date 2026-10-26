"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Measure = { value: number | null; upperBound: number | null; incomplete: boolean; estimated: boolean };
type Food = {
  id: string;
  name: string;
  calories: Measure;
  protein: Measure;
  carbs: Measure;
  fiber: Measure;
  totalSugar: Measure;
  addedSugar: Measure;
  sugarAlcohols: Measure;
  fat: Measure;
  saturatedFat: Measure;
  transFat: Measure;
  polyunsaturatedFat: Measure;
  monounsaturatedFat: Measure;
  vitaminD: Measure;
  vitaminA: Measure;
  cholesterol: Measure;
  potassium: Measure;
  calcium: Measure;
  iron: Measure;
  sodium: Measure;
  quality: string;
  note: string;
  consumption: "confirmed" | "planned" | "excluded" | "unknown";
};
type Nutrients = Omit<Food, "id" | "name" | "quality" | "note" | "consumption" | "calories"> & { netCarbs: Measure };
type HistoryMetric = "totalSugar" | "addedSugar" | "calories" | "protein" | "saturatedFat" | "fiber" | "sodium";
type HistoryDay = { date: string } & Record<HistoryMetric, Measure>;
type SugarAverage = { measure: Measure; recordedDays: number; calendarDays: number };
type DashboardData = {
  generatedAt: string;
  timezone: string;
  selectedDate: string;
  availableDates: string[];
  targets: { calories: number; protein: number; fiber: number; saturatedFat: number; sodium: number; sugarReduction: number };
  calories: {
    consumed: Measure;
    planned: Measure;
    basal: Measure;
    active: Measure;
    burned: Measure;
    net: Measure;
    intakeGoalDelta: Measure;
    detailCalories: Measure;
    discrepancy: number | null;
    status: string;
    note: string;
  };
  nutrients: Nutrients;
  foods: Food[];
  sugar: {
    rolling7: SugarAverage;
    sinceOctober: SugarAverage;
    september: SugarAverage;
    rollingReductionPercent: number | null;
    sinceOctoberReductionPercent: number | null;
  };
  history: HistoryDay[];
  reliability: { confirmedFoodCount: number; plannedFoodCount: number; uncountedFoodCount: number; unknownConsumptionCount: number };
};

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
});

function dateAtNoon(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function dateLabel(date: string) {
  return dateFormatter.format(dateAtNoon(date));
}

function shortDate(date: string) {
  return shortDateFormatter.format(dateAtNoon(date));
}

function shiftDate(date: string, days: number) {
  const value = dateAtNoon(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function todayLosAngeles() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatMeasure(measure: Measure, unit: string, maximumFractionDigits = 1) {
  if (measure.value === null) return "Incomplete data";
  const formatter = maximumFractionDigits === 0 ? wholeNumber : number;
  const lower = formatter.format(measure.value);
  if (measure.upperBound !== null && Math.abs(measure.upperBound - measure.value) > 0.001) {
    if (measure.value === 0) return `<${formatter.format(measure.upperBound)} ${unit}`;
    return `${lower}–<${formatter.format(measure.upperBound)} ${unit}`;
  }
  if (measure.upperBound === null || measure.incomplete) return `≥${lower} ${unit}`;
  return `${measure.estimated ? "≈" : ""}${lower} ${unit}`;
}

function compactMeasure(measure: Measure, maximumFractionDigits = 0) {
  if (measure.value === null) return "—";
  const formatter = maximumFractionDigits === 0 ? wholeNumber : number;
  if (measure.upperBound !== null && Math.abs(measure.upperBound - measure.value) > 0.001) {
    return measure.value === 0 ? `<${formatter.format(measure.upperBound)}` : `${formatter.format(measure.value)}–<${formatter.format(measure.upperBound)}`;
  }
  if (measure.upperBound === null || measure.incomplete) return `≥${formatter.format(measure.value)}`;
  return `${measure.estimated ? "≈" : ""}${formatter.format(measure.value)}`;
}

function signed(value: number | null, unit = "") {
  if (value === null) return "Unknown";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${wholeNumber.format(Math.abs(value))}${unit}`;
}

function percentage(value: number | null) {
  if (value === null) return "Unknown";
  return `${value > 0 ? "↓ " : value < 0 ? "↑ " : ""}${Math.abs(value).toFixed(0)}%`;
}

function ProgressBar({ value, target, warning = false }: { value: number | null; target: number; warning?: boolean }) {
  const percent = value === null ? 0 : Math.max(0, Math.min(100, value / target * 100));
  return (
    <div className={`nutrition-progress-track${warning ? " nutrition-progress-warning" : ""}`} aria-label={value === null ? "Data unavailable" : `${Math.round(value / target * 100)} percent`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function NutrientProgress({ label, measure, target, unit, reference }: { label: string; measure: Measure; target: number; unit: string; reference: string }) {
  const value = measure.value;
  const warning = (label === "Saturated fat" || label === "Sodium") && value !== null && value > target;
  return (
    <article className="nutrition-target-card">
      <div><span>{label}</span><strong>{formatMeasure(measure, unit, unit === "mg" ? 0 : 1)}</strong></div>
      <ProgressBar value={value} target={target} warning={warning} />
      <small>{reference} · {value === null ? "progress unknown" : `${Math.round(value / target * 100)}%`}</small>
    </article>
  );
}

const metricConfig: Record<HistoryMetric, { label: string; unit: string }> = {
  totalSugar: { label: "Total sugar", unit: "g" },
  addedSugar: { label: "Added sugar", unit: "g" },
  calories: { label: "Calories", unit: "kcal" },
  protein: { label: "Protein", unit: "g" },
  saturatedFat: { label: "Saturated fat", unit: "g" },
  fiber: { label: "Fiber", unit: "g" },
  sodium: { label: "Sodium", unit: "mg" },
};

function HistoryChart({ data, metric, baseline, movingAverage }: { data: HistoryDay[]; metric: HistoryMetric; baseline: number | null; movingAverage: boolean }) {
  const points = data.flatMap((item, index) => item[metric].value === null ? [] : [{ index, date: item.date, value: item[metric].value as number, measure: item[metric] }]);
  if (!points.length) return <p className="nutrition-chart-empty">No quantified values are available for this period.</p>;
  const width = 980;
  const height = 300;
  const pad = { left: 56, right: 18, top: 20, bottom: 42 };
  const maxValue = Math.max(...points.map((point) => point.measure.upperBound ?? point.value), baseline ?? 0, 1) * 1.08;
  const x = (index: number) => pad.left + (data.length <= 1 ? 0 : index / (data.length - 1) * (width - pad.left - pad.right));
  const y = (value: number) => pad.top + (1 - value / maxValue) * (height - pad.top - pad.bottom);
  const segments: Array<typeof points> = [];
  for (const point of points) {
    const segment = segments.at(-1);
    if (!segment || segment.at(-1)!.index !== point.index - 1) segments.push([point]);
    else segment.push(point);
  }
  const averages = data.map((item, index) => {
    const window = data.slice(Math.max(0, index - 6), index + 1).map((day) => day[metric].value).filter((value): value is number => value !== null);
    return window.length ? window.reduce((sum, value) => sum + value, 0) / window.length : null;
  });
  const averagePoints = averages.flatMap((value, index) => value === null ? [] : [{ index, value }]);
  const yTicks = [0, .25, .5, .75, 1].map((ratio) => ratio * maxValue);
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="nutrition-chart-scroll">
      <svg className="nutrition-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metricConfig[metric].label} history`}>
        {yTicks.map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="nutrition-grid-line" /><text x={pad.left - 10} y={y(tick) + 4} textAnchor="end">{number.format(tick)}</text></g>)}
        {baseline !== null && metric === "totalSugar" ? <g><line x1={pad.left} x2={width - pad.right} y1={y(baseline)} y2={y(baseline)} className="nutrition-baseline-line" /><text x={width - pad.right} y={Math.max(12, y(baseline) - 7)} textAnchor="end">September baseline</text></g> : null}
        {segments.map((segment, index) => segment.length > 1 ? <polyline key={index} points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} className="nutrition-history-line" /> : null)}
        {movingAverage && averagePoints.length > 1 ? <polyline points={averagePoints.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} className="nutrition-average-line" /> : null}
        {points.map((point) => <circle key={point.date} cx={x(point.index)} cy={y(point.value)} r="4.5" className={point.measure.incomplete ? "nutrition-history-point nutrition-history-point-incomplete" : "nutrition-history-point"}><title>{shortDate(point.date)}: {formatMeasure(point.measure, metricConfig[metric].unit, metric === "sodium" || metric === "calories" ? 0 : 1)}</title></circle>)}
        {data.map((item, index) => index % labelEvery === 0 || index === data.length - 1 ? <text key={item.date} x={x(index)} y={height - 12} textAnchor="middle">{shortDate(item.date)}</text> : null)}
      </svg>
    </div>
  );
}

const nutrientGroups: Array<{ category: string; rows: Array<[string, keyof Nutrients, string, number]> }> = [
  { category: "Protein", rows: [["Total protein", "protein", "g", 1]] },
  { category: "Carbohydrates", rows: [["Total carbohydrates", "carbs", "g", 1], ["Dietary fiber", "fiber", "g", 1], ["Net carbohydrates", "netCarbs", "g", 1]] },
  { category: "Sugars", rows: [["Total sugar", "totalSugar", "g", 1], ["Added sugar", "addedSugar", "g", 1], ["Sugar alcohols", "sugarAlcohols", "g", 1]] },
  { category: "Fats", rows: [["Total fat", "fat", "g", 1], ["Saturated fat", "saturatedFat", "g", 1], ["Trans fat", "transFat", "g", 1], ["Monounsaturated fat", "monounsaturatedFat", "g", 1], ["Polyunsaturated fat", "polyunsaturatedFat", "g", 1]] },
  { category: "Cholesterol", rows: [["Total cholesterol", "cholesterol", "mg", 0]] },
  { category: "Minerals", rows: [["Sodium", "sodium", "mg", 0], ["Potassium", "potassium", "mg", 0], ["Calcium", "calcium", "mg", 0], ["Iron", "iron", "mg", 1]] },
  { category: "Vitamins", rows: [["Vitamin A", "vitaminA", "mcg", 0], ["Vitamin D", "vitaminD", "mcg", 1]] },
];

function FoodDetails({ food }: { food: Food }) {
  const rows: Array<[string, Measure, string]> = [
    ["Carbohydrates", food.carbs, "g"], ["Fiber", food.fiber, "g"], ["Added sugar", food.addedSugar, "g"],
    ["Sugar alcohols", food.sugarAlcohols, "g"], ["Total fat", food.fat, "g"], ["Trans fat", food.transFat, "g"],
    ["Monounsaturated fat", food.monounsaturatedFat, "g"], ["Polyunsaturated fat", food.polyunsaturatedFat, "g"],
    ["Cholesterol", food.cholesterol, "mg"], ["Sodium", food.sodium, "mg"], ["Potassium", food.potassium, "mg"],
    ["Calcium", food.calcium, "mg"], ["Iron", food.iron, "mg"], ["Vitamin A", food.vitaminA, "mcg"], ["Vitamin D", food.vitaminD, "mcg"],
  ];
  return (
    <div className="nutrition-food-details">
      <dl>{rows.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{formatMeasure(value, unit, unit === "mg" ? 0 : 1)}</dd></div>)}</dl>
      <p><strong>Source note</strong>{food.note || "No source note recorded."}</p>
    </div>
  );
}

export function NutritionDashboard({ ownerLabel }: { ownerLabel: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<HistoryMetric>("totalSugar");
  const [range, setRange] = useState<"7" | "30" | "october" | "september">("7");
  const [movingAverage, setMovingAverage] = useState(true);
  const [proteinTarget, setProteinTarget] = useState<number | null>(null);

  const load = useCallback(async (date?: string, refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (refresh) params.set("refresh", String(Date.now()));
      const response = await fetch(`/admin/api/nutrition${params.size ? `?${params}` : ""}`, { cache: "no-store" });
      const payload = await response.json() as DashboardData | { error?: string };
      if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Nutrition data could not be loaded");
      setData(payload as DashboardData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nutrition data could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const setTarget = (value: number) => {
    const safe = Math.max(1, Math.min(999, value || 1));
    setProteinTarget(safe);
  };

  const history = useMemo(() => {
    if (!data) return [];
    const end = data.selectedDate;
    const start = range === "7" ? shiftDate(end, -6) : range === "30" ? shiftDate(end, -29) : range === "october" ? "2026-10-01" : "2026-09-01";
    const rangeEnd = range === "september" ? "2026-09-30" : end;
    return data.history.filter((day) => day.date >= start && day.date <= rangeEnd);
  }, [data, range]);

  if (loading && !data) {
    return <section className="owner-loading nutrition-loading"><span className="owner-loading-mark" /><div><h2>Reading the nutrition log</h2><p>Calculating daily totals without filling in missing values.</p></div></section>;
  }
  if (error && !data) {
    return <section className="owner-loading nutrition-error"><div><h2>Nutrition data is unavailable</h2><p>{error}</p></div><button onClick={() => void load()}>Try again</button></section>;
  }
  if (!data) return null;

  const consumed = data.calories.consumed.value;
  const planned = data.calories.planned.value;
  const remaining = consumed === null ? null : Math.max(0, data.targets.calories - consumed - (planned ?? 0));
  const selectedIndex = data.availableDates.indexOf(data.selectedDate);
  const previousDate = selectedIndex > 0 ? data.availableDates[selectedIndex - 1] : null;
  const nextDate = selectedIndex >= 0 && selectedIndex < data.availableDates.length - 1 ? data.availableDates[selectedIndex + 1] : null;
  const discrepancy = data.calories.discrepancy;
  const hasDiscrepancy = discrepancy !== null && Math.abs(discrepancy) >= 10;
  const activeProteinTarget = proteinTarget ?? data.targets.protein;

  return (
    <div className="nutrition-dashboard">
      <div className="owner-session-bar nutrition-session-bar">
        <div><span className="owner-state-dot owner-state-operational" /><strong>{ownerLabel}</strong><span>Private session</span></div>
        <nav className="owner-admin-tabs" aria-label="Owner sections">
          <a href="/admin">Overview</a>
          <a href="/admin/electricity">Electrical bill outlook</a>
          <a className="owner-admin-tab-active" href="/admin/nutrition">Nutrition</a>
        </nav>
      </div>

      <section className="nutrition-toolbar" aria-label="Date navigation">
        <div className="nutrition-date-stepper">
          <button disabled={!previousDate || loading} onClick={() => previousDate && void load(previousDate)} aria-label="Previous logged day">←</button>
          <label><span>Selected date</span><input type="date" value={data.selectedDate} onChange={(event) => void load(event.target.value)} /></label>
          <button disabled={!nextDate || loading} onClick={() => nextDate && void load(nextDate)} aria-label="Next logged day">→</button>
        </div>
        <div className="nutrition-quick-dates">
          <button onClick={() => void load(todayLosAngeles())}>Today</button>
          <button onClick={() => void load(shiftDate(todayLosAngeles(), -1))}>Yesterday</button>
          <button disabled={loading} onClick={() => void load(data.selectedDate, true)}>Refresh</button>
        </div>
      </section>

      {error ? <p className="owner-alert">Refresh failed: {error}. Showing the last loaded view.</p> : null}

      <section className="nutrition-overview owner-panel">
        <header className="nutrition-section-heading">
          <div><p className="section-kicker">Daily overview</p><h2>{dateLabel(data.selectedDate)}</h2></div>
          <span className="nutrition-day-status">{data.calories.status}</span>
        </header>

        <div className="nutrition-calorie-cards">
          <article><span>Calories consumed</span><strong>{compactMeasure(data.calories.consumed)} <small>kcal</small></strong><p>{consumed === null ? "Target progress unknown" : `${Math.round(consumed / data.targets.calories * 100)}% of ${wholeNumber.format(data.targets.calories)} target`}</p></article>
          <article><span>Calories burned</span><strong>{compactMeasure(data.calories.burned)} <small>kcal</small></strong><p>Basal {compactMeasure(data.calories.basal)} · Active {compactMeasure(data.calories.active)}</p></article>
          <article className={data.calories.net.value !== null && data.calories.net.value > 0 ? "nutrition-surplus" : "nutrition-deficit"}><span>Net calories</span><strong>{signed(data.calories.net.value)} <small>kcal</small></strong><p>{data.calories.net.value === null ? "Burn data incomplete" : data.calories.net.value > 0 ? "Energy surplus" : data.calories.net.value < 0 ? "Energy deficit" : "Energy balance"}</p></article>
        </div>

        <div className="nutrition-intake-bar-block">
          <div><strong>Daily calorie target</strong><span>{consumed === null ? "Unknown" : `${wholeNumber.format(consumed)} / ${wholeNumber.format(data.targets.calories)} kcal`} · goal delta {signed(data.calories.intakeGoalDelta.value, " kcal")}</span></div>
          <div className="nutrition-segmented-bar" aria-label="Calorie target allocation">
            {consumed !== null ? <span className="nutrition-segment-consumed" style={{ width: `${Math.min(100, consumed / data.targets.calories * 100)}%` }} /> : null}
            {planned !== null && planned > 0 ? <span className="nutrition-segment-planned" style={{ width: `${Math.min(100, planned / data.targets.calories * 100)}%` }} /> : null}
            {remaining !== null && remaining > 0 ? <span className="nutrition-segment-remaining" style={{ width: `${Math.min(100, remaining / data.targets.calories * 100)}%` }} /> : null}
          </div>
          <div className="nutrition-bar-legend"><span><i className="consumed" /> Consumed {consumed === null ? "unknown" : wholeNumber.format(consumed)}</span>{planned !== null && planned > 0 ? <span><i className="planned" /> Planned {wholeNumber.format(planned)}</span> : null}<span><i className="remaining" /> Remaining {remaining === null ? "unknown" : wholeNumber.format(remaining)}</span></div>
        </div>

        {hasDiscrepancy ? <p className="nutrition-reliability-alert">Calorie validation: Nutrition Detail totals {signed(discrepancy, " kcal")} versus Calorie Net. The dashboard keeps Calorie Net as the intake source of truth.</p> : null}
      </section>

      <section className="nutrition-sugar-grid">
        <article className="owner-panel nutrition-sugar-card"><span>Rolling 7-day average</span><strong>{formatMeasure(data.sugar.rolling7.measure, "g/day")}</strong><p className={(data.sugar.rollingReductionPercent ?? 0) >= data.targets.sugarReduction ? "nutrition-on-target" : ""}>{percentage(data.sugar.rollingReductionPercent)} vs September</p><small>{data.sugar.rolling7.recordedDays} of {data.sugar.rolling7.calendarDays} calendar days quantified</small></article>
        <article className="owner-panel nutrition-sugar-card"><span>Average since October 1</span><strong>{formatMeasure(data.sugar.sinceOctober.measure, "g/day")}</strong><p className={(data.sugar.sinceOctoberReductionPercent ?? 0) >= data.targets.sugarReduction ? "nutrition-on-target" : ""}>{percentage(data.sugar.sinceOctoberReductionPercent)} vs September</p><small>{data.sugar.sinceOctober.recordedDays} recorded days</small></article>
        <article className="owner-panel nutrition-sugar-card"><span>September baseline</span><strong>{formatMeasure(data.sugar.september.measure, "g/day")}</strong><p>Goal: at least {data.targets.sugarReduction}% lower</p><small>{data.sugar.september.recordedDays} of {data.sugar.september.calendarDays} calendar days quantified</small></article>
      </section>

      <section className="owner-panel nutrition-history-panel">
        <header className="nutrition-section-heading nutrition-chart-heading"><div><p className="section-kicker">Historical trend</p><h2>{metricConfig[metric].label}</h2></div><div className="nutrition-chart-controls"><label><span>Metric</span><select value={metric} onChange={(event) => setMetric(event.target.value as HistoryMetric)}>{Object.entries(metricConfig).map(([key, config]) => <option key={key} value={key}>{config.label}</option>)}</select></label><label className="nutrition-check"><input type="checkbox" checked={movingAverage} onChange={(event) => setMovingAverage(event.target.checked)} /> 7-day moving average</label></div></header>
        <div className="nutrition-range-tabs" role="group" aria-label="History range">{([['7', 'Last 7 days'], ['30', 'Last 30 days'], ['october', 'Since Oct 1'], ['september', 'September baseline']] as const).map(([value, label]) => <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{label}</button>)}</div>
        <HistoryChart data={history} metric={metric} baseline={data.sugar.september.measure.value} movingAverage={movingAverage} />
        <p className="nutrition-chart-note">Gaps remain gaps; days without quantified data are never plotted as zero. Hollow points are estimates or lower bounds.</p>
      </section>

      <section className="owner-panel nutrition-targets-panel">
        <header className="nutrition-section-heading"><div><p className="section-kicker">Daily progress</p><h2>Targets and reference values</h2></div><label className="nutrition-protein-target"><span>Protein target</span><input type="number" min="1" max="999" value={activeProteinTarget} onChange={(event) => setTarget(Number(event.target.value))} /><b>g</b></label></header>
        <div className="nutrition-target-grid">
          <NutrientProgress label="Protein" measure={data.nutrients.protein} target={activeProteinTarget} unit="g" reference="Personal target" />
          <NutrientProgress label="Fiber" measure={data.nutrients.fiber} target={data.targets.fiber} unit="g" reference="Daily reference" />
          <NutrientProgress label="Saturated fat" measure={data.nutrients.saturatedFat} target={data.targets.saturatedFat} unit="g" reference="10% of calorie target" />
          <NutrientProgress label="Sodium" measure={data.nutrients.sodium} target={data.targets.sodium} unit="mg" reference="Daily reference" />
        </div>
      </section>

      <section className="owner-panel nutrition-breakdown-panel">
        <header className="nutrition-section-heading"><div><p className="section-kicker">Nutrition breakdown</p><h2>Confirmed intake</h2></div><span className="nutrition-quality-count">{data.reliability.confirmedFoodCount} counted foods</span></header>
        {data.reliability.confirmedFoodCount ? <div className="nutrition-table-wrap"><table className="nutrition-table"><thead><tr><th>Category</th><th>Nutrient</th><th>Daily total</th></tr></thead><tbody>{nutrientGroups.flatMap((group) => group.rows.map(([label, key, unit, digits], index) => <tr key={`${group.category}-${label}`} className={index === 0 ? "nutrition-group-start" : ""}><th scope="rowgroup">{index === 0 ? group.category : ""}</th><td>{label}</td><td>{formatMeasure(data.nutrients[key], unit, digits)}</td></tr>))}</tbody></table></div> : <p className="nutrition-empty-state">No confirmed food entries are recorded for this date.</p>}
        <p className="nutrition-table-note">Net carbohydrates = total carbohydrates minus dietary fiber. Sugar alcohols are shown only when a value can be reliably extracted from a note or reference entry.</p>
      </section>

      <section className="owner-panel nutrition-food-panel">
        <header className="nutrition-section-heading"><div><p className="section-kicker">Food log</p><h2>Everything recorded</h2></div><div className="nutrition-food-counts"><span>{data.reliability.confirmedFoodCount} confirmed</span><span>{data.reliability.plannedFoodCount} planned</span><span>{data.reliability.uncountedFoodCount + data.reliability.unknownConsumptionCount} not counted / unknown</span></div></header>
        {data.foods.length ? <div className="nutrition-food-list"><div className="nutrition-food-header"><span>Food</span><span>Calories</span><span>Protein</span><span>Sugar</span><span>Sat. fat</span><span>Quality</span></div>{data.foods.map((food) => <details key={food.id} className={`nutrition-food-row nutrition-food-${food.consumption}`}><summary><span className="nutrition-food-name"><b>{food.name}</b><small>{food.consumption}</small></span><span>{formatMeasure(food.calories, "kcal", 0)}</span><span>{formatMeasure(food.protein, "g")}</span><span>{formatMeasure(food.totalSugar, "g")}</span><span>{formatMeasure(food.saturatedFat, "g")}</span><span className="nutrition-quality-badge">{food.quality}</span></summary><FoodDetails food={food} /></details>)}</div> : <p className="nutrition-empty-state">No food entries are recorded for this date.</p>}
      </section>

      <footer className="nutrition-data-footnote"><p>Updated {new Date(data.generatedAt).toLocaleString("en-US", { timeZone: data.timezone })}. Missing fields remain unknown; restaurant estimates and threshold labels are identified. The source spreadsheet is read-only.</p></footer>
    </div>
  );
}
