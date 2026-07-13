import { html, raw } from "../../lib/html.js";

/* Every icon in the site, in one place. All are 24×24 line icons on a shared
   stroke recipe (the exceptions declare what they override), so any component
   can ask for one by name and get something that looks like it belongs. */
const ICONS = {
  website:    `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 6.5h.01M10 6.5h.01"/>`,
  leads:      `<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 8h5M16 12h5M16 16h3"/>`,
  automation: `<path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5"/><circle cx="12" cy="12" r="3.2"/>`,
  app:        `<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>`,
  marketing:  `<path d="M4 19V9M9 19v-6M14 19v-9M19 19V6"/><path d="M3 21h18"/>`,
  /* an admin screen: sidebar beside panels */
  system:     `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>`,
  picture:    `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 15.5 16 11 6 20"/>`,

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
