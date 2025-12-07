// tools/recategorize.js
import admin from "firebase-admin";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------- PATH SETUP ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend/.env (same as server.js)
dotenv.config({
  path: path.join(__dirname, "..", "backend", ".env"),
});

// ---------- Firebase Admin init ----------
const serviceKeyPath = path.join(
  __dirname,
  "..",
  "backend",
  "serviceAccountKey.json"
);

let serviceAccount;
try {
  const json = await fs.readFile(serviceKeyPath, "utf-8");
  serviceAccount = JSON.parse(json);
} catch (err) {
  console.error("❌ Failed to load serviceAccountKey.json from:", serviceKeyPath);
  console.error(err);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// ---------- MODEL CONFIG ----------
const HF_API_TOKEN =
  process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_TOKEN;

if (!HF_API_TOKEN) {
  console.error("❌ HF_API_TOKEN / HUGGINGFACE_API_TOKEN not set in backend/.env");
  process.exit(1);
}

// ✅ same base URL as server.js
const HF_BASE_URL = "https://router.huggingface.co/hf-inference";

const CATEGORY_MODEL = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli";
const PRIORITY_MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest";

const CATEGORY_LABELS = [
  "Issues related to water supply, water pressure, contamination, or no water",
  "Issues related to roads, potholes, footpaths, traffic, or road damage",
  "Issues related to electricity, power cuts, voltage fluctuations, or streetlights not working",
  "Issues related to sanitation, garbage, sewage, drainage, or public cleanliness",
  "Issues related to health services, hospitals, clinics, medicines, or public health",
  "Issues related to governance, staff behavior, corruption, permissions, or government service delays",
  "Other issues not matching the above categories",
];

const CATEGORY_KEYS = [
  "water",
  "roads",
  "electricity",
  "sanitation",
  "health",
  "governance",
  "other",
];

function mapLabelToKey(label) {
  const idx = CATEGORY_LABELS.indexOf(label);
  return idx === -1 || !CATEGORY_KEYS[idx] ? "other" : CATEGORY_KEYS[idx];
}

const URGENT_KEYWORDS = [
  "urgent",
  "emergency",
  "immediately",
  "asap",
  "accident",
  "fire",
  "flood",
  "electrocution",
  "collapsed",
  "burst",
  "serious",
  "critical",
  "life threatening",
  "danger",
  "injury",
  "major issue",
  "no water",
  "no electricity",
];

const SANITATION_KEYWORDS = [
  "garbage",
  "waste",
  "trash",
  "dustbin",
  "sewage",
  "sewer",
  "drainage",
  "drain",
  "litter",
  "dirty",
  "filth",
  "smell",
  "stink",
  "stray animals",
  "dump",
  "waste collection",
  "garbage collection",
];

function findUrgentMatches(text) {
  const lower = text.toLowerCase();
  return URGENT_KEYWORDS.filter((word) => lower.includes(word));
}

function extractKeywords(text, topK = 5) {
  const tokens = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "there",
    "their",
    "was",
    "were",
    "from",
    "will",
    "your",
    "you",
    "are",
    "sir",
    "madam",
    "please",
    "kindly",
    "city",
    "area",
    "ward",
  ]);
  const freq = {};
  for (let t of tokens) if (!stop.has(t)) freq[t] = (freq[t] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([w]) => w);
}

function inferCategoryFromKeywords(text) {
  const lower = text.toLowerCase();
  if (SANITATION_KEYWORDS.some((k) => lower.includes(k))) {
    return "sanitation";
  }
  return null;
}

// ---------- CATEGORY MODEL ----------
async function classifyCategory(text) {
  try {
    const response = await fetch(`${HF_BASE_URL}/models/${CATEGORY_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          candidate_labels: CATEGORY_LABELS,
          multi_label: false,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("⚠️ HF category HTTP error:", response.status, errText);
      return {
        rawLabel: "Other issues not matching the above categories",
        category: "other",
        confidence: 0.0,
      };
    }

    const data = await response.json();
    // console.log("HF category raw:", JSON.stringify(data, null, 2));

    let rawLabel = "Other issues not matching the above categories";
    let confidence = 0.0;

    if (Array.isArray(data)) {
      // array of { label, score }
      const candidates = data
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      if (candidates[0] && typeof candidates[0].label === "string") {
        rawLabel = candidates[0].label;
        confidence = candidates[0].score ?? 0.0;
      } else {
        console.error("⚠️ HF category array but invalid elements:", data);
      }
    } else if (data && Array.isArray(data.labels)) {
      // older style: { labels: [...], scores: [...] }
      rawLabel = data.labels[0] || rawLabel;
      confidence = data.scores?.[0] ?? 0.0;
    } else {
      console.error("⚠️ HF category unknown format:", data);
    }

    return {
      rawLabel,
      category: mapLabelToKey(rawLabel),
      confidence,
    };
  } catch (err) {
    console.error("⚠️ classifyCategory error:", err);
    return {
      rawLabel: "Other issues not matching the above categories",
      category: "other",
      confidence: 0.0,
    };
  }
}

// ---------- PRIORITY MODEL ----------
async function classifyPriority(text) {
  try {
    const response = await fetch(`${HF_BASE_URL}/models/${PRIORITY_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("⚠️ HF priority HTTP error:", response.status, errText);
      return { sentiment: "neutral", sentimentScore: 0.0 };
    }

    const data = await response.json();
    // console.log("HF priority raw:", JSON.stringify(data, null, 2));

    let sentiment = "neutral";
    let sentimentScore = 0.0;

    if (Array.isArray(data)) {
      // can be [[{label,score}...]] or [{label,score}...]
      let candidates = data;
      if (Array.isArray(data[0])) {
        candidates = data[0];
      }
      candidates = candidates
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      if (candidates[0] && typeof candidates[0].label === "string") {
        sentiment = candidates[0].label; // "negative"/"neutral"/"positive"
        sentimentScore = candidates[0].score ?? 0.0;
      } else {
        console.error("⚠️ HF priority array but invalid elements:", data);
      }
    } else if (
      data &&
      Array.isArray(data[0]?.labels) &&
      data[0].labels.length
    ) {
      sentiment = data[0].labels[0];
      sentimentScore = data[0].scores?.[0] ?? 0.0;
    } else {
      console.error("⚠️ HF priority unknown format:", data);
    }

    return { sentiment, sentimentScore };
  } catch (err) {
    console.error("⚠️ classifyPriority error:", err);
    return { sentiment: "neutral", sentimentScore: 0.0 };
  }
}

function normalizeSentiment(sentiment) {
  const s = (sentiment || "").toLowerCase();
  if (s === "label_0" || s === "negative") return "negative";
  if (s === "label_1" || s === "neutral") return "neutral";
  if (s === "label_2" || s === "positive") return "positive";
  return "neutral";
}

// ---------- MAIN RE-CATEGORIZATION ----------
async function recategorizeAll() {
  console.log("🔄 Fetching all grievances...");
  const snapshot = await db.collection("grievances").get();
  console.log(`📌 Found ${snapshot.size} documents\n`);

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const id = docSnap.id;
    const text = `${data.title || ""}\n${data.description || ""}`.trim();

    console.log(`➡ Reprocessing ${id}`);

    try {
      const catRes = await classifyCategory(text);
      const priRes = await classifyPriority(text);

      // start with model category
      let category = catRes.category || "other";

      // override with sanitation keyword rule if needed
      const keywordCategory = inferCategoryFromKeywords(text);
      if (keywordCategory) {
        category = keywordCategory;
      }

      const urgentMatches = findUrgentMatches(text);
      let priority = "low";

      const sentimentNorm = normalizeSentiment(priRes.sentiment);
      const score = priRes.sentimentScore;

      if (urgentMatches.length > 0) {
        priority = "high";
      } else if (sentimentNorm === "negative") {
        if (score > 0.7) priority = "high";
        else if (score > 0.35) priority = "medium";
      } else if (sentimentNorm === "neutral") {
        if (score > 0.6) priority = "medium";
      }

      if (category === "sanitation" && priority === "low") {
        priority = "medium";
      }

      const keywords = extractKeywords(text);

      const hfEngine = {
        category,
        rawCategoryLabel: catRes.rawLabel,
        categoryConfidence: catRes.confidence,
        priority,
        isUrgent: priority === "high",
        urgentMatches,
        keywords,
        modelInfo: {
          categoryModel: CATEGORY_MODEL,
          priorityModel: PRIORITY_MODEL,
          sentimentLabel: priRes.sentiment,
          sentimentScore: priRes.sentimentScore,
        },
      };

      await docSnap.ref.set({ hfEngine }, { merge: true });
      console.log(`   ✅ Updated: ${id}\n`);
    } catch (e) {
      console.error(`   ❌ Failed for ${id}:`, e);
    }
  }

  console.log("\n🎉 Re-categorization complete!");
}

// Run script
recategorizeAll();
