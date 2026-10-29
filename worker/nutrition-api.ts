import type { OwnerIdentity } from "./owner-network-auth";

export interface NutritionEnv {
  GOOGLE_SHEETS_CLIENT_EMAIL?: string;
  GOOGLE_SHEETS_PRIVATE_KEY?: string;
  NUTRITION_SPREADSHEET_ID?: string;
  NUTRITION_CALORIE_TARGET?: string;
}

type Cell = string | number | boolean | null;
type Row = Cell[];
type RangeResult = { range?: string; values?: Row[] };
type TokenCache = { token: string; expiresAt: number };

type Measure = {
  value: number | null;
  upperBound: number | null;
  incomplete: boolean;
  estimated: boolean;
};

type FoodEntry = {
  id: string;
  date: string;
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

const CALORIE_RANGE = "'Calorie Net'!A:Z";
const DETAIL_RANGE = "'Nutrition Detail'!A:W";
const REFERENCE_RANGE = "'Nutrition Reference'!A:Z";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const tokenCache = new Map<string, TokenCache>();
const losAngelesDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const emptyMeasure = (incomplete = true): Measure => ({
  value: null,
  upperBound: null,
  incomplete,
  estimated: false,
});

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToBytes(value: string) {
  const normalized = value.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function accessToken(env: NutritionEnv) {
  const email = env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim();
  const privateKey = env.GOOGLE_SHEETS_PRIVATE_KEY?.trim();
  if (!email || !privateKey) throw new Error("Google Sheets service account is not configured");

  const cached = tokenCache.get(email);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("Google authentication failed");
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Google authentication returned no access token");
  tokenCache.set(email, {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(300, payload.expires_in ?? 3600) * 1000,
  });
  return payload.access_token;
}

async function readWorkbook(env: NutritionEnv) {
  const spreadsheetId = env.NUTRITION_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) throw new Error("Nutrition spreadsheet is not configured");
  const token = await accessToken(env);
  const params = new URLSearchParams({
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  for (const range of [CALORIE_RANGE, DETAIL_RANGE, REFERENCE_RANGE]) params.append("ranges", range);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`;
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
      throw new Error("The nutrition spreadsheet is not shared with the configured service account");
    }
    throw new Error("Google Sheets data is temporarily unavailable");
  }
  const payload = await response.json() as { valueRanges?: RangeResult[] };
  const ranges = payload.valueRanges ?? [];
  return {
    calorieRows: ranges[0]?.values ?? [],
    detailRows: ranges[1]?.values ?? [],
    referenceRows: ranges[2]?.values ?? [],
  };
}

function normalizeHeader(value: Cell) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[%?]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findHeaderRow(rows: Row[], required: string[]) {
  const limit = Math.min(rows.length, 15);
  for (let index = 0; index < limit; index += 1) {
    const normalized = rows[index].map(normalizeHeader);
    if (required.every((term) => normalized.some((header) => header.includes(term)))) return index;
  }
  return 0;
}

function headerMap(row: Row) {
  const map = new Map<string, number>();
  row.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (normalized) map.set(normalized, index);
  });
  return map;
}

function column(headers: Map<string, number>, aliases: string[], fallback: number | null = null) {
  for (const alias of aliases) {
    const exact = headers.get(normalizeHeader(alias));
    if (exact !== undefined) return exact;
  }
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    for (const [header, index] of headers) {
      if (header.includes(normalized) || normalized.includes(header)) return index;
    }
  }
  return fallback;
}

function parseDate(value: Cell): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + Math.floor(value) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{5}(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
  }
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  if (!/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/.test(text)) return null;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseMeasure(value: Cell): Measure {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value, upperBound: value, incomplete: false, estimated: false };
  }
  const text = String(value ?? "").trim();
  if (!text || /^(?:n\/?a|na|unknown|—|-)$/i.test(text)) return emptyMeasure();
  const number = Number(text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(number)) return emptyMeasure();
  if (/^(?:<|less than\b)/i.test(text)) {
    return { value: 0, upperBound: Math.max(0, number), incomplete: false, estimated: true };
  }
  if (/^(?:>|more than\b|at least\b)/i.test(text)) {
    return { value: number, upperBound: null, incomplete: true, estimated: true };
  }
  return {
    value: number,
    upperBound: number,
    incomplete: /(?:about|approx|estimate|~)/i.test(text),
    estimated: /(?:about|approx|estimate|~)/i.test(text),
  };
}

function sumMeasures(measures: Measure[], expectedCount = measures.length): Measure {
  const quantified = measures.filter((measure) => measure.value !== null);
  if (!quantified.length) return emptyMeasure(expectedCount > 0);
  const hasOpenUpper = quantified.some((measure) => measure.upperBound === null);
  return {
    value: quantified.reduce((sum, measure) => sum + (measure.value ?? 0), 0),
    upperBound: hasOpenUpper
      ? null
      : quantified.reduce((sum, measure) => sum + (measure.upperBound ?? measure.value ?? 0), 0),
    incomplete: quantified.length < expectedCount || quantified.some((measure) => measure.incomplete),
    estimated: quantified.some((measure) => measure.estimated),
  };
}

function subtractMeasures(total: Measure, deduction: Measure): Measure {
  if (total.value === null || deduction.value === null) return emptyMeasure();
  const lower = Math.max(0, total.value - (deduction.upperBound ?? deduction.value));
  const upper = total.upperBound === null ? null : Math.max(0, total.upperBound - deduction.value);
  return {
    value: lower,
    upperBound: upper,
    incomplete: total.incomplete || deduction.incomplete,
    estimated: total.estimated || deduction.estimated || lower !== upper,
  };
}

function classifyConsumption(value: Cell): FoodEntry["consumption"] {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (["true", "yes", "y", "1", "counted", "consumed", "logged"].includes(normalized)) return "confirmed";
  if (["planned", "plan", "scheduled"].includes(normalized)) return "planned";
  if (["false", "no", "n", "0", "not counted", "excluded"].includes(normalized)) return "excluded";
  return "unknown";
}

function extractSugarAlcohol(note: string): Measure {
  const patterns = [
    /sugar alcohols?\s*[:=-]?\s*(<|less than\s+)?\s*(\d+(?:\.\d+)?)\s*g\b/i,
    /(<|less than\s+)?\s*(\d+(?:\.\d+)?)\s*g\s+(?:of\s+)?sugar alcohols?\b/i,
  ];
  for (const pattern of patterns) {
    const match = note.match(pattern);
    if (!match) continue;
    const amount = Number(match[2]);
    return match[1]
      ? { value: 0, upperBound: amount, incomplete: false, estimated: true }
      : { value: amount, upperBound: amount, incomplete: false, estimated: false };
  }
  return emptyMeasure();
}

function extractThreshold(note: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${escaped}\\s*(?:is|of|:|=)?\\s*(<|less than\\s+|at least\\s+|>)\\s*(\\d+(?:\\.\\d+)?)\\s*g\\b`, "i"),
      new RegExp(`(<|less than\\s+|at least\\s+|>)\\s*(\\d+(?:\\.\\d+)?)\\s*g\\s+${escaped}\\b`, "i"),
    ];
    for (const pattern of patterns) {
      const match = note.match(pattern);
      if (!match) continue;
      const amount = Number(match[2]);
      if (/^(?:<|less)/i.test(match[1])) {
        return { value: 0, upperBound: amount, incomplete: false, estimated: true };
      }
      return { value: amount, upperBound: null, incomplete: true, estimated: true };
    }
  }
  return emptyMeasure();
}

function parseReferenceSugarAlcohols(rows: Row[]) {
  if (!rows.length) return new Map<string, Measure>();
  const headerIndex = findHeaderRow(rows, ["item"]);
  const headers = headerMap(rows[headerIndex] ?? []);
  const nameIndex = column(headers, ["food item", "food", "item", "name"], 1);
  const alcoholIndex = column(headers, ["sugar alcohols", "sugar alcohol"]);
  const noteIndex = column(headers, ["status source note", "source note", "notes", "note", "source"]);
  const result = new Map<string, Measure>();
  for (const row of rows.slice(headerIndex + 1)) {
    const name = String(row[nameIndex ?? 0] ?? "").trim().toLowerCase();
    if (!name) continue;
    const direct = alcoholIndex === null ? emptyMeasure() : parseMeasure(row[alcoholIndex]);
    const fromNote = noteIndex === null ? emptyMeasure() : extractSugarAlcohol(String(row[noteIndex] ?? ""));
    const measure = direct.value === null ? fromNote : direct;
    if (measure.value !== null) result.set(name, measure);
  }
  return result;
}

function parseFoodRows(rows: Row[], referenceRows: Row[]) {
  if (!rows.length) return [];
  const headerIndex = findHeaderRow(rows, ["date", "food"]);
  const headers = headerMap(rows[headerIndex] ?? []);
  const index = {
    date: column(headers, ["date"], 0) ?? 0,
    name: column(headers, ["food item", "food"], 1) ?? 1,
    calories: column(headers, ["calories logged", "calories"], 2) ?? 2,
    protein: column(headers, ["protein"], 3) ?? 3,
    carbs: column(headers, ["carbs", "total carbohydrates", "carbohydrates"], 4) ?? 4,
    fiber: column(headers, ["fiber", "dietary fiber"], 5) ?? 5,
    totalSugar: column(headers, ["total sugar", "sugar"], 6) ?? 6,
    addedSugar: column(headers, ["added sugar"], 7) ?? 7,
    fat: column(headers, ["fat", "total fat"], 8) ?? 8,
    sodium: column(headers, ["sodium"], 9) ?? 9,
    quality: column(headers, ["status estimate quality", "status", "estimate quality"], 10) ?? 10,
    note: column(headers, ["source note", "source", "note"], 11) ?? 11,
    counted: column(headers, ["counted in calorie log", "counted"], 12) ?? 12,
    saturatedFat: column(headers, ["saturated fat"], 13) ?? 13,
    transFat: column(headers, ["trans fat"], 14) ?? 14,
    polyunsaturatedFat: column(headers, ["polyunsaturated fat"], 15) ?? 15,
    monounsaturatedFat: column(headers, ["monounsaturated fat"], 16) ?? 16,
    vitaminD: column(headers, ["vitamin d"], 17) ?? 17,
    vitaminA: column(headers, ["vitamin a"], 18) ?? 18,
    cholesterol: column(headers, ["cholesterol"], 19) ?? 19,
    potassium: column(headers, ["potassium"], 20) ?? 20,
    calcium: column(headers, ["calcium"], 21) ?? 21,
    iron: column(headers, ["iron"], 22) ?? 22,
  };
  const referenceAlcohols = parseReferenceSugarAlcohols(referenceRows);
  const seenRows = new Set<string>();

  return rows.slice(headerIndex + 1).flatMap((row, rowOffset): FoodEntry[] => {
    const date = parseDate(row[index.date]);
    const name = String(row[index.name] ?? "").trim();
    if (!date || !name) return [];
    const note = String(row[index.note] ?? "").trim();
    const signature = [date, name.toLowerCase(), String(row[index.calories] ?? ""), String(row[index.counted] ?? ""), note].join("|");
    if (seenRows.has(signature)) return [];
    seenRows.add(signature);
    const noteAlcohol = extractSugarAlcohol(note);
    const normalizedName = name.toLowerCase();
    const referenceAlcohol = referenceAlcohols.get(normalizedName)
      ?? Array.from(referenceAlcohols).find(([referenceName]) =>
        referenceName.length >= 5 && (normalizedName.includes(referenceName) || referenceName.includes(normalizedName)),
      )?.[1];
    const sugarAlcohols = noteAlcohol.value === null
      ? (referenceAlcohol ?? emptyMeasure())
      : noteAlcohol;
    const directTotalSugar = parseMeasure(row[index.totalSugar]);
    const directAddedSugar = parseMeasure(row[index.addedSugar]);
    const directProtein = parseMeasure(row[index.protein]);
    const directCarbs = parseMeasure(row[index.carbs]);
    return [{
      id: `${date}-${rowOffset + headerIndex + 2}`,
      date,
      name,
      calories: parseMeasure(row[index.calories]),
      protein: directProtein.value === null ? extractThreshold(note, ["protein"]) : directProtein,
      carbs: directCarbs.value === null ? extractThreshold(note, ["carbs", "carbohydrates", "carb"]) : directCarbs,
      fiber: parseMeasure(row[index.fiber]),
      totalSugar: directTotalSugar.value === null ? extractThreshold(note, ["total sugar", "sugar"]) : directTotalSugar,
      addedSugar: directAddedSugar.value === null ? extractThreshold(note, ["added sugar"]) : directAddedSugar,
      sugarAlcohols,
      fat: parseMeasure(row[index.fat]),
      saturatedFat: parseMeasure(row[index.saturatedFat]),
      transFat: parseMeasure(row[index.transFat]),
      polyunsaturatedFat: parseMeasure(row[index.polyunsaturatedFat]),
      monounsaturatedFat: parseMeasure(row[index.monounsaturatedFat]),
      vitaminD: parseMeasure(row[index.vitaminD]),
      vitaminA: parseMeasure(row[index.vitaminA]),
      cholesterol: parseMeasure(row[index.cholesterol]),
      potassium: parseMeasure(row[index.potassium]),
      calcium: parseMeasure(row[index.calcium]),
      iron: parseMeasure(row[index.iron]),
      sodium: parseMeasure(row[index.sodium]),
      quality: String(row[index.quality] ?? "Status not established").trim() || "Status not established",
      note,
      consumption: classifyConsumption(row[index.counted]),
    }];
  });
}

type CalorieDay = {
  date: string;
  weight: Measure;
  consumed: Measure;
  planned: Measure;
  basal: Measure;
  active: Measure;
  totalBurned: Measure;
  net: Measure;
  status: string;
  note: string;
};

function parseCalorieRows(rows: Row[]) {
  if (!rows.length) return [];
  const headerIndex = findHeaderRow(rows, ["date", "calor"]);
  const headerRow = rows[headerIndex] ?? [];
  const headers = headerMap(headerRow);
  // The primary ledger is always anchored in column A. Do not let the
  // secondary "Chart Date" table take over when the A1 label is blank.
  const explicitDateIndex = headerRow.findIndex((value) => {
    const header = normalizeHeader(value);
    return header === "date" || header === "day";
  });
  const dateIndex = explicitDateIndex >= 0 ? explicitDateIndex : 0;
  // The sheet also contains a secondary chart table with another "Weight (lb)"
  // header. Use the first matching source column so weights stay aligned with
  // the primary Date column rather than the chart's independent date series.
  const weightColumn = headerRow.findIndex((value) => {
    const header = normalizeHeader(value);
    return header === "weight" || header === "body weight";
  });
  const weightIndex = weightColumn >= 0 ? weightColumn : null;
  const consumedIndex = column(headers, ["calories consumed", "consumed calories", "calories logged", "calories in", "calorie intake", "intake"]);
  const plannedIndex = column(headers, ["planned calories", "calories planned", "planned"]);
  const basalIndex = column(headers, ["basal calories burned", "basal burn", "basal energy expenditure", "resting energy", "bmr"]);
  const activeIndex = column(headers, ["active calories burned", "active burn", "active energy expenditure", "active energy"]);
  const totalIndex = column(headers, ["total energy expenditure", "total calories burned", "total burned", "total burn", "tee"]);
  const netIndex = column(headers, ["net calories", "calorie net", "net"]);
  const statusIndex = column(headers, ["finalized", "day status", "status", "complete"]);
  const noteIndex = column(headers, ["food notes", "notes", "note"]);

  return rows.slice(headerIndex + 1).flatMap((row): CalorieDay[] => {
    const date = parseDate(row[dateIndex]);
    if (!date) return [];
    const consumed = consumedIndex === null ? emptyMeasure() : parseMeasure(row[consumedIndex]);
    const planned = plannedIndex === null ? emptyMeasure() : parseMeasure(row[plannedIndex]);
    const basal = basalIndex === null ? emptyMeasure() : parseMeasure(row[basalIndex]);
    const active = activeIndex === null ? emptyMeasure() : parseMeasure(row[activeIndex]);
    let totalBurned = totalIndex === null ? emptyMeasure() : parseMeasure(row[totalIndex]);
    if (totalBurned.value === null && basal.value !== null && active.value !== null) {
      totalBurned = sumMeasures([basal, active]);
    }
    let net = netIndex === null ? emptyMeasure() : parseMeasure(row[netIndex]);
    if (net.value === null && consumed.value !== null && totalBurned.value !== null) {
      net = subtractMeasures(consumed, totalBurned);
      net = { ...net, value: consumed.value - totalBurned.value, upperBound: consumed.value - totalBurned.value };
    }
    const note = noteIndex === null ? "" : String(row[noteIndex] ?? "").trim();
    const rawStatus = statusIndex === null ? "" : String(row[statusIndex] ?? "").trim();
    const derivedStatus = /\bfinali[sz]ed\b/i.test(note) ? "Finalized" : "Status not established";
    return [{
      date,
      weight: weightIndex === null ? emptyMeasure() : parseMeasure(row[weightIndex]),
      consumed,
      planned,
      basal,
      active,
      totalBurned,
      net,
      status: rawStatus || derivedStatus,
      note,
    }];
  });
}

const nutrientKeys = [
  "protein", "carbs", "fiber", "totalSugar", "addedSugar", "sugarAlcohols", "fat",
  "saturatedFat", "transFat", "monounsaturatedFat", "polyunsaturatedFat",
  "cholesterol", "sodium", "potassium", "calcium", "iron", "vitaminA", "vitaminD",
] as const;

function aggregateFoods(foods: FoodEntry[]) {
  const totals = Object.fromEntries(nutrientKeys.map((key) => [
    key,
    sumMeasures(foods.map((food) => food[key]), foods.length),
  ])) as Record<(typeof nutrientKeys)[number], Measure>;
  return { ...totals, netCarbs: subtractMeasures(totals.carbs, totals.fiber) };
}

function dateShift(date: string, days: number) {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function averageDaily(entries: Array<{ date: string; measure: Measure }>, start: string, end: string) {
  const relevant = entries.filter((entry) => entry.date >= start && entry.date <= end && entry.measure.value !== null);
  if (!relevant.length) return { measure: emptyMeasure(), recordedDays: 0, calendarDays: Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1) };
  const total = sumMeasures(relevant.map((entry) => entry.measure), relevant.length);
  return {
    measure: {
      value: total.value === null ? null : total.value / relevant.length,
      upperBound: total.upperBound === null ? null : total.upperBound / relevant.length,
      incomplete: total.incomplete,
      estimated: total.estimated,
    },
    recordedDays: relevant.length,
    calendarDays: Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1),
  };
}

function reduction(current: Measure, baseline: Measure) {
  if (current.value === null || baseline.value === null || baseline.value <= 0) return null;
  return ((baseline.value - current.value) / baseline.value) * 100;
}

function currentLosAngelesDate() {
  const parts = losAngelesDate.formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function safeDateParam(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : currentLosAngelesDate();
}

export async function handleNutritionDashboardGet(
  request: Request,
  env: NutritionEnv,
  _identity: OwnerIdentity,
) {
  void _identity;
  try {
    const { calorieRows, detailRows, referenceRows } = await readWorkbook(env);
    const calorieDays = parseCalorieRows(calorieRows);
    const foods = parseFoodRows(detailRows, referenceRows);
    const url = new URL(request.url);
    const requestedDate = safeDateParam(url.searchParams.get("date"));
    const availableDates = Array.from(new Set([
      ...calorieDays.map((day) => day.date),
      ...foods.map((food) => food.date),
    ])).sort();
    const selectedDate = url.searchParams.has("date")
      ? requestedDate
      : (availableDates.filter((date) => date <= requestedDate).at(-1) ?? requestedDate);
    const selectedCalorieDay = calorieDays.find((day) => day.date === selectedDate) ?? null;
    const selectedFoods = foods.filter((food) => food.date === selectedDate);
    const confirmedFoods = selectedFoods.filter((food) => food.consumption === "confirmed");
    const plannedFoods = selectedFoods.filter((food) => food.consumption === "planned");
    const nutrients = aggregateFoods(confirmedFoods);
    const detailCalories = sumMeasures(confirmedFoods.map((food) => food.calories), confirmedFoods.length);
    const plannedCaloriesFromRows = sumMeasures(plannedFoods.map((food) => food.calories), plannedFoods.length);
    const plannedCalories = selectedCalorieDay?.planned.value !== null
      ? selectedCalorieDay?.planned ?? emptyMeasure()
      : plannedCaloriesFromRows;
    const selectedConsumed = selectedCalorieDay?.consumed.value ?? null;
    const calorieTarget = Number(env.NUTRITION_CALORIE_TARGET) || 2100;

    const confirmedByDate = new Map<string, FoodEntry[]>();
    for (const food of foods) {
      if (food.consumption !== "confirmed") continue;
      const day = confirmedByDate.get(food.date) ?? [];
      day.push(food);
      confirmedByDate.set(food.date, day);
    }
    const nutrientByDate = Array.from(confirmedByDate, ([date, dayFoods]) => ({
      date,
      totals: aggregateFoods(dayFoods),
    })).sort((a, b) => a.date.localeCompare(b.date));
    const sugarEntries = nutrientByDate.map((day) => ({ date: day.date, measure: day.totals.totalSugar }));
    const rollingStart = dateShift(selectedDate, -6);
    const septemberStart = "2026-09-01";
    const septemberEnd = "2026-09-30";
    const octoberStart = "2026-10-01";
    const rolling = averageDaily(sugarEntries, rollingStart, selectedDate);
    const sinceOctober = selectedDate >= octoberStart
      ? averageDaily(sugarEntries, octoberStart, selectedDate)
      : { measure: emptyMeasure(), recordedDays: 0, calendarDays: 0 };
    const september = averageDaily(sugarEntries, septemberStart, septemberEnd);

    const latestRecordedDate = availableDates.filter((date) => date <= currentLosAngelesDate()).at(-1) ?? selectedDate;
    const historyEnd = latestRecordedDate > selectedDate ? latestRecordedDate : selectedDate;
    const historyStart = availableDates[0] ?? dateShift(historyEnd, -29);
    const calorieByDate = new Map(calorieDays.map((day) => [day.date, day]));
    const nutrientsByDate = new Map(nutrientByDate.map((day) => [day.date, day.totals]));
    const historyDates = Array.from(new Set([
      ...calorieDays.map((day) => day.date),
      ...nutrientByDate.map((day) => day.date),
    ])).filter((date) => date >= historyStart && date <= historyEnd).sort();
    const recordedWeights = calorieDays
      .filter((day) => day.date <= currentLosAngelesDate() && day.weight.value !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    const latestWeightDay = recordedWeights.at(-1) ?? null;
    const weightTrendPerWeek = (() => {
      if (recordedWeights.length < 2) return null;
      const firstTime = Date.parse(`${recordedWeights[0].date}T12:00:00Z`);
      const points = recordedWeights.map((day) => ({
        x: (Date.parse(`${day.date}T12:00:00Z`) - firstTime) / 86_400_000,
        y: day.weight.value as number,
      }));
      const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
      if (denominator === 0) return null;
      const slopePerDay = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
      return slopePerDay * 7;
    })();

    return json({
      generatedAt: new Date().toISOString(),
      timezone: "America/Los_Angeles",
      selectedDate,
      availableDates,
      targets: {
        calories: calorieTarget,
        protein: 110,
        proteinMin: 90,
        proteinMax: 130,
        fiber: 30,
        saturatedFat: 30,
        sodium: 2300,
        sugarReduction: 50,
      },
      calories: {
        consumed: selectedCalorieDay?.consumed ?? emptyMeasure(),
        planned: plannedCalories,
        basal: selectedCalorieDay?.basal ?? emptyMeasure(),
        active: selectedCalorieDay?.active ?? emptyMeasure(),
        burned: selectedCalorieDay?.totalBurned ?? emptyMeasure(),
        net: selectedCalorieDay?.net ?? emptyMeasure(),
        intakeGoalDelta: selectedConsumed === null
          ? emptyMeasure()
          : { value: selectedConsumed - calorieTarget, upperBound: selectedConsumed - calorieTarget, incomplete: false, estimated: false },
        detailCalories,
        discrepancy: selectedConsumed !== null && detailCalories.value !== null
          ? detailCalories.value - selectedConsumed
          : null,
        status: selectedCalorieDay?.status ?? "Status not established",
        note: selectedCalorieDay?.note ?? "",
      },
      weight: {
        current: latestWeightDay?.weight ?? emptyMeasure(),
        date: latestWeightDay?.date ?? null,
        trendPerWeek: weightTrendPerWeek,
        trendStartDate: recordedWeights[0]?.date ?? null,
      },
      nutrients,
      foods: selectedFoods,
      sugar: {
        rolling7: rolling,
        sinceOctober,
        september,
        rollingReductionPercent: reduction(rolling.measure, september.measure),
        sinceOctoberReductionPercent: reduction(sinceOctober.measure, september.measure),
      },
      history: historyDates.map((date) => {
        const dayNutrients = nutrientsByDate.get(date);
        const calorieDay = calorieByDate.get(date);
        return {
          date,
          weight: calorieDay?.weight ?? emptyMeasure(),
          calories: calorieDay?.consumed ?? emptyMeasure(),
          totalSugar: dayNutrients?.totalSugar ?? emptyMeasure(),
          addedSugar: dayNutrients?.addedSugar ?? emptyMeasure(),
          sugarAlcohols: dayNutrients?.sugarAlcohols ?? emptyMeasure(),
          protein: dayNutrients?.protein ?? emptyMeasure(),
          saturatedFat: dayNutrients?.saturatedFat ?? emptyMeasure(),
          fiber: dayNutrients?.fiber ?? emptyMeasure(),
          sodium: dayNutrients?.sodium ?? emptyMeasure(),
        };
      }),
      reliability: {
        confirmedFoodCount: confirmedFoods.length,
        plannedFoodCount: plannedFoods.length,
        uncountedFoodCount: selectedFoods.filter((food) => food.consumption === "excluded").length,
        unknownConsumptionCount: selectedFoods.filter((food) => food.consumption === "unknown").length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nutrition data could not be loaded";
    return json({ error: message }, /not configured|not shared/.test(message) ? 503 : 502);
  }
}

export const nutritionInternals = {
  aggregateFoods,
  classifyConsumption,
  parseCalorieRows,
  parseDate,
  parseFoodRows,
  parseMeasure,
};
