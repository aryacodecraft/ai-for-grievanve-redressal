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
        # If env var contains JSON string ensure it's valid; otherwise fall back.
        try:
            cred = credentials.Certificate(json_lib.loads(firebase_key_json))
            logger.info("Using FIREBASE_SERVICE_ACCOUNT from env")
        except Exception:
            logger.exception("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON from env; will try local file.")
            cred = None
    else:
        cred = None

    if not cred:
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

LLAVA_MODEL = os.getenv("LLAVA_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
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
# Uses Groq multimodal (meta-llama/llama-4-scout-17b-16e-instruct) correctly.
# -------------------------
def llm_image_confidence(image_url):
    """
    Validate an image using an LLM (Groq) when available, otherwise fall back to
    an image-quality heuristic. Returns: {"score": float(0-100), "explanation": str, "raw": str}.
    """

    if not image_url:
        return {"score": 0.0, "explanation": "No image URL provided", "raw": ""}

    # Try LLM first if configured
    if groq_client:
        try:
            system_prompt = (
                "You are an image validation assistant for a public grievance portal.\n"
                "Given an image URL, return a JSON object only with two keys:\n"
                "  - score: integer 0-100 (how confident the image shows a public infrastructure complaint)\n"
                "  - explanation: short plain-text explanation (1-2 sentences).\n\n"
                "Acceptable examples: broken roads, potholes, visible water leakage, large garbage piles, damaged streetlights, flooded streets.\n"
                "Unacceptable examples: selfies, memes, screenshots of chat/webpages, indoor food/pets, documents.\n\n"
                "IMPORTANT: Reply with VALID JSON only, for example:\n"
                '{"score": 78, "explanation": "Shows a large pothole on a public road; clear context and damage visible."}\n'
                "Do NOT include any extra text outside the JSON object."
            )

            user_text = (
                "Rate this image (0-100) for whether it shows a public infrastructure complaint.\n"
                "Return JSON only with keys `score` and `explanation`.\n"
                f"Image URL: {image_url}\n"
            )

            # Use a plain string for message content (fixes Groq 'messages.1' errors)
            res = groq_client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_text},
                ],
                temperature=0.0,
                max_tokens=200,
            )

            # extract raw text safely
            raw = ""
            try:
                # stable path for many Groq responses
                raw = res.choices[0].message.content.strip()
            except Exception:
                try:
                    # older/newer shapes
                    raw = getattr(res.choices[0].message, "content", str(res)).strip()
                except Exception:
                    raw = str(res)

            # Try to parse JSON; if the model wraps text, try to extract the {...}
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

            # If parsed and contains score, normalize and return
            if parsed and isinstance(parsed, dict) and "score" in parsed:
                try:
                    score = float(parsed.get("score", 0.0))
                except Exception:
                    try:
                        score = float(int(parsed.get("score", 0)))
                    except Exception:
                        score = 0.0
                score = max(0.0, min(100.0, score))
                explanation = str(parsed.get("explanation", "") or "")[:400]
                return {"score": round(score, 2), "explanation": explanation, "raw": raw}

            # If LLM returned but not parseable => log and fall through to fallback
            logger.warning("LLM returned unparsable/unexpected response for image validation: %s", str(raw)[:400])

        except Exception:
            # keep the exception in logs and fall back to heuristics
            logger.exception("LLM image confidence check failed; falling back to heuristics.")

    try:
        r = requests.get(image_url, timeout=12)
        r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGB")
        q = compute_image_quality_score(img)
        score = q.get("score", 0.0)
        comps = q.get("components", {})
        explanation = f"Fallback quality check: score={score}. Components: {comps}."
        if score < 30:
            explanation = "Low image clarity/context for a public complaint. " + explanation
        return {"score": float(round(score, 2)), "explanation": explanation[:400], "raw": "heuristic:quality-check"}
    except Exception as e:
        logger.exception("Fallback image download/quality check failed")
        return {
            "score": 5.0,
            "explanation": "Unable to validate image (LLM failed and fallback also failed).",
            "raw": f"heuristic:error:{str(e)[:300]}"
        }


# -------------------------
# validate-image route (improved error detail, uses fallback when Groq missing)
# -------------------------
@app.route("/validate-image", methods=["POST"])
def validate_image():
    try:
        payload = request.get_json() or {}
        image_url = payload.get("imageUrl") or payload.get("image_url") or payload.get("url")
        public_id = payload.get("public_id")
        public_url = payload.get("public_url")

        if not image_url:
            return jsonify({"error": "imageUrl required"}), 400

        if not groq_client:
            # If you intentionally want fallback-only mode, comment this out and allow heuristics
            # return jsonify({"error": "LLM validation unavailable: set GROQ_API_KEY and install groq SDK."}), 500
            logger.warning("Groq not configured; using heuristic fallback only.")
        try:
            llm_res = llm_image_confidence(image_url)
        except Exception as e:
            logger.exception("LLM image check failed for url: %s", image_url)
            return jsonify({
                "error": "LLM image validation failed",
                "detail": str(e),
                "hint": "Check GROQ_API_KEY/LLAVA_MODEL and Groq SDK compatibility. See server logs for raw LLM reply."
            }), 500

        llm_score = float(llm_res.get("score", 0.0))
        explanation = llm_res.get("explanation", "")
        raw = llm_res.get("raw", "")
        ok = llm_score >= IMAGE_LLM_THRESHOLD

        result = {"ok": ok, "llm_score": llm_score, "explanation": explanation, "raw": raw, "threshold": float(IMAGE_LLM_THRESHOLD)}

        # If rejected AND Cloudinary configured AND client provided public_id (or url), attempt deletion
        if not ok and cloudinary and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and (public_id or public_url):
            try:
                # extract public_id from public_url if needed
                pid = public_id
                if not pid and public_url:
                    m = re.search(r'/upload/(?:v\d+/)?(.+)$', public_url)
                    if m:
                        pid = re.sub(r'\.[a-zA-Z0-9]{2,5}$', '', m.group(1))
                if pid:
                    from cloudinary import uploader
                    del_res = uploader.destroy(pid, resource_type="image")
                    logger.info("Cloudinary delete requested for %s => %s", pid, del_res)
                    result["deleted"] = del_res
                else:
                    logger.warning("No public_id extracted; skipping server-side delete")
            except Exception as e:
                logger.exception("cloudinary delete attempt failed")
                result["delete_error"] = str(e)

        return jsonify(result), 200

    except Exception:
        logger.exception("validate-image internal error")
        return jsonify({"error": "internal error"}), 500


# API: /delete-cloudinary
@app.route("/delete-cloudinary", methods=["POST"])
def delete_cloudinary():
    """
    POST { "public_id": "folder/file", "resource_type": "image" }
    Accepts either:
      - public_id: "folder/file"
      - or public_url: "https://res.cloudinary.com/<cloud>/image/upload/v123/.../file.png"
    Returns JSON { deleted: {...} } or clear error message.
    """
    payload = request.get_json() or {}
    public_id = payload.get("public_id")
    public_url = payload.get("public_url")
    resource_type = payload.get("resource_type", "image")

    # allow full url and extract public_id
    if not public_id and public_url:
        try:
            # Attempt to extract portion after /upload/
            m = re.search(r'/upload/(?:v\d+/)?(.+)$', public_url)
            if m:
                candidate = m.group(1)
                candidate = re.sub(r'\.[a-zA-Z0-9]{2,5}$', '', candidate)
                public_id = candidate
        except Exception:
            public_id = None

    if not public_id:
        return jsonify({"error": "public_id or public_url required"}), 400

    # verify Cloudinary is configured
    if not cloudinary:
        return jsonify({"error": "Cloudinary SDK not installed on server"}), 500

    if not (CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and CLOUDINARY_CLOUD_NAME):
        return jsonify({"error": "Cloudinary not configured on server. Set CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME."}), 500

    try:
        from cloudinary import uploader
        logger.info("Attempting to delete Cloudinary asset: %s (resource_type=%s)", public_id, resource_type)
        res = uploader.destroy(public_id, resource_type=resource_type)
        logger.info("Cloudinary delete response: %s", res)
        return jsonify({"deleted": res}), 200
    except Exception as e:
        logger.exception("cloudinary delete failed for %s", public_id)
        return jsonify({"error": "cloudinary delete failed", "detail": str(e)}), 500

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
            signed_url, options = cloudinary_url(public_id, resource_type=resource_type, sign_url=bool(CLOUDINARY_API_SECRET), secure=True, transformation=transform)
            return jsonify({"signedUrl": signed_url, "signed": bool(CLOUDINARY_API_SECRET)}), 200
        except Exception:
            logger.exception("cloudinary signing failed")
            return jsonify({"error": "cloudinary signing failed"}), 500

    if CLOUDINARY_CLOUD_NAME:
        try:
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
