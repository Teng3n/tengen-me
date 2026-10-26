# Nutrition dashboard

The private dashboard is available at `/admin/nutrition`. It reads the existing
Google workbook at request time and never sends Google credentials or raw sheet
ranges to the browser.

## Data boundary

- `/admin/nutrition` and `/admin/api/nutrition` use the same owner-network gate
  as the rest of the private console.
- The Worker authenticates to Google Sheets with a service account and the
  read-only `spreadsheets.readonly` scope.
- `Calorie Net` is the source of truth for daily calorie intake and burn.
- `Nutrition Detail` is aggregated only when `Counted in calorie log?` explicitly
  identifies the item as counted. Status/quality text is not treated as a
  consumption signal.
- `Nutrition Reference` is used only to recover explicitly recorded values such
  as sugar alcohols.
- Blank cells remain unknown. Threshold values such as `<2 g` are represented as
  ranges or quantified lower bounds.

## One-time Google configuration

1. In the owner's Google Cloud project, enable the Google Sheets API.
2. Create a service account dedicated to the nutrition dashboard. It does not
   need a Google Cloud project role.
3. Create a JSON key for that service account.
4. Share the nutrition workbook with the JSON key's `client_email` as a Viewer.
5. Add these Worker secrets interactively from the repository root:

   ```powershell
   npx wrangler secret put GOOGLE_SHEETS_CLIENT_EMAIL --name tengen-me
   npx wrangler secret put GOOGLE_SHEETS_PRIVATE_KEY --name tengen-me
   npx wrangler secret put NUTRITION_SPREADSHEET_ID --name tengen-me
   ```

   Use the JSON key's `client_email`, the complete `private_key`, and the
   workbook ID respectively. Never paste those values into source files, shell
   history, documentation, or chat.

Optional configuration can be stored as Worker secrets or environment values:

- `NUTRITION_CALORIE_TARGET` (default `2100`)

The four primary nutrient references are intentionally fixed in source: protein
110 g with a 90–130 g preferred range, fiber 30 g, saturated fat at less than
10% of the calorie target, and sodium at less than 2,300 mg. They are presented
as flexible references rather than mandatory allowances and are not editable in
the dashboard.

After configuring the secrets, deploy through the normal GitHub-to-Cloudflare
pipeline and verify `/admin/nutrition` from the approved network.
