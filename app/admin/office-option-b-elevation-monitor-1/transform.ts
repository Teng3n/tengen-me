function replaceRequired(value: string, search: string, replacement: string) {
  if (!value.includes(search)) {
    throw new Error(`Monitor option 1 elevation template is missing: ${search}`);
  }
  return value.replace(search, replacement);
}

export function renderMonitorOption1Elevation(elevationHtml: string) {
  const replacements: Array<[string, string]> = [
    ["<title>Office Option B Wall Elevation</title>", "<title>Office Monitor Option 1 Wall Elevation</title>"],
    ["<h1>Office Option B Wall Elevation</h1>", "<h1>Office Monitor Option 1 Wall Elevation</h1>"],
    ["Peloton option B · monitor option 2", "Peloton option B · monitor option 1"],
    ["<strong>Option 2</strong>Centered on 89.6 in wall segment", "<strong>Option 1</strong>Centered on 63 in desk run"],
    ["overlapping the monitor span by 6.35 inches and stopping 5.05 inches before the chair edge", "stopping 5.35 inches before the monitor span and 16.75 inches before the chair edge"],
    ["Monitor option 2 is centered at 44.8 inches on the 89.6-inch desk-side wall segment. The MI-305B plate spans estimated studs at 32 and 48 inches.", "Monitor option 1 is centered at 56.5 inches on the 63-inch clear desk run. The MI-305B plate spans estimated studs at 48 and 64 inches."],
    ["Monitor-span overlap: 6.35 in", "Gap to monitor span: 5.35 in"],
    ["Gap to chair edge: 5.05 in", "Gap to chair edge: 16.75 in"],
    ["Stud centers: 32 + 48 in", "Stud centers: 48 + 64 in"],
    ["Plate edges: 27.15–52.85 in", "Plate edges: 43.15–68.85 in"],
    ["Plate center: 40.0 in", "Plate center: 56.0 in"],
    ["<strong>Monitor option 2</strong>Center: 44.8 in<br>Edges: 18.65–70.95 in<br>Shift: 4.8 in left in this view", "<strong>Monitor option 1</strong>Center: 56.5 in<br>Edges: 30.35–82.65 in<br>Shift: 0.5 in left in this view"],
    ["monitor={center:44.8,width:52.3,height:16.9,bottom:35},mount={center:40,width:25.7,height:8.3,studs:[32,48]},chair={center:44.8", "monitor={center:56.5,width:52.3,height:16.9,bottom:35},mount={center:56,width:25.7,height:8.3,studs:[48,64]},chair={center:56.5"],
    [">Monitor option 2</text>", ">Monitor option 1</text>"],
    [">4.8 in left in this view</text>", ">0.5 in left in this view</text>"],
    [">CHAIR–RETURN GAP · 5.05 in</text>", ">CHAIR–RETURN GAP · 16.75 in</text>"],
    ["comparisonLink.href='/admin/office-option-b-elevation-monitor-1';comparisonLink.textContent='Monitor option 1 elevation →'", "comparisonLink.href='/admin/office-option-b-elevation';comparisonLink.textContent='← Monitor option 2 elevation'"],
  ];

  return replacements.reduce(
    (html, [search, replacement]) => replaceRequired(html, search, replacement),
    elevationHtml,
  );
}
