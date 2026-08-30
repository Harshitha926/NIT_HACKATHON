"""
Jalamrit — Sponge City Risk Detector
Backend API server (Flask + SQLite)

Endpoints:
  GET  /api/risk-data          -> full grid dataset for the risk map
  GET  /api/predict?lat=&lon=  -> nearest-cell risk prediction for a given point
  GET  /api/reports            -> all citizen reports
  POST /api/reports            -> submit a new citizen report (multipart form, with optional photo)
  PATCH /api/reports/<id>      -> update a report's status (government portal actions)
  GET  /uploads/<filename>     -> serve an uploaded report photo

Run:
  pip install -r requirements.txt
  python app.py
Server runs on http://localhost:5000
"""

import json
import math
import os
import sqlite3
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, request, send_from_directory, g
from flask_cors import CORS
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data", "bellandur_data.json")
DB_FILE = os.path.join(BASE_DIR, "reports.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app)  # allow the frontend (served separately or via Live Server) to call this API

# ============================================================
# Load the real, validated risk dataset once at startup
# ============================================================
with open(DATA_FILE, "r") as f:
    RISK_DATA = json.load(f)

CAT_NAME = {"L": "Low", "M": "Moderate", "H": "High", "C": "Critical"}
REC_NAME = {
    "none": "No intervention needed",
    "rain_garden": "Rain garden / bioswale",
    "permeable_pavement": "Permeable pavement",
    "recharge_well": "Groundwater recharge well",
}


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearest_record(lat, lon):
    best, best_dist = None, float("inf")
    for rec in RISK_DATA:
        d = haversine_km(lat, lon, rec["lat"], rec["lon"])
        if d < best_dist:
            best_dist = d
            best = rec
    return best, best_dist


# ============================================================
# Database setup (SQLite) — citizen reports
# ============================================================
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_FILE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_FILE)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            locality TEXT NOT NULL,
            description TEXT NOT NULL,
            photo_filename TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# ============================================================
# Risk map + prediction endpoints
# ============================================================
@app.route("/api/risk-data", methods=["GET"])
def get_risk_data():
    """Full grid dataset for rendering the interactive risk map."""
    return jsonify(RISK_DATA)


@app.route("/api/predict", methods=["GET"])
def predict():
    """
    Given a lat/lon, find the nearest assessed grid cell and return
    its risk category, score, and recommendation.
    Query params: lat, lon (required)
    """
    try:
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lon query parameters are required and must be numeric"}), 400

    record, dist_km = nearest_record(lat, lon)
    if record is None:
        return jsonify({"error": "No data available"}), 404

    return jsonify(
        {
            "category": record["cat"],
            "category_label": CAT_NAME.get(record["cat"], record["cat"]),
            "score": record["score"],
            "recommendation": record["rec"],
            "recommendation_label": REC_NAME.get(record["rec"], record["rec"]),
            "elevation_m": record["elev"],
            "impervious_pct": round(record["imp"] * 100),
            "distance_to_water_m": record["dist"],
            "nearest_point_distance_m": round(dist_km * 1000),
        }
    )


# ============================================================
# Citizen reporting endpoints
# ============================================================
@app.route("/api/reports", methods=["GET"])
def list_reports():
    db = get_db()
    rows = db.execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()
    reports = []
    for row in rows:
        reports.append(
            {
                "id": row["id"],
                "locality": row["locality"],
                "description": row["description"],
                "photo_url": f"/uploads/{row['photo_filename']}" if row["photo_filename"] else None,
                "status": row["status"],
                "created_at": row["created_at"],
            }
        )
    return jsonify(reports)


@app.route("/api/reports", methods=["POST"])
def create_report():
    """
    Accepts multipart/form-data with fields:
      locality (required), description (required), photo (optional file)
    """
    locality = request.form.get("locality", "").strip()
    description = request.form.get("description", "").strip()

    if not locality or not description:
        return jsonify({"error": "locality and description are required"}), 400

    photo_filename = None
    if "photo" in request.files:
        file = request.files["photo"]
        if file and file.filename and allowed_file(file.filename):
            ext = file.filename.rsplit(".", 1)[1].lower()
            photo_filename = f"{uuid.uuid4().hex}.{ext}"
            file.save(os.path.join(UPLOAD_DIR, secure_filename(photo_filename)))

    report_id = uuid.uuid4().hex
    created_at = datetime.now(timezone.utc).isoformat()

    db = get_db()
    db.execute(
        "INSERT INTO reports (id, locality, description, photo_filename, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
        (report_id, locality, description, photo_filename, created_at),
    )
    db.commit()

    return (
        jsonify(
            {
                "id": report_id,
                "locality": locality,
                "description": description,
                "photo_url": f"/uploads/{photo_filename}" if photo_filename else None,
                "status": "pending",
                "created_at": created_at,
            }
        ),
        201,
    )


@app.route("/api/reports/<report_id>", methods=["PATCH"])
def update_report_status(report_id):
    """
    Update a report's status. Used by the Government Portal to mark
    a report as Red Alert (verified), Under Review, or Resolved.
    Body: {"status": "verified" | "review" | "resolved" | "pending"}
    """
    body = request.get_json(silent=True) or {}
    new_status = body.get("status")
    valid_statuses = {"pending", "verified", "review", "resolved"}

    if new_status not in valid_statuses:
        return jsonify({"error": f"status must be one of {sorted(valid_statuses)}"}), 400

    db = get_db()
    cur = db.execute("UPDATE reports SET status = ? WHERE id = ?", (new_status, report_id))
    db.commit()

    if cur.rowcount == 0:
        return jsonify({"error": "report not found"}), 404

    return jsonify({"id": report_id, "status": new_status})


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


# ============================================================
# Health check
# ============================================================
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "grid_cells_loaded": len(RISK_DATA)})


if __name__ == "__main__":
    init_db()
    print(f"Loaded {len(RISK_DATA)} grid cells from {DATA_FILE}")
    print("Starting Jalamrit backend on http://localhost:5000")
    app.run(debug=True, port=5000)
