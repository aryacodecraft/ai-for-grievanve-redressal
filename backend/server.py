#!/usr/bin/env python3
"""
server.py — LLM-only image validation (reject if LLM confidence < IMAGE_LLM_THRESHOLD)
Also exposes an optional Cloudinary signing endpoint for private images:
  POST /sign-cloudinary  { "public_id": "...", "resource_type": "image", "transform": "f_auto,q_auto,w_900" }
Returns { "signedUrl": "..." } or an error.

Env:
 - FIREBASE_SERVICE_ACCOUNT (JSON string) or serviceAccountKey.json beside this file
 - GROQ_API_KEY (required for LLM image checks) — optional if you don't use image LLM checks
 - HF_API_TOKEN (optional, used for text classification only)
 - IMAGE_LLM_THRESHOLD (default 60)
 - CLOUDINARY_CLOUD_NAME (optional)
 - CLOUDINARY_API_KEY (optional)
 - CLOUDINARY_API_SECRET (optional)  # required for signed URLs
 - PORT (default 10000)
"""
import os
import json as json_lib
import logging
from io import BytesIO
from collections import Counter
import re

import numpy as np
import requests
from PIL import Image, ImageStat

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Firebase admin SDK
import firebase_admin
from firebase_admin import credentials, firestore

# optional Groq client (LLM)
try:
    from groq import Groq
except Exception:
    Groq = None

# Optional Cloudinary SDK (for signed URL generation)
try:
    import cloudinary
    from cloudinary.utils import cloudinary_url
except Exception:
    cloudinary = None
    cloudinary_url = None

# -------------------------
# Logging
# -------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("grievance-server")

# -------------------------
# Load .env
# -------------------------
load_dotenv()

# -------------------------
# Flask init
# -------------------------
app = Flask(__name__)
CORS(app)

# -------------------------
# Firebase init
# -------------------------
db = None
try:
    firebase_key_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if firebase_key_json:
        cred = credentials.Certificate(json_lib.loads(firebase_key_json))
        logger.info("Using FIREBASE_SERVICE_ACCOUNT from env")
    else:
        service_account_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            logger.info("Using local serviceAccountKey.json")
        else:
            raise FileNotFoundError("Firebase credentials not found in env or local file.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    logger.info("Firebase initialized")
except Exception:
    logger.exception("Firebase initialization failed; continuing without DB (db will be None).")
    db = None

# -------------------------
# Groq (LLM) init — required for image validation
# -------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = None
if GROQ_API_KEY:
    if Groq is None:
        logger.error("GROQ_API_KEY set but Groq SDK is not installed. Install `groq` package.")
    else:
        try:
            groq_client = Groq(api_key=GROQ_API_KEY)
            logger.info("Groq client initialized")
        except Exception:
            logger.exception("Failed to initialize Groq client; image LLM validation will be unavailable.")
            groq_client = None
else:
    logger.warning("GROQ_API_KEY not set. LLM image validation disabled until GROQ_API_KEY is provided.")

LLAVA_MODEL = os.getenv("LLAVA_MODEL", "llava-v1.6-34b")
IMAGE_LLM_THRESHOLD = float(os.getenv("IMAGE_LLM_THRESHOLD", "60.0"))

# -------------------------
# (Optional) HuggingFace text config used for text classification only
# -------------------------
HF_API_TOKEN = os.getenv("HF_API_TOKEN") or os.getenv("HUGGINGFACE_API_TOKEN")
HF_BASE_URL = "https://router.huggingface.co/hf-inference"

# -------------------------
# Cloudinary config (optional)
# -------------------------
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

if cloudinary and CLOUDINARY_CLOUD_NAME:
    try:
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True
        )
        logger.info("Cloudinary configured")
    except Exception:
        logger.exception("Failed to configure Cloudinary")

# -------------------------
# helper utilities (kept for submit endpoint)
# -------------------------
CATEGORY_LABELS = [
    "Issues related to water supply, water pressure, contamination, or no water",
    "Issues related to roads, potholes, footpaths, traffic, or road damage",
    "Issues related to electricity, power cuts, voltage fluctuations, or streetlights not working",
    "Issues related to sanitation, garbage, sewage, drainage, or public cleanliness",
    "Issues related to health services, hospitals, clinics, medicines, or public health",
    "Issues related to governance, staff behavior, corruption, permissions, or government service delays",
    "Other issues not matching the above categories",
]
CATEGORY_KEYS = ["water", "roads", "electricity", "sanitation", "health", "governance", "other"]
PRIORITY_MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest"

URGENT_KEYWORDS = [
    "urgent", "emergency", "immediately", "asap",
    "accident", "fire", "flood", "electrocution",
    "collapsed", "burst", "serious", "critical",
    "life threatening", "danger", "injury",
    "major issue", "no water", "no electricity"
]

SANITATION_KEYWORDS = [
    "garbage", "waste", "trash", "dustbin", "sewage", "sewer",
    "drainage", "drain", "litter", "dirty", "filth",
    "smell", "stink", "stray animals", "dump",
    "waste collection", "garbage collection"
]

# -------------------------
# simple image quality scoring (kept optional — we will NOT use it for final decision)
# -------------------------
def compute_image_quality_score(pil_img):
    img = pil_img.convert("RGB")
    width, height = img.size
    ref_area = 1024 * 768
    area = max(1, width * height)
    res_score = min(1.0, area / ref_area)
    gray = img.convert("L")
    stat = ImageStat.Stat(gray)
    mean_brightness = stat.mean[0] if stat.mean else 0
    bright_score = (mean_brightness - 30) / (200 - 30)
    bright_score = max(0.0, min(1.0, bright_score))
    arr = np.asarray(gray).astype(np.int32)
    if arr.shape[0] < 3 or arr.shape[1] < 3:
        sharpness_score = 0.0
    else:
        dyy = arr[2:, 1:-1] - 2 * arr[1:-1, 1:-1] + arr[:-2, 1:-1]
        dxx = arr[1:-1, 2:] - 2 * arr[1:-1, 1:-1] + arr[1:-1, :-2]
        lap = dyy + dxx
        var = float(np.var(lap))
        sharpness_score = (var - 20.0) / (2000.0 - 20.0)
        sharpness_score = max(0.0, min(1.0, sharpness_score))
    final_score = (sharpness_score * 0.5 + res_score * 0.3 + bright_score * 0.2) * 100.0
    return {
        "score": round(final_score, 2),
        "components": {
            "sharpness_score": round(sharpness_score * 100, 2),
            "resolution_score": round(res_score * 100, 2),
            "brightness_score": round(bright_score * 100, 2),
            "width": width,
            "height": height,
        }
    }

# -------------------------
# LLM image validation — returns a dict: { score: float(0-100), explanation: str, raw: str }
# NOTE: uses Groq client only. If groq_client not configured, raises RuntimeError.
# -------------------------
def llm_image_confidence(image_url):
    if not groq_client:
        raise RuntimeError("Groq LLM (GROQ_API_KEY) not configured — cannot run LLM image validation.")

    system_prompt = (
        "You are an image validation assistant for a public grievance portal.\n"
        "Given an image, return a JSON object only (no extra text) with two keys:\n"
        "  - score: integer 0-100 (how confident the image shows a public infrastructure issue relevant for a complaint)\n"
        "  - explanation: short plain-text explanation (1-2 sentences) describing why you gave that score.\n\n"
        "Examples of ACCEPTABLE images: broken roads, large potholes, visible water leakage, large garbage piles, damaged streetlights, flooded streets.\n"
        "Examples of UNACCEPTABLE images: selfies, selfies with background blurred, memes, screenshots of chat, indoor food/pets, documents, screenshots of webpages.\n\n"
        "Important: always reply with valid JSON only, for example:\n"
        '{"score": 78, "explanation": "Shows a large pothole on a public road; clear context and damage visible."}\n'
        "\nDo not include any other commentary."
    )

    user_content = [
        {"type": "input_image", "image_url": image_url},
        {"type": "text", "text": "Rate this image (0-100) for whether it shows a public infrastructure complaint. Reply in JSON as described."}
    ]

    try:
        res = groq_client.chat.completions.create(
            model=LLAVA_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            temperature=0.0,
            max_tokens=200
        )
        raw = ""
        try:
            raw = res.choices[0].message.content.strip()
        except Exception:
            raw = str(res)

        parsed = None
        try:
            parsed = json_lib.loads(raw)
        except Exception:
            import re as _re
            m = _re.search(r'\{[\s\S]*\}', raw)
            if m:
                try:
                    parsed = json_lib.loads(m.group(0))
                except Exception:
                    parsed = None

        if not parsed:
            logger.warning("LLM returned unparsable response for image validation: %s", raw[:200])
            return {"score": 0.0, "explanation": "LLM response unparsable", "raw": raw}

        score = parsed.get("score")
        explanation = parsed.get("explanation", "") or ""
        try:
            score = float(score)
        except Exception:
            try:
                score = float(int(score))
            except Exception:
                score = 0.0
        if score < 0: score = 0.0
        if score > 100: score = 100.0

        return {"score": round(float(score), 2), "explanation": str(explanation)[:400], "raw": raw}
    except Exception as e:
        logger.exception("LLM image confidence check failed")
        raise

# -------------------------
# Minimal HF wrappers for text classification (unchanged behavior — best-effort)
# -------------------------
def classify_huggingface(text, model, task_params=None):
    if not HF_API_TOKEN:
        return None
    try:
        headers = {"Authorization": f"Bearer {HF_API_TOKEN}", "Content-Type": "application/json"}
        payload = {"inputs": text}
        if task_params:
            payload["parameters"] = task_params
        r = requests.post(f"{HF_BASE_URL}/models/{model}", headers=headers, json=payload, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception:
        logger.exception("classify_huggingface error")
        return None

def map_label_to_key(label):
    try:
        return CATEGORY_KEYS[CATEGORY_LABELS.index(label)]
    except Exception:
        return "other"

def classify_category(text):
    default = {"rawLabel": CATEGORY_LABELS[-1], "category": "other", "confidence": 0.0}
    data = classify_huggingface(text, "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli",
                                {"candidate_labels": CATEGORY_LABELS, "multi_label": False})
    if not data:
        return default
    try:
        if isinstance(data, dict) and "labels" in data and isinstance(data["labels"], list):
            raw_label = data["labels"][0]
            confidence = float(data.get("scores", [0.0])[0] if data.get("scores") else 0.0)
        else:
            top = sorted(data, key=lambda x: x.get("score", 0), reverse=True)[0]
            raw_label = top.get("label")
            confidence = float(top.get("score", 0.0))
        return {"rawLabel": raw_label, "category": map_label_to_key(raw_label), "confidence": confidence}
    except Exception:
        logger.exception("classify_category parsing error")
        return default

def classify_priority(text):
    default = {"sentiment": "neutral", "sentimentScore": 0.0}
    data = classify_huggingface(text, PRIORITY_MODEL)
    if not data:
        return default
    try:
        if isinstance(data, list) and isinstance(data[0], dict):
            top = sorted(data, key=lambda x: x.get("score", 0), reverse=True)[0]
            return {"sentiment": top.get("label", "neutral"), "sentimentScore": float(top.get("score", 0.0))}
        return default
    except Exception:
        logger.exception("classify_priority parsing error")
        return default

def normalize_sentiment(s):
    s = (s or "").lower()
    if s in ["label_0", "negative"]: return "negative"
    if s in ["label_1", "neutral"]: return "neutral"
    if s in ["label_2", "positive"]: return "positive"
    return "neutral"

def extract_keywords(text, top_k=5):
    tokens = re.findall(r"[a-z]{3,}", (text or "").lower())
    stopwords = {"the", "and", "for", "with", "this", "that", "there", "their", "was", "were", "from", "will", "your", "you", "are", "please", "city", "area", "ward"}
    freq = Counter([t for t in tokens if t not in stopwords])
    return [w for w,_ in freq.most_common(top_k)]

def find_urgent_matches(text):
    lower = (text or "").lower()
    return [k for k in URGENT_KEYWORDS if k in lower]

# -------------------------
# API: /validate-image  (LLM-only)
# -------------------------
@app.route("/validate-image", methods=["POST"])
def validate_image():
    try:
        payload = request.get_json() or {}
        image_url = payload.get("imageUrl")
        if not image_url:
            return jsonify({"error": "imageUrl required"}), 400

        if not groq_client:
            return jsonify({"error": "LLM validation unavailable: set GROQ_API_KEY and install groq SDK."}), 500

        try:
            llm_res = llm_image_confidence(image_url)
        except Exception as e:
            logger.exception("LLM image check failed")
            return jsonify({"error": "LLM image validation failed", "detail": str(e)}), 500

        llm_score = float(llm_res.get("score", 0.0))
        explanation = llm_res.get("explanation", "")
        raw = llm_res.get("raw", "")

        ok = llm_score >= IMAGE_LLM_THRESHOLD

        return jsonify({
            "ok": ok,
            "llm_score": llm_score,
            "explanation": explanation,
            "raw": raw,
            "threshold": float(IMAGE_LLM_THRESHOLD)
        }), 200

    except Exception:
        logger.exception("validate-image internal error")
        return jsonify({"error": "internal error"}), 500

# -------------------------
# API: /submit-grievance (uses LLM-only image check if image provided)
# -------------------------
@app.route("/submit-grievance", methods=["POST"])
def submit_grievance():
    if db is None:
        return jsonify({"error": "Firebase not initialized"}), 500

    payload = request.get_json() or {}
    title = payload.get("title")
    description = payload.get("description")
    user_id = payload.get("userId")
    latitude = payload.get("latitude")
    longitude = payload.get("longitude")
    image_url = payload.get("imageUrl")

    if not title or not description or not user_id:
        return jsonify({"error": "Missing required fields (title, description, userId)"}), 400

    image_validation_result = None
    if image_url:
        if not groq_client:
            return jsonify({"error": "Image validation disabled (GROQ_API_KEY missing). Server rejects image submissions until LLM configured)."}), 500
        try:
            llm_res = llm_image_confidence(image_url)
            llm_score = float(llm_res.get("score", 0.0))
            explanation = llm_res.get("explanation", "")
            image_validation_result = {"llm_score": llm_score, "explanation": explanation, "raw": llm_res.get("raw", "")}
            if llm_score < IMAGE_LLM_THRESHOLD:
                return jsonify({
                    "error": "Image rejected by LLM validation (score below threshold)",
                    "imageValidation": image_validation_result,
                    "threshold": float(IMAGE_LLM_THRESHOLD)
                }), 400
        except Exception as e:
            logger.exception("LLM image validation failed during submit")
            return jsonify({"error": "LLM image validation failed", "detail": str(e)}), 500

    new_doc = {"title": title, "description": description, "userId": user_id, "status": "open", "createdAt": firestore.SERVER_TIMESTAMP}
    if image_url:
        new_doc["imageUrl"] = image_url
        if image_validation_result:
            new_doc["imageValidation"] = image_validation_result

    try:
        if latitude is not None and longitude is not None:
            new_doc["latitude"] = float(latitude)
            new_doc["longitude"] = float(longitude)
    except Exception:
        pass

    try:
        doc_ref, write_time = db.collection("grievances").add(new_doc)
        doc_id = doc_ref.id
    except Exception:
        logger.exception("Failed to create grievance document")
        return jsonify({"error": "Failed to save grievance"}), 500

    full_text = f"{title}\n{description}"
    try:
        cat = classify_category(full_text)
    except Exception:
        cat = {"rawLabel": "", "category": "other", "confidence": 0.0}
    try:
        pri = classify_priority(full_text)
    except Exception:
        pri = {"sentiment": "neutral", "sentimentScore": 0.0}

    sentiment_raw = pri.get("sentiment", "neutral")
    sentiment_score = float(pri.get("sentimentScore", 0.0))
    sentiment = normalize_sentiment(sentiment_raw)

    hf_priority = "low"
    urgent_matches = find_urgent_matches(full_text)
    if urgent_matches:
        hf_priority = "high"
    elif sentiment == "negative":
        if sentiment_score > 0.7:
            hf_priority = "high"
        elif sentiment_score > 0.35:
            hf_priority = "medium"
    elif sentiment == "neutral" and sentiment_score > 0.6:
        hf_priority = "medium"

    hf_category = cat.get("category", "other")
    if any(k in (full_text or "").lower() for k in SANITATION_KEYWORDS):
        hf_category = "sanitation"

    hf_raw_label = cat.get("rawLabel", "")
    keywords = extract_keywords(full_text)

    hf_engine = {
        "category": hf_category,
        "priority": hf_priority,
        "isUrgent": hf_priority == "high",
        "rawCategoryLabel": hf_raw_label,
        "categoryConfidence": float(cat.get("confidence", 0.0)),
        "urgentMatches": urgent_matches,
        "keywords": keywords,
    }

    try:
        db.collection("grievances").document(doc_id).set({"hfEngine": hf_engine}, merge=True)
    except Exception:
        logger.exception("Failed to write hfEngine to document")

    return jsonify({"message": "Grievance submitted successfully", "grievanceId": doc_id, "hfEngine": hf_engine}), 200

# -------------------------
# Cloudinary signing endpoint (optional)
# -------------------------
@app.route("/sign-cloudinary", methods=["POST"])
def sign_cloudinary():
    """
    POST { "public_id": "folder/file.jpg", "resource_type": "image", "transform": "f_auto,q_auto,w_900" }
    If CLOUDINARY_API_SECRET present and cloudinary package installed, returns a signed URL:
      { "signedUrl": "https://res.cloudinary.com/..." }
    Otherwise returns the original unsigned preview URL (still useful for public images).
    """
    payload = request.get_json() or {}
    public_id = payload.get("public_id")
    transform = payload.get("transform", "f_auto,q_auto,w_900")
    resource_type = payload.get("resource_type", "image")

    if not public_id:
        return jsonify({"error": "public_id required"}), 400

    if cloudinary and CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY:
        try:
            # Build a preview URL with transformation. If api_secret is present cloudinary_url
            # with sign_url=True will add a signature.
            signed_url, options = cloudinary_url(public_id, resource_type=resource_type, sign_url=bool(CLOUDINARY_API_SECRET), secure=True, transformation=transform)
            return jsonify({"signedUrl": signed_url, "signed": bool(CLOUDINARY_API_SECRET)}), 200
        except Exception:
            logger.exception("cloudinary signing failed")
            return jsonify({"error": "cloudinary signing failed"}), 500

    # fallback: construct unsigned preview URL manually if possible
    if CLOUDINARY_CLOUD_NAME:
        try:
            # unsigned transform inserted after /upload/
            unsigned = f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/{resource_type}/upload/{transform}/{public_id}"
            return jsonify({"signedUrl": unsigned, "signed": False}), 200
        except Exception:
            pass

    return jsonify({"error": "Cloudinary not configured on server"}), 500

# -------------------------
# Health / Test
# -------------------------
@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/test")
def test():
    return "Flask running."

# -------------------------
# Run
# -------------------------
if __name__ == "__main__":
    PORT = int(os.getenv("PORT", "10000"))
    app.run(host="0.0.0.0", port=PORT, debug=False)
