# 3D Point Cloud QA System

## Overview

An AI-powered 3D quality assurance tool for analyzing construction point cloud data. It enables deviation detection, alignment analysis, defect identification, and interactive measurement in a 3D environment.

## Key Features

* Deviation heatmap visualization
* ICP-based alignment analysis (fitness, RMSE, status)
* Defect classification
* Measurement tool with annotations and history
* Hotspot detection
* Quality score (0–100)
* Export reports (CSV, PDF) and screenshot capture

## Tech Stack

* Frontend: React, Three.js
* Backend: FastAPI, Open3D
* Tools: Axios, jsPDF

## Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend-app
npm install
npm run dev
```

## Use Case

Helps construction teams validate as-built structures, detect deviations, and perform QA inspections efficiently.

## Author

Shahista Tamkeen
* Portfolio: https://shahistatamkeen1.github.io/portfolio/
* LinkedIn: https://www.linkedin.com/in/shahista-tamkeen/
