/* ==========================================================================
   FLOA — Admin core
   ניהול הלידים. מודול משותף לשני דפי הניהול (רשימה + טיפול בליד יחיד):
   אתחול Firebase, שער הזדהות דרך Google, וגישה משותפת ל-Firestore.

   ההרשאה בפועל אוכפת דרך Firestore Security Rules (ראו README) — הרשימה כאן
   רק מחליטה מה מציגים למשתמש; מי שלא ברשימה פשוט לא יקבל נתונים מהשרת.
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, updateDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* אותה תצורה ציבורית כמו js/firebase.js — היא מזהה את הפרויקט, לא סוד. */
const firebaseConfig = {
  apiKey: "AIzaSyCY9G7E-QDlfq1T49JMTORlFwY6PsKYop0",
  authDomain: "floa-7506f.firebaseapp.com",
  projectId: "floa-7506f",
  storageBucket: "floa-7506f.firebasestorage.app",
  messagingSenderId: "866116829150",
  appId: "1:866116829150:web:a0812f68004829e9a7274f"
};

/* ── מי מורשה לנהל לידים ──────────────────────────────────────────────────
   כתובות ה-Gmail (או Google Workspace) שרשאיות להיכנס. חובה שיהיו זהות
   לרשימה שב-Firestore Security Rules. להוספת מנהל: מוסיפים כתובת כאן וגם
   בכללי האבטחה בקונסולת Firebase. */
export const ADMIN_EMAILS = [
  "ofir.aviram@gmail.com",
];

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);
auth.languageCode = "he";

export { collection, doc, getDoc, getDocs, updateDoc, query, orderBy, serverTimestamp };

const isAdmin = (user) =>
  !!user && user.emailVerified && ADMIN_EMAILS.includes((user.email || "").toLowerCase());

/* מחליף בין שני מסכים ידועים לפי id */
function show(id) {
  ["authGate", "appView"].forEach((el) => {
    const node = document.getElementById(el);
    if (node) node.hidden = el !== id;
  });
}

/* פותח את חלון ההזדהות של Google */
async function login(errEl) {
  if (errEl) errEl.hidden = true;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.warn("FLOA admin: sign-in failed —", err && err.code);
    if (err && err.code === "auth/popup-closed-by-user") return;
    if (errEl) {
      errEl.textContent = "ההתחברות נכשלה. נסו שוב.";
      errEl.hidden = false;
    }
  }
}

export const logout = () => signOut(auth);

/* השער: קורא ל-onReady(user) רק כשמשתמש מורשה מחובר, אחרת מציג מסך התחברות.
   מחזיר גם helper לניתוק. */
export function guard(onReady) {
  const loginBtn = document.getElementById("loginBtn");
  const errEl = document.getElementById("authError");
  const denied = document.getElementById("authDenied");
  const logoutBtns = document.querySelectorAll("[data-logout]");

  if (loginBtn) loginBtn.addEventListener("click", () => login(errEl));
  logoutBtns.forEach((b) => b.addEventListener("click", () => logout()));

  onAuthStateChanged(auth, (user) => {
    if (isAdmin(user)) {
      if (denied) denied.hidden = true;
      const whoami = document.getElementById("whoami");
      if (whoami) whoami.textContent = user.email;
      show("appView");
      onReady(user);
    } else if (user) {
      /* מחובר לגוגל אבל לא ברשימת המנהלים */
      if (denied) {
        denied.hidden = false;
        denied.textContent = `החשבון ${user.email} אינו מורשה לניהול הלידים.`;
      }
      show("authGate");
    } else {
      if (denied) denied.hidden = true;
      show("authGate");
    }
  });
}

/* ── עזרי תצוגה משותפים ──────────────────────────────────────────────── */

/* מנרמל מסמך ליד לאובייקט תצוגה אחיד, כולל סטטוס ברירת מחדל */
export function normalizeLead(id, data) {
  return {
    id,
    name: data.name || "",
    phone: data.phone || "",
    business: data.business || "",
    help: data.help || "",
    improve: data.improve || "",
    source: data.source || "",
    status: data.status || "open",
    notes: data.notes || "",
    createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null,
    handledAt: data.handledAt && data.handledAt.toDate ? data.handledAt.toDate() : null,
    handledBy: data.handledBy || "",
  };
}

export const STATUSES = [
  { value: "open", label: "חדש" },
  { value: "in_progress", label: "בטיפול" },
  { value: "done", label: "טופל" },
];

export const statusLabel = (v) => (STATUSES.find((s) => s.value === v) || STATUSES[0]).label;

/* תאריך בעברית, קצר וקריא */
export function formatDate(d) {
  if (!d) return "—";
  return d.toLocaleString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/* מנקה מספר טלפון לשימוש בקישור tel:/wa.me */
export function telHref(phone) {
  return (phone || "").replace(/[^\d+]/g, "");
}
export function waHref(phone) {
  let p = (phone || "").replace(/[^\d]/g, "");
  if (p.startsWith("0")) p = "972" + p.slice(1);
  return p ? `https://wa.me/${p}` : "";
}
