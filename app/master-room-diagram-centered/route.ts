import masterDiagramHtml from "../../master_room_diagram.html?raw";

export const dynamic = "force-static";

const centeredXLeft = 52.24;
const centeredXRight = 152.24;

const comparisonSection = String.raw`
  <section class="drawing-card centered-alternative" aria-labelledby="centered-comparison-heading">
    <div class="drawing-header">
      <h2 id="centered-comparison-heading">A0 · Centered-on-each-ceiling-plane alternative</h2>
      <div class="drawing-meta">Separate mock-up · Existing 40″ / 30″ layout remains unchanged</div>
    </div>

    <div class="coverage-summary" aria-label="Alternative layout comparison">
      <article class="coverage-metric alert" id="alt-fan-card">
        <span>Fan main-beam exposure</span>
        <strong id="alt-fan-value">Calculating…</strong>
        <small id="alt-fan-note">Compared with the current layout</small>
      </article>
      <article class="coverage-metric good">
        <span>Nominal floor coverage</span>
        <strong id="alt-floor-value">Calculating…</strong>
        <small id="alt-floor-note">Centered alternative versus current layout</small>
      </article>
      <article class="coverage-metric good">
        <span>Side-wall main-beam area</span>
        <strong id="alt-wall-value">Calculating…</strong>
        <small id="alt-wall-note">Geometric nominal-beam coverage, not measured illuminance</small>
      </article>
    </div>

    <svg id="centered-comparison-svg" viewBox="0 0 280 236" role="img" aria-labelledby="centered-comparison-title centered-comparison-desc">
      <title id="centered-comparison-title">Current and centered-plane master bedroom light positions</title>
      <desc id="centered-comparison-desc">A top-down room plan comparing the current outward light columns with columns centered on each separate ceiling plane.</desc>
      <defs>
        <marker id="alt-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M 0 0 L 6 3 L 0 6 Z" fill="#33414d"></path>
        </marker>
      </defs>
      <rect class="room-fill" x="40" y="24" width="200" height="183"></rect>
      <rect class="ridge-beam-plan" x="141.98" y="24" width="5" height="183"></rect>
      <line class="ridge" x1="144.48" y1="24" x2="144.48" y2="207"></line>

      <g class="alt-current-layout" aria-label="Current light positions">
        <line x1="80" y1="24" x2="80" y2="207"></line>
        <line x1="210" y1="24" x2="210" y2="207"></line>
        <circle cx="80" cy="46.875" r="3.6"></circle><circle cx="80" cy="92.625" r="3.6"></circle>
        <circle cx="80" cy="138.375" r="3.6"></circle><circle cx="80" cy="184.125" r="3.6"></circle>
        <circle cx="210" cy="46.875" r="3.6"></circle><circle cx="210" cy="92.625" r="3.6"></circle>
        <circle cx="210" cy="138.375" r="3.6"></circle><circle cx="210" cy="184.125" r="3.6"></circle>
      </g>
      <g class="alt-centered-layout" aria-label="Centered-plane light positions">
        <line x1="92.24" y1="24" x2="92.24" y2="207"></line>
        <line x1="192.24" y1="24" x2="192.24" y2="207"></line>
        <circle cx="92.24" cy="46.875" r="3.8"></circle><circle cx="92.24" cy="92.625" r="3.8"></circle>
        <circle cx="92.24" cy="138.375" r="3.8"></circle><circle cx="92.24" cy="184.125" r="3.8"></circle>
        <circle cx="192.24" cy="46.875" r="3.8"></circle><circle cx="192.24" cy="92.625" r="3.8"></circle>
        <circle cx="192.24" cy="138.375" r="3.8"></circle><circle cx="192.24" cy="184.125" r="3.8"></circle>
      </g>
      <circle class="fan-sweep" cx="144.48" cy="101" r="26"></circle>
      <circle class="fan-hub" cx="144.48" cy="101" r="3.2"></circle>
      <rect class="room-wall" x="40" y="24" width="200" height="183"></rect>

      <line class="extension" x1="40" y1="24" x2="40" y2="8"></line>
      <line class="extension" x1="92.24" y1="24" x2="92.24" y2="8"></line>
      <line class="extension" x1="192.24" y1="24" x2="192.24" y2="8"></line>
      <line class="extension" x1="240" y1="24" x2="240" y2="8"></line>
      <line class="dimension alt-dimension" x1="40" y1="13" x2="92.24" y2="13"></line>
      <line class="dimension alt-dimension" x1="92.24" y1="13" x2="192.24" y2="13"></line>
      <line class="dimension alt-dimension" x1="192.24" y1="13" x2="240" y2="13"></line>
      <text class="svg-dim halo" x="66.12" y="6" text-anchor="middle">52.24″</text>
      <text class="svg-dim halo" x="142.24" y="6" text-anchor="middle">100.00″</text>
      <text class="svg-dim halo" x="216.12" y="6" text-anchor="middle">47.76″</text>
      <text class="svg-wall-label halo" x="140" y="216" text-anchor="middle">OPPOSITE WALL</text>
      <text class="svg-wall-label halo" x="24" y="115.5" text-anchor="middle" transform="rotate(-90 24 115.5)">PHOTO-LEFT WALL</text>
      <text class="svg-wall-label halo" x="256" y="115.5" text-anchor="middle" transform="rotate(90 256 115.5)">MIRRORED-CLOSET WALL</text>
    </svg>

    <div class="diagram-legend" aria-label="Centered-plane placement legend">
      <h3>Legend for A0</h3>
      <div class="legend-item"><span class="swatch swatch-alt-centered"></span>Centered-on-plane alternative</div>
      <div class="legend-item"><span class="swatch swatch-alt-current"></span>Current 40″ / 30″ positions</div>
      <div class="legend-item"><span class="swatch swatch-fan"></span>52″ fan swept disk</div>
      <div class="legend-item"><span class="swatch swatch-beam"></span>Ridge beam projection</div>
    </div>
    <p class="finding alert" id="alt-comparison-finding"><strong>Calculating centered-layout fan result…</strong></p>
  </section>
`;

const sideWallSection = String.raw`
  <section class="drawing-card centered-alternative" aria-labelledby="sidewall-heading">
    <div class="drawing-header">
      <h2 id="sidewall-heading">D0 · Side-wall main-beam illumination</h2>
      <div class="drawing-meta">Looking directly at each long wall · 110° nominal beam default</div>
    </div>

    <div class="coverage-summary" aria-label="Side-wall coverage comparison">
      <article class="coverage-metric good">
        <span>Photo-left wall · centered</span>
        <strong id="alt-left-wall-value">Calculating…</strong>
        <small id="alt-left-wall-current">Current layout comparison pending</small>
      </article>
      <article class="coverage-metric good">
        <span>Mirrored-closet wall · centered</span>
        <strong id="alt-right-wall-value">Calculating…</strong>
        <small id="alt-right-wall-current">Current layout comparison pending</small>
      </article>
      <article class="coverage-metric caution">
        <span>Interpretation</span>
        <strong>Nominal beam regions</strong>
        <small>Spill light continues beyond the colored boundary; this is not a lux prediction</small>
      </article>
    </div>

    <div class="centered-sidewall-grid">
      <article>
        <h3>Photo-left wall · 96″ high</h3>
        <svg viewBox="0 0 240 130" role="img" aria-label="Nominal main-beam coverage on the photo-left wall">
          <g id="alt-left-wall-map"></g>
          <rect class="room-wall" x="30" y="22" width="183" height="96"></rect>
          <text class="svg-wall-label" x="121.5" y="124" text-anchor="middle">183″ · TV WALL → OPPOSITE WALL</text>
          <text class="svg-small halo" x="26" y="70" text-anchor="middle" transform="rotate(-90 26 70)">96″</text>
        </svg>
      </article>
      <article>
        <h3>Mirrored-closet wall · 108″ high</h3>
        <svg viewBox="0 0 240 130" role="img" aria-label="Nominal main-beam coverage on the mirrored-closet wall">
          <g id="alt-right-wall-map"></g>
          <rect class="room-wall" x="30" y="10" width="183" height="108"></rect>
          <text class="svg-wall-label" x="121.5" y="124" text-anchor="middle">183″ · TV WALL → OPPOSITE WALL</text>
          <text class="svg-small halo" x="26" y="64" text-anchor="middle" transform="rotate(-90 26 64)">108″</text>
        </svg>
      </article>
    </div>

    <div class="diagram-legend" aria-label="Side-wall illumination legend">
      <h3>Legend for D0</h3>
      <div class="legend-item"><span class="swatch swatch-coverage-1"></span>1 nominal main beam</div>
      <div class="legend-item"><span class="swatch swatch-coverage-2"></span>2–3 nominal main beams</div>
      <div class="legend-item"><span class="swatch swatch-coverage-3"></span>4–8 nominal main beams</div>
      <div class="legend-item"><span class="swatch swatch-tv"></span>Uncolored wall area: outside the nominal beam, but not necessarily dark</div>
    </div>
    <p class="finding" id="alt-sidewall-finding"><strong>Calculating side-wall comparison…</strong></p>
  </section>
`;

const centeredStyles = String.raw`
<style>
  .alt-current-layout line, .alt-current-layout circle {
    fill: rgba(91, 104, 114, .05);
    stroke: #73808a;
    stroke-width: .75;
    stroke-dasharray: 3 2;
    vector-effect: non-scaling-stroke;
  }
  .alt-centered-layout line {
    stroke: #d97706;
    stroke-width: .65;
    stroke-dasharray: 2 2;
    vector-effect: non-scaling-stroke;
  }
  .alt-centered-layout circle {
    fill: #fff;
    stroke: #d97706;
    stroke-width: 1.15;
    vector-effect: non-scaling-stroke;
  }
  .alt-dimension { marker-start: url(#alt-arrow); marker-end: url(#alt-arrow); }
  .swatch-alt-centered { border: 2px solid #d97706; background: rgba(217,119,6,.08); }
  .swatch-alt-current { border: 2px dashed #73808a; background: rgba(115,128,138,.06); }
  .centered-sidewall-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .centered-sidewall-grid article { border: 1px solid #d7dde2; padding: 8px; }
  .centered-sidewall-grid h3 { margin: 0 0 4px; font-size: 12px; }
  @media (max-width: 760px) { .centered-sidewall-grid { grid-template-columns: 1fr; } }
</style>
`;

const centeredAnalysisScript = String.raw`
<script>
(() => {
  "use strict";
  const cfg = MASTER_ROOM_CONFIG;
  const NS = "http://www.w3.org/2000/svg";
  const ridgeX = cfg.ridgeBeam.centerFromLeft;
  const leftSlope = (cfg.ceiling.peakHeight - cfg.ceiling.leftWallHeight) / ridgeX;
  const rightSlope = (cfg.ceiling.peakHeight - cfg.ceiling.rightWallHeight) / (cfg.room.width - ridgeX);
  const ceilingHeight = x => x <= ridgeX
    ? cfg.ceiling.leftWallHeight + leftSlope * x
    : cfg.ceiling.peakHeight - rightSlope * (x - ridgeX);
  const axisForX = x => {
    const horizontal = x < ridgeX ? leftSlope : -rightSlope;
    const magnitude = Math.hypot(horizontal, 1);
    return { x: horizontal / magnitude, y: 0, z: -1 / magnitude };
  };
  const makeLights = columns => columns.flatMap((x, columnIndex) =>
    [22.875, 68.625, 114.375, 160.125].map((y, rowIndex) => ({
      number: columnIndex * 4 + rowIndex + 1,
      x,
      y,
      z: ceilingHeight(x),
      axis: axisForX(x)
    }))
  );
  const centeredLights = makeLights([52.24, 152.24]);
  const currentLights = makeLights([40, 170]);
  const insideBeam = (light, point, angle) => {
    const dx = point.x - light.x;
    const dy = point.y - light.y;
    const dz = point.z - light.z;
    const length = Math.hypot(dx, dy, dz);
    const dot = dx * light.axis.x + dy * light.axis.y + dz * light.axis.z;
    if (dot <= 0 || !length) return false;
    const cosine = Math.max(-1, Math.min(1, dot / length));
    return Math.acos(cosine) * 180 / Math.PI <= angle / 2;
  };
  const fanMetrics = (lights, fanY, fanZ, angle) => {
    let samples = 0;
    let covered = 0;
    const crossing = new Set();
    for (let dx = -cfg.fan.radius; dx <= cfg.fan.radius; dx += .75) {
      for (let dy = -cfg.fan.radius; dy <= cfg.fan.radius; dy += .75) {
        if (dx * dx + dy * dy > cfg.fan.radius * cfg.fan.radius) continue;
        samples += 1;
        const point = { x: cfg.fan.centerX + dx, y: fanY + dy, z: fanZ };
        lights.forEach(light => {
          if (insideBeam(light, point, angle)) crossing.add(light.number);
        });
        if (lights.some(light => insideBeam(light, point, angle))) covered += 1;
      }
    }
    return { percentage: samples ? covered / samples * 100 : 0, crossing };
  };
  const floorMetrics = (lights, angle) => {
    let samples = 0;
    let covered = 0;
    let minimum = 99;
    for (let x = 1.5; x < cfg.room.width; x += 3) {
      for (let y = 1.5; y < cfg.room.length; y += 3) {
        const count = lights.filter(light => insideBeam(light, { x, y, z: 0 }, angle)).length;
        samples += 1;
        if (count) covered += 1;
        minimum = Math.min(minimum, count);
      }
    }
    return { percentage: samples ? covered / samples * 100 : 0, minimum };
  };
  const wallMetrics = (lights, wallX, wallHeight, angle) => {
    let samples = 0;
    let covered = 0;
    let minimum = 99;
    let maximum = 0;
    for (let y = 1; y < cfg.room.length; y += 2) {
      for (let z = 1; z < wallHeight; z += 2) {
        const count = lights.filter(light => insideBeam(light, { x: wallX, y, z }, angle)).length;
        samples += 1;
        if (count) covered += 1;
        minimum = Math.min(minimum, count);
        maximum = Math.max(maximum, count);
      }
    }
    return { percentage: samples ? covered / samples * 100 : 0, minimum, maximum };
  };
  const svgElement = (name, attrs) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  const renderWall = (groupId, lights, wallX, wallHeight, angle) => {
    const group = document.getElementById(groupId);
    const paths = { one: "", medium: "", high: "" };
    const cell = 2;
    for (let y = 0; y < cfg.room.length; y += cell) {
      const width = Math.min(cell, cfg.room.length - y);
      for (let z = 0; z < wallHeight; z += cell) {
        const height = Math.min(cell, wallHeight - z);
        const point = { x: wallX, y: y + width / 2, z: z + height / 2 };
        const count = lights.filter(light => insideBeam(light, point, angle)).length;
        if (!count) continue;
        const key = count === 1 ? "one" : count <= 3 ? "medium" : "high";
        paths[key] += "M" + (30 + y) + " " + (118 - z - height) + "h" + width + "v" + height + "h-" + width + "Z";
      }
    }
    group.replaceChildren();
    [["one", "tv-coverage-1"], ["medium", "tv-coverage-2"], ["high", "tv-coverage-3"]].forEach(item => {
      if (paths[item[0]]) group.appendChild(svgElement("path", { d: paths[item[0]], class: item[1] }));
    });
  };
  const update = () => {
    const fanY = Number(document.getElementById("fan-y-control").value);
    const fanZ = Number(document.getElementById("fan-z-control").value);
    const angle = Number(document.getElementById("beam-control").value);
    const centeredFan = fanMetrics(centeredLights, fanY, fanZ, angle);
    const currentFan = fanMetrics(currentLights, fanY, fanZ, angle);
    const centeredFloor = floorMetrics(centeredLights, angle);
    const currentFloor = floorMetrics(currentLights, angle);
    const centeredLeft = wallMetrics(centeredLights, 0, cfg.ceiling.leftWallHeight, angle);
    const centeredRight = wallMetrics(centeredLights, cfg.room.width, cfg.ceiling.rightWallHeight, angle);
    const currentLeft = wallMetrics(currentLights, 0, cfg.ceiling.leftWallHeight, angle);
    const currentRight = wallMetrics(currentLights, cfg.room.width, cfg.ceiling.rightWallHeight, angle);

    document.getElementById("alt-fan-value").textContent = centeredFan.percentage.toFixed(1) + "%";
    document.getElementById("alt-fan-note").textContent = centeredFan.crossing.size + " centered beam(s) cross; current layout " + currentFan.percentage.toFixed(1) + "%";
    document.getElementById("alt-floor-value").textContent = centeredFloor.percentage.toFixed(0) + "% centered · " + currentFloor.percentage.toFixed(0) + "% current";
    document.getElementById("alt-floor-note").textContent = "Minimum overlap: " + centeredFloor.minimum + " centered beam(s) versus " + currentFloor.minimum + " current";
    document.getElementById("alt-wall-value").textContent = centeredLeft.percentage.toFixed(0) + "% left · " + centeredRight.percentage.toFixed(0) + "% right";
    document.getElementById("alt-wall-note").textContent = "Current layout: " + currentLeft.percentage.toFixed(0) + "% left · " + currentRight.percentage.toFixed(0) + "% right";
    document.getElementById("alt-left-wall-value").textContent = centeredLeft.percentage.toFixed(1) + "%";
    document.getElementById("alt-left-wall-current").textContent = "Current layout: " + currentLeft.percentage.toFixed(1) + "% of sampled wall area";
    document.getElementById("alt-right-wall-value").textContent = centeredRight.percentage.toFixed(1) + "%";
    document.getElementById("alt-right-wall-current").textContent = "Current layout: " + currentRight.percentage.toFixed(1) + "% of sampled wall area";

    const fanCard = document.getElementById("alt-fan-card");
    fanCard.className = "coverage-metric " + (centeredFan.percentage > 0 ? "alert" : "good");
    const fanFinding = document.getElementById("alt-comparison-finding");
    if (centeredFan.percentage > 0) {
      fanFinding.className = "finding alert";
      fanFinding.innerHTML = "<strong>Centered-layout warning:</strong> " + centeredFan.percentage.toFixed(1) + "% of the sampled fan disk lies inside " + centeredFan.crossing.size + " nominal main beam(s): " + [...centeredFan.crossing].map(number => "L" + number).join(", ") + ". That creates a materially greater moving-shadow/strobe path than the current layout’s " + currentFan.percentage.toFixed(1) + "% result.";
    } else {
      fanFinding.className = "finding";
      fanFinding.innerHTML = "<strong>Centered-layout result:</strong> No nominal main beam reaches the sampled fan disk at these settings.";
    }
    const wallGainLeft = centeredLeft.percentage - currentLeft.percentage;
    const wallGainRight = centeredRight.percentage - currentRight.percentage;
    document.getElementById("alt-sidewall-finding").innerHTML = "<strong>Side-wall result:</strong> Centering each plane increases nominal main-beam wall coverage by " + wallGainLeft.toFixed(1) + " percentage points on the photo-left wall and " + wallGainRight.toFixed(1) + " points on the mirrored-closet wall at the selected beam angle. Uncolored regions still receive spill and reflected light.";
    renderWall("alt-left-wall-map", centeredLights, 0, cfg.ceiling.leftWallHeight, angle);
    renderWall("alt-right-wall-map", centeredLights, cfg.room.width, cfg.ceiling.rightWallHeight, angle);
  };
  ["fan-y-control", "fan-z-control", "beam-control"].forEach(id => {
    document.getElementById(id).addEventListener("input", update);
  });
  document.getElementById("reset-controls").addEventListener("click", () => setTimeout(update, 0));
  update();
})();
</script>
`;

const centeredDiagramHtml = masterDiagramHtml
  .replace("<title>Master Room Diagram — Lighting and Fan Study</title>", "<title>Master Room Diagram — Centered Ceiling-Plane Alternative</title>")
  .replace('revision: "02"', 'revision: "02-centered-alternative"')
  .replace('<h1>Master Room — Vaulted-Ceiling Lighting and Fan Study</h1>', '<h1>Master Room — Centered Ceiling-Plane Lighting Alternative</h1>')
  .replace('Drawing revision 02 · 30 July 2026 · Eight Feit night-light wafers · All dimensions in inches · Not for construction', 'Separate centered-plane alternative · Original master-room page unchanged · Eight Feit night-light wafers · Not for construction')
  .replace('{ number: 1, side: "left", x: 40, y: 22.875 }', `{ number: 1, side: "left", x: ${centeredXLeft}, y: 22.875 }`)
  .replace('{ number: 2, side: "left", x: 40, y: 68.625 }', `{ number: 2, side: "left", x: ${centeredXLeft}, y: 68.625 }`)
  .replace('{ number: 3, side: "left", x: 40, y: 114.375 }', `{ number: 3, side: "left", x: ${centeredXLeft}, y: 114.375 }`)
  .replace('{ number: 4, side: "left", x: 40, y: 160.125 }', `{ number: 4, side: "left", x: ${centeredXLeft}, y: 160.125 }`)
  .replace('{ number: 5, side: "right", x: 170, y: 22.875 }', `{ number: 5, side: "right", x: ${centeredXRight}, y: 22.875 }`)
  .replace('{ number: 6, side: "right", x: 170, y: 68.625 }', `{ number: 6, side: "right", x: ${centeredXRight}, y: 68.625 }`)
  .replace('{ number: 7, side: "right", x: 170, y: 114.375 }', `{ number: 7, side: "right", x: ${centeredXRight}, y: 114.375 }`)
  .replace('{ number: 8, side: "right", x: 170, y: 160.125 }', `{ number: 8, side: "right", x: ${centeredXRight}, y: 160.125 }`)
  .replace('<section class="drawing-card" aria-labelledby="installer-plan-heading">', '<section class="drawing-card" aria-labelledby="installer-plan-heading" hidden>')
  .replace('  <section class="drawing-card" aria-labelledby="blade-plan-heading">', comparisonSection + '\n  <section class="drawing-card" aria-labelledby="blade-plan-heading">')
  .replace('  <section class="drawing-card" aria-labelledby="tv-wall-heading">', sideWallSection + '\n  <section class="drawing-card" aria-labelledby="tv-wall-heading">')
  .replace('[40, 170].forEach(x => {', '[52.24, 152.24].forEach(x => {')
  .replace('horizontal: "40″ from left wall"', 'horizontal: "52.24″ from left wall"')
  .replace('(40 / Math.cos(cfg.ceiling.leftAngleDegrees', '(52.24 / Math.cos(cfg.ceiling.leftAngleDegrees')
  .replace('ceilingHeight(40).toFixed(1)', 'ceilingHeight(52.24).toFixed(1)')
  .replace('horizontal: "30″ from right wall"', 'horizontal: "47.76″ from right wall"')
  .replace('(30 / Math.cos(cfg.ceiling.rightAngleDegrees', '(47.76 / Math.cos(cfg.ceiling.rightAngleDegrees')
  .replace('ceilingHeight(170).toFixed(1)', 'ceilingHeight(152.24).toFixed(1)')
  .replace('</head>', centeredStyles + '\n</head>')
  .replace('</body>', centeredAnalysisScript + '\n</body>');

export async function GET() {
  return new Response(centeredDiagramHtml, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
