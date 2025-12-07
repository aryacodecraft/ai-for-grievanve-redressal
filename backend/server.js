// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

// ---------- Firebase Admin init ----------
const serviceAccount = require("./serviceAccountKey.json");
// serviceAccountKey.json must be in backend/ folder

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// ---------- Hugging Face config ----------
const HF_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN;

const CATEGORY_MODEL = "facebook/bart-large-mnli";
const PRIORITY_MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest";

const CATEGORY_LABELS = [
  "water",
  "roads",
  "electricity",
  "sanitation",
  "health",
  "governance",
  "other",
];

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

// ---------- Express app ----------
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "grievance-backend" });
});

// ---------- Helpers ----------
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

async function classifyCategory(text) {
  if (!HF_API_TOKEN) {
    console.warn("HF_API_TOKEN not set");
    return { category: "other", confidence: 0.0 };
  }

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${CATEGORY_MODEL}`,
    {
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
    }
  );

  const data = await response.json();
  return {
    category: data.labels?.[0] || "other",
    confidence: data.scores?.[0] || 0.0,
  };
}

async function classifyPriority(text) {
  if (!HF_API_TOKEN) {
    console.warn("HF_API_TOKEN not set");
    return {
      sentiment: "LABEL_1",
      sentimentScore: 0.0,
      priority: "low",
    };
  }

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${PRIORITY_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    }
  );

  const data = await response.json();
  const result = data[0];

  const sentimentLabel = result.label;
  const score = result.score;

  let priority = "low";

  if (sentimentLabel === "LABEL_0") {
    if (score > 0.75) priority = "high";
    else if (score > 0.3) priority = "medium";
    else priority = "low";
  } else if (sentimentLabel === "LABEL_1" || sentimentLabel === "LABEL_2") {
    if (score > 0.75) priority = "medium";
    else priority = "low";
  }

  return {
    sentiment: sentimentLabel,
    sentimentScore: score,
    priority,
  };
}

// ---------- MAIN ROUTE ----------
app.post("/submit-grievance", async (req, res) => {
  console.log("📩 Received grievance:", req.body);

  const { title, description, userId } = req.body;

  if (!title || !description || !userId) {
    return res
      .status(400)
      .json({ error: "Missing required fields: title, description, userId" });
  }

  const text = `${title}\n${description}`.trim();

  try {
    // 1) create doc
    const newGrievance = {
      title,
      description,
      userId,
      status: "open",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("grievances").add(newGrievance);
    console.log("📝 Created grievance doc:", docRef.id);

    // 2) AI analysis (never crashes whole flow)
    let catRes = { category: "other", confidence: 0.0 };
    let priRes = { sentiment: "LABEL_1", sentimentScore: 0.0, priority: "low" };

    try {
      [catRes, priRes] = await Promise.all([
        classifyCategory(text.slice(0, 1000)),
        classifyPriority(text.slice(0, 3000)),
      ]);
      console.log("🤖 AI results:", catRes, priRes);
    } catch (aiErr) {
      console.error("❌ AI error (using defaults):", aiErr);
    }

    let priority = priRes.priority;
    const urgentMatches = findUrgentMatches(text);
    if (urgentMatches.length > 0) {
      priority = "high";
    }
    const isUrgent = priority === "high";
    const keywords = extractKeywords(text);

    const explanation =
      `Category predicted as '${catRes.category}' (score ${catRes.confidence.toFixed(
        2
      )}) using ${CATEGORY_MODEL}. ` +
      `Priority '${priority}' derived from sentiment (${PRIORITY_MODEL}) and urgent keywords. ` +
      (urgentMatches.length
        ? `Urgent terms: ${urgentMatches.join(", ")}.`
        : "");

    const hfEngine = {
      category: catRes.category,
      categoryConfidence: catRes.confidence,
      priority,
      isUrgent,
      urgentMatches,
      keywords,
      explanation,
      modelInfo: {
        categoryModel: CATEGORY_MODEL,
        priorityModel: PRIORITY_MODEL,
        sentimentLabel: priRes.sentiment,
        sentimentScore: priRes.sentimentScore,
      },
    };

    console.log("🧠 Final hfEngine:", hfEngine);

    await docRef.set({ hfEngine }, { merge: true });
    console.log("✅ hfEngine saved to doc:", docRef.id);

    return res.status(200).json({
      message: "Grievance submitted and analyzed successfully!",
      grievanceId: docRef.id,
      hfEngine,
    });
  } catch (err) {
    console.error("❌ Error in /submit-grievance:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${PORT}`);
});
