import { html, raw } from "#lib/html.js";

/* ==========================================================================
   The measurement tags, for whichever business is being rendered.

   Nothing loads unless that business has filled in a real id. An empty id is not
   a broken state, it is the normal one: a client who does not advertise gets no
   pixel, no third-party script, and no cookie banner to answer for.

   The pixel goes on EVERY page of the business, not on a campaign page only. A
   pixel that sees just one page cannot tell you that the visitor who clicked the
   ad read the homepage first, and it cannot build an audience out of anyone who
   did not land on that one page.

   What the pixel fires here is only PageView. The events that matter — a
   WhatsApp click, a lead — are fired from core.client.js, at the moment they
   actually happen. See the note there.
   ========================================================================== */
export const analyticsHead = ({ ga4, metaPixel } = {}) => html`${ga4 ? html`
  <script async src="https://www.googletagmanager.com/gtag/js?id=${ga4}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${ga4}");</script>` : ""}${metaPixel ? html`
  <script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,"script","https://connect.facebook.net/en_US/fbevents.js");
  fbq("init","${metaPixel}");fbq("track","PageView");</script>
  <noscript><img height="1" width="1" style="display:none" alt=""
    src="${raw(`https://www.facebook.com/tr?id=${metaPixel}&ev=PageView&noscript=1`)}"></noscript>` : ""}`;
