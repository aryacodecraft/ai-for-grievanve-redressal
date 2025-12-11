// functions/admin.api.js
// Stable Firebase / Firestore API wrapper. Edit this only when backend behavior changes.

const firebaseConfig = {
  apiKey: "AIzaSyAWTsTs_NEav91LKQ5jLrVf3ojsLYAY4XI",
  authDomain: "grievance-redressal-syst-627d7.firebaseapp.com",
  projectId: "grievance-redressal-syst-627d7",
  storageBucket: "grievance-redressal-syst-627d7.firebasestorage.app",
  messagingSenderId: "47862331768",
  appId: "1:47862331768:web:423bb1a0ac46e259d1b08d",
  measurementId: "G-YX2Y3RFF3P"
};

// Ensure firebase libs are available (they are loaded in admin.html)
if (!window.firebase) {
  throw new Error("Firebase SDK not found. Make sure admin.html includes Firebase scripts before admin.api.js");
}

// Initialize app only once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Admin whitelist (same as before)
export const ADMIN_EMAILS = ["aryaadmin@gmail.com"];

/**
 * Subscribe to grievances collection (ordered by createdAt desc).
 * callback receives (itemsArray)
 * returns unsubscribe function
 */
export function subscribeGrievancesRealtime(onChange, onError) {
  const q = db.collection("grievances").orderBy("createdAt", "desc");
  const unsub = q.onSnapshot(snapshot => {
    const items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    onChange(items);
  }, err => {
    if (typeof onError === "function") onError(err);
  });
  return unsub;
}

/** One-time fetch of grievances (array) */
export async function fetchGrievancesOnce() {
  const snap = await db.collection("grievances").orderBy("createdAt", "desc").get();
  const arr = [];
  snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
  return arr;
}

/** Mark a grievance resolved by id */
export async function markResolved(id) {
  if (!id) throw new Error("id required");
  await db.collection("grievances").doc(id).update({ status: "resolved" });
  return true;
}

/** Recategorize or update fields on a grievance (partial update) */
export async function updateGrievance(id, patch = {}) {
  if (!id) throw new Error("id required");
  await db.collection("grievances").doc(id).update(patch);
  return true;
}

/** Auth helpers */
export async function signInWithEmail(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}
export function signOut() { return auth.signOut(); }
export function onAuthStateChanged(fn) { return auth.onAuthStateChanged(fn); }
export function getCurrentUser() { return auth.currentUser; }

// small helper exported for UI to open marker/popups if needed
export function getMarkerDataSnapshotConvert(snapshot) {
  const items = [];
  snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
  return items;
}

// Export the low-level objects in case UI needs advanced ops
export { auth as firebaseAuth, db as firestoreDB };
