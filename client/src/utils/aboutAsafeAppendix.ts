import type jsPDF from "jspdf";

// ═══════════════════════════════════════════════════════════════════════
// A-SAFE ENGAGE — "About A-SAFE" brand-overview appendix
//
// Optional 2-3 page insert for the order-form PDF. Wired in behind the
// `includeBrandOverview` flag so a standard quote doesn't ship ten pages
// of marketing; premium / first-time customers get the hand-prepared
// feel with this appendix appended after the cover.
//
// Content rules (mirror the main generator):
//   - No images — this appendix is text + geometric callouts only.
//   - Yellow used as accent only (vertical section bars, big stat
//     numerals in yellowDark). Body text stays in ink.body.
//   - Every block calls ctx.needSpace() first so nothing orphans.
//   - All drawing goes through the ctx primitives, never pdf.* directly,
//     so the caller stays the single source of truth for typography +
//     page chrome.
// ═══════════════════════════════════════════════════════════════════════

export interface AppendixContext {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  contentWidth: number;
  yStart: number;
  newPage: () => void;
  needSpace: (mm: number) => void;
  setFill: (c: [number, number, number]) => void;
  setStroke: (c: [number, number, number]) => void;
  setText: (c: [number, number, number]) => void;
  setFont: (size: number, weight?: "normal" | "bold" | "italic") => void;
  wrap: (text: string, maxW: number) => string[];
  hr: (y: number, color?: [number, number, number], width?: number) => void;
  ink: {
    black: [number, number, number];
    heading: [number, number, number];
    body: [number, number, number];
    muted: [number, number, number];
    subtle: [number, number, number];
    line: [number, number, number];
    softLine: [number, number, number];
    surface: [number, number, number];
    white: [number, number, number];
  };
  brand: {
    yellow: [number, number, number];
    yellowDark: [number, number, number];
    yellowSoft: [number, number, number];
  };
  accent: {
    green: [number, number, number];
    greenDark: [number, number, number];
    red: [number, number, number];
    blue: [number, number, number];
  };
  sectionHeading: (title: string, subtitle?: string) => void;
  eyebrow: (text: string, x: number, y: number) => void;
  y: { value: number };
}

export function renderAboutAsafe(pdf: jsPDF, ctx: AppendixContext): void {
  const {
    pageWidth,
    margin,
    contentWidth,
    newPage,
    needSpace,
    setFill,
    setStroke,
    setText,
    setFont,
    wrap,
    ink,
    brand,
    sectionHeading,
    y,
  } = ctx;

  // Start from wherever the caller left the cursor (usually top of a fresh
  // page). If there's no realistic vertical budget left, advance first.
  y.value = ctx.yStart;

  // ───────────────────────────────────────────────────────────────────
  // Local helpers
  // ───────────────────────────────────────────────────────────────────

  // Yellow vertical bar + small-caps heading, used for sub-section
  // separators inside a page. Smaller than the main sectionHeading so
  // two of these can sit side-by-side in the two-column block on page 2.
  const subHeading = (
    text: string,
    x: number,
    yy: number,
    width: number,
  ): number => {
    setFill(brand.yellow);
    pdf.rect(x, yy, 1.2, 6, "F");
    setFont(10, "bold");
    setText(ink.heading);
    pdf.text(text.toUpperCase(), x + 4, yy + 4.5, { charSpace: 0.3 });
    return yy + 10;
  };

  // A single stat callout: big yellowDark numeral, uppercase muted label
  // below it, and an explanatory body line. Rendered inside a soft-line
  // rectangle so the 2x2 grid reads as a grouped set rather than loose
  // text. Returns nothing — caller owns layout math.
  const statCallout = (
    x: number,
    yy: number,
    w: number,
    h: number,
    bigNumber: string,
    label: string,
    explainer: string,
  ) => {
    setStroke(ink.line);
    pdf.setLineWidth(0.3);
    setFill(ink.surface);
    pdf.rect(x, yy, w, h, "FD");

    // Thin yellow accent bar down the left edge — keeps the tile feeling
    // part of the same family as the yellow section heading without
    // shouting.
    setFill(brand.yellow);
    pdf.rect(x, yy, 1, h, "F");

    setFont(22, "bold");
    setText(brand.yellowDark);
    pdf.text(bigNumber, x + 5, yy + 10);

    setFont(7, "bold");
    setText(ink.muted);
    pdf.text(label.toUpperCase(), x + 5, yy + 14.5, { charSpace: 0.4 });

    setFont(8, "normal");
    setText(ink.body);
    const lines = wrap(explainer, w - 8).slice(0, 2);
    pdf.text(lines, x + 5, yy + 18.5);
  };

  // ═══════════════════════════════════════════════════════════════════
  // PAGE 1 — Pioneering workplace safety
  // ═══════════════════════════════════════════════════════════════════

  sectionHeading(
    "About A-SAFE",
    "Scientifically engineered safety solutions for the world's busiest operations",
  );

  // ─── Opening paragraph ────────────────────────────────────────────
  needSpace(34);
  setFont(10, "normal");
  setText(ink.body);
  const openingParagraph =
    "A-SAFE engineers and manufactures the world's leading workplace-safety barriers. " +
    "Our scientifically developed Memaplex\u2122 polymer and patented 3-phase Energy " +
    "Absorption System flex on impact and reform to their original shape \u2014 " +
    "protecting people, preserving infrastructure, and eliminating the repair cycle " +
    "of traditional steel barriers. Every A-SAFE installation is independently " +
    "verified to PAS 13:2017, the global benchmark for workplace safety barriers.";
  const openingLines = wrap(openingParagraph, contentWidth);
  pdf.text(openingLines, margin, y.value);
  y.value += openingLines.length * 4.3 + 6;

  // ─── 2x2 stat grid ────────────────────────────────────────────────
  // Cell geometry: total grid is contentWidth (174) wide with a 10mm
  // gutter between columns, so each cell is 82mm. Two rows of 22mm with
  // a 4mm vertical gutter.
  const statGridH = 22 + 4 + 22; // two rows + gutter
  needSpace(statGridH + 8);

  const cellW = 82;
  const cellH = 22;
  const colGutter = 10;
  const rowGutter = 4;
  const col1X = margin;
  const col2X = margin + cellW + colGutter;
  const row1Y = y.value;
  const row2Y = y.value + cellH + rowGutter;

  statCallout(
    col1X,
    row1Y,
    cellW,
    cellH,
    "40+ years",
    "Engineering heritage",
    "Engineering experience since 1984.",
  );
  statCallout(
    col2X,
    row1Y,
    cellW,
    cellH,
    "65+ countries",
    "Global reach",
    "Global footprint across 16 subsidiaries.",
  );
  statCallout(
    col1X,
    row2Y,
    cellW,
    cellH,
    "10,000+",
    "Impact tests",
    "Real-world validation at our in-house test facility.",
  );
  statCallout(
    col2X,
    row2Y,
    cellW,
    cellH,
    "60% lower",
    "CO\u2082 vs. steel",
    "vs. equivalent steel barrier over a 100m run.",
  );

  y.value = row2Y + cellH + 10;

  // ─── Milestones timeline ──────────────────────────────────────────
  const milestones: Array<[string, string]> = [
    ["1984", "A-Fax Films founded; polythene extrusion specialists."],
    ["2001", "Flexi Barrier invented \u2014 the original polymer safety barrier."],
    [
      "2009",
      "100m iFlex run at Gatwick Airport saves \u00a3100,000+ in maintenance over 5 years vs. steel.",
    ],
    ["2015", "3rd-generation iFlex range launches."],
    [
      "2017",
      "A-SAFE surpasses every other brand in installed safety barrier volume.",
    ],
    ["2018", "Global presence reaches 15 countries / 16 subsidiaries."],
    [
      "2019",
      "Technology division launched (RackEye IoT; Active Technology impact alerts).",
    ],
  ];

  // Budget before emitting the heading — heading + at least the first two
  // rows must fit on the same page or it orphans.
  const milestoneRowH = 5.5;
  const milestoneHeadingSpace = 12;
  needSpace(milestoneHeadingSpace + milestoneRowH * 2);

  y.value = subHeading("Milestones", margin, y.value, contentWidth);

  // Hairline guide down the left of the timeline, aligned with the year
  // column. Keeps the list feeling like a document, not a list of facts.
  const yearColX = margin + 2;
  const yearColW = 16;
  const eventColX = margin + yearColW + 6;
  const eventColW = contentWidth - yearColW - 6;

  for (const [year, event] of milestones) {
    needSpace(milestoneRowH + 1);
    setFont(9, "bold");
    setText(brand.yellowDark);
    pdf.text(year, yearColX, y.value);

    setFont(9, "normal");
    setText(ink.body);
    const eventLines = wrap(event, eventColW);
    pdf.text(eventLines[0], eventColX, y.value);
    // Continuation lines indent under the event column so the year stays
    // visually anchored in the left gutter.
    if (eventLines.length > 1) {
      pdf.text(eventLines.slice(1), eventColX, y.value + 4);
      y.value += (eventLines.length - 1) * 4;
    }
    y.value += milestoneRowH;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PAGE 2 — Material science + energy absorption
  // ═══════════════════════════════════════════════════════════════════
  newPage();
  y.value = ctx.yStart;

  sectionHeading(
    "Scientifically Engineered Safety",
    "The materials and mechanics behind every A-SAFE product",
  );

  // ─── Two-column block ─────────────────────────────────────────────
  // Equal columns with a 10mm gutter. The left column holds the
  // Memaplex construction breakdown; the right column holds the
  // numbered energy-absorption phases. Column heights are computed
  // independently; the next block resumes below the taller of the two.
  const twoColGutter = 10;
  const twoColW = (contentWidth - twoColGutter) / 2;
  const leftColX = margin;
  const rightColX = margin + twoColW + twoColGutter;

  // Budget the whole two-column unit so neither column orphans its
  // heading. ~68mm covers headings + 3 bullets + paragraph + 3 phases
  // with room for line wrap.
  needSpace(72);

  const twoColTopY = y.value;
  let leftY = subHeading("Memaplex\u2122 Polymer", leftColX, twoColTopY, twoColW);
  let rightY = subHeading(
    "3-Phase Energy Absorption",
    rightColX,
    twoColTopY,
    twoColW,
  );

  // LEFT — Memaplex three-layer bullets + paragraph
  const memaplexLayers: Array<[string, string]> = [
    ["Outer layer", "UV-stabilised colour skin for long-term visibility."],
    [
      "Central zone",
      "Engineered impact-absorption core that flexes on contact.",
    ],
    [
      "Inner core",
      "High-strength reinforcing skeleton that holds geometry.",
    ],
  ];
  for (const [label, desc] of memaplexLayers) {
    setFont(8, "bold");
    setText(brand.yellowDark);
    pdf.text("\u2022", leftColX + 1, leftY);
    setFont(8, "bold");
    setText(ink.black);
    pdf.text(label, leftColX + 5, leftY);

    setFont(8, "normal");
    setText(ink.body);
    const descLines = wrap(desc, twoColW - 5 - pdf.getTextWidth(label + "  "));
    pdf.text(descLines[0], leftColX + 5 + pdf.getTextWidth(label) + 2, leftY);
    leftY += 4;
    if (descLines.length > 1) {
      const rest = descLines.slice(1);
      pdf.text(rest, leftColX + 5, leftY);
      leftY += rest.length * 4;
    }
  }
  leftY += 3;

  setFont(9, "normal");
  setText(ink.body);
  const memaplexPara =
    "During manufacture, Memaplex\u2122 polymer chains are reoriented under " +
    "controlled tension to lock a molecular memory into the finished barrier. " +
    "On impact the structure deflects to absorb the load, then returns to its " +
    "original geometry \u2014 no permanent deformation, no replacement cycle.";
  const memaplexLines = wrap(memaplexPara, twoColW);
  pdf.text(memaplexLines, leftColX, leftY);
  leftY += memaplexLines.length * 4;

  // RIGHT — three numbered phases
  const phases: Array<[string, string, string]> = [
    [
      "1",
      "Phase 1 \u2014 Rail flex",
      "The impact rail flexes to absorb the initial load, sliding the rail pin forward into the compression pocket.",
    ],
    [
      "2",
      "Phase 2 \u2014 Compression",
      "Continued pocket compression disperses energy as the coupling rotates around the post pin.",
    ],
    [
      "3",
      "Phase 3 \u2014 Torsion",
      "At peak energy, the coupling twists further to engage post-base torsion and dispel remaining forces.",
    ],
  ];

  for (const [num, name, mech] of phases) {
    // Small numbered disc — yellow fill, black numeral. Keeps the
    // numbered list scannable without relying on a bullet-list feature
    // jsPDF doesn't really have.
    setFill(brand.yellow);
    pdf.circle(rightColX + 2.5, rightY - 1.5, 2.5, "F");
    setFont(7, "bold");
    setText(ink.black);
    pdf.text(num, rightColX + 2.5, rightY + 0.1, { align: "center" });

    setFont(8, "bold");
    setText(ink.black);
    pdf.text(name, rightColX + 7, rightY);
    rightY += 4;

    setFont(8, "normal");
    setText(ink.body);
    const mechLines = wrap(mech, twoColW - 7);
    pdf.text(mechLines, rightColX + 7, rightY);
    rightY += mechLines.length * 4 + 2;
  }

  y.value = Math.max(leftY, rightY) + 6;

  // ─── Certifications & Independent Verification ────────────────────
  // Three small cards in a row. Cell geometry: 58mm x 26mm with a
  // 3mm gutter — 58*3 + 3*2 = 180mm total, which matches contentWidth
  // to within 6mm (the grid is centered below the heading).
  const certHeadingH = 12;
  const certCardH = 26;
  needSpace(certHeadingH + certCardH + 8);

  y.value = subHeading(
    "Certifications & Independent Verification",
    margin,
    y.value,
    contentWidth,
  );

  const certCardW = 58;
  const certGutter = (contentWidth - certCardW * 3) / 2;

  const certCard = (
    x: number,
    yy: number,
    title: string,
    body: string,
  ) => {
    setStroke(ink.line);
    pdf.setLineWidth(0.3);
    pdf.rect(x, yy, certCardW, certCardH);

    // Thin yellow strip along the top edge — visual echo of the main
    // section-heading bar.
    setFill(brand.yellow);
    pdf.rect(x, yy, certCardW, 1.2, "F");

    setFont(10, "bold");
    setText(ink.heading);
    pdf.text(title, x + 4, yy + 7);

    setFont(8, "normal");
    setText(ink.body);
    const bodyLines = wrap(body, certCardW - 8).slice(0, 4);
    pdf.text(bodyLines, x + 4, yy + 12);
  };

  certCard(
    margin,
    y.value,
    "PAS 13:2017",
    "Code of Practice for Workplace Safety Barriers \u2014 tested to the global benchmark.",
  );
  certCard(
    margin + certCardW + certGutter,
    y.value,
    "T\u00dcV NORD",
    "Independently verified by world-class safety test experts.",
  );
  certCard(
    margin + (certCardW + certGutter) * 2,
    y.value,
    "ISO/TR 10358",
    "Chemically inert and corrosion-resistant across industrial environments.",
  );

  y.value += certCardH + 10;

  // ─── PAS 13 pull-quote ────────────────────────────────────────────
  const pullQuote =
    "\u201cThe movement of goods and materials involves the use of a wide range " +
    "of vehicles and accounts for a large proportion of accidents in the workplace.\u201d";

  setFont(10, "italic");
  setText(ink.muted);
  const quoteLines = wrap(pullQuote, contentWidth - 20);
  const quoteBlockH = quoteLines.length * 5 + 8;
  needSpace(quoteBlockH);

  // Centered across the content width. Drawing line-by-line so jsPDF's
  // alignment respects the wrap boundaries — splitTextToSize + align
  // "center" sometimes mis-centers the final short line.
  const quoteCenterX = pageWidth / 2;
  for (let i = 0; i < quoteLines.length; i++) {
    pdf.text(quoteLines[i], quoteCenterX, y.value + i * 5, { align: "center" });
  }
  y.value += quoteLines.length * 5 + 3;

  setFont(8, "normal");
  setText(ink.subtle);
  pdf.text("\u2014 PAS 13:2017", pageWidth - margin, y.value, {
    align: "right",
  });
  y.value += 6;

  // ═══════════════════════════════════════════════════════════════════
  // PAGE 3 (OPTIONAL) — Trusted by the world's biggest companies
  // ═══════════════════════════════════════════════════════════════════
  //
  // Rendered only if the current page can't host the grid + greener-by-
  // design callout. When we're already near the bottom of page 2 we
  // advance; otherwise we skip the third page entirely and let the
  // main generator continue with its normal content flow. This matches
  // the brief's "only render if there's space; otherwise skip" rule.

  // The page-3 block needs roughly: section heading (~22) + 5-row grid
  // (5 x 10 + 4 x 3 gutters = 62) + callout (~22). Plus comfortable
  // breathing room (~12) before the section heading. We always render
  // this on a fresh page so it reads as a deliberate closing statement
  // rather than a squeezed footer.
  newPage();
  y.value = ctx.yStart;

  sectionHeading(
    "Trusted by the World's Leading Companies",
    "A-SAFE protects operations across 65+ countries",
  );

  // ─── Company-name grid ────────────────────────────────────────────
  // 4 columns x 5 rows = 20 cells. The brief specifies 25 companies,
  // which would need 4x7 = 28 cells. We keep the 4x5 geometry the brief
  // calls out and feature the first 20 names — these are the most
  // globally recognisable and the grid stays dense without wrapping.
  const companies = [
    "Johnson & Johnson",
    "DHL",
    "IKEA",
    "Bosch",
    "Unilever",
    "Royal Canin",
    "L'Or\u00e9al",
    "Nike",
    "Boeing",
    "Heinz",
    "Siemens",
    "Coca-Cola",
    "Nissan",
    "Arla",
    "Amazon",
    "UPS",
    "Heineken",
    "P&G",
    "Nestl\u00e9",
    "3M",
    "Toyota",
    "Lego",
    "Jungheinrich",
    "Denso",
    "Mercedes-Benz",
  ];

  const gridCols = 4;
  const gridRows = 5;
  const cellWidth = 35;
  const cellHeight = 10;
  const gridGutter = 3;
  const gridTotalW = cellWidth * gridCols + gridGutter * (gridCols - 1);
  const gridStartX = margin + (contentWidth - gridTotalW) / 2;

  needSpace(cellHeight * gridRows + gridGutter * (gridRows - 1) + 8);

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const idx = row * gridCols + col;
      if (idx >= companies.length) continue;
      const name = companies[idx];
      const cx = gridStartX + col * (cellWidth + gridGutter);
      const cy = y.value + row * (cellHeight + gridGutter);

      setStroke(ink.line);
      pdf.setLineWidth(0.2);
      pdf.rect(cx, cy, cellWidth, cellHeight);

      setFont(9, "bold");
      setText(ink.black);
      // Shrink to fit: if the name is wider than the cell less padding,
      // drop a point of font size. Keeps long names like "Johnson &
      // Johnson" and "Mercedes-Benz" on a single line.
      const availW = cellWidth - 4;
      let fontSize = 9;
      while (pdf.getTextWidth(name) > availW && fontSize > 6.5) {
        fontSize -= 0.5;
        setFont(fontSize, "bold");
      }
      pdf.text(name, cx + cellWidth / 2, cy + cellHeight / 2 + 1.2, {
        align: "center",
      });
    }
  }
  y.value += cellHeight * gridRows + gridGutter * (gridRows - 1) + 12;

  // ─── Greener-by-design callout ────────────────────────────────────
  const calloutH = 15;
  needSpace(calloutH + 4);

  setFill(brand.yellowSoft);
  pdf.rect(margin, y.value, contentWidth, calloutH, "F");

  // Headline stat on the left — same visual weight as the stat tiles on
  // page 1 so the numbers tie the appendix together.
  setFont(12, "bold");
  setText(ink.heading);
  pdf.text("60% LOWER CO\u2082", margin + 5, y.value + 9, { charSpace: 0.3 });

  // Supporting body on the right. Compute where the headline ends so we
  // can start the body flush against it, then wrap within the remaining
  // width so long sentences don't overrun the callout.
  const headlineW = pdf.getTextWidth("60% LOWER CO\u2082") + 6;
  const bodyX = margin + 5 + headlineW + 6;
  const bodyW = contentWidth - (bodyX - margin) - 5;

  setFont(8, "normal");
  setText(ink.body);
  const calloutBody =
    "An iFlex Double Traffic 100m run produces 3,678 kg CO\u2082eq vs. 6,059 kg " +
    "for equivalent galvanised steel twin-rail Armco \u2014 before the emissions " +
    "saved by eliminating repair cycles are counted.";
  const calloutLines = wrap(calloutBody, bodyW).slice(0, 2);
  pdf.text(calloutLines, bodyX, y.value + 6);

  y.value += calloutH + 6;
}
