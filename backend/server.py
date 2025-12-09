
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
import json
from groq import Groq

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- 1. Setup ---
load_dotenv()
app = Flask(__name__)
# NOTE: In a real deployment, configure CORS more strictly than '*'
CORS(app)

# Firebase Admin init
try:
    # Option 1: From environment variable (for Render)
    firebase_key_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if firebase_key_json:
        import json
        cred = credentials.Certificate(json.loads(firebase_key_json))
        logger.info("✅ Using Firebase credentials from FIREBASE_SERVICE_ACCOUNT env var")
    else:
        # Option 2: Local file (for local dev)
        service_account_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            logger.info("✅ Using local serviceAccountKey.json")
        else:
            raise Exception("No Firebase credentials found: set FIREBASE_SERVICE_ACCOUNT or add serviceAccountKey.json")

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    logger.error(f"❌ Error initializing Firebase Admin: {e}")
    db = None

# Hugging Face Config
HF_API_TOKEN = os.getenv("HF_API_TOKEN") or os.getenv("HUGGINGFACE_API_TOKEN")
HF_BASE_URL = "https://router.huggingface.co/hf-inference"
logger.info(f"HF_API_TOKEN: {'✅ Set' if HF_API_TOKEN else '❌ Not Set'}")

# Groq Config
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct" 
logger.info(f"GROQ_API_KEY: {'✅ Set' if GROQ_API_KEY else '❌ Not Set'}")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


# --- 2. Constants (Mirroring server.js) ---
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
    "water", "roads", "electricity", "sanitation", "health", "governance", "other",
]

URGENT_KEYWORDS = [
    "urgent", "emergency", "immediately", "asap", "accident", "fire", "flood",
    "electrocution", "collapsed", "burst", "serious", "critical",
    "life threatening", "danger", "injury", "major issue", "no water",
    "no electricity",
]

SANITATION_KEYWORDS = [
    "garbage", "waste", "trash", "dustbin", "sewage", "sewer", "drainage",
    "drain", "litter", "dirty", "filth", "smell", "stink", "stray animals",
    "dump", "waste collection", "garbage collection",
]

# --- 3. Helper Functions ---
def map_label_to_key(label):
    """Map model label to simple category key."""
    try:
        idx = CATEGORY_LABELS.index(label)
        return CATEGORY_KEYS[idx]
    except ValueError:
        return "other"

def infer_category_from_keywords(text):
    """Simple keyword-based category override."""
    lower = text.lower()
    if any(k in lower for k in SANITATION_KEYWORDS):
        return "sanitation"
    return None

def extract_keywords(text, top_k=5):
    """Extract top N non-stopwords from text (Matches server.js logic)."""
    tokens = re.findall(r'[a-z]{3,}', text.lower()) or []
    stopwords = {
        "the", "and", "for", "with", "this", "that", "there", "their",
        "was", "were", "from", "will", "your", "you", "are", "sir",
        "madam", "please", "kindly", "city", "area", "ward",
    }
    freq = Counter(t for t in tokens if t not in stopwords)
    return [w for w, _ in freq.most_common(top_k)]

def find_urgent_matches(text):
    """Finds matching urgent keywords in the text."""
    lower = text.lower()
    return [k for k in URGENT_KEYWORDS if k in lower]

def normalize_sentiment(sentiment):
    """Normalize sentiment label from the model to 'negative', 'neutral', or 'positive'."""
    s = (sentiment or "").lower()
    if s in ["label_0", "negative"]:
        return "negative"
    if s in ["label_1", "neutral"]:
        return "neutral"
    if s in ["label_2", "positive"]:
        return "positive"
    return "neutral"

def classify_huggingface(text, model_name, task_params=None):
    """Generic function to call Hugging Face Inference API."""
    if not HF_API_TOKEN: return None

    headers = {
        "Authorization": f"Bearer {HF_API_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": text,
        "parameters": task_params if task_params else {},
    }

    try:
        response = requests.post(f"{HF_BASE_URL}/models/{model_name}", headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as err:
        logger.error(f"⚠️ HF {model_name} HTTP error: {err} - {response.text}")
        return None
    except Exception as err:
        logger.error(f"⚠️ classify_huggingface error for {model_name}: {err}")
        return None

def classify_category(text):
    """AI: Category Classification using Hugging Face Zero-Shot Classification."""
    default_res = {
        "rawLabel": "Other issues not matching the above categories", "category": "other", "confidence": 0.0,
    }
    data = classify_huggingface(
        text, CATEGORY_MODEL, task_params={"candidate_labels": CATEGORY_LABELS, "multi_label": False}
    )

    if not data: return default_res

    raw_label = default_res['rawLabel']
    confidence = default_res['confidence']

    if isinstance(data, dict) and 'labels' in data and data['labels']:
        raw_label = data['labels'][0]
        confidence = data['scores'][0] if data['scores'] else 0.0
    elif isinstance(data, list) and data and isinstance(data[0], list) and data[0]:
        candidates = sorted(data[0], key=lambda x: x.get('score', 0), reverse=True)
        if candidates:
             raw_label = candidates[0].get('label', raw_label)
             confidence = candidates[0].get('score', confidence)
    elif isinstance(data, list) and data and isinstance(data[0], dict):
        candidates = sorted(data, key=lambda x: x.get('score', 0), reverse=True)
        if candidates:
            raw_label = candidates[0].get('label', raw_label)
            confidence = candidates[0].get('score', confidence)
    else:
        logger.error(f"⚠️ HF category unknown format: {data}")

    return {
        "rawLabel": raw_label,
        "category": map_label_to_key(raw_label),
        "confidence": confidence,
    }

def classify_priority(text):
    """AI: Priority Classification using Hugging Face Sentiment Analysis."""
    default_res = {"sentiment": "neutral", "sentimentScore": 0.0}
    data = classify_huggingface(text, PRIORITY_MODEL)
    if not data: return default_res

    sentiment = default_res['sentiment']
    score = default_res['sentimentScore']

    if isinstance(data, list) and data and isinstance(data[0], list) and data[0]:
        candidates = sorted(data[0], key=lambda x: x.get('score', 0), reverse=True)
        if candidates:
            sentiment = candidates[0].get('label', sentiment)
            score = candidates[0].get('score', score)
    elif isinstance(data, list) and data and isinstance(data[0], dict):
        candidates = sorted(data, key=lambda x: x.get('score', 0), reverse=True)
        if candidates:
            sentiment = candidates[0].get('label', sentiment)
            score = candidates[0].get('score', score)
    else:
        logger.error(f"⚠️ HF priority unknown format: {data}")

    return {"sentiment": sentiment, "sentimentScore": score}


def refine_with_groq(text, initial_category, initial_priority, hf_raw_label): # <--- RENAMED AND UPDATED SIGNATURE
    """
    LLM Wrapper: Uses Groq to validate and refine the initial category and priority 
    determined by Hugging Face and rule-based logic.
    """
    if not groq_client:
        return None

    category_list = CATEGORY_KEYS
    priority_list = ["high", "medium", "low"]
    
    json_format_instruction = (
        "Respond ONLY with a single JSON object. The object MUST have three keys: "
        "'category' (string, one of: " + ", ".join(category_list) + "), "
        "'priority' (string, one of: " + ", ".join(priority_list) + "), and "
        "'explanation' (string, a brief 2-3 sentence reason for the FINAL classification). "
        "Do not add any other text outside the JSON object."
    )
    
    system_prompt = (
        "You are an expert grievance classification refiner. "
        f"Initial Category (from simpler models): '{initial_category}' (mapped from: '{hf_raw_label}') "
        f"Initial Priority (from simpler models): '{initial_priority}' "
        "Your task is to review the grievance text and the initial classification. "
        "If the initial classification is accurate, return it. If the classification is likely wrong, provide a better one. "
        "The category and priority in your response MUST be one of the defined values. "
        + json_format_instruction
    )

    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Grievance Text: {text}"}
            ],
            model=GROQ_MODEL,
            response_format={"type": "json_object"}, 
            temperature=0.0
        )
        
        json_string = chat_completion.choices[0].message.content
        parsed_content = json.loads(json_string)

        logger.info(f"✅ Groq Refinement Result: {parsed_content}")
        return parsed_content

    except Exception as err:
        logger.error(f"⚠️ Groq refinement error: {err}")
        return None


# --- 4. MAIN ROUTE ---
@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "service": "grievance-backend"})

@app.route("/submit-grievance", methods=["POST"])
def submit_grievance():
    if db is None:
        return jsonify({"error": "Firebase not initialized"}), 500

    data = request.get_json()
    title = data.get("title")
    description = data.get("description")
    user_id = data.get("userId")
    # Capture Location Data
    latitude = data.get("latitude")
    longitude = data.get("longitude")

    if not title or not description or not user_id:
        return jsonify({"error": "Missing required fields: title, description, userId"}), 400

    text = f"{title}\n{description}".strip()

    try:
        # 1. Save raw grievance first
        new_grievance = {
            "title": title,
            "description": description,
            "userId": user_id,
            "status": "open",
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        
        # Add location data if available (optional fields)
        if latitude is not None and longitude is not None:
            try:
                new_grievance["latitude"] = float(latitude)
                new_grievance["longitude"] = float(longitude)
            except (ValueError, TypeError):
                logger.warning("Received invalid latitude/longitude data.")

        # Firestore automatically adds the document ID
        _, doc_ref = db.collection("grievances").add(new_grievance)
        doc_id = doc_ref.id

        # 2. HF/Rule-based Classification (FIRST LOGIC PASS)
        cat_res = classify_category(text)
        pri_res = classify_priority(text)

        # 3. PRIORITY & CATEGORY DECISION LOGIC (HF/Keyword runs first)
        hf_priority = "low"
        sentiment_raw = pri_res.get("sentiment")
        score = pri_res.get("sentimentScore")
        sentiment = normalize_sentiment(sentiment_raw)
        urgent_matches = find_urgent_matches(text)

        if len(urgent_matches) > 0:
            hf_priority = "high"
        elif sentiment == "negative":
            if score > 0.7: hf_priority = "high"
            elif score > 0.35: hf_priority = "medium"
        elif sentiment == "neutral":
            if score > 0.6: hf_priority = "medium"

        hf_category = cat_res.get("category", "other")
        keyword_category = infer_category_from_keywords(text)
        if keyword_category:
            hf_category = keyword_category
        
        if hf_category == "sanitation" and hf_priority == "low":
            hf_priority = "medium"
            
        hf_raw_label = cat_res.get("rawLabel", "other") # Keep raw label for refinement prompt

        # 4. LLM Refinement (SECOND LOGIC PASS / WRAPPER)
        groq_res = refine_with_groq(text, hf_category, hf_priority, hf_raw_label)

        # 5. FINAL CLASSIFICATION (Prioritizes Groq refinement)
        
        if groq_res:
            priority = groq_res.get("priority", hf_priority)
            category = groq_res.get("category", hf_category)
            ai_explanation = groq_res.get("explanation", "Refined by Groq LLM.")
        else:
            # Fallback to the existing logic results if Groq fails
            priority = hf_priority
            category = hf_category
            ai_explanation = (
                f"Category '{category}' predicted from '{hf_raw_label}' "
                f"(score: {float(cat_res.get('confidence', 0.0)):.2f}), "
                f"Priority '{priority}' determined using sentiment ('{sentiment_raw}', "
                f"score: {float(score):.2f}) and urgency keywords."
            )
        
        is_urgent = priority == "high"
        keywords = extract_keywords(text)

        # 6. Build final hfEngine object
        hf_engine = {
            "category": category,
            "priority": priority,
            "isUrgent": is_urgent,
            "keywords": keywords,
            "explanation": ai_explanation,
            
            # Keep all model data for diagnostics
            "rawCategoryLabel": hf_raw_label,
            "categoryConfidence": float(cat_res.get("confidence", 0.0)),
            "urgentMatches": urgent_matches,
            "modelInfo": {
                "categoryModel": CATEGORY_MODEL,
                "priorityModel": PRIORITY_MODEL,
                "sentimentLabel": sentiment_raw,
                "sentimentScore": float(score),
                "groqModel": GROQ_MODEL if groq_res else "None",
                "hfCategory": hf_category,
                "hfPriority": hf_priority,
            },
        }

        # Update the document with AI results
        db.collection("grievances").document(doc_id).set({"hfEngine": hf_engine}, merge=True)
        logger.info("✅ Saved AI data to Firestore")

        return jsonify({
            "message": "Grievance submitted and analyzed successfully!",
            "grievanceId": doc_id,
            "hfEngine": hf_engine,
        })

    except Exception as err:
        logger.error(f"❌ Server error: {err}")
        return jsonify({"error": "Internal Server Error"}), 500

# --- 7. Start Server ---
if __name__ == "__main__":
    PORT = int(os.getenv("PORT", 10000))
    app.run(host='0.0.0.0', port=PORT, debug=False)