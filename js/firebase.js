/* ==========================================================================
   FLOA — Firestore lead capture
   נטען כ-module. שומר כל פנייה מהטופס באוסף "leads" ב-Cloud Firestore.
   ה-firebaseConfig ציבורי מעצם הגדרתו; ההגנה על המידע היא דרך Security Rules
   (ראו README) — כתיבה בלבד, ללא קריאה.
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCY9G7E-QDlfq1T49JMTORlFwY6PsKYop0",
  authDomain: "floa-7506f.firebaseapp.com",
  projectId: "floa-7506f",
  storageBucket: "floa-7506f.firebasestorage.app",
  messagingSenderId: "866116829150",
  appId: "1:866116829150:web:a0812f68004829e9a7274f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// נחשף ל-main.js. מחזיר Promise; לעולם לא זורק בצורה שתשבור את הטופס.
window.floaSaveLead = function (data) {
  return addDoc(collection(db, "leads"), {
    name:      (data.name || "").toString().slice(0, 100),
    phone:     (data.phone || "").toString().slice(0, 40),
    business:  (data.business || "").toString().slice(0, 120),
    help:      (data.help || "").toString().slice(0, 60),
    improve:   (data.improve || "").toString().slice(0, 2000),
    source:    "floa-landing",
    createdAt: serverTimestamp()
  });
};
