from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import open3d as o3d
import numpy as np
import os
import shutil

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

CURRENT_FILE_STATE = os.path.join(BASE_DIR, "current_file.txt")
REFERENCE_FILE_STATE = os.path.join(BASE_DIR, "reference_file.txt")
ACTUAL_FILE_STATE = os.path.join(BASE_DIR, "actual_file.txt")

DEFAULT_FILE_PATH = os.path.join(BASE_DIR, "room.ply")
MAX_POINTS = 50000

SUPPORTED_EXTENSIONS = {
    ".ply", ".pcd", ".xyz", ".xyzn", ".xyzrgb",
    ".pts", ".las", ".laz", ".e57",
    ".obj", ".stl", ".off", ".gltf", ".glb",
    ".rcp", ".rcs"
}


def save_state(path: str, value: str):
    with open(path, "w", encoding="utf-8") as f:
        f.write(value)


def read_state(path: str, fallback: str = "") -> str:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            saved = f.read().strip()
        if saved and os.path.exists(saved):
            return saved
    return fallback


def validate_file_extension(filename: str):
    ext = os.path.splitext(filename)[1].lower()

    if ext not in SUPPORTED_EXTENSIONS:
        return False, ext, f"Unsupported file format: {ext}"

    if ext in [".rcp", ".rcs"]:
        return (
            False,
            ext,
            "RCP/RCS files are Autodesk ReCap project formats and are not directly supported. "
            "Please convert them to E57, LAS, LAZ, PLY, PCD, XYZ, or PTS first."
        )

    return True, ext, ""


def get_current_file():
    return read_state(CURRENT_FILE_STATE, DEFAULT_FILE_PATH)


def get_reference_file():
    return read_state(REFERENCE_FILE_STATE, "")


def get_actual_file():
    return read_state(ACTUAL_FILE_STATE, "")


def normalize_and_sample_points(points: np.ndarray) -> np.ndarray:
    if points is None or len(points) == 0:
        return np.empty((0, 3))

    points = np.asarray(points, dtype=np.float64)

    if points.ndim != 2 or points.shape[1] < 3:
        return np.empty((0, 3))

    points = points[:, :3]
    points = points[np.isfinite(points).all(axis=1)]

    if len(points) == 0:
        return np.empty((0, 3))

    if len(points) > MAX_POINTS:
        indices = np.random.choice(len(points), MAX_POINTS, replace=False)
        points = points[indices]
        print(f"⚡ Sampled to {MAX_POINTS} points")

    centroid = np.mean(points, axis=0)
    points = points - centroid

    max_dist = np.max(np.linalg.norm(points, axis=1))
    if max_dist > 0:
        points = (points / max_dist) * 10

    return points


def load_pts_file(file_path: str) -> np.ndarray:
    loaded_points = []

    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    start_index = 0
    if lines and lines[0].strip().isdigit():
        start_index = 1

    for line in lines[start_index:]:
        parts = line.strip().split()
        if len(parts) >= 3:
            try:
                loaded_points.append([float(parts[0]), float(parts[1]), float(parts[2])])
            except ValueError:
                continue

    return np.array(loaded_points, dtype=np.float64) if loaded_points else np.empty((0, 3))


def load_las_laz_file(file_path: str) -> np.ndarray:
    try:
        import laspy
        las = laspy.read(file_path)
        return np.vstack((las.x, las.y, las.z)).transpose()
    except ImportError:
        print("❌ Missing dependency: pip install laspy lazrs")
    except Exception as e:
        print(f"❌ Error reading LAS/LAZ file: {e}")

    return np.empty((0, 3))


def load_e57_file(file_path: str) -> np.ndarray:
    try:
        import pye57
    except ImportError:
        print("❌ pye57 NOT installed. Run: pip install pye57")
        return np.empty((0, 3))

    try:
        print(f"📂 Loading E57: {file_path}")

        e57 = pye57.E57(file_path)
        all_points = []

        scan_count = e57.scan_count
        print(f"✅ E57 scan count: {scan_count}")

        for scan_index in range(scan_count):
            print(f"📌 Reading scan {scan_index + 1}/{scan_count}")
            data = e57.read_scan_raw(scan_index)
            print("✅ Keys in E57:", data.keys())

            if "cartesianX" in data and "cartesianY" in data and "cartesianZ" in data:
                x = np.asarray(data["cartesianX"], dtype=np.float64)
                y = np.asarray(data["cartesianY"], dtype=np.float64)
                z = np.asarray(data["cartesianZ"], dtype=np.float64)

            elif (
                "sphericalRange" in data
                and "sphericalAzimuth" in data
                and "sphericalElevation" in data
            ):
                r = np.asarray(data["sphericalRange"], dtype=np.float64)
                az = np.asarray(data["sphericalAzimuth"], dtype=np.float64)
                el = np.asarray(data["sphericalElevation"], dtype=np.float64)

                x = r * np.cos(el) * np.cos(az)
                y = r * np.cos(el) * np.sin(az)
                z = r * np.sin(el)

            else:
                print(f"⚠️ Scan {scan_index} has unsupported coordinate fields")
                continue

            valid_mask = np.isfinite(x) & np.isfinite(y) & np.isfinite(z)
            scan_points = np.vstack(
                (x[valid_mask], y[valid_mask], z[valid_mask])
            ).transpose()

            print(f"✅ Loaded {len(scan_points)} points from scan {scan_index + 1}")

            if len(scan_points) > 0:
                all_points.append(scan_points)

        if not all_points:
            print("❌ No readable E57 points found")
            return np.empty((0, 3))

        points = np.vstack(all_points)
        print(f"✅ Total E57 points loaded before sampling: {len(points)}")

        return points

    except Exception as e:
        print(f"❌ Error reading E57 file: {e}")
        return np.empty((0, 3))


def load_mesh_as_points(file_path: str) -> np.ndarray:
    try:
        mesh = o3d.io.read_triangle_mesh(file_path)
        if mesh.has_vertices():
            sampled = mesh.sample_points_uniformly(number_of_points=MAX_POINTS)
            return np.asarray(sampled.points)
    except Exception as e:
        print(f"❌ Error reading mesh file: {e}")

    return np.empty((0, 3))


def load_points_from_file(file_path: str) -> np.ndarray:
    if not file_path or not os.path.exists(file_path):
        return np.empty((0, 3))

    ext = os.path.splitext(file_path)[1].lower()
    points = np.empty((0, 3))

    try:
        if ext in [".ply", ".pcd", ".xyz", ".xyzn", ".xyzrgb"]:
            pcd = o3d.io.read_point_cloud(file_path)
            points = np.asarray(pcd.points)

            if len(points) == 0 and ext == ".ply":
                points = load_mesh_as_points(file_path)

        elif ext == ".pts":
            points = load_pts_file(file_path)

        elif ext in [".las", ".laz"]:
            points = load_las_laz_file(file_path)

        elif ext == ".e57":
            points = load_e57_file(file_path)

        elif ext in [".obj", ".stl", ".off", ".gltf", ".glb"]:
            points = load_mesh_as_points(file_path)

        elif ext in [".rcp", ".rcs"]:
            print("❌ RCP/RCS files are not directly supported. Convert to E57/LAS/PLY first.")
            return np.empty((0, 3))

        else:
            print(f"❌ Unsupported file format: {ext}")
            return np.empty((0, 3))

    except Exception as e:
        print(f"❌ Error reading file {file_path}: {e}")
        return np.empty((0, 3))

    return normalize_and_sample_points(points)


def align_point_clouds_icp(reference_points: np.ndarray, actual_points: np.ndarray):
    if len(reference_points) == 0 or len(actual_points) == 0:
        return actual_points, np.eye(4), {
            "fitness": 0,
            "rmse": 0,
            "status": "No Alignment",
        }

    reference_pcd = o3d.geometry.PointCloud()
    reference_pcd.points = o3d.utility.Vector3dVector(reference_points)

    actual_pcd = o3d.geometry.PointCloud()
    actual_pcd.points = o3d.utility.Vector3dVector(actual_points)

    reg = o3d.pipelines.registration.registration_icp(
        actual_pcd,
        reference_pcd,
        1.5,
        np.eye(4),
        o3d.pipelines.registration.TransformationEstimationPointToPoint(),
    )

    actual_pcd.transform(reg.transformation)
    aligned_points = np.asarray(actual_pcd.points)

    fitness = round(float(reg.fitness), 4)
    rmse = round(float(reg.inlier_rmse), 4)

    if fitness >= 0.75 and rmse <= 0.35:
        status = "Good Alignment"
    elif fitness >= 0.45 and rmse <= 0.75:
        status = "Moderate Alignment"
    else:
        status = "Poor Alignment"

    alignment_quality = {
        "fitness": fitness,
        "rmse": rmse,
        "status": status,
    }

    return aligned_points, reg.transformation, alignment_quality


def compute_basic_deviation(points: np.ndarray, threshold: float):
    z_vals = points[:, 2]
    mean_z = float(np.mean(z_vals))
    deviations = np.abs(z_vals - mean_z)

    return classify_deviations(deviations, threshold)


def compute_comparison_deviation(reference_points: np.ndarray, actual_points: np.ndarray, threshold: float):
    if len(reference_points) == 0 or len(actual_points) == 0:
        return np.array([]), [], [], 0

    reference_pcd = o3d.geometry.PointCloud()
    reference_pcd.points = o3d.utility.Vector3dVector(reference_points)

    actual_pcd = o3d.geometry.PointCloud()
    actual_pcd.points = o3d.utility.Vector3dVector(actual_points)

    distances = np.asarray(actual_pcd.compute_point_cloud_distance(reference_pcd))

    return classify_deviations(distances, threshold)


def classify_deviations(deviations: np.ndarray, threshold: float):
    effective_threshold = threshold / 10.0

    colors = []
    severity_labels = []
    deviation_count = 0

    for d in deviations:
        if d < effective_threshold:
            colors.append([0.0, 1.0, 0.0])
            severity_labels.append("acceptable")
        elif d < effective_threshold * 2:
            colors.append([1.0, 1.0, 0.0])
            severity_labels.append("warning")
            deviation_count += 1
        else:
            colors.append([1.0, 0.0, 0.0])
            severity_labels.append("critical")
            deviation_count += 1

    return deviations, colors, severity_labels, deviation_count

def calculate_quality_score(
    point_count: int,
    deviation_count: int,
    hotspot_count: int = 0,
    alignment_quality: dict | None = None,
):
    if point_count <= 0:
        return {
            "score": 0,
            "status": "No Data",
        }

    deviation_percent = (deviation_count / point_count) * 100

    score = 100
    score -= min(deviation_percent * 0.8, 45)
    score -= min(hotspot_count * 2, 20)

    if alignment_quality:
        fitness = alignment_quality.get("fitness", 0)
        rmse = alignment_quality.get("rmse", 0)

        score += min(fitness * 10, 10)
        score -= min(rmse * 10, 15)

    score = max(0, min(100, round(score, 1)))

    if score >= 90:
        status = "Excellent"
    elif score >= 75:
        status = "Good"
    elif score >= 55:
        status = "Needs Review"
    else:
        status = "Critical"

    return {
        "score": score,
        "status": status,
    }


def save_uploaded_file(file: UploadFile, prefix: str = ""):
    is_valid, ext, error_message = validate_file_extension(file.filename)

    if not is_valid:
        return None, ext, error_message

    safe_name = f"{prefix}{os.path.basename(file.filename)}"
    save_path = os.path.join(UPLOADS_DIR, safe_name)

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return save_path, ext, ""


@app.get("/")
def root():
    return {"message": "Point Cloud QA Backend Running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/supported-formats")
def supported_formats():
    return {
        "directly_supported": [
            ".ply", ".pcd", ".xyz", ".xyzn", ".xyzrgb",
            ".pts", ".las", ".laz", ".e57",
            ".obj", ".stl", ".off", ".gltf", ".glb"
        ],
        "requires_conversion": {
            ".rcp": "Convert Autodesk ReCap RCP to E57, LAS, LAZ, PLY, PCD, XYZ, or PTS.",
            ".rcs": "Convert Autodesk ReCap RCS to E57, LAS, LAZ, PLY, PCD, XYZ, or PTS."
        },
        "optional_dependencies": {
            ".las/.laz": "pip install laspy lazrs",
            ".e57": "pip install pye57"
        },
        "max_points_returned": MAX_POINTS
    }


@app.post("/upload-pointcloud")
async def upload_pointcloud(file: UploadFile = File(...)):
    save_path, ext, error_message = save_uploaded_file(file)

    if error_message:
        return {"error": error_message}

    save_state(CURRENT_FILE_STATE, save_path)
    points = load_points_from_file(save_path)

    if len(points) == 0:
        return {
            "error": f"File uploaded but no readable points were found for format {ext}.",
            "file": os.path.basename(save_path),
            "point_count": 0,
        }

    return {
        "message": "File uploaded successfully",
        "file": os.path.basename(save_path),
        "format": ext,
        "point_count": int(len(points)),
    }


@app.post("/upload-reference")
async def upload_reference(file: UploadFile = File(...)):
    save_path, ext, error_message = save_uploaded_file(file, prefix="reference_")

    if error_message:
        return {"error": error_message}

    save_state(REFERENCE_FILE_STATE, save_path)
    points = load_points_from_file(save_path)

    if len(points) == 0:
        return {
            "error": f"Reference file uploaded but no readable points were found for format {ext}.",
            "file": os.path.basename(save_path),
            "point_count": 0,
        }

    return {
        "message": "Reference file uploaded successfully",
        "file": os.path.basename(save_path),
        "format": ext,
        "point_count": int(len(points)),
    }


@app.post("/upload-actual")
async def upload_actual(file: UploadFile = File(...)):
    save_path, ext, error_message = save_uploaded_file(file, prefix="actual_")

    if error_message:
        return {"error": error_message}

    save_state(ACTUAL_FILE_STATE, save_path)
    points = load_points_from_file(save_path)

    if len(points) == 0:
        return {
            "error": f"Actual file uploaded but no readable points were found for format {ext}.",
            "file": os.path.basename(save_path),
            "point_count": 0,
        }

    return {
        "message": "Actual file uploaded successfully",
        "file": os.path.basename(save_path),
        "format": ext,
        "point_count": int(len(points)),
    }


@app.get("/pointcloud-analysis")
def pointcloud_analysis(mode: str = "deviation", threshold: float = 2.0):
    if mode == "comparison":
        reference_file = get_reference_file()
        actual_file = get_actual_file()

        reference_points = load_points_from_file(reference_file)
        actual_points = load_points_from_file(actual_file)

        if len(reference_points) == 0 or len(actual_points) == 0:
            return empty_response(
                mode,
                threshold,
                message="Upload both reference and actual files first",
                reference_file=reference_file,
                actual_file=actual_file,
            )

        aligned_actual_points, transformation, alignment_quality = align_point_clouds_icp(
            reference_points,
            actual_points
        )

        deviations, colors, severity_labels, deviation_count = compute_comparison_deviation(
            reference_points,
            aligned_actual_points,
            threshold
        )
        
        quality_score = calculate_quality_score(
            point_count=len(aligned_actual_points),
            deviation_count=deviation_count,
            hotspot_count=0,
            alignment_quality=alignment_quality,
        )

        return {
            "file": os.path.basename(actual_file),
            "reference_file": os.path.basename(reference_file),
            "actual_file": os.path.basename(actual_file),
            "alignment_matrix": transformation.tolist(),
            "alignment_quality": alignment_quality,
            "quality_score": quality_score,
            "points": aligned_actual_points.tolist(),
            "colors": colors,
            "deviations": deviations.tolist(),
            "severity_labels": severity_labels,
            "point_count": int(len(aligned_actual_points)),
            "deviation_count": int(deviation_count),
            "deviation_percent": round((deviation_count / len(aligned_actual_points)) * 100, 2),
            "max_deviation": round(float(np.max(deviations)), 4) if len(deviations) > 0 else 0,
            "avg_deviation": round(float(np.mean(deviations)), 4) if len(deviations) > 0 else 0,
            "threshold": threshold,
            "mode": mode,
        }

    file_path = get_current_file()
    points = load_points_from_file(file_path)

    if len(points) == 0:
        return empty_response(mode, threshold, file_path=file_path)

    if mode == "raw":
        return {
            "file": os.path.basename(file_path),
            "reference_file": "",
            "actual_file": "",
            "alignment_matrix": [],
            "alignment_quality": {
                "fitness": 0,
                "rmse": 0,
                "status": "Not Applicable",
            },
            "points": points.tolist(),
            "colors": [[0.85, 0.85, 0.85] for _ in range(len(points))],
            "deviations": [0.0 for _ in range(len(points))],
            "severity_labels": ["raw" for _ in range(len(points))],
            "point_count": int(len(points)),
            "deviation_count": 0,
            "deviation_percent": 0,
            "max_deviation": 0,
            "avg_deviation": 0,
            "threshold": threshold,
            "mode": mode,
            "quality_score": {
                "score": 100,
                "status": "Raw View",
            },
        }

    deviations, colors, severity_labels, deviation_count = compute_basic_deviation(points, threshold)
    
    quality_score = calculate_quality_score(
        point_count=len(points),
        deviation_count=deviation_count,
    )
    
    # --- AI SUGGESTION ENGINE ---

    suggestions = []

    total_points = len(points) if len(points) > 0 else 1
    critical_ratio = deviation_count / total_points

    if critical_ratio > 0.6:
        suggestions.append("⚠️ High deviation detected across structure. Recommend full inspection.")
    elif critical_ratio > 0.3:
        suggestions.append("⚠️ Moderate deviation. Check alignment and structural consistency.")
    else:
        suggestions.append("✅ Structure is mostly within acceptable deviation limits.")

    if max(deviations) > threshold * 2:
        suggestions.append("🔴 Extreme deviation zones detected. Possible structural defects.")

    if np.mean(deviations) < threshold:
        suggestions.append("🟢 Overall alignment looks stable.")

    return {
        "file": os.path.basename(file_path),
        "reference_file": "",
        "actual_file": "",
        "alignment_matrix": [],
        "points": points.tolist(),
        "colors": colors,
        "deviations": deviations.tolist(),
        "severity_labels": severity_labels,
        "point_count": int(len(points)),
        "deviation_count": int(deviation_count),
        "deviation_percent": round((deviation_count / len(points)) * 100, 2),
        "max_deviation": round(float(np.max(deviations)), 4),
        "avg_deviation": round(float(np.mean(deviations)), 4),
        "threshold": threshold,
        "mode": mode,
        "suggestions": suggestions,
        "quality_score": quality_score,
    }


def empty_response(
    mode: str,
    threshold: float,
    message: str = "",
    file_path: str = "",
    reference_file: str = "",
    actual_file: str = "",
):
    response = {
        "file": os.path.basename(file_path) if file_path else "",
        "reference_file": os.path.basename(reference_file) if reference_file else "",
        "actual_file": os.path.basename(actual_file) if actual_file else "",
        "alignment_matrix": [],
        "points": [],
        "colors": [],
        "deviations": [],
        "severity_labels": [],
        "point_count": 0,
        "deviation_count": 0,
        "deviation_percent": 0,
        "max_deviation": 0,
        "avg_deviation": 0,
        "threshold": threshold,
        "mode": mode,
    }

    if message:
        response["message"] = message

    return response