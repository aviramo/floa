/* The local dev server (scripts/dev.mjs) as a browser origin: plain http on localhost or 127.0.0.1, any port, and the same server
   reached from a phone on the private LAN (192.168.x.x, 10.x.x.x), any port. No https origin is a dev origin. Loadable by plain node. */
const DEV = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/;

export const isDevOrigin = (origin) => typeof origin === "string" && DEV.test(origin);

/* a list of origins (a business's lead origins, ALLOWED_ORIGINS): an exact member passes; a dev origin passes when the list
   holds any dev origin ("http://localhost" in a manifest stands for all of them), so a business without one stays without */
export const originIn = (list, origin) => list.includes(origin) || (isDevOrigin(origin) && list.some(isDevOrigin));
