# Jalamrit — Sponge City Risk Detector

Satellite-based, hyperlocal urban flood risk mapping with citizen reporting and a government review portal. Built for NIT Delhi Hackathon.

## Project Structure

```
NIT_HACKATHON/
├── backend/
│   ├── app.py              # Flask API server
│   ├── requirements.txt    # Python dependencies
│   ├── data/
│   │   └── bellandur_data.json   # Real, validated risk data (1,288 grid cells)
│   └── uploads/             # Citizen report photos land here (created automatically)
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
└── README.md
```

## What This Is

Jalamrit identifies which 100m x 100m patches of Bellandur/HSR Layout (Bengaluru) are genuinely prone to flooding, and recommends a specific intervention (rain garden, permeable pavement, or groundwater recharge well) for each — using a model trained on real satellite data (Sentinel-1 radar), government rainfall records, and validated against official BBMP flood vulnerability lists and a peer-reviewed 2026 academic paper.

Five sections:
- **Home** — mission, problem framing, and team
- **Risk Map** — interactive map of all 1,288 assessed grid cells
- **Predict** — check flood risk for any locality or your current location
- **Report an Issue** — citizens upload a photo and description of flooding they see
- **Government Portal** — officials review reports and mark them Red Alert / Under Review / Resolved
- **Methodology** — data sources, validation, and honest model limitations

## Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The server starts on **http://localhost:5000**. It will print how many grid cells it loaded — should say 1288.

Verify it's running: open http://localhost:5000/api/health in a browser — you should see `{"status": "ok", "grid_cells_loaded": 1288}`.

### 2. Frontend

The frontend is plain HTML/CSS/JS — no build step needed. Two ways to run it:

**Option A — VS Code Live Server (recommended)**
Install the "Live Server" extension, right-click `frontend/index.html`, and choose "Open with Live Server".

**Option B — Python's built-in server**
```bash
cd frontend
python -m http.server 8000
```
Then open http://localhost:8000 in your browser.

**Important:** Don't just double-click `index.html` to open it directly (`file://` URLs) — some browsers block the requests to the backend from a `file://` origin. Always serve it through Live Server or a local HTTP server.

Make sure the backend (step 1) is running first — the frontend fetches all its data from `http://localhost:5000`.

## API Endpoints (backend/app.py)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/risk-data` | Full grid dataset for the map |
| GET | `/api/predict?lat=&lon=` | Nearest-cell risk prediction |
| GET | `/api/reports` | List all citizen reports |
| POST | `/api/reports` | Submit a new report (multipart form: locality, description, photo) |
| PATCH | `/api/reports/<id>` | Update a report's status |
| GET | `/uploads/<filename>` | Serve an uploaded report photo |
| GET | `/api/health` | Health check |

## Notes

- The database is SQLite (`backend/reports.db`), created automatically on first run. Delete it to reset all citizen reports.
- Uploaded photos are stored in `backend/uploads/` as actual image files, not base64 blobs.
- CORS is enabled on the backend so the frontend can call it from a different port.
- This currently ships with real data for one zone (Bellandur/HSR Layout, 1,288 cells). The same pipeline was also run for Yelahanka, Kodigehalli, and KR Puram — swap `backend/data/bellandur_data.json` for another zone's export to point the app at a different area.

## Model Performance (Honest Numbers)

ROC-AUC (5-fold cross-validated): 0.55–0.78 across four independently tested Bengaluru zones, strongest in Bellandur (0.775... see Methodology tab in-app for the full breakdown, including what we tested and what didn't improve results).
