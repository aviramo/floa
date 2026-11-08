/* ==========================================================================
   Characters a text field may not carry, shared by every place in the Worker
   that validates or cleans text (field checks, the sender name, mail
   variables, subjects, webhook URLs).

   HIDDEN are the characters that change what a reader sees without being
   visible themselves: the bidi embeddings and overrides (U+202A to U+202E), the
   bidi isolates (U+2066 to U+2069), the zero-width characters (U+200B to U+200D)
   and the byte order mark / zero-width no-break space (U+FEFF). A name written
   with them can display as another name, an address as another address, and two
   people who look identical can be two different rows.

   The database refuses the same set (roster_valid_name); the Worker says no
   first, and cleans the same set out of anything it prints into a mail.
   ========================================================================== */

const HIDDEN_RE = /[\u200b-\u200d\u202a-\u202e\u2066-\u2069\ufeff]/;
const HIDDEN_ALL_RE = /[\u200b-\u200d\u202a-\u202e\u2066-\u2069\ufeff]/g;

export const hasHidden = (s) => HIDDEN_RE.test(s);
export const stripHidden = (s) => s.replace(HIDDEN_ALL_RE, "");
