-- Schema only. Household utility records are private production data and are
-- intentionally not stored in this public repository.
CREATE TABLE IF NOT EXISTS utility_bill_history (
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  delivered_kwh REAL NOT NULL CHECK (delivered_kwh >= 0),
  exported_solar_kwh REAL CHECK (exported_solar_kwh >= 0),
  solar_bank_kwh REAL CHECK (solar_bank_kwh >= 0),
  electric_cost REAL CHECK (electric_cost >= 0),
  billed_electric_cost REAL CHECK (billed_electric_cost >= 0),
  cost_kind TEXT NOT NULL CHECK (cost_kind IN ('actual', 'modeled')),
  source TEXT NOT NULL,
  PRIMARY KEY (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_utility_bill_history_end
  ON utility_bill_history (period_end DESC);
