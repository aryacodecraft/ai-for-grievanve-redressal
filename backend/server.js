// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

// ---------- Firebase Admin init ----------
const serviceAccount = require("./serviceAccountKey.json");

// LLM wrapper (future use if needed)
//const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// ---------- Hugging Face Config ----------
const HF_API_TOKEN =
  process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_TOKEN;

console.log("HF_API_TOKEN:", HF_API_TOKEN ? "✅ Set" : "❌ Not Set");

// ✅ Correct HF router base URL with hf-inference
const HF_BASE_URL = "https://router.huggingface.co/hf-inference";

// Models
const CATEGORY_MODEL = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli";
const PRIORITY_MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest";

// LONG descriptive labels for AI
const CATEGORY_LABELS = [
  "Issues related to water supply, water pressure, contamination, or no water",
  "Issues related to roads, potholes, footpaths, traffic, or road damage",
  "Issues related to electricity, power cuts, voltage fluctuations, or streetlights not working",
  "Issues related to sanitation, garbage, sewage, drainage, or public cleanliness",
  "Issues related to health services, hospitals, clinics, medicines, or public health",
  "Issues related to governance, staff behavior, corruption, permissions, or government service delays",
  "Other issues not matching the above categories",
];

// SHORT clean category keys for Firestore and dashboard filters
const CATEGORY_KEYS = [
  "water",
  "roads",
  "electricity",
  "sanitation",
  "health",
  "governance",
  "other", // aligns with CATEGORY_LABELS
];

// Map model label → simple category key
function mapLabelToKey(label) {
  const idx = CATEGORY_LABELS.indexOf(label);
  if (idx === -1 || !CATEGORY_KEYS[idx]) {
    return "other";
  }
  return CATEGORY_KEYS[idx];
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

// Domain keywords for sanitation override
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

function inferCategoryFromKeywords(text) {
  const lower = text.toLowerCase();

  // sanitation rule (you can add more later for roads/water/etc.)
  if (SANITATION_KEYWORDS.some((k) => lower.includes(k))) {
    return "sanitation";
  }

  return null;
}

// ---------- Express App ----------
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "grievance-backend" });
});

// ---------- Helper Functions ----------
function extractKeywords(text, topK = 5) {
  const tokens = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  const stopwords = new Set([
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
  tokens.forEach((t) => {
    if (!stopwords.has(t)) freq[t] = (freq[t] || 0) + 1;
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([w]) => w);
}

function findUrgentMatches(text) {
  const lower = text.toLowerCase();
  return URGENT_KEYWORDS.filter((k) => lower.includes(k));
}

// ---------- AI: Category Classification ----------
async function classifyCategory(text) {
  if (!HF_API_TOKEN) {
    console.warn("HF_API_TOKEN not set");
    return {
      rawLabel: "Other issues not matching the above categories",
      category: "other",
      confidence: 0.0,
    };
  }

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
      // New-style: array of { label, score } objects
      const candidates = data.slice().sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0)
      );
      if (candidates[0] && typeof candidates[0].label === "string") {
        rawLabel = candidates[0].label;
        confidence = candidates[0].score ?? 0.0;
      } else {
        console.error("⚠️ HF category array but invalid elements:", data);
      }
    } else if (data && Array.isArray(data.labels)) {
      // Old-style: { labels: [...], scores: [...] }
      rawLabel = data.labels[0];
      confidence = data.scores?.[0] ?? 0.0;
    } else {
      console.error("⚠️ HF category unknown format:", data);
    }

    const category = mapLabelToKey(rawLabel);
    return { rawLabel, category, confidence };
  } catch (err) {
    console.error("⚠️ classifyCategory error:", err);
    return {
      rawLabel: "Other issues not matching the above categories",
      category: "other",
      confidence: 0.0,
    };
  }
}

// ---------- AI: Priority Classification ----------
async function classifyPriority(text) {
  if (!HF_API_TOKEN) {
    console.warn("HF_API_TOKEN not set");
    return { sentiment: "neutral", sentimentScore: 0.0 };
  }

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
      // New-style: either [[{label,score}...]] or [{label,score}...]
      let candidates = data;
      if (Array.isArray(data[0])) {
        candidates = data[0];
      }
      candidates = candidates.slice().sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0)
      );
      if (candidates[0] && typeof candidates[0].label === "string") {
        sentiment = candidates[0].label; // "negative" / "neutral" / "positive"
        sentimentScore = candidates[0].score ?? 0.0;
      } else {
        console.error("⚠️ HF priority array but invalid elements:", data);
      }
    } else if (
      data &&
      Array.isArray(data[0]?.labels) &&
      data[0]?.labels.length
    ) {
      // Old-style multi-result
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

// Helper: normalize sentiment into buckets we use in rules
function normalizeSentiment(sentiment) {
  const s = (sentiment || "").toLowerCase();
  if (s === "label_0" || s === "negative") return "negative";
  if (s === "label_1" || s === "neutral") return "neutral";
  if (s === "label_2" || s === "positive") return "positive";
  return "neutral";
}

// ---------- MAIN ROUTE ----------
app.post("/submit-grievance", async (req, res) => {
  console.log("📩 Received grievance:", req.body);

  const { title, description, userId } = req.body;

  if (!title || !description || !userId) {
    return res.status(400).json({
      error: "Missing required fields: title, description, userId",
    });
  }

  const text = `${title}\n${description}`.trim();

  try {
    // 1️⃣ Save raw grievance first
    const newGrievance = {
      title,
      description,
      userId,
      status: "open",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("grievances").add(newGrievance);
    console.log("📝 Created grievance:", docRef.id);

    // 2️⃣ AI Processing
    let catRes = { category: "other", rawLabel: "other", confidence: 0.0 };
    let priRes = { sentiment: "neutral", sentimentScore: 0.0 };

    try {
      [catRes, priRes] = await Promise.all([
        classifyCategory(text),
        classifyPriority(text),
      ]);
      console.log("🤖 AI results:", catRes, priRes);
    } catch (err) {
      console.error("AI Error:", err);
    }

    // start from model category
    let category = catRes.category || "other";

    // override with sanitation rule if needed
    const keywordCategory = inferCategoryFromKeywords(text);
    if (keywordCategory) {
      category = keywordCategory;
    }

    // 3️⃣ PRIORITY DECISION LOGIC
    const urgentMatches = findUrgentMatches(text);

    let priority = "low";
    const sentimentRaw = priRes.sentiment;
    const score = priRes.sentimentScore;
    const sentiment = normalizeSentiment(sentimentRaw);

    if (urgentMatches.length > 0) {
      priority = "high"; // URGENCY OVERRIDES EVERYTHING
    } else if (sentiment === "negative") {
      if (score > 0.7) priority = "high";
      else if (score > 0.35) priority = "medium";
    } else if (sentiment === "neutral") {
      if (score > 0.6) priority = "medium";
    } else if (sentiment === "positive") {
      // you can down-rank positives if you want, for now keep default "low"
    }

    // sanitation complaints shouldn't stay "low"
    if (category === "sanitation" && priority === "low") {
      priority = "medium";
    }

    const isUrgent = priority === "high";
    const keywords = extractKeywords(text);

    // 4️⃣ Build final hfEngine object
    const hfEngine = {
      category, // final key: "sanitation"/"roads"/etc.
      rawCategoryLabel: catRes.rawLabel, // long sentence
      categoryConfidence: catRes.confidence,

      priority,
      isUrgent,
      urgentMatches,
      keywords,

      explanation:
        `Category '${category}' predicted from '${catRes.rawLabel}' (score: ${catRes.confidence.toFixed(
          2
        )}), ` +
        `refined using domain keyword rules. ` +
        `Priority '${priority}' determined using sentiment ('${sentimentRaw}', score: ${score.toFixed(
          2
        )}) and urgency keywords.`,

      modelInfo: {
        categoryModel: CATEGORY_MODEL,
        priorityModel: PRIORITY_MODEL,
        sentimentLabel: priRes.sentiment,
        sentimentScore: priRes.sentimentScore,
      },
    };

    console.log("🧠 Final hfEngine:", hfEngine);

    await docRef.set({ hfEngine }, { merge: true });
    console.log("✅ Saved AI data to Firestore");

    return res.status(200).json({
      message: "Grievance submitted and analyzed successfully!",
      grievanceId: docRef.id,
      hfEngine,
    });
  } catch (err) {
    console.error("❌ Server error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
