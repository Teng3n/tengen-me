import type { OwnerDatabase } from "./owner-data";

const METER_KEY = "apu-main";
const CURRENT_CYCLE_START = "2026-06-20";
const CURRENT_CYCLE_END = "2026-08-20";
const AC_FULL_TRACKING_START = "2026-07-25";
const HISTORY_START = "2024-01-01";
const ELECTRICITY_CACHE_MS = 15 * 60 * 1000;

const domesticRates = {
  monthlyCustomerCharge: 8,
  lifelineDailyKwh: 10,
  lifelineRate: 0.14,
  aboveLifelineRate: 0.2149,
  undergroundSurcharge: 0.04,
  powerCostAdjustment: 0.01,
  environmentalMitigationAdjustment: 0.0055,
  stateEnergySurcharge: 0.0003,
};

const completedCycles = [
  { label: "Aug '25", start: "2025-06-19", end: "2025-08-18" },
  { label: "Oct '25", start: "2025-08-19", end: "2025-10-16" },
  { label: "Dec '25", start: "2025-10-17", end: "2025-12-18" },
  { label: "Feb '26", start: "2025-12-19", end: "2026-02-20" },
  { label: "Apr '26", start: "2026-02-21", end: "2026-04-21" },
  { label: "Jun '26", start: "2026-04-22", end: "2026-06-19" },
] as const;

type DailyElectricityRow = {
  local_date: string;
  total_kwh: number;
};

type DailyCoolingRow = {
  local_date: string;
  cooling_runtime_seconds: number;
};

type MonthlyElectricityRow = {
  month: string;
  usage_kwh: number;
  covered_days: number;
  first_date: string;
  last_date: string;
};

type UtilityBillRow = {
  period_start: string;
  period_end: string;
  delivered_kwh: number;
  exported_solar_kwh: number | null;
  solar_bank_kwh: number | null;
  electric_cost: number | null;
  cost_kind: "actual" | "modeled";
  source: string;
};

export type ElectricityAnalytics = {
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
    usageKind: "measured" | "forecast";
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
  methodology: {
    forecast: string;
    cost: string;
    ac: string;
    solar: string;
  };
};

let cachedAnalytics: { expiresAt: number; value: ElectricityAnalytics } | null = null;
let pendingAnalytics: Promise<ElectricityAnalytics | null> | null = null;

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function dateValue(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}

function inclusiveDays(start: string, end: string) {
  return Math.round((dateValue(end) - dateValue(start)) / 86_400_000) + 1;
}

function priorYearDate(date: string) {
  return `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
}

function shiftDate(date: string, days: number) {
  return new Date(dateValue(date) + days * 86_400_000).toISOString().slice(0, 10);
}

function averageRange(rows: DailyElectricityRow[], start: string, end: string) {
  const matchingRows = rows.filter((row) => row.local_date >= start && row.local_date <= end);
  if (!matchingRows.length) return null;
  return matchingRows.reduce((total, row) => total + row.total_kwh, 0) / matchingRows.length;
}

function percentChange(current: number, comparison: number | null) {
  if (comparison === null || comparison <= 0) return null;
  return round(((current / comparison) - 1) * 100, 1);
}

function sumRange(rows: DailyElectricityRow[], start: string, end: string) {
  return rows.reduce(
    (total, row) => total + (row.local_date >= start && row.local_date <= end ? row.total_kwh : 0),
    0,
  );
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));
}

function billLabel(periodEnd: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(`${periodEnd}T00:00:00Z`));
}

function calendarDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
}

function standardDomesticCost(kwh: number, serviceDays: number) {
  const safeKwh = Math.max(0, kwh);
  const safeDays = Math.max(1, serviceDays);
  const lifelineKwh = Math.min(safeKwh, safeDays * domesticRates.lifelineDailyKwh);
  const aboveLifelineKwh = Math.max(0, safeKwh - lifelineKwh);
  const customerCharge = round(domesticRates.monthlyCustomerCharge / 30 * safeDays);
  const lifelineCharge = round(lifelineKwh * domesticRates.lifelineRate);
  const aboveLifelineCharge = round(aboveLifelineKwh * domesticRates.aboveLifelineRate);
  const undergroundCharge = round(
    (customerCharge + lifelineCharge + aboveLifelineCharge) * domesticRates.undergroundSurcharge,
  );
  const powerCostAdjustment = round(aboveLifelineKwh * domesticRates.powerCostAdjustment);
  const environmentalAdjustment = round(safeKwh * domesticRates.environmentalMitigationAdjustment);
  const stateSurcharge = round(safeKwh * domesticRates.stateEnergySurcharge);
  return {
    total: round(
      customerCharge
      + lifelineCharge
      + aboveLifelineCharge
      + undergroundCharge
      + powerCostAdjustment
      + environmentalAdjustment
      + stateSurcharge,
    ),
    lifelineKwh,
    aboveLifelineKwh,
  };
}

function fitAcUsage(
  rows: DailyElectricityRow[],
  coolingByDate: Map<string, number>,
) {
  const samples = rows.flatMap((row) => {
    const coolingHours = coolingByDate.get(row.local_date);
    return coolingHours === undefined ? [] : [{ totalKwh: row.total_kwh, coolingHours }];
  });
  if (samples.length < 3) return null;

  const meanHours = samples.reduce((sum, sample) => sum + sample.coolingHours, 0) / samples.length;
  const meanKwh = samples.reduce((sum, sample) => sum + sample.totalKwh, 0) / samples.length;
  const hoursVariance = samples.reduce(
    (sum, sample) => sum + (sample.coolingHours - meanHours) ** 2,
    0,
  );
  if (hoursVariance <= 0) return null;

  const covariance = samples.reduce(
    (sum, sample) => sum + (sample.coolingHours - meanHours) * (sample.totalKwh - meanKwh),
    0,
  );
  const kwhPerRuntimeHour = Math.max(0, covariance / hoursVariance);
  const regressionBaseline = Math.max(0, meanKwh - kwhPerRuntimeHour * meanHours);
  const lowCoolingDays = samples
    .filter((sample) => sample.coolingHours <= 0.5)
    .map((sample) => sample.totalKwh)
    .sort((left, right) => left - right);
  const lowCoolingBaseline = lowCoolingDays.length
    ? lowCoolingDays[Math.floor(lowCoolingDays.length / 2)]!
    : regressionBaseline;
  const baselineDailyKwh = lowCoolingDays.length >= 3
    ? lowCoolingBaseline
    : (regressionBaseline + lowCoolingBaseline) / 2;

  const residualSumSquares = samples.reduce((sum, sample) => {
    const predicted = regressionBaseline + kwhPerRuntimeHour * sample.coolingHours;
    return sum + (sample.totalKwh - predicted) ** 2;
  }, 0);
  const totalSumSquares = samples.reduce(
    (sum, sample) => sum + (sample.totalKwh - meanKwh) ** 2,
    0,
  );
  const modelFit = totalSumSquares > 0 ? Math.max(0, 1 - residualSumSquares / totalSumSquares) : 0;
  const slopeStandardError = samples.length > 2
    ? Math.sqrt(residualSumSquares / (samples.length - 2) / hoursVariance)
    : kwhPerRuntimeHour;
  const totalCoolingHours = samples.reduce((sum, sample) => sum + sample.coolingHours, 0);
  const estimatedKwh = kwhPerRuntimeHour * totalCoolingHours;
  const estimatedKwhLow = Math.max(0, kwhPerRuntimeHour - 1.96 * slopeStandardError) * totalCoolingHours;
  const estimatedKwhHigh = (kwhPerRuntimeHour + 1.96 * slopeStandardError) * totalCoolingHours;
  const confidence = samples.length >= 14 && modelFit >= 0.65
    ? "high"
    : samples.length >= 7 && modelFit >= 0.35 ? "medium" : "low";

  return {
    trackedDays: samples.length,
    totalCoolingHours,
    baselineDailyKwh,
    kwhPerRuntimeHour,
    modelFit,
    estimatedKwh,
    estimatedKwhLow,
    estimatedKwhHigh,
    confidence,
  } as const;
}

async function loadBillHistory(ownerDb: OwnerDatabase | undefined) {
  if (!ownerDb) return [] as UtilityBillRow[];
  try {
    const result = await ownerDb.prepare(
      `SELECT period_start, period_end, delivered_kwh, exported_solar_kwh, solar_bank_kwh,
              electric_cost, cost_kind, source
       FROM utility_bill_history
       ORDER BY period_end`,
    ).all<UtilityBillRow>();
    return result.results;
  } catch {
    return [] as UtilityBillRow[];
  }
}

async function loadElectricityAnalytics(
  householdDb: OwnerDatabase,
  ownerDb: OwnerDatabase | undefined,
): Promise<ElectricityAnalytics | null> {
  const [dailyResult, monthlyResult, coolingResult, storedBills] = await Promise.all([
    householdDb.prepare(
      `SELECT local_date, total_kwh
       FROM electricity_daily_statistics
       WHERE meter_key = ? AND local_date >= ?
       ORDER BY local_date`,
    ).bind(METER_KEY, HISTORY_START).all<DailyElectricityRow>(),
    householdDb.prepare(
      `SELECT substr(local_date, 1, 7) AS month,
              SUM(total_kwh) AS usage_kwh,
              COUNT(*) AS covered_days,
              MIN(local_date) AS first_date,
              MAX(local_date) AS last_date
       FROM electricity_daily_statistics
       WHERE meter_key = ? AND local_date >= ?
       GROUP BY substr(local_date, 1, 7)
       ORDER BY month`,
    ).bind(METER_KEY, HISTORY_START).all<MonthlyElectricityRow>(),
    householdDb.prepare(
      `SELECT local_date, SUM(cooling_runtime_seconds) AS cooling_runtime_seconds
       FROM daily_statistics
       WHERE local_date BETWEEN ? AND ?
       GROUP BY local_date
       ORDER BY local_date`,
    ).bind(AC_FULL_TRACKING_START, CURRENT_CYCLE_END).all<DailyCoolingRow>(),
    loadBillHistory(ownerDb),
  ]);

  const currentRows = dailyResult.results.filter(
    (row) => row.local_date >= CURRENT_CYCLE_START && row.local_date <= CURRENT_CYCLE_END,
  );
  if (!currentRows.length) return null;

  const asOfDate = currentRows.at(-1)!.local_date;
  const latestMeterDate = dailyResult.results.at(-1)!.local_date;
  const usageToDateKwh = currentRows.reduce((total, row) => total + row.total_kwh, 0);
  const daysElapsed = currentRows.length;
  const totalDays = inclusiveDays(CURRENT_CYCLE_START, CURRENT_CYCLE_END);
  const daysRemaining = Math.max(0, totalDays - daysElapsed);
  const recentRows = currentRows.slice(-Math.min(14, currentRows.length));
  const recentDailyKwh = recentRows.reduce((total, row) => total + row.total_kwh, 0) / recentRows.length;
  const projectedKwh = usageToDateKwh + recentDailyKwh * daysRemaining;

  const fallbackCycleTotals = completedCycles.map((cycle) => ({
    ...cycle,
    kwh: sumRange(dailyResult.results, cycle.start, cycle.end),
  }));
  const previousStoredBill = storedBills.filter((bill) => bill.period_end <= CURRENT_CYCLE_START).at(-1);
  const previousSummerStoredBill = storedBills.find((bill) => bill.period_end === "2025-08-18");
  const previousBillKwh = previousStoredBill?.delivered_kwh || fallbackCycleTotals.at(-1)!.kwh;
  const previousBillDays = previousStoredBill
    ? Math.max(1, inclusiveDays(previousStoredBill.period_start, previousStoredBill.period_end))
    : inclusiveDays(fallbackCycleTotals.at(-1)!.start, fallbackCycleTotals.at(-1)!.end);
  const previousSummerBillKwh = previousSummerStoredBill?.delivered_kwh || fallbackCycleTotals[0]!.kwh;

  const projectedCost = standardDomesticCost(projectedKwh, 60);
  const estimatedServiceDaysToDate = Math.max(1, Math.round(daysElapsed / totalDays * 60));
  const grossToDate = standardDomesticCost(usageToDateKwh, estimatedServiceDaysToDate).total;

  const coolingByDate = new Map(
    coolingResult.results.map((row) => [row.local_date, row.cooling_runtime_seconds / 3600]),
  );
  const trackedRows = currentRows.filter((row) => row.local_date >= AC_FULL_TRACKING_START);
  const acModel = fitAcUsage(trackedRows, coolingByDate);
  const trackedCoolingHours = acModel?.totalCoolingHours ?? 0;
  const trackedUsageKwh = trackedRows.reduce((total, row) => total + row.total_kwh, 0);
  const midpoint = Math.max(1, Math.floor(trackedRows.length / 2));
  const earlierRows = trackedRows.slice(0, midpoint);
  const recentTrackedRows = trackedRows.slice(-midpoint);
  const averageCoolingHours = (rows: DailyElectricityRow[]) => rows.length
    ? rows.reduce((total, row) => total + (coolingByDate.get(row.local_date) ?? 0), 0) / rows.length
    : 0;
  const earlierCoolingAverage = averageCoolingHours(earlierRows);
  const recentCoolingAverage = averageCoolingHours(recentTrackedRows);
  const recentTrendPercent = earlierCoolingAverage > 0
    ? ((recentCoolingAverage / earlierCoolingAverage) - 1) * 100
    : 0;
  const acTrend = recentTrendPercent > 15 ? "spiking" : recentTrendPercent < -10 ? "easing" : "steady";
  const estimatedAcKwh = acModel?.estimatedKwh ?? 0;
  const marginalAcRate = domesticRates.aboveLifelineRate * (1 + domesticRates.undergroundSurcharge)
    + domesticRates.powerCostAdjustment
    + domesticRates.environmentalMitigationAdjustment
    + domesticRates.stateEnergySurcharge;
  const trackedAcShare = trackedUsageKwh > 0 ? estimatedAcKwh / trackedUsageKwh : 0;
  const trackedAcShareLow = trackedUsageKwh > 0 ? (acModel?.estimatedKwhLow ?? 0) / trackedUsageKwh : 0;
  const trackedAcShareHigh = trackedUsageKwh > 0 ? (acModel?.estimatedKwhHigh ?? 0) / trackedUsageKwh : 0;
  const projectedCycleAcKwh = projectedKwh * Math.min(1, trackedAcShare);
  const projectedCycleAcKwhLow = projectedKwh * Math.min(1, trackedAcShareLow);
  const projectedCycleAcKwhHigh = projectedKwh * Math.min(1, trackedAcShareHigh);
  const hasFullCycleTracking = AC_FULL_TRACKING_START <= CURRENT_CYCLE_START
    && (acModel?.trackedDays ?? 0) >= daysElapsed;

  const projectionVsPreviousBillPercent = ((projectedKwh / previousBillKwh) - 1) * 100;
  const risk = projectionVsPreviousBillPercent >= 50
    ? "high"
    : projectionVsPreviousBillPercent >= 15 ? "elevated" : "normal";

  const priorYearByDate = new Map(
    dailyResult.results.map((row) => [row.local_date, row.total_kwh]),
  );
  const allMonthly = monthlyResult.results.map((row) => {
    const expectedDays = calendarDays(row.month);
    const partial = row.first_date !== `${row.month}-01`
      || row.covered_days < expectedDays
      || row.last_date > asOfDate;
    const modeledServiceDays = partial ? Math.max(1, row.covered_days) : 30;
    return {
      month: row.month,
      label: monthLabel(row.month),
      usageKwh: round(row.usage_kwh),
      modeledCost: standardDomesticCost(row.usage_kwh, modeledServiceDays).total,
      coveredDays: row.covered_days,
      partial,
    };
  });
  const monthly = allMonthly.slice(-18);
  const latestYear = Number(latestMeterDate.slice(0, 4));
  const comparisonYears = Array.from({ length: 4 }, (_, index) => latestYear - index)
    .filter((year) => dailyResult.results.some((row) => row.local_date.startsWith(`${year}-`)));
  const yearlyDaily = comparisonYears.map((year) => ({
    year,
    days: dailyResult.results
      .filter((row) => row.local_date.startsWith(`${year}-`))
      .map((row) => ({ date: row.local_date, kwh: round(row.total_kwh) })),
  }));
  const yearlyMonthly = comparisonYears.map((year) => ({
    year,
    months: allMonthly
      .filter((row) => row.month.startsWith(`${year}-`))
      .map((row) => ({
        month: row.month,
        monthIndex: Number(row.month.slice(5, 7)) - 1,
        usageKwh: row.usageKwh,
        coveredDays: row.coveredDays,
        partial: row.partial,
      })),
  }));
  const storedCurrentBill = storedBills.find((bill) => bill.period_end === CURRENT_CYCLE_END) ?? null;
  const billingHistory: ElectricityAnalytics["billingHistory"] = [
    ...storedBills.filter((bill) => bill.period_end !== CURRENT_CYCLE_END).map((bill) => ({
      periodStart: bill.period_start,
      periodEnd: bill.period_end,
      label: billLabel(bill.period_end),
      usageKwh: round(bill.delivered_kwh),
      usageKind: "measured",
      electricCost: round(bill.electric_cost ?? standardDomesticCost(bill.delivered_kwh, 60).total),
      costKind: bill.cost_kind,
      exportedSolarKwh: bill.exported_solar_kwh === null ? null : round(bill.exported_solar_kwh),
      solarBankKwh: bill.solar_bank_kwh === null ? null : round(bill.solar_bank_kwh),
      source: bill.source,
    })),
    {
      periodStart: CURRENT_CYCLE_START,
      periodEnd: CURRENT_CYCLE_END,
      label: billLabel(CURRENT_CYCLE_END),
      usageKwh: round(daysRemaining === 0 ? usageToDateKwh : projectedKwh),
      usageKind: daysRemaining === 0 ? "measured" : "forecast",
      electricCost: round(storedCurrentBill?.electric_cost ?? projectedCost.total),
      costKind: storedCurrentBill?.electric_cost !== null && storedCurrentBill?.electric_cost !== undefined
        ? storedCurrentBill.cost_kind
        : daysRemaining === 0 ? "modeled" : "forecast",
      exportedSolarKwh: storedCurrentBill?.exported_solar_kwh === null || storedCurrentBill?.exported_solar_kwh === undefined
        ? null
        : round(storedCurrentBill.exported_solar_kwh),
      solarBankKwh: storedCurrentBill?.solar_bank_kwh === null || storedCurrentBill?.solar_bank_kwh === undefined
        ? null
        : round(storedCurrentBill.solar_bank_kwh),
      source: storedCurrentBill?.source ?? (daysRemaining === 0 ? "SmartStats measured billing-period usage" : "SmartStats forecast"),
    },
  ];
  const solarHistory = storedBills.flatMap((bill) => {
    if (bill.exported_solar_kwh === null || bill.solar_bank_kwh === null) return [];
    return [{
      periodEnd: bill.period_end,
      label: billLabel(bill.period_end),
      exportedKwh: round(bill.exported_solar_kwh),
      bankKwh: round(bill.solar_bank_kwh),
    }];
  });
  const latestSolarBill = storedBills.filter((bill) => bill.solar_bank_kwh !== null).at(-1) ?? null;

  const currentMonthStart = `${latestMeterDate.slice(0, 7)}-01`;
  const previousMonthEnd = shiftDate(currentMonthStart, -1);
  const previousMonthStart = `${previousMonthEnd.slice(0, 7)}-01`;
  const priorYearMonthStart = priorYearDate(currentMonthStart);
  const priorYearMonthEnd = priorYearDate(latestMeterDate);
  const currentMonthRows = dailyResult.results.filter(
    (row) => row.local_date >= currentMonthStart && row.local_date <= latestMeterDate,
  );
  const currentMonthTotal = currentMonthRows.reduce((total, row) => total + row.total_kwh, 0);
  const currentMonthAverage = currentMonthTotal / currentMonthRows.length;
  const previousMonthAverage = averageRange(dailyResult.results, previousMonthStart, previousMonthEnd);
  const priorYearMonthAverage = averageRange(dailyResult.results, priorYearMonthStart, priorYearMonthEnd);

  const isNewBillingPeriod = latestMeterDate > CURRENT_CYCLE_END;
  const activeBillingStart = isNewBillingPeriod ? shiftDate(CURRENT_CYCLE_END, 1) : CURRENT_CYCLE_START;
  const activeBillingExpectedEnd = isNewBillingPeriod ? shiftDate(activeBillingStart, 59) : CURRENT_CYCLE_END;
  const activeBillingRows = dailyResult.results.filter(
    (row) => row.local_date >= activeBillingStart && row.local_date <= latestMeterDate,
  );
  const activeBillingTotal = activeBillingRows.reduce((total, row) => total + row.total_kwh, 0);
  const activeBillingAverage = activeBillingTotal / activeBillingRows.length;
  const previousBillingStart = isNewBillingPeriod ? CURRENT_CYCLE_START : completedCycles.at(-1)!.start;
  const previousBillingEnd = isNewBillingPeriod ? CURRENT_CYCLE_END : completedCycles.at(-1)!.end;
  const previousBillingAverage = averageRange(dailyResult.results, previousBillingStart, previousBillingEnd);
  const priorYearBillingAnchor = priorYearDate(activeBillingStart);
  const matchingPriorYearCycle = completedCycles.find(
    (cycle) => cycle.start <= priorYearBillingAnchor && cycle.end >= priorYearBillingAnchor,
  ) ?? completedCycles[0];
  const priorYearBillingStart = matchingPriorYearCycle.start;
  const priorYearBillingEnd = shiftDate(priorYearBillingStart, Math.max(0, activeBillingRows.length - 1));
  const priorYearBillingAverage = averageRange(
    dailyResult.results,
    priorYearBillingStart,
    priorYearBillingEnd,
  );

  return {
    asOfDate,
    cycle: {
      start: CURRENT_CYCLE_START,
      expectedEnd: CURRENT_CYCLE_END,
      daysElapsed,
      daysRemaining,
      totalDays,
      usageToDateKwh: round(usageToDateKwh),
      averageDailyKwh: round(usageToDateKwh / daysElapsed),
      projectedKwh: round(projectedKwh),
      previousBillKwh: round(previousBillKwh),
      previousBillAverageDailyKwh: round(previousBillKwh / previousBillDays),
      previousSummerBillKwh: round(previousSummerBillKwh),
      projectedVsPreviousBillPercent: round(projectionVsPreviousBillPercent, 1),
      projectedVsPreviousSummerPercent: round(((projectedKwh / previousSummerBillKwh) - 1) * 100, 1),
      usageToDateVsPreviousBillPercent: round(((usageToDateKwh / previousBillKwh) - 1) * 100, 1),
      risk,
      riskLabel: risk === "high" ? "Likely much higher" : risk === "elevated" ? "Trending higher" : "Near recent range",
    },
    cost: {
      grossToDate,
      projectedGross: projectedCost.total,
      lifelineKwh: round(projectedCost.lifelineKwh),
      aboveLifelineKwh: round(projectedCost.aboveLifelineKwh),
      lifelineRate: domesticRates.lifelineRate,
      aboveLifelineRate: domesticRates.aboveLifelineRate,
      ratePlan: "Standard Domestic",
      solarCreditsIncluded: false,
    },
    ac: acModel ? {
      availableFrom: AC_FULL_TRACKING_START,
      trackedDays: acModel.trackedDays,
      runtimeHours: round(trackedCoolingHours, 1),
      estimatedKwh: round(projectedCycleAcKwh),
      estimatedKwhLow: round(projectedCycleAcKwhLow),
      estimatedKwhHigh: round(projectedCycleAcKwhHigh),
      estimatedCost: round(projectedCycleAcKwh * marginalAcRate),
      estimatedCostLow: round(projectedCycleAcKwhLow * marginalAcRate),
      estimatedCostHigh: round(projectedCycleAcKwhHigh * marginalAcRate),
      baselineDailyKwh: round(acModel.baselineDailyKwh, 1),
      kwhPerRuntimeHour: round(acModel.kwhPerRuntimeHour, 2),
      modelFitPercent: round(acModel.modelFit * 100, 1),
      confidence: acModel.confidence,
      confidenceLabel: hasFullCycleTracking
        ? `${acModel.confidence[0]!.toUpperCase()}${acModel.confidence.slice(1)} confidence`
        : "Partial-cycle extrapolation",
      trackingCoveragePercent: round((acModel.trackedDays / totalDays) * 100, 1),
      fullCycleEstimate: true,
      shareOfTrackedUsagePercent: round(trackedAcShare * 100, 1),
      recentTrendPercent: round(recentTrendPercent, 1),
      trend: acTrend,
      trendLabel: acTrend === "spiking" ? "Recent AC spike" : acTrend === "easing" ? "AC use is easing" : "AC use is steady",
    } : null,
    trends: {
      asOfDate: latestMeterDate,
      month: {
        start: currentMonthStart,
        end: latestMeterDate,
        daysElapsed: currentMonthRows.length,
        totalKwh: round(currentMonthTotal),
        dailyAverageKwh: round(currentMonthAverage, 1),
        previousPeriodStart: previousMonthStart,
        previousPeriodEnd: previousMonthEnd,
        previousPeriodDailyAverageKwh: previousMonthAverage === null ? null : round(previousMonthAverage, 1),
        vsPreviousPeriodPercent: percentChange(currentMonthAverage, previousMonthAverage),
        priorYearStart: priorYearMonthStart,
        priorYearEnd: priorYearMonthEnd,
        priorYearDailyAverageKwh: priorYearMonthAverage === null ? null : round(priorYearMonthAverage, 1),
        vsPriorYearPercent: percentChange(currentMonthAverage, priorYearMonthAverage),
      },
      billingPeriod: {
        start: activeBillingStart,
        end: latestMeterDate,
        expectedEnd: activeBillingExpectedEnd,
        daysElapsed: activeBillingRows.length,
        totalDays: inclusiveDays(activeBillingStart, activeBillingExpectedEnd),
        totalKwh: round(activeBillingTotal),
        dailyAverageKwh: round(activeBillingAverage, 1),
        projectedKwh: round(activeBillingAverage * inclusiveDays(activeBillingStart, activeBillingExpectedEnd)),
        previousPeriodStart: previousBillingStart,
        previousPeriodEnd: previousBillingEnd,
        previousPeriodDailyAverageKwh: previousBillingAverage === null ? null : round(previousBillingAverage, 1),
        vsPreviousPeriodPercent: percentChange(activeBillingAverage, previousBillingAverage),
        priorYearStart: priorYearBillingStart,
        priorYearEnd: priorYearBillingEnd,
        priorYearDailyAverageKwh: priorYearBillingAverage === null ? null : round(priorYearBillingAverage, 1),
        vsPriorYearPercent: percentChange(activeBillingAverage, priorYearBillingAverage),
      },
    },
    daily: currentRows.map((row) => ({
      date: row.local_date,
      kwh: round(row.total_kwh),
      previousYearKwh: priorYearByDate.has(priorYearDate(row.local_date))
        ? round(priorYearByDate.get(priorYearDate(row.local_date))!)
        : null,
      coolingHours: coolingByDate.has(row.local_date)
        ? round(coolingByDate.get(row.local_date)!, 2)
        : null,
    })),
    yearlyDaily,
    monthly,
    yearlyMonthly,
    billingHistory,
    solar: {
      latestBankKwh: latestSolarBill?.solar_bank_kwh ?? null,
      asOfDate: latestSolarBill?.period_end ?? null,
      source: latestSolarBill?.source ?? null,
      appliedToCosts: false,
      history: solarHistory,
    },
    methodology: {
      forecast: daysRemaining === 0
        ? `Billing-period usage is a completed SmartStats meter total through ${asOfDate}.`
        : `Actual usage through ${asOfDate}, plus the most recent ${recentRows.length}-day average for the ${daysRemaining} remaining days.`,
      cost: "Anaheim Standard Domestic calculator logic: a 60-day bimonthly customer charge and lifeline allowance, basic and above-lifeline energy charges, underground surcharge, PCA, EMA, and California energy surcharge. Solar is never deducted.",
      ac: `Nest runtime is complete beginning July 25, 2026, so this billing cycle uses a full-cycle extrapolation rather than displaying the tracked-period subtotal. Matched whole-home meter use is regressed against runtime to learn a ${round(acModel?.baselineDailyKwh ?? 0, 1)} kWh/day non-AC baseline and an AC share of tracked electricity. That share and its 95% model interval are applied to the projected ${round(projectedKwh)} kWh cycle, then priced at the Standard Domestic above-lifeline marginal rate. The next billing cycle will have complete APU and Nest coverage from day one.`,
      solar: "Exported solar and bank balances come from the Utilities workbook through April 21, 2026. The current SmartStats importer does not yet extract received energy or the bank, so later bank values remain unknown until another bill or spreadsheet update is added.",
    },
  };
}

export async function getElectricityAnalytics(
  householdDb: OwnerDatabase | undefined,
  ownerDb?: OwnerDatabase,
) {
  if (!householdDb) return null;
  if (cachedAnalytics && cachedAnalytics.expiresAt > Date.now()) return cachedAnalytics.value;
  if (pendingAnalytics) return pendingAnalytics;

  pendingAnalytics = loadElectricityAnalytics(householdDb, ownerDb)
    .then((value) => {
      if (value) cachedAnalytics = { value, expiresAt: Date.now() + ELECTRICITY_CACHE_MS };
      return value;
    })
    .finally(() => {
      pendingAnalytics = null;
    });
  return pendingAnalytics;
}
