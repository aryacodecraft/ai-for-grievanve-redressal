from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import firebase_admin
from firebase_admin import credentials, firestore
import requests
import re
from collections import Counter
import logging
import json as json_lib
from groq import Groq

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Init
load_dotenv()
app = Flask(__name__)
CORS(app)

# ───────────────────────────────────────── Firestore Init ─────────────────────────────────────────
try:
    firebase_key_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if firebase_key_json:
        cred = credentials.Certificate(json_lib.loads(firebase_key_json))
        logger.info("Using FIREBASE_SERVICE_ACCOUNT env var")
    else:
        service_account_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            logger.info("Using local serviceAccountKey.json")
        else:
            raise Exception("Firebase credentials missing")

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)

    db = firestore.client()
except Exception as e:
    logger.error(f"Firebase init error: {e}")
    db = None

# ───────────────────────────────────────── Hugging Face Config ─────────────────────────────────────────
HF_API_TOKEN = os.getenv("HF_API_TOKEN") or os.getenv("HUGGINGFACE_API_TOKEN")
HF_BASE_URL = "https://router.huggingface.co/hf-inference"
logger.info(f"HF_API_TOKEN: {'Set' if HF_API_TOKEN else 'Not Set'}")

# ───────────────────────────────────────── Groq Config ─────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
logger.info(f"GROQ_API_KEY: {'Set' if GROQ_API_KEY else 'Not Set'}")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# ───────────────────────────────────────── Constants ─────────────────────────────────────────
CATEGORY_MODEL = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"
PRIORITY_MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest"

CATEGORY_LABELS = [
    "Issues related to water supply, water pressure, contamination, or no water",
    "Issues related to roads, potholes, footpaths, traffic, or road damage",
    "Issues related to electricity, power cuts, voltage fluctuations, or streetlights not working",
    "Issues related to sanitation, garbage, sewage, drainage, or public cleanliness",
    "Issues related to health services, hospitals, clinics, medicines, or public health",
    "Issues related to governance, staff behavior, corruption, permissions, or government service delays",
    "Other issues not matching the above categories",
]

CATEGORY_KEYS = [
    "water", "roads", "electricity", "sanitation", "health", "governance", "other"
]

URGENT_KEYWORDS = [
    "urgent", "emergency", "immediately", "asap", "accident", "fire", "flood",
    "electrocution", "collapsed", "burst", "serious", "critical",
    "life threatening", "danger", "injury", "major issue", "no water",
    "no electricity"
]

SANITATION_KEYWORDS = [
    "garbage", "waste", "trash", "dustbin", "sewage", "sewer", "drainage",
    "drain", "litter", "dirty", "filth", "smell", "stink", "stray animals",
    "dump", "waste collection", "garbage collection"
]

# ───────────────────────────────────────── Helpers ─────────────────────────────────────────
def map_label_to_key(label):
    try:
        idx = CATEGORY_LABELS.index(label)
        return CATEGORY_KEYS[idx]
    except ValueError:
        return "other"

def infer_category_from_keywords(text):
    lower = text.lower()
    if any(k in lower for k in SANITATION_KEYWORDS):
        return "sanitation"
    return None

def extract_keywords(text, top_k=5):
    tokens = re.findall(r'[a-z]{3,}', text.lower()) or []
    stopwords = {
        "the","and","for","with","this","that","there","their",
        "was","were","from","will","your","you","are","sir","madam",
        "please","kindly","city","area","ward"
    }
    freq = Counter(t for t in tokens if t not in stopwords)
    return [w for w,_ in freq.most_common(top_k)]

def find_urgent_matches(text):
    lower = text.lower()
    return [k for k in URGENT_KEYWORDS if k in lower]

def normalize_sentiment(s):
    s = (s or "").lower()
    if s in ["label_0","negative"]: return "negative"
    if s in ["label_1","neutral"]: return "neutral"
    if s in ["label_2","positive"]: return "positive"
    return "neutral"

def classify_huggingface(text, model, task_params=None):
    if not HF_API_TOKEN:
        return None

    headers = {
        "Authorization": f"Bearer {HF_API_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = { "inputs": text, "parameters": task_params or {} }

    try:
        r = requests.post(f"{HF_BASE_URL}/models/{model}", headers=headers, json=payload)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.error(f"HF error ({model}): {e}")
        return None

def classify_category(text):
    default = {
        "rawLabel": CATEGORY_LABELS[-1],
        "category": "other",
        "confidence": 0.0
    }

    data = classify_huggingface(
        text,
        CATEGORY_MODEL,
        task_params={"candidate_labels": CATEGORY_LABELS, "multi_label": False}
    )

    if not data:
        return default

    raw_label = default["rawLabel"]
    confidence = default["confidence"]

    if isinstance(data, dict) and "labels" in data:
        raw_label = data["labels"][0]
        confidence = data["scores"][0]
    elif isinstance(data, list) and isinstance(data[0], dict):
        top = sorted(data, key=lambda x: x.get("score",0), reverse=True)[0]
        raw_label = top.get("label", raw_label)
        confidence = top.get("score", confidence)

    return {
        "rawLabel": raw_label,
        "category": map_label_to_key(raw_label),
        "confidence": confidence,
    }

def classify_priority(text):
    default = {"sentiment":"neutral","sentimentScore":0.0}
    data = classify_huggingface(text, PRIORITY_MODEL)

    if not data:
        return default

    sentiment = default["sentiment"]
    score = default["sentimentScore"]

    if isinstance(data, list) and isinstance(data[0], dict):
        top = sorted(data, key=lambda x: x.get("score",0), reverse=True)[0]
        sentiment = top.get("label", sentiment)
        score = top.get("score", score)

    return {"sentiment": sentiment, "sentimentScore": score}

# ───────────────────────────────────────── Groq Refinement ─────────────────────────────────────────
def refine_with_groq(text, initial_category, initial_priority, hf_label):
    if not groq_client:
        return None

    category_list = CATEGORY_KEYS
    priority_list = ["high","medium","low"]

    json_instruction = (
        "Respond ONLY with a JSON object containing keys: "
        "'category', 'priority', 'explanation'. "
        "Category must be one of: " + ", ".join(category_list) + ". "
        "Priority must be one of: " + ", ".join(priority_list) + "."
    )

    system_prompt = (
        "You refine grievance categories.\n"
        f"Initial category: {initial_category} (raw={hf_label}). "
        f"Initial priority: {initial_priority}. "
        "Correct only if needed.\n" + json_instruction
    )

    try:
        res = groq_client.chat.completions.create(
            messages=[
                {"role":"system","content":system_prompt},
                {"role":"user","content":f"Grievance text:\n{text}"}
            ],
            model=GROQ_MODEL,
            response_format={"type": "json_object"},
            temperature=0.0,
        )

        parsed = json_lib.loads(res.choices[0].message.content)
        return parsed
    except Exception as e:
        logger.error(f"Groq refinement error: {e}")
        return None

# ───────────────────────────────────────── Routes ─────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status":"ok"})

@app.route("/test")
def test():
    return "Flask running"

# ───────────────────────────────────────── Submit Grievance ─────────────────────────────────────────
@app.route("/submit-grievance", methods=["POST"])
def submit_grievance():
    if db is None:
        return jsonify({"error":"Firebase not initialized"}), 500

    data = request.get_json()
    title = data.get("title")
    description = data.get("description")
    user_id = data.get("userId")
    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if not title or not description or not user_id:
        return jsonify({"error":"Missing required fields"}), 400

    text = f"{title}\n{description}".strip()

    try:
        new_doc = {
            "title": title,
            "description": description,
            "userId": user_id,
            "status": "open",
            "createdAt": firestore.SERVER_TIMESTAMP
        }

        # Location
        if latitude is not None and longitude is not None:
            try:
                new_doc["latitude"] = float(latitude)
                new_doc["longitude"] = float(longitude)
            except:
                logger.warning("Invalid lat/lon received")

        _, ref = db.collection("grievances").add(new_doc)
        doc_id = ref.id

        # 1. HF category + priority
        cat = classify_category(text)
        pri = classify_priority(text)

        sentiment_raw = pri["sentiment"]
        sentiment_score = pri["sentimentScore"]
        sentiment = normalize_sentiment(sentiment_raw)

        hf_priority = "low"
        urgent_matches = find_urgent_matches(text)

        if urgent_matches:
            hf_priority = "high"
        elif sentiment == "negative":
            if sentiment_score > 0.7: hf_priority = "high"
            elif sentiment_score > 0.35: hf_priority = "medium"
        elif sentiment == "neutral" and sentiment_score > 0.6:
            hf_priority = "medium"

        hf_category = cat["category"]
        kw_cat = infer_category_from_keywords(text)
        if kw_cat:
            hf_category = kw_cat

        if hf_category == "sanitation" and hf_priority == "low":
            hf_priority = "medium"

        hf_raw = cat["rawLabel"]

        # 2. Groq Refinement
        groq_res = refine_with_groq(text, hf_category, hf_priority, hf_raw)

        if groq_res:
            final_priority = groq_res.get("priority", hf_priority)
            final_category = groq_res.get("category", hf_category)
            explanation = groq_res.get("explanation", "")
        else:
            final_priority = hf_priority
            final_category = hf_category
            explanation = (
                f"Category from HF={hf_category}, priority={hf_priority}, "
                f"sentiment={sentiment_raw} ({sentiment_score})."
            )

        keywords = extract_keywords(text)

        hf_engine = {
            "category": final_category,
            "priority": final_priority,
            "isUrgent": final_priority == "high",
            "keywords": keywords,
            "explanation": explanation,
            "rawCategoryLabel": hf_raw,
            "categoryConfidence": float(cat["confidence"]),
            "urgentMatches": urgent_matches,
            "modelInfo": {
                "categoryModel": CATEGORY_MODEL,
                "priorityModel": PRIORITY_MODEL,
                "sentimentLabel": sentiment_raw,
                "sentimentScore": float(sentiment_score),
                "groqModel": GROQ_MODEL if groq_res else None,
                "hfCategory": hf_category,
                "hfPriority": hf_priority,
            }
        }

        db.collection("grievances").document(doc_id).set({"hfEngine": hf_engine}, merge=True)

        return jsonify({
            "message": "Grievance submitted successfully",
            "grievanceId": doc_id,
            "hfEngine": hf_engine
        })

    except Exception as e:
        logger.error(f"Server error: {e}")
        return jsonify({"error":"Internal Server Error"}), 500

# ───────────────────────────────────────── Run ─────────────────────────────────────────
if __name__ == "__main__":
    PORT = int(os.getenv("PORT", 10000))
    app.run(host="0.0.0.0", port=PORT, debug=False)
