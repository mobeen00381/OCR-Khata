function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ParchiLine {
  name: string;
  qty: string;
  rate: string;
  amount: string;
}

interface ParchiConfig {
  shop: string;
  party: string;
  parchi: string;
  date: string;
  lines: ParchiLine[];
  extra?: string;
  total: string;
  mode: string;
  tilt?: number;
  stamp?: string;
}

function makeParchi(config: ParchiConfig) {
  const rows = config.lines
    .map(
      (line, index) => `
        <g transform="translate(0, ${index * 48})">
          <text x="55" y="0" class="hand" font-size="19">${escapeXml(line.name)}</text>
          <text x="338" y="0" class="hand" font-size="17" text-anchor="middle">${escapeXml(line.qty)}</text>
          <text x="420" y="0" class="hand" font-size="17" text-anchor="end">${escapeXml(line.rate)}</text>
          <text x="505" y="0" class="hand" font-size="17" text-anchor="end">${escapeXml(line.amount)}</text>
        </g>`,
    )
    .join("");

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="560" height="720" viewBox="0 0 560 720">
    <defs>
      <linearGradient id="desk" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#DCE2E8"/>
        <stop offset="0.52" stop-color="#C4CBD5"/>
        <stop offset="1" stop-color="#B4BCC8"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0F172A" flood-opacity="0.30"/>
      </filter>
      <filter id="paper" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" stitchTiles="stitch" result="noise"/>
        <feColorMatrix type="saturate" values="0" in="noise" result="gray"/>
        <feComponentTransfer in="gray" result="faint">
          <feFuncA type="table" tableValues="0 0.055"/>
        </feComponentTransfer>
        <feBlend in="SourceGraphic" in2="faint" mode="multiply"/>
      </filter>
      <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse">
        <path d="M 22 0 L 0 0 0 22" fill="none" stroke="#0F172A" stroke-opacity="0.03" stroke-width="1"/>
      </pattern>
      <style>
        .hand { font-family: "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive; fill: #172554; }
        .label { font-family: Inter, Segoe UI, sans-serif; fill: #475569; letter-spacing: 1.6px; }
        .ink { fill: #0F172A; }
      </style>
    </defs>
    <rect width="560" height="720" fill="url(#desk)"/>
    <rect width="560" height="720" fill="url(#grid)"/>
    <g transform="rotate(${config.tilt ?? -1.4} 280 360)" filter="url(#shadow)">
      <path d="M58 34 H502 L500 677 L469 688 L439 679 L406 690 L373 680 L338 690 L303 681 L270 690 L235 681 L201 690 L166 680 L132 690 L99 680 L63 688 Z" fill="#FBF7EA" filter="url(#paper)"/>
      <path d="M63 39 H497" stroke="#D6CDB4" stroke-width="1.5" stroke-dasharray="4 6"/>
      <text x="280" y="92" text-anchor="middle" class="ink" font-family="Manrope, Segoe UI, sans-serif" font-size="22" font-weight="800" letter-spacing="1.4">${escapeXml(config.shop)}</text>
      <text x="280" y="116" text-anchor="middle" class="label" font-size="9.5">STAINLESS STEEL PIPES • TUBES • FABRICATION</text>
      <line x1="72" y1="136" x2="488" y2="136" stroke="#172554" stroke-opacity="0.42" stroke-width="1.2"/>
      <text x="72" y="161" class="hand" font-size="17">Parchi: ${escapeXml(config.parchi)}</text>
      <text x="488" y="161" text-anchor="end" class="hand" font-size="15">${escapeXml(config.date)}</text>
      <text x="72" y="188" class="hand" font-size="17">Party: ${escapeXml(config.party)}</text>
      <text x="72" y="229" class="label" font-size="9.5">ITEM / SIZE</text>
      <text x="338" y="229" text-anchor="middle" class="label" font-size="9.5">QTY</text>
      <text x="420" y="229" text-anchor="end" class="label" font-size="9.5">RATE</text>
      <text x="505" y="229" text-anchor="end" class="label" font-size="9.5">AMOUNT</text>
      <line x1="72" y1="240" x2="488" y2="240" stroke="#172554" stroke-opacity="0.22" stroke-dasharray="3 5"/>
      <g transform="translate(0, 278)">${rows}</g>
      <line x1="72" y1="${278 + config.lines.length * 48 + 8}" x2="488" y2="${278 + config.lines.length * 48 + 8}" stroke="#172554" stroke-opacity="0.22" stroke-dasharray="3 5"/>
      <text x="72" y="${278 + config.lines.length * 48 + 40}" class="hand" font-size="16">${escapeXml(config.extra || "Mazdoori / Loading: —")}</text>
      <line x1="300" y1="${278 + config.lines.length * 48 + 62}" x2="488" y2="${278 + config.lines.length * 48 + 62}" stroke="#172554" stroke-opacity="0.5" stroke-width="1.4"/>
      <text x="340" y="${278 + config.lines.length * 48 + 94}" class="label" font-size="10">TOTAL</text>
      <text x="488" y="${278 + config.lines.length * 48 + 96}" text-anchor="end" class="hand" font-size="27" font-weight="700">Rs. ${escapeXml(config.total)}</text>
      <g transform="translate(72 ${Math.min(615, 508 + config.lines.length * 10)}) rotate(-3)">
        <rect x="0" y="0" width="146" height="31" rx="4" fill="none" stroke="#B91C1C" stroke-opacity="0.7" stroke-width="2"/>
        <text x="73" y="21" text-anchor="middle" fill="#B91C1C" fill-opacity="0.8" font-family="Manrope, Segoe UI, sans-serif" font-size="11" font-weight="800" letter-spacing="2">${escapeXml(config.mode)}</text>
      </g>
      <text x="488" y="646" text-anchor="end" class="hand" font-size="15">— ${escapeXml(config.stamp || "Malik Steel")}</text>
      <text x="280" y="674" text-anchor="middle" class="label" font-size="7.5">MOBILE: 0300-1234567 • 24 FT ROAD, LAHORE</text>
    </g>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const shop = "MALIK STEEL PIPE STORE";

export const sampleParchiImage = makeParchi({
  shop,
  party: "Nadeem Fabricators — Sialkot Rd",
  parchi: "1042",
  date: "25 / 11 / 2026",
  lines: [
    { name: '10 nali 1.5" 18G 304', qty: "10", rate: "3,200", amount: "32,000" },
    { name: '4 nali 1" 18G 304', qty: "4", rate: "2,350", amount: "9,400" },
    { name: '2 nali 2" 14G 304', qty: "2", rate: "7,900", amount: "15,800" },
  ],
  extra: "Mazdoori: 800",
  total: "58,000",
  mode: "UDHAAR",
  tilt: -1.8,
  stamp: "Nadeem",
});

export const demoBillImages = [
  makeParchi({
    shop,
    party: "Hammad Steel Works — Adda",
    parchi: "1041",
    date: "25 / 11 / 2026",
    lines: [
      { name: '6 nali 1.5" 304 18G', qty: "6", rate: "3,250", amount: "19,500" },
      { name: '2 nali 2" 304 16G', qty: "2", rate: "5,850", amount: "11,700" },
    ],
    extra: "Mazdoori: 800",
    total: "32,000",
    mode: "UDHAAR",
    stamp: "Hammad",
  }),
  makeParchi({
    shop,
    party: "Cash Counter / Walk-in",
    parchi: "1043",
    date: "25 / 11 / 2026",
    lines: [
      { name: '12 nali 3/4" 304 18G', qty: "12", rate: "1,680", amount: "20,160" },
      { name: '5 nali 1" 304 18G', qty: "5", rate: "2,350", amount: "11,750" },
    ],
    extra: "Loading: 300",
    total: "32,210",
    mode: "NAQAD",
    tilt: 1.1,
    stamp: "Counter",
  }),
  makeParchi({
    shop,
    party: "Ch. Aslam & Sons — Gujranwala",
    parchi: "1044",
    date: "25 / 11 / 2026",
    lines: [
      { name: '10 nali 1.5" 18G 304', qty: "10", rate: "3,200", amount: "32,000" },
    ],
    extra: "Mazdoori: 500",
    total: "32,500",
    mode: "UDHAAR",
    tilt: -0.7,
    stamp: "Aslam",
  }),
  makeParchi({
    shop,
    party: "Rehman Engineering — Model Town",
    parchi: "1045",
    date: "25 / 11 / 2026",
    lines: [
      { name: '4 nali 2" SQ 201 16G', qty: "4", rate: "4,600", amount: "18,400" },
    ],
    extra: "Loading: —",
    total: "18,400",
    mode: "NAQAD",
    tilt: 1.7,
    stamp: "Rehman",
  }),
  makeParchi({
    shop,
    party: "Al-Madina Traders — Badami Bagh",
    parchi: "AP-219",
    date: "25 / 11 / 2026",
    lines: [
      { name: '20 nali 2" 304 16G', qty: "20", rate: "4,600", amount: "92,000" },
    ],
    extra: "Freight: 2,000",
    total: "94,000",
    mode: "PART CASH",
    tilt: -1.2,
    stamp: "Supplier",
  }),
  makeParchi({
    shop,
    party: "Hammad Steel Works — Adda",
    parchi: "1038",
    date: "22 / 11 / 2026",
    lines: [
      { name: '20 nali 1" 304 18G', qty: "20", rate: "2,320", amount: "46,400" },
      { name: '6 nali 1.25" 304 16G', qty: "6", rate: "4,150", amount: "24,900" },
    ],
    extra: "Mazdoori: 700",
    total: "72,000",
    mode: "UDHAAR",
    stamp: "Hammad",
  }),
];

export function demoBillImage(index: number) {
  return demoBillImages[index % demoBillImages.length];
}
