import { html, raw } from "../../lib/html.js";

/* Every icon in the site, in one place. All are 24×24 line icons on a shared
   stroke recipe (the exceptions declare what they override), so any component
   can ask for one by name and get something that looks like it belongs. */
const ICONS = {
  website:    `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 6.5h.01M10 6.5h.01"/>`,
  leads:      `<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 8h5M16 12h5M16 16h3"/>`,
  automation: `<path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5"/><circle cx="12" cy="12" r="3.2"/>`,
  app:        `<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>`,
  /* an admin screen: sidebar beside panels */
  system:     `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>`,
  picture:    `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 15.5 16 11 6 20"/>`,
  /* bars in a panel: the dashboards, controls and reports an admin screen shows */
  chart:      `<path d="M4 19V9M9 19v-6M14 19v-9M19 19V6"/><path d="M3 21h18"/>`,
  /* two links of a chain: systems that already exist, joined up */
  link:       `<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.2-1.2"/>`,
  /* a page with a folded corner: the forms, documents and invoices in a flow */
  doc:        `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>`,
  /* concentric rings: one message, one action, nothing else on the page */
  target:     `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`,
  /* an arrow coming back round: taking something that exists and lifting it */
  upgrade:    `<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M19.5 3.5V6.5H16.5"/><path d="M12 15.5V9M9 12l3-3 3 3"/>`,

  /* --- identity & access set: for a business whose whole subject is who may
     reach what. A shield that has been checked, a key, a pair of people, a
     fingerprint, a mesh of things, a chip, an ID badge. --- */
  shield:      `<path d="M12 3l7 3v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3Z"/><path d="m9 11.6 2.2 2.2L15.5 9.3"/>`,
  key:         `<circle cx="8" cy="8" r="3.6"/><path d="m10.6 10.6 8.4 8.4"/><path d="m19 19 1.8-1.8M16.4 16.4l1.8-1.8"/>`,
  users:       `<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.1a3.2 3.2 0 0 1 0 6.1M20.5 19a5.5 5.5 0 0 0-3-3.9"/>`,
  fingerprint: `<path d="M12 4a7 7 0 0 0-7 7v1"/><path d="M12 8a4 4 0 0 0-4 4v2a2 2 0 0 0 2 2"/><path d="M12 12v3"/><path d="M16 11a4 4 0 0 0-1.2-2.8"/><path d="M19 11a7 7 0 0 0-2-4.9"/>`,
  network:     `<circle cx="12" cy="12" r="2.4"/><circle cx="5" cy="5.5" r="1.7"/><circle cx="19" cy="5.5" r="1.7"/><circle cx="5" cy="18.5" r="1.7"/><circle cx="19" cy="18.5" r="1.7"/><path d="m6.3 6.7 3.6 3.6M17.7 6.7l-3.6 3.6M6.3 17.3l3.6-3.6M17.7 17.3l-3.6-3.6"/>`,
  chip:        `<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 6.5V3.5M14.5 6.5V3.5M9.5 20.5v-3M14.5 20.5v-3M6.5 9.5h-3M6.5 14.5h-3M20.5 9.5h-3M20.5 14.5h-3"/>`,
  badge:       `<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10.5" r="2.2"/><path d="M5.2 16a3.3 3.3 0 0 1 6.6 0"/><path d="M14.5 9.5H19M14.5 13H18"/>`,

  check:      { strokeWidth: 2.2, body: `<path d="M20 6 9 17l-5-5"/>` },
  arrow:      { viewBox: "0 0 40 24", strokeWidth: 1.6, body: `<path d="M38 12H2"/><path d="M10 4 2 12l8 8"/>` },

  whatsapp:   { fill: true, body: `<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.882 11.882 0 005.71 1.454h.006c6.585 0 11.946-5.358 11.949-11.945a11.9 11.9 0 00-3.495-8.42"/>` },
};

export function icon(name) {
  const spec = ICONS[name];
  if (!spec) throw new Error(`icon: unknown "${name}"`);
  const { viewBox = "0 0 24 24", strokeWidth = 1.5, fill = false, body = spec } = spec;

  return fill
    ? html`<svg viewBox="${viewBox}" fill="currentColor">${raw(body)}</svg>`
    : html`<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${raw(body)}</svg>`;
}
