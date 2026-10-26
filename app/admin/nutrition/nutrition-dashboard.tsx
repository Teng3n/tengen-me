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
type PrimaryMetric = "protein" | "fiber" | "saturatedFat" | "sodium";
type HistoryDay = { date: string } & Record<HistoryMetric, Measure>;
type SugarAverage = { measure: Measure; recordedDays: number; calendarDays: number };
type DashboardData = {
  generatedAt: string;
  timezone: string;
  selectedDate: string;
  availableDates: string[];
  targets: { calories: number; protein: number; proteinMin: number; proteinMax: number; fiber: number; saturatedFat: number; sodium: number; sugarReduction: number };
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

function shiftMonth(month: string, months: number) {
  const value = new Date(`${month}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 7);
}

function monthDateRange(month: string) {
  const start = `${month}-01`;
  const nextMonth = shiftMonth(month, 1);
  const end = shiftDate(`${nextMonth}-01`, -1);
  return { start, end, days: dateAtNoon(end).getUTCDate() };
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

type RollingMetric = {
  average: number | null;
  previousAverage: number | null;
  recordedDays: number;
  previousRecordedDays: number;
  uncertain: boolean;
  previousUncertain: boolean;
};
const EMPTY_ROLLING: RollingMetric = { average: null, previousAverage: null, recordedDays: 0, previousRecordedDays: 0, uncertain: true, previousUncertain: true };

function rollingMetric(history: HistoryDay[], selectedDate: string, metric: PrimaryMetric, days = 7): RollingMetric {
  const byDate = new Map(history.map((day) => [day.date, day[metric]]));
  const summarize = (start: string) => {
    const measures = Array.from({ length: days }, (_, index) => byDate.get(shiftDate(start, index))).filter((measure): measure is Measure => Boolean(measure) && measure!.value !== null);
    const values = measures.map((measure) => measure.value as number);
    return {
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      recordedDays: values.length,
      uncertain: values.length < days || measures.some((measure) => measure.incomplete || measure.estimated || measure.upperBound === null || Math.abs((measure.upperBound ?? measure.value ?? 0) - (measure.value ?? 0)) > 0.001),
    };
  };
  const current = summarize(shiftDate(selectedDate, -(days - 1)));
  const previous = summarize(shiftDate(selectedDate, -(days * 2 - 1)));
  return { ...current, previousAverage: previous.average, previousRecordedDays: previous.recordedDays, previousUncertain: previous.uncertain };
}

function metricStatus(metric: PrimaryMetric, value: number | null, targets: DashboardData["targets"]) {
  if (value === null) return { label: "Not enough data", tone: "neutral" };
  if (metric === "protein") {
    if (Math.abs(value - targets.protein) < 0.05) return { label: "On Target", tone: "target" };
    if (value >= targets.proteinMin && value <= targets.proteinMax) return { label: "Within Preferred Range", tone: "range" };
    return { label: value < targets.proteinMin ? "Below Preferred Range" : "Above Preferred Range", tone: "neutral" };
  }
  if (metric === "fiber") {
    if (value < 20) return { label: "Below Preferred Intake", tone: "neutral" };
    if (value < 25) return { label: "Building Toward Target", tone: "neutral" };
    if (value < 30) return { label: "Within Starting Range", tone: "range" };
    if (value < 38) return { label: "Practical Target Met", tone: "target" };
    return { label: "Meets Adult Reference", tone: "target" };
  }
  if (metric === "saturatedFat") {
    if (value > 30) return { label: "Higher Intake Day", tone: "neutral" };
    if (value > targets.saturatedFat) return { label: "Above General Reference", tone: "neutral" };
    if (value >= 20) return { label: "Near General Reference", tone: "range" };
    return { label: "Below General Reference", tone: "target" };
  }
  if (value > 3000) return { label: "Higher Sodium Day", tone: "neutral" };
  if (value > targets.sodium) return { label: "Above Reference", tone: "neutral" };
  if (value >= 2000) return { label: "Near Reference", tone: "range" };
  return { label: "Below Reference", tone: "target" };
}

function primaryMetricDetails(metric: PrimaryMetric, targets: DashboardData["targets"]) {
  if (metric === "protein") return { label: "Protein", unit: "g", target: targets.protein, bandStart: targets.proteinMin, bandEnd: targets.proteinMax, reference: `${targets.proteinMin}–${targets.proteinMax} g preferred · ${targets.protein} g suggested`, orientation: "minimum" as const };
  if (metric === "fiber") return { label: "Fiber", unit: "g", target: targets.fiber, bandStart: 25, bandEnd: 40, reference: `${targets.fiber} g practical target · 38 g adult reference`, orientation: "minimum" as const };
  if (metric === "saturatedFat") return { label: "Saturated fat", unit: "g", target: targets.saturatedFat, bandStart: 0, bandEnd: targets.saturatedFat, reference: `<${number.format(targets.saturatedFat)} g general reference · 14 g optional stricter reference`, orientation: "upper" as const };
  return { label: "Sodium", unit: "mg", target: targets.sodium, bandStart: 0, bandEnd: targets.sodium, reference: `<${wholeNumber.format(targets.sodium)} mg general reference · 3,000 mg improvement milestone`, orientation: "upper" as const };
}

function PrimaryNutrientCard({ metric, measure, targets, rolling7, rolling30, period, detail }: { metric: PrimaryMetric; measure: Measure; targets: DashboardData["targets"]; rolling7: RollingMetric; rolling30: RollingMetric; period: "today" | "r7" | "r30"; detail?: string | null }) {
  const config = primaryMetricDetails(metric, targets);
  const periodRolling = period === "r30" ? rolling30 : rolling7;
  const displayMeasure = period === "today" ? measure : { value: periodRolling.average, upperBound: periodRolling.uncertain ? null : periodRolling.average, incomplete: periodRolling.uncertain, estimated: periodRolling.uncertain };
  const value = displayMeasure.value;
  const status = metricStatus(metric, value, targets);
  const plottedValue = displayMeasure.upperBound ?? value ?? 0;
  const fixedScale = metric === "sodium" ? 3300 : metric === "saturatedFat" ? 35 : config.bandEnd * 1.2;
  const scaleMax = Math.max(fixedScale, plottedValue * 1.08, config.target * 1.4, 1);
  const percent = (amount: number) => Math.max(0, Math.min(100, amount / scaleMax * 100));
  const digits = metric === "sodium" ? 0 : 1;
  const minimumDays = period === "r30" ? 15 : 4;
  const change = periodRolling.average !== null && periodRolling.previousAverage !== null && periodRolling.recordedDays >= minimumDays && periodRolling.previousRecordedDays >= minimumDays
    ? periodRolling.average - periodRolling.previousAverage
    : null;
  const contextRolling = period === "today" ? rolling7 : periodRolling;
  const contextValue = period === "today" ? contextRolling.average : contextRolling.previousAverage;
  const contextLabel = period === "today" ? "Rolling 7-day average" : period === "r7" ? "Previous 7-day average" : "Previous 30-day average";
  const contextDays = period === "today" ? contextRolling.recordedDays : contextRolling.previousRecordedDays;
  const contextTotalDays = period === "r30" ? 30 : 7;
  const contextUncertain = period === "today" ? contextRolling.uncertain : contextRolling.previousUncertain;
  const averageLabel = contextValue === null ? "Not enough data" : `${contextUncertain ? "≥" : ""}${digits === 0 ? wholeNumber.format(contextValue) : number.format(contextValue)} ${config.unit}/day`;
  const trendLabel = change === null ? `Prior ${period === "r30" ? "30" : "7"}-day comparison unavailable` : `${change > 0 ? "↑" : change < 0 ? "↓" : "→"} ${digits === 0 ? wholeNumber.format(Math.abs(change)) : number.format(Math.abs(change))} ${config.unit}/day vs prior ${period === "r30" ? "30" : "7"} days`;
  const referenceLabel = value === null ? config.reference : `${wholeNumber.format(value / config.target * 100)}% of reference · ${config.reference}`;
  const periodLabel = period === "today" ? "today" : period === "r7" ? "R7 average" : "R30 average";
  return (
    <article className={`nutrition-target-card nutrition-primary-card nutrition-primary-${config.orientation}`}>
      <div className="nutrition-primary-totals">
        <div><span>{config.label} · {periodLabel}</span><strong>{formatMeasure(displayMeasure, config.unit, digits)}</strong>{period === "today" && detail ? <small>{detail}</small> : <small>{periodRolling.recordedDays} of {period === "r30" ? 30 : 7} days quantified</small>}</div>
        <div><span>{contextLabel}</span><strong>{averageLabel}</strong><small>{contextDays} of {contextTotalDays} days quantified{contextUncertain ? " · estimated / lower bound" : ""}</small></div>
      </div>
      <div className="nutrition-primary-bar" aria-label={`${config.label}: ${formatMeasure(displayMeasure, config.unit, digits)}; reference ${number.format(config.target)} ${config.unit}`}>
        <span className="nutrition-primary-fill" style={{ width: `${percent(plottedValue)}%` }} />
        <span className="nutrition-primary-band" style={{ left: `${percent(config.bandStart)}%`, width: `${percent(config.bandEnd) - percent(config.bandStart)}%` }} />
        <i className="nutrition-primary-target-mark" style={{ left: `${percent(config.target)}%` }} />
        {metric === "saturatedFat" ? <i className="nutrition-primary-secondary-mark" style={{ left: `${percent(14)}%` }} /> : null}
        {metric === "sodium" ? <i className="nutrition-primary-milestone-mark" style={{ left: `${percent(3000)}%` }} /> : null}
        {value !== null ? <b className="nutrition-primary-current-mark" style={{ left: `${percent(plottedValue)}%` }} /> : null}
      </div>
      <div className="nutrition-primary-scale-labels"><span>0 {config.unit}</span><span>{metric === "sodium" ? "2,300 reference · 3,000 milestone" : config.reference}</span><span>{digits === 0 ? wholeNumber.format(scaleMax) : number.format(scaleMax)} {config.unit}</span></div>
      <div className={`nutrition-primary-status nutrition-primary-status-${status.tone}`}><strong>{status.label}</strong><span>{referenceLabel}</span></div>
      <p className="nutrition-primary-trend">{trendLabel}</p>
    </article>
  );
}

function SugarProgressCard({ label, measure, baseline, detail, added = false }: { label: string; measure: Measure; baseline: Measure; detail: string; added?: boolean }) {
  const value = measure.value;
  const baselineValue = baseline.value;
  const plottedValue = measure.upperBound ?? value ?? 0;
  const comparison = added ? baselineValue : baselineValue === null ? null : baselineValue * 0.5;
  const scaleMax = Math.max(plottedValue * 1.08, baseline.upperBound ?? baselineValue ?? 0, 1);
  const percent = (amount: number) => Math.max(0, Math.min(100, amount / scaleMax * 100));
  const comparisonText = added
    ? value === null || baselineValue === null || baselineValue <= 0 ? "Share of total sugar unavailable" : `${wholeNumber.format(value / baselineValue * 100)}% of today's total sugar`
    : baselineValue === null ? "September comparison unavailable" : `${percentage(value === null ? null : (baselineValue - value) / baselineValue * 100)} vs September`;
  return <article className="nutrition-sugar-card nutrition-sugar-progress-card">
    <span>{label}</span>
    <strong>{formatMeasure(measure, added ? "g" : "g/day")}</strong>
    <div className="nutrition-sugar-bar" aria-label={`${label}: ${formatMeasure(measure, "g")}`}>
      <span style={{ width: `${percent(plottedValue)}%` }} />
      {!added && comparison !== null ? <i className="nutrition-sugar-goal" style={{ left: `${percent(comparison)}%` }} /> : null}
      {baselineValue !== null ? <i className={added ? "nutrition-sugar-total-mark" : "nutrition-sugar-baseline-mark"} style={{ left: `${percent(baselineValue)}%` }} /> : null}
      {value !== null ? <b style={{ left: `${percent(plottedValue)}%` }} /> : null}
    </div>
    <p>{comparisonText}</p>
    <small>{detail}</small>
  </article>;
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

const primaryMetricOrder: PrimaryMetric[] = ["protein", "fiber", "saturatedFat", "sodium"];

function DayMetricBars({ day, targets }: { day?: HistoryDay; targets: DashboardData["targets"] }) {
  return <div className="nutrition-day-mini-bars">{primaryMetricOrder.map((metric) => {
    const measure = day?.[metric];
    const config = primaryMetricDetails(metric, targets);
    const value = measure?.upperBound ?? measure?.value ?? null;
    const height = value === null ? 0 : Math.max(5, Math.min(100, value / config.target * 100));
    const uncertain = !measure || measure.value === null || measure.incomplete || measure.estimated || measure.upperBound === null;
    return <span className={`nutrition-day-mini-bar nutrition-day-mini-bar-${metric}${uncertain ? " nutrition-day-mini-bar-uncertain" : ""}`} key={metric} title={`${config.label}: ${measure ? formatMeasure(measure, config.unit, metric === "sodium" ? 0 : 1) : "No entry"}`}><i style={{ height: `${height}%` }} /></span>;
  })}</div>;
}

function MonthlyNutritionCalendar({ data, targets, month, selectedDate, onMonthChange, onSelect }: { data: HistoryDay[]; targets: DashboardData["targets"]; month: string; selectedDate: string; onMonthChange(month: string): void; onSelect(date: string): void }) {
  const range = monthDateRange(month);
  const dates = Array.from({ length: range.days }, (_, index) => shiftDate(range.start, index));
  const byDate = new Map(data.map((day) => [day.date, day]));
  const leadingDays = dateAtNoon(range.start).getUTCDay();
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateAtNoon(range.start));
  return (
    <div className="nutrition-calendar-wrap">
      <div className="nutrition-month-nav"><button onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month">←</button><strong>{monthLabel}</strong><button onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month">→</button></div>
      <div className="nutrition-calendar-legend"><span><i className="protein" /> Protein</span><span><i className="fiber" /> Fiber</span><span><i className="saturated-fat" /> Saturated fat</span><span><i className="sodium" /> Sodium</span><span><b /> Incomplete</span></div>
      <div className="nutrition-calendar-scroll">
        <div className="nutrition-calendar nutrition-calendar-multi" role="grid" aria-label={`${monthLabel} nutrition calendar`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span className="nutrition-calendar-weekday" role="columnheader" key={day}>{day}</span>)}
          {Array.from({ length: leadingDays }, (_, index) => <span className="nutrition-calendar-blank" key={`blank-${index}`} />)}
          {dates.map((date) => {
            const day = byDate.get(date);
            const uncertain = !day || primaryMetricOrder.some((metric) => day[metric].value === null || day[metric].incomplete || day[metric].estimated);
            return <button type="button" role="gridcell" key={date} className={`${date === selectedDate ? "nutrition-calendar-selected " : ""}${uncertain ? "nutrition-calendar-uncertain" : ""}`} onClick={() => onSelect(date)} aria-label={`${dateLabel(date)}${day ? ", nutrition values available" : ", no logged nutrition"}`}><span className="nutrition-calendar-day-number">{dateAtNoon(date).getUTCDate()}</span><DayMetricBars day={day} targets={targets} /></button>;
          })}
        </div>
      </div>
    </div>
  );
}

function NutrientTrendPanel({ data, metric, targets, periodLabel }: { data: HistoryDay[]; metric: PrimaryMetric; targets: DashboardData["targets"]; periodLabel: string }) {
  const config = primaryMetricDetails(metric, targets);
  const points = data.flatMap((day, index) => day[metric].value === null ? [] : [{ index, value: day[metric].value as number, date: day.date, measure: day[metric] }]);
  if (!points.length) return <article className="nutrition-trend-card"><h3>{config.label}</h3><p>No quantified values</p></article>;
  const width = 420; const height = 135; const pad = { left: 12, right: 12, top: 15, bottom: 24 };
  const maxValue = Math.max(...points.map((point) => point.measure.upperBound ?? point.value), config.target, metric === "sodium" ? 3000 : 0, 1) * 1.12;
  const x = (index: number) => pad.left + (data.length <= 1 ? 0 : index / (data.length - 1) * (width - pad.left - pad.right));
  const y = (value: number) => pad.top + (1 - value / maxValue) * (height - pad.top - pad.bottom);
  const segments: Array<typeof points> = [];
  for (const point of points) { const segment = segments.at(-1); if (!segment || segment.at(-1)!.index !== point.index - 1) segments.push([point]); else segment.push(point); }
  return <article className="nutrition-trend-card"><header><h3>{config.label}</h3><span>{config.reference}</span></header><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${periodLabel} ${config.label} trend`}><line x1={pad.left} x2={width - pad.right} y1={y(config.target)} y2={y(config.target)} className="nutrition-trend-reference" />{metric === "sodium" ? <line x1={pad.left} x2={width - pad.right} y1={y(3000)} y2={y(3000)} className="nutrition-trend-milestone" /> : null}{segments.map((segment, index) => segment.length > 1 ? <polyline key={index} points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} className="nutrition-history-line" /> : null)}{points.map((point) => <circle key={point.date} cx={x(point.index)} cy={y(point.value)} r="3"><title>{shortDate(point.date)}: {formatMeasure(point.measure, config.unit, metric === "sodium" ? 0 : 1)}</title></circle>)}<text x={pad.left} y={height - 6}>{shortDate(data[0].date)}</text><text x={width - pad.right} y={height - 6} textAnchor="end">{shortDate(data.at(-1)!.date)}</text></svg></article>;
}

function NutritionTrends({ data, targets, selectedDate, days }: { data: HistoryDay[]; targets: DashboardData["targets"]; selectedDate: string; days: 7 | 30 }) {
  const start = shiftDate(selectedDate, -(days - 1));
  const byDate = new Map(data.map((day) => [day.date, day]));
  const trendDays = Array.from({ length: days }, (_, index) => {
    const date = shiftDate(start, index);
    return byDate.get(date) ?? { date, ...Object.fromEntries(Object.keys(metricConfig).map((metric) => [metric, { value: null, upperBound: null, incomplete: true, estimated: false }])) } as HistoryDay;
  });
  return <div className="nutrition-trend-grid">{primaryMetricOrder.map((metric) => <NutrientTrendPanel key={metric} data={trendDays} metric={metric} targets={targets} periodLabel={`${days}-day`} />)}</div>;
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
  const [historyView, setHistoryView] = useState<"r7" | "r30">("r7");
  const [progressPeriod, setProgressPeriod] = useState<"today" | "r7" | "r30">("today");
  const [calendarMonth, setCalendarMonth] = useState("");

  const load = useCallback(async (date?: string, refresh = false, preserveCalendarMonth = false) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (refresh) params.set("refresh", String(Date.now()));
      const response = await fetch(`/admin/api/nutrition${params.size ? `?${params}` : ""}`, { cache: "no-store" });
      const payload = await response.json() as DashboardData | { error?: string };
      if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Nutrition data could not be loaded");
      const nextData = payload as DashboardData;
      setData(nextData);
      if (!preserveCalendarMonth) setCalendarMonth(nextData.selectedDate.slice(0, 7));
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

  const primaryRolling = useMemo(() => Object.fromEntries(primaryMetricOrder.map((metric) => [metric, data ? rollingMetric(data.history, data.selectedDate, metric) : EMPTY_ROLLING])) as Record<PrimaryMetric, RollingMetric>, [data]);
  const primaryRolling30 = useMemo(() => Object.fromEntries(primaryMetricOrder.map((metric) => [metric, data ? rollingMetric(data.history, data.selectedDate, metric, 30) : EMPTY_ROLLING])) as Record<PrimaryMetric, RollingMetric>, [data]);

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
  const saturatedFatCaloriePercent = consumed !== null && consumed > 0 && data.nutrients.saturatedFat.value !== null
    ? data.nutrients.saturatedFat.value * 9 / consumed * 100
    : null;

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

      {error ? <p className="owner-alert">Refresh failed: {error}. Showing the last loaded view.</p> : null}

      <details className="owner-panel nutrition-calendar-panel" open>
        <summary aria-label="Show or hide calendar"><span aria-hidden="true">⌄</span></summary>
        <MonthlyNutritionCalendar data={data.history} targets={data.targets} month={calendarMonth || data.selectedDate.slice(0, 7)} selectedDate={data.selectedDate} onMonthChange={setCalendarMonth} onSelect={(date) => void load(date, false, true)} />
      </details>

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

      <section className="owner-panel nutrition-targets-panel">
        <header className="nutrition-section-heading"><div><p className="section-kicker">Progress view</p><h2>Targets and reference values</h2></div><div className="nutrition-view-toggle nutrition-period-toggle" role="group" aria-label="Progress period"><button className={progressPeriod === "today" ? "active" : ""} onClick={() => setProgressPeriod("today")}>Today</button><button className={progressPeriod === "r7" ? "active" : ""} onClick={() => setProgressPeriod("r7")}>R7 Average</button><button className={progressPeriod === "r30" ? "active" : ""} onClick={() => setProgressPeriod("r30")}>R30 Average</button></div></header>
        <div className="nutrition-primary-grid">
          <PrimaryNutrientCard metric="protein" measure={data.nutrients.protein} targets={data.targets} rolling7={primaryRolling.protein} rolling30={primaryRolling30.protein} period={progressPeriod} />
          <PrimaryNutrientCard metric="fiber" measure={data.nutrients.fiber} targets={data.targets} rolling7={primaryRolling.fiber} rolling30={primaryRolling30.fiber} period={progressPeriod} detail="Increase gradually according to comfort and tolerance" />
          <PrimaryNutrientCard metric="saturatedFat" measure={data.nutrients.saturatedFat} targets={data.targets} rolling7={primaryRolling.saturatedFat} rolling30={primaryRolling30.saturatedFat} period={progressPeriod} detail={saturatedFatCaloriePercent === null ? "Percent of calories unavailable" : `≈${number.format(saturatedFatCaloriePercent)}% of today's calories`} />
          <PrimaryNutrientCard metric="sodium" measure={data.nutrients.sodium} targets={data.targets} rolling7={primaryRolling.sodium} rolling30={primaryRolling30.sodium} period={progressPeriod} detail={data.nutrients.sodium.value === null ? null : `${signed(data.nutrients.sodium.value - data.targets.sodium, " mg")} versus 2,300 mg reference`} />
        </div>
      </section>

      <section className="owner-panel nutrition-sugar-section">
        <header className="nutrition-section-heading"><div><p className="section-kicker">Sugar trends</p><h2>Total and added sugar</h2></div><span className="nutrition-quality-count">Naturally occurring and added sugar remain separate</span></header>
        <div className="nutrition-sugar-grid">
          <SugarProgressCard label="Total sugar · R7 average" measure={data.sugar.rolling7.measure} baseline={data.sugar.september.measure} detail={`${data.sugar.rolling7.recordedDays} of ${data.sugar.rolling7.calendarDays} calendar days quantified`} />
          <SugarProgressCard label="Total sugar · since October 1" measure={data.sugar.sinceOctober.measure} baseline={data.sugar.september.measure} detail={`${data.sugar.sinceOctober.recordedDays} recorded days`} />
          <SugarProgressCard label="September baseline" measure={data.sugar.september.measure} baseline={data.sugar.september.measure} detail={`${data.targets.sugarReduction}% reduction reference · ${data.sugar.september.recordedDays} days quantified`} />
          <SugarProgressCard label="Added sugar today" measure={data.nutrients.addedSugar} baseline={data.nutrients.totalSugar} detail="Informational subset of total sugar; missing label data is not zero" added />
        </div>
      </section>

      <section className="owner-panel nutrition-history-panel">
        <header className="nutrition-section-heading nutrition-chart-heading"><div><p className="section-kicker">Nutrient graphs</p><h2>{historyView === "r7" ? "Seven-day trends" : "Rolling 30-day trends"}</h2></div><div className="nutrition-view-toggle" role="group" aria-label="Graph range"><button className={historyView === "r7" ? "active" : ""} onClick={() => setHistoryView("r7")}>7 Days</button><button className={historyView === "r30" ? "active" : ""} onClick={() => setHistoryView("r30")}>30 Days</button></div></header>
        <NutritionTrends data={data.history} targets={data.targets} selectedDate={data.selectedDate} days={historyView === "r7" ? 7 : 30} />
        <p className="nutrition-chart-note">Protein, fiber, saturated fat, and sodium stay visible together. Missing days remain gaps rather than being interpreted as zero.</p>
      </section>

      <section className="owner-panel nutrition-breakdown-panel">
        <header className="nutrition-section-heading"><div><p className="section-kicker">Nutrition breakdown</p><h2>Confirmed intake</h2></div><span className="nutrition-quality-count">{data.reliability.confirmedFoodCount} counted foods</span></header>
        {data.reliability.confirmedFoodCount ? <div className="nutrition-table-wrap"><table className="nutrition-table"><thead><tr><th>Category</th><th>Nutrient</th><th>Daily total</th></tr></thead><tbody>{nutrientGroups.flatMap((group) => group.rows.map(([label, key, unit, digits], index) => <tr key={`${group.category}-${label}`} className={index === 0 ? "nutrition-group-start" : ""}><th scope="rowgroup">{index === 0 ? group.category : ""}</th><td>{label}</td><td>{formatMeasure(data.nutrients[key], unit, digits)}</td></tr>))}</tbody></table></div> : <p className="nutrition-empty-state">No confirmed food entries are recorded for this date.</p>}
        <p className="nutrition-table-note">Net carbohydrates = total carbohydrates minus dietary fiber. Sugar alcohols are shown only when a value can be reliably extracted from a note or reference entry.</p>
      </section>

      <section className="owner-panel nutrition-food-panel">
        <header className="nutrition-section-heading"><div><p className="section-kicker">Food log</p><h2>Everything recorded</h2></div><div className="nutrition-food-counts"><span>{data.reliability.confirmedFoodCount} confirmed</span><span>{data.reliability.plannedFoodCount} planned</span><span>{data.reliability.uncountedFoodCount + data.reliability.unknownConsumptionCount} not counted / unknown</span></div></header>
        {data.foods.length ? <div className="nutrition-food-list"><div className="nutrition-food-header"><span>Food</span><span>Calories</span><span>Protein</span><span>Sugar</span><span>Sat. fat</span><span>Quality</span></div>{data.foods.map((food) => <details key={food.id} className={`nutrition-food-row nutrition-food-${food.consumption}`}><summary><span className="nutrition-food-name"><b>{food.name}</b><small>{food.consumption}</small></span><span className="nutrition-food-metric" data-label="Calories">{formatMeasure(food.calories, "kcal", 0)}</span><span className="nutrition-food-metric" data-label="Protein">{formatMeasure(food.protein, "g")}</span><span className="nutrition-food-metric" data-label="Sugar">{formatMeasure(food.totalSugar, "g")}</span><span className="nutrition-food-metric" data-label="Sat. fat">{formatMeasure(food.saturatedFat, "g")}</span><span className="nutrition-quality-badge">{food.quality}</span></summary><FoodDetails food={food} /></details>)}</div> : <p className="nutrition-empty-state">No food entries are recorded for this date.</p>}
      </section>

      <footer className="nutrition-data-footnote"><p>Updated {new Date(data.generatedAt).toLocaleString("en-US", { timeZone: data.timezone })}. Missing fields remain unknown; restaurant estimates and threshold labels are identified. The source spreadsheet is read-only.</p></footer>
    </div>
  );
}
