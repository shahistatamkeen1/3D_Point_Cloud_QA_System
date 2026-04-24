import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import axios from "axios";
import jsPDF from "jspdf";

const API_BASE = import.meta.env.VITE_API_BASE;

const ACCEPTED_FORMATS =
  ".ply,.pcd,.xyz,.xyzn,.xyzrgb,.pts,.las,.laz,.e57,.obj,.stl,.off,.gltf,.glb,.rcp,.rcs";

export default function PointCloudViewer() {
  const mountRef = useRef(null);
  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const pointCloudRef = useRef(null);
  const animationRef = useRef(null);
  const gridRef = useRef(null);
  const axesRef = useRef(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const selectedMarkerRef = useRef(null);
  const hotspotMarkersRef = useRef([]);
  const hotspotLabelSpritesRef = useRef([]);

  const measureLineRef = useRef(null);
  const measureLabelRef = useRef(null);
  const measureMarkersRef = useRef([]);
  const measureModeRef = useRef(false);
  const measurePointsRef = useRef([]);
  const savedMeasureLinesRef = useRef([]);
  const savedMeasureMarkersRef = useRef([]);
  const savedMeasureLabelsRef = useRef([]);

  const pointsDataRef = useRef([]);
  const deviationsRef = useRef([]);
  const severityLabelsRef = useRef([]);
  const performanceModeRef = useRef("full");

  const dragStateRef = useRef({ dragging: false, panel: null, offsetX: 0, offsetY: 0 });

  const [leftPanelPos, setLeftPanelPos] = useState({ x: 16, y: 16 });
  const [rightPanelPos, setRightPanelPos] = useState({
    x: Math.max(window.innerWidth - 390, 430),
    y: 16,
  });

  const [fileName, setFileName] = useState("None");
  const [referenceFileName, setReferenceFileName] = useState("None");
  const [actualFileName, setActualFileName] = useState("None");

  const [pointCount, setPointCount] = useState(0);
  const [performanceMode, setPerformanceMode] = useState("full");

  const [alignmentQuality, setAlignmentQuality] = useState({
    fitness: 0,
    rmse: 0,
    status: "Not Applicable",
  });

  const [qualityScore, setQualityScore] = useState({ score: 0, status: "No Data" });

  const [defectClassification, setDefectClassification] = useState({
    type: "Not Available",
    confidence: 0,
    reason: "Run deviation or comparison analysis to classify defects.",
  });

  const [deviationCount, setDeviationCount] = useState(0);
  const [deviationPercent, setDeviationPercent] = useState(0);
  const [maxDeviation, setMaxDeviation] = useState(0);
  const [avgDeviation, setAvgDeviation] = useState(0);

  const [threshold, setThreshold] = useState(2.0);
  const [mode, setMode] = useState("raw");
  const [filterMode, setFilterMode] = useState("all");

  const [statusMessage, setStatusMessage] = useState("Initializing viewer...");
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const [selectedPoint, setSelectedPoint] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const [severityCounts, setSeverityCounts] = useState({
    acceptable: 0,
    warning: 0,
    critical: 0,
    raw: 0,
  });

  const [hotspotCount, setHotspotCount] = useState(0);
  const [hotspotSizes, setHotspotSizes] = useState([]);
  const [hotspotCenters, setHotspotCenters] = useState([]);

  const [suggestions, setSuggestions] = useState([]);
  const [fixSuggestions, setFixSuggestions] = useState([]);

  const [pointSize, setPointSize] = useState(0.12);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);

  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measureDistance, setMeasureDistance] = useState(null);
  const [measurementHistory, setMeasurementHistory] = useState([]);

  const cardStyle = {
    marginTop: "12px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px",
    padding: "10px",
  };

  const baseButton = {
    padding: "6px 8px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    color: "white",
    fontSize: "11px",
    minHeight: "32px",
    width: "100%",
  };

  const smallButton = {
    padding: "4px 8px",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    background: "#444",
    color: "white",
    fontSize: "11px",
  };

  const clearSelectedMarker = () => {
    if (!selectedMarkerRef.current || !sceneRef.current) return;
    sceneRef.current.remove(selectedMarkerRef.current);
    selectedMarkerRef.current.geometry?.dispose();
    selectedMarkerRef.current.material?.dispose();
    selectedMarkerRef.current = null;
  };

  const clearHotspotMarkers = () => {
    if (!sceneRef.current) return;
    hotspotMarkersRef.current.forEach((marker) => {
      sceneRef.current.remove(marker);
      marker.geometry?.dispose();
      marker.material?.dispose();
    });
    hotspotMarkersRef.current = [];
  };

  const clearHotspotLabels = () => {
    if (!sceneRef.current) return;
    hotspotLabelSpritesRef.current.forEach((sprite) => {
      sceneRef.current.remove(sprite);
      sprite.material?.map?.dispose();
      sprite.material?.dispose();
    });
    hotspotLabelSpritesRef.current = [];
  };

  const createTextSprite = (text) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.beginPath();
    ctx.roundRect(20, 24, 216, 72, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.2, 0.6, 1);
    return sprite;
  };

  const createMeasureLabel = (text) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#00ffff";
    ctx.font = "bold 42px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4.5, 1.1, 1);
    return sprite;
  };

  const clearMeasurement = () => {
    if (measureLabelRef.current && sceneRef.current) {
      sceneRef.current.remove(measureLabelRef.current);
      measureLabelRef.current.material?.map?.dispose();
      measureLabelRef.current.material?.dispose();
      measureLabelRef.current = null;
    }

    if (measureLineRef.current && sceneRef.current) {
      sceneRef.current.remove(measureLineRef.current);
      measureLineRef.current.geometry?.dispose();
      measureLineRef.current.material?.dispose();
      measureLineRef.current = null;
    }

    measureMarkersRef.current.forEach((marker) => {
      if (sceneRef.current) sceneRef.current.remove(marker);
      marker.geometry?.dispose();
      marker.material?.dispose();
    });

    measureMarkersRef.current = [];
    setMeasurePoints([]);
    setMeasureDistance(null);
  };

  const clearAllMeasurements = () => {
    clearMeasurement();

    savedMeasureLinesRef.current.forEach((line) => {
      if (sceneRef.current) sceneRef.current.remove(line);
      line.geometry?.dispose();
      line.material?.dispose();
    });

    savedMeasureMarkersRef.current.forEach((marker) => {
      if (sceneRef.current) sceneRef.current.remove(marker);
      marker.geometry?.dispose();
      marker.material?.dispose();
    });

    savedMeasureLabelsRef.current.forEach((label) => {
      if (sceneRef.current) sceneRef.current.remove(label);
      label.material?.map?.dispose();
      label.material?.dispose();
    });

    savedMeasureLinesRef.current = [];
    savedMeasureMarkersRef.current = [];
    savedMeasureLabelsRef.current = [];
    setMeasurementHistory([]);
  };

  const clearPointCloud = () => {
    clearAllMeasurements();

    if (pointCloudRef.current && sceneRef.current) {
      sceneRef.current.remove(pointCloudRef.current);
      pointCloudRef.current.geometry?.dispose();
      pointCloudRef.current.material?.dispose();
      pointCloudRef.current = null;
    }

    pointsDataRef.current = [];
    deviationsRef.current = [];
    severityLabelsRef.current = [];

    clearSelectedMarker();
    clearHotspotMarkers();
    clearHotspotLabels();

    setSelectedPoint(null);
    setHoveredPoint(null);
    setHotspotCount(0);
    setHotspotSizes([]);
    setHotspotCenters([]);
  };

  const fitCameraToGeometry = (geometry) => {
    if (!geometry || !cameraRef.current || !controlsRef.current) return;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere || !isFinite(sphere.radius)) {
      cameraRef.current.position.set(18, 12, 18);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
      return;
    }
    const center = sphere.center.clone();
    const radius = Math.max(sphere.radius, 2);
    cameraRef.current.position.set(center.x + radius * 2.4, center.y + radius * 1.5, center.z + radius * 2.4);
    cameraRef.current.near = 0.01;
    cameraRef.current.far = Math.max(2000, radius * 100);
    cameraRef.current.updateProjectionMatrix();
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  const computeHotspots = (points, severities) => {
    clearHotspotMarkers();
    clearHotspotLabels();
    const critical = points.filter((p, i) => severities[i] === "critical");
    if (critical.length === 0) {
      setHotspotCount(0);
      setHotspotSizes([]);
      setHotspotCenters([]);
      return;
    }

    const cellSize = 1.2;
    const grid = new Map();
    critical.forEach((p) => {
      const key = `${Math.round(p.originalX / cellSize)}_${Math.round(p.originalY / cellSize)}_${Math.round(p.originalZ / cellSize)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(p);
    });

    const clusters = Array.from(grid.values())
      .filter((cluster) => cluster.length >= 20)
      .sort((a, b) => b.length - a.length)
      .slice(0, 20);

    const centers = clusters.map((cluster, index) => {
      const cx = cluster.reduce((s, p) => s + p.x, 0) / cluster.length;
      const cy = cluster.reduce((s, p) => s + p.y, 0) / cluster.length;
      const cz = cluster.reduce((s, p) => s + p.z, 0) / cluster.length;
      const ox = cluster.reduce((s, p) => s + p.originalX, 0) / cluster.length;
      const oy = cluster.reduce((s, p) => s + p.originalY, 0) / cluster.length;
      const oz = cluster.reduce((s, p) => s + p.originalZ, 0) / cluster.length;
      return { id: index + 1, x: cx, y: cy, z: cz, originalX: ox, originalY: oy, originalZ: oz, size: cluster.length };
    });

    setHotspotCount(centers.length);
    setHotspotSizes(centers.map((c) => c.size));
    setHotspotCenters(centers);

    if (!sceneRef.current) return;
    const markers = centers.map((center) => {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 18), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
      marker.position.set(center.x, center.y, center.z);
      return marker;
    });

    const labels = centers.map((center) => {
      const sprite = createTextSprite(`H${center.id}`);
      sprite.position.set(center.x + 0.45, center.y + 0.45, center.z);
      return sprite;
    });

    markers.forEach((m) => sceneRef.current.add(m));
    labels.forEach((l) => sceneRef.current.add(l));
    hotspotMarkersRef.current = markers;
    hotspotLabelSpritesRef.current = labels;
  };

  const renderPointCloud = (pointData, colorData, deviationData = [], severityData = [], currentFilterMode = filterMode, currentPerformanceMode = performanceMode) => {
    clearPointCloud();
    if (!Array.isArray(pointData) || pointData.length === 0) {
      setStatusMessage("No points found.");
      return;
    }

    const validPoints = [];
    for (let i = 0; i < pointData.length; i++) {
      const p = pointData[i];
      if (Array.isArray(p) && p.length >= 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) {
        const severity = severityData[i] || "raw";
        if (currentFilterMode !== "all" && severity !== currentFilterMode) continue;
        validPoints.push({
          point: p,
          color: Array.isArray(colorData?.[i]) ? colorData[i] : [0.88, 0.88, 0.88],
          deviation: Number.isFinite(deviationData[i]) ? deviationData[i] : Math.abs(p[2]),
          severity,
          originalIndex: i,
        });
      }
    }

    if (validPoints.length === 0) {
      setStatusMessage(`No points found for filter: ${currentFilterMode}`);
      return;
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const item of validPoints) {
      const [x, y, z] = item.point;
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const largestRange = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
    const scale = 18 / largestRange;

    const positions = new Float32Array(validPoints.length * 3);
    const colors = new Float32Array(validPoints.length * 3);
    const mappedPoints = [];
    const mappedDeviations = [];
    const mappedSeverities = [];

    for (let i = 0; i < validPoints.length; i++) {
      const item = validPoints[i];
      const [x, y, z] = item.point;
      const sx = (x - centerX) * scale;
      const sy = (y - centerY) * scale;
      const sz = (z - centerZ) * scale;
      positions[i * 3] = sx;
      positions[i * 3 + 1] = sy;
      positions[i * 3 + 2] = sz;
      const c = item.color;
      colors[i * 3] = Number.isFinite(c[0]) ? c[0] : 0.88;
      colors[i * 3 + 1] = Number.isFinite(c[1]) ? c[1] : 0.88;
      colors[i * 3 + 2] = Number.isFinite(c[2]) ? c[2] : 0.88;
      mappedPoints.push({ x: sx, y: sy, z: sz, originalX: x, originalY: y, originalZ: z, index: item.originalIndex });
      mappedDeviations.push(item.deviation);
      mappedSeverities.push(item.severity);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new THREE.PointsMaterial({ size: pointSize, sizeAttenuation: true, vertexColors: true });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    pointCloudRef.current = points;
    sceneRef.current.add(points);

    pointsDataRef.current = mappedPoints;
    deviationsRef.current = mappedDeviations;
    severityLabelsRef.current = mappedSeverities;

    if (currentPerformanceMode === "full" && mappedPoints.length <= 50000) {
      computeHotspots(mappedPoints, mappedSeverities);
    }
    fitCameraToGeometry(geometry);
  };

  const loadAnalysis = async (currentMode = mode, currentThreshold = threshold) => {
    try {
      setStatusMessage(currentMode === "raw" ? "Loading raw point cloud..." : currentMode === "comparison" ? "Loading comparison view..." : "Loading deviation heatmap...");
      const response = await axios.get(`${API_BASE}/pointcloud-analysis`, { params: { mode: currentMode, threshold: currentThreshold } });
      const data = response.data || {};
      const pointData = data.points || [];
      const colorData = data.colors || [];
      const deviationData = data.deviations || [];
      const severityData = data.severity_labels || [];
      const count = data.point_count || 0;

      let newPerformanceMode = "full";
      if (count >= 150000) newPerformanceMode = "fast";
      else if (count >= 50000) newPerformanceMode = "medium";

      setPerformanceMode(newPerformanceMode);
      setFileName(data.file || "None");
      setReferenceFileName(data.reference_file || "None");
      setActualFileName(data.actual_file || "None");
      setPointCount(count);
      setDeviationCount(data.deviation_count || 0);
      setDeviationPercent(data.deviation_percent || 0);
      setMaxDeviation(data.max_deviation || 0);
      setAvgDeviation(data.avg_deviation || 0);
      setAlignmentQuality(data.alignment_quality || { fitness: 0, rmse: 0, status: "Not Applicable" });
      setQualityScore(data.quality_score || { score: 0, status: "No Data" });

      const counts = { acceptable: 0, warning: 0, critical: 0, raw: 0 };
      for (const label of severityData) {
        if (label === "acceptable") counts.acceptable += 1;
        else if (label === "warning") counts.warning += 1;
        else if (label === "critical") counts.critical += 1;
        else if (label === "raw") counts.raw += 1;
      }
      setSeverityCounts(counts);

      if (!Array.isArray(pointData) || pointData.length === 0) {
        clearPointCloud();
        setStatusMessage(data.message || "No points found. Upload both reference and actual files if using Compare.");
        return;
      }

      renderPointCloud(pointData, colorData, deviationData, severityData, filterMode, newPerformanceMode);
      setStatusMessage(currentMode === "raw" ? "Raw 3D point cloud loaded." : currentMode === "comparison" ? "Reference vs actual comparison loaded." : "3D deviation heatmap loaded.");
    } catch (error) {
      console.error("Frontend loadAnalysis error:", error);
      clearPointCloud();
      setStatusMessage("Frontend render error. Check browser console for details.");
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      setStatusMessage("Uploading file...");
      const response = await axios.post(`${API_BASE}/upload-pointcloud`, formData);
      if (response.data?.error) {
        setStatusMessage(response.data.error);
        return;
      }
      await loadAnalysis(mode, threshold);
    } catch (error) {
      console.error(error);
      setStatusMessage("Upload failed.");
    }
  };

  const handleReferenceUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      setStatusMessage("Uploading reference...");
      const response = await axios.post(`${API_BASE}/upload-reference`, formData);
      if (response.data?.error) {
        setStatusMessage(response.data.error);
        return;
      }
      setReferenceFileName(response.data.file || file.name);
      setStatusMessage("Reference uploaded successfully.");
      if (mode === "comparison") await loadAnalysis("comparison", threshold);
    } catch (error) {
      console.error(error);
      setStatusMessage("Reference upload failed.");
    }
  };

  const handleActualUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      setStatusMessage("Uploading actual...");
      const response = await axios.post(`${API_BASE}/upload-actual`, formData);
      if (response.data?.error) {
        setStatusMessage(response.data.error);
        return;
      }
      setActualFileName(response.data.file || file.name);
      setStatusMessage("Actual uploaded successfully.");
      if (mode === "comparison") await loadAnalysis("comparison", threshold);
    } catch (error) {
      console.error(error);
      setStatusMessage("Actual upload failed.");
    }
  };

  const resetView = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    setAutoRotate(false);
    controlsRef.current.autoRotate = false;
    cameraRef.current.position.set(18, 12, 18);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const updateMeasurementNote = (id, note) => {
    setMeasurementHistory((prev) => prev.map((m) => (m.id === id ? { ...m, note } : m)));
  };

  const focusMeasurement = (measurement) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const midX = ((measurement.a.sceneX ?? measurement.a.x) + (measurement.b.sceneX ?? measurement.b.x)) / 2;
    const midY = ((measurement.a.sceneY ?? measurement.a.y) + (measurement.b.sceneY ?? measurement.b.y)) / 2;
    const midZ = ((measurement.a.sceneZ ?? measurement.a.z) + (measurement.b.sceneZ ?? measurement.b.z)) / 2;
    controlsRef.current.target.set(midX, midY, midZ);
    cameraRef.current.position.set(midX + 6, midY + 4, midZ + 6);
    controlsRef.current.update();
  };

  const setCameraView = (view) => {
    if (!cameraRef.current || !controlsRef.current) return;
    if (view === "front") cameraRef.current.position.set(0, 0, 25);
    else if (view === "top") cameraRef.current.position.set(0, 25, 0);
    else cameraRef.current.position.set(18, 12, 18);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const getSeverityLabel = (index) => {
    const s = severityLabelsRef.current[index];
    if (s === "acceptable") return "Acceptable";
    if (s === "warning") return "Warning";
    if (s === "critical") return "Critical";
    return "Raw";
  };

  const handlePointClick = (event) => {
    if (!mountRef.current || !cameraRef.current || !pointCloudRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    raycasterRef.current.params.Points.threshold = 0.18;
    const intersects = raycasterRef.current.intersectObject(pointCloudRef.current);
    if (!intersects.length) {
      clearSelectedMarker();
      setSelectedPoint(null);
      return;
    }

    const hitIndex = intersects[0].index;
    const point = pointsDataRef.current[hitIndex];
    if (!point) return;
    const deviation = deviationsRef.current[hitIndex] ?? 0;

    if (measureModeRef.current) {
      const newPoint = {
        x: point.x,
        y: point.y,
        z: point.z,
        originalX: point.originalX,
        originalY: point.originalY,
        originalZ: point.originalZ,
      };

      const currentMeasurePoints = measurePointsRef.current;

      if (currentMeasurePoints.length >= 2) {
        clearMeasurement();
        const freshMarker = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        freshMarker.position.set(point.x, point.y, point.z);
        sceneRef.current.add(freshMarker);
        measureMarkersRef.current.push(freshMarker);
        setMeasurePoints([newPoint]);
        setMeasureDistance(null);
        return;
      }

      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
      marker.position.set(point.x, point.y, point.z);
      sceneRef.current.add(marker);
      measureMarkersRef.current.push(marker);

      const updatedPoints = [...currentMeasurePoints, newPoint];
      setMeasurePoints(updatedPoints);

      if (updatedPoints.length === 2) {
        const [a, b] = updatedPoints;
        const dx = b.originalX - a.originalX;
        const dy = b.originalY - a.originalY;
        const dz = b.originalZ - a.originalZ;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        setMeasureDistance(distance);

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 3 });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        sceneRef.current.add(line);
        measureLineRef.current = line;

        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const midZ = (a.z + b.z) / 2;
        const label = createMeasureLabel(`${distance.toFixed(4)} units`);
        label.position.set(midX, midY + 1.2, midZ);
        sceneRef.current.add(label);
        measureLabelRef.current = label;

        const savedMeasurement = {
          id: Date.now(),
          distance,
          note: "",
          a: { x: a.originalX, y: a.originalY, z: a.originalZ, sceneX: a.x, sceneY: a.y, sceneZ: a.z },
          b: { x: b.originalX, y: b.originalY, z: b.originalZ, sceneX: b.x, sceneY: b.y, sceneZ: b.z },
        };

        setMeasurementHistory((prev) => [...prev, savedMeasurement]);
        savedMeasureLinesRef.current.push(line);
        savedMeasureLabelsRef.current.push(label);
        savedMeasureMarkersRef.current.push(...measureMarkersRef.current);
        measureLineRef.current = null;
        measureLabelRef.current = null;
        measureMarkersRef.current = [];
      }
      return;
    }

    clearSelectedMarker();
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    marker.position.set(point.x, point.y, point.z);
    sceneRef.current.add(marker);
    selectedMarkerRef.current = marker;
    setSelectedPoint({
      index: point.index,
      x: point.originalX.toFixed(3),
      y: point.originalY.toFixed(3),
      z: point.originalZ.toFixed(3),
      deviation: deviation.toFixed(4),
      severity: getSeverityLabel(hitIndex),
    });
  };

  const handlePointHover = (event) => {
    if (performanceModeRef.current !== "full" || pointsDataRef.current.length > 50000 || !mountRef.current || !cameraRef.current || !pointCloudRef.current) {
      setHoveredPoint(null);
      return;
    }
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    raycasterRef.current.params.Points.threshold = 0.12;
    const intersects = raycasterRef.current.intersectObject(pointCloudRef.current);
    if (!intersects.length) {
      setHoveredPoint(null);
      return;
    }
    const hitIndex = intersects[0].index;
    const point = pointsDataRef.current[hitIndex];
    if (!point) {
      setHoveredPoint(null);
      return;
    }
    const deviation = deviationsRef.current[hitIndex] ?? 0;
    setTooltipPos({ x: event.clientX + 14, y: event.clientY + 14 });
    setHoveredPoint({
      index: point.index,
      x: point.originalX.toFixed(3),
      y: point.originalY.toFixed(3),
      z: point.originalZ.toFixed(3),
      deviation: deviation.toFixed(4),
      severity: getSeverityLabel(hitIndex),
    });
  };

  const buildAISuggestions = () => {
    const ai = [];
    const criticalPercent = pointCount ? (severityCounts.critical / pointCount) * 100 : 0;
    const warningPercent = pointCount ? (severityCounts.warning / pointCount) * 100 : 0;

    if (pointCount === 0) ai.push("Upload or compare valid point cloud files to generate insights.");
    else if (mode === "comparison") {
      if (criticalPercent > 60) {
        ai.push("High structural mismatch detected between the reference model and actual scan.");
        ai.push("Large red regions suggest major deviation, missing geometry, or alignment issues.");
      } else if (criticalPercent > 30) ai.push("Moderate deviation detected. Several areas may require inspection.");
      else ai.push("Most compared points are within acceptable tolerance.");
    } else if (mode === "deviation") {
      if (criticalPercent > 40) ai.push("High deviation concentration detected in the current scan.");
      else ai.push("Deviation pattern appears manageable under the current threshold.");
    } else ai.push("Raw mode loaded. Switch to Deviation or Compare mode for QA insights.");

    if (hotspotCount > 0) ai.push(`${hotspotCount} critical hotspot area(s) detected. These represent concentrated defect zones.`);
    if (maxDeviation > threshold * 2) ai.push("Maximum deviation is significantly above the selected threshold.");
    if (warningPercent > 10) ai.push("Warning-level deviations are present and should be reviewed before they become critical.");
    setSuggestions(ai);
  };

  const buildDefectClassification = () => {
    const criticalPercent = pointCount ? (severityCounts.critical / pointCount) * 100 : 0;
    const warningPercent = pointCount ? (severityCounts.warning / pointCount) * 100 : 0;
    let result = { type: "Low Risk", confidence: 70, reason: "Most points appear within acceptable tolerance." };

    if (mode === "raw" || pointCount === 0) result = { type: "Not Available", confidence: 0, reason: "Switch to Deviation or Compare mode to classify defects." };
    else if (mode === "comparison" && alignmentQuality.status === "Poor Alignment" && criticalPercent > 40) result = { type: "Likely Misalignment", confidence: 88, reason: "High critical deviation combined with poor ICP alignment suggests scan/reference registration issues." };
    else if (criticalPercent > 70 && hotspotCount <= 2) result = { type: "Missing Geometry / Major Mismatch", confidence: 84, reason: "Most points are critical, but hotspots are limited, suggesting broad geometry mismatch or missing model areas." };
    else if (criticalPercent > 20 && hotspotCount >= 3) result = { type: "Localized Surface Defect", confidence: 82, reason: "Critical points are concentrated into multiple hotspot zones, suggesting localized construction defects." };
    else if (warningPercent > 20 && criticalPercent < 20) result = { type: "Scan Noise / Borderline Issues", confidence: 76, reason: "Warning-level deviations dominate while critical points remain low, suggesting borderline tolerance or scan noise." };

    setDefectClassification(result);
  };

  const buildFixSuggestions = () => {
    const fixes = [];
    const criticalPercent = pointCount ? (severityCounts.critical / pointCount) * 100 : 0;
    const warningPercent = pointCount ? (severityCounts.warning / pointCount) * 100 : 0;

    if (pointCount === 0) fixes.push("Upload both reference and actual files before running comparison.");
    if (mode === "comparison") {
      if (criticalPercent > 50) {
        fixes.push("Check model alignment first. High critical deviation may indicate the actual scan and reference are not properly registered.");
        fixes.push("Run comparison again after verifying scan origin, rotation, and scale.");
      }
      if (hotspotCount > 0) fixes.push(`Prioritize the largest hotspot clusters first. Start with ${hotspotSizes.slice(0, 3).join(", ") || "the visible hotspots"} critical-point clusters.`);
      if (maxDeviation > threshold * 2) fixes.push("Inspect maximum-deviation areas manually. These may represent missing geometry, scan noise, or major construction mismatch.");
    }
    if (mode === "deviation") {
      if (criticalPercent > 40) fixes.push("Review the red regions as likely out-of-tolerance surface areas.");
      if (warningPercent > 15) fixes.push("Use Warning filter to inspect borderline regions before they become critical defects.");
    }
    if (filterMode !== "all") fixes.push(`Current filter is '${filterMode}'. Switch back to 'all' before final reporting to include full-context results.`);
    if (performanceMode !== "full") fixes.push("Performance mode is limiting advanced interactions. Use smaller samples for detailed hover and hotspot inspection.");
    if (fixes.length === 0) fixes.push("No major corrective action suggested. Continue monitoring deviation results and verify with project tolerance requirements.");
    setFixSuggestions(fixes);
  };

  const exportDeviationReport = () => {
    const rows = [
      ["Mode", "File", "Reference File", "Actual File", "Point Count", "Deviation Count", "Deviation Percent", "Max Deviation", "Avg Deviation", "Threshold", "Filter", "Hotspot Count", "ICP Fitness", "ICP RMSE", "ICP Status", "Quality Score", "Quality Status", "Defect Type", "Defect Confidence", "Defect Reason"],
      [mode, fileName, referenceFileName, actualFileName, pointCount, deviationCount, deviationPercent, maxDeviation, avgDeviation, threshold, filterMode, hotspotCount, alignmentQuality.fitness, alignmentQuality.rmse, alignmentQuality.status, qualityScore.score, qualityScore.status, defectClassification.type, `${defectClassification.confidence}%`, defectClassification.reason],
      [],
      ["Severity Summary"],
      ["Acceptable", severityCounts.acceptable],
      ["Warning", severityCounts.warning],
      ["Critical", severityCounts.critical],
      ["Raw", severityCounts.raw],
      [],
      ["Hotspot Centers"],
      ["Hotspot ID", "Center X", "Center Y", "Center Z", "Cluster Size"],
    ];

    hotspotCenters.forEach((center) => rows.push([center.id, center.originalX.toFixed(4), center.originalY.toFixed(4), center.originalZ.toFixed(4), center.size]));
    rows.push([], ["AI Suggestions"]);
    suggestions.forEach((s) => rows.push([s]));
    rows.push([], ["Fix Recommendations"]);
    fixSuggestions.forEach((s) => rows.push([s]));
    rows.push([], ["Measurement Notes"], ["Measurement", "Distance", "Note"]);
    measurementHistory.forEach((m, index) => rows.push([`M${index + 1}`, m.distance.toFixed(4), m.note || ""]));

    const csv = rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pointcloud_report_${mode}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const captureScreenshot = () => {
    if (!rendererRef.current) return;
    const image = rendererRef.current.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = image;
    link.download = `pointcloud_snapshot_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDFReport = () => {
    const doc = new jsPDF();
    let y = 20;
    const snapshot = rendererRef.current ? rendererRef.current.domElement.toDataURL("image/png") : null;
    const addWrapped = (text, x = 20) => {
      const lines = doc.splitTextToSize(text, 170);
      doc.text(lines, x, y);
      y += lines.length * 6;
    };
    const maybeAddPage = () => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
    };

    doc.setFontSize(18);
    doc.text("Point Cloud QA Report", 20, y); y += 14;
    doc.setFontSize(12); doc.text("File Information", 20, y); y += 8;
    doc.setFontSize(10);
    addWrapped(`Mode: ${mode}`); addWrapped(`File: ${fileName}`); addWrapped(`Reference: ${referenceFileName}`); addWrapped(`Actual: ${actualFileName}`); y += 4;
    doc.setFontSize(12); doc.text("Overall Quality Score", 20, y); y += 8;
    doc.setFontSize(10); addWrapped(`Score: ${qualityScore.score}/100`); addWrapped(`Status: ${qualityScore.status}`); y += 4;
    doc.setFontSize(12); doc.text("Analysis Metrics", 20, y); y += 8;
    doc.setFontSize(10);
    addWrapped(`Points: ${pointCount}`); addWrapped(`Deviation Points: ${deviationCount}`); addWrapped(`Deviation %: ${deviationPercent}%`); addWrapped(`Max Deviation: ${maxDeviation}`); addWrapped(`Avg Deviation: ${avgDeviation}`); addWrapped(`Threshold: ${threshold}`); y += 4;
    if (mode === "comparison") {
      doc.setFontSize(12); doc.text("ICP Alignment Quality", 20, y); y += 8;
      doc.setFontSize(10); addWrapped(`Status: ${alignmentQuality.status}`); addWrapped(`Fitness: ${alignmentQuality.fitness}`); addWrapped(`RMSE: ${alignmentQuality.rmse}`); y += 4;
    }
    doc.setFontSize(12); doc.text("Deviation Distribution", 20, y); y += 8;
    doc.setFontSize(10); addWrapped(`Acceptable: ${severityCounts.acceptable}`); addWrapped(`Warning: ${severityCounts.warning}`); addWrapped(`Critical: ${severityCounts.critical}`); y += 4;
    doc.setFontSize(12); doc.text("AI Defect Classification", 20, y); y += 8;
    doc.setFontSize(10); addWrapped(`Type: ${defectClassification.type}`); addWrapped(`Confidence: ${defectClassification.confidence}%`); addWrapped(`Reason: ${defectClassification.reason}`); y += 4;
    maybeAddPage();
    doc.setFontSize(12); doc.text("Hotspot Summary", 20, y); y += 8;
    doc.setFontSize(10); addWrapped(`Critical Hotspots: ${hotspotCount}`); addWrapped(`Largest Clusters: ${hotspotSizes.length ? hotspotSizes.slice(0, 3).join(", ") : "None"}`); y += 4;
    maybeAddPage();
    doc.setFontSize(12); doc.text("AI Suggestions", 20, y); y += 8;
    doc.setFontSize(10); if (!suggestions.length) addWrapped("- No AI suggestions available."); else suggestions.forEach((s) => { maybeAddPage(); addWrapped(`- ${s}`); });
    y += 4; maybeAddPage();
    doc.setFontSize(12); doc.text("Fix Recommendations", 20, y); y += 8;
    doc.setFontSize(10); if (!fixSuggestions.length) addWrapped("- No fixes required."); else fixSuggestions.forEach((f) => { maybeAddPage(); addWrapped(`- ${f}`); });
    if (measurementHistory.length > 0) {
      y += 4; maybeAddPage();
      doc.setFontSize(12); doc.text("Measurements", 20, y); y += 8;
      doc.setFontSize(10);
      measurementHistory.forEach((m, index) => { maybeAddPage(); addWrapped(`M${index + 1}: ${m.distance.toFixed(4)} units${m.note ? ` - ${m.note}` : ""}`); });
    }
    if (snapshot) {
      doc.addPage();
      doc.setFontSize(16);
      doc.text("3D Heatmap Snapshot", 20, 20);
      doc.addImage(snapshot, "PNG", 15, 30, 180, 100);
    }
    doc.save("PointCloud_QA_Report.pdf");
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 5000);
    camera.position.set(18, 12, 18);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    renderer.domElement.addEventListener("click", handlePointClick);
    renderer.domElement.addEventListener("mousemove", handlePointHover);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 1.2;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(10, 15, 10);
    scene.add(light);
    const grid = new THREE.GridHelper(30, 30, 0x3a3a3a, 0x1f1f1f);
    gridRef.current = grid;
    scene.add(grid);
    const axes = new THREE.AxesHelper(4);
    axesRef.current = axes;
    scene.add(axes);
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    setIsSceneReady(true);
    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (rendererRef.current?.domElement) {
        rendererRef.current.domElement.removeEventListener("click", handlePointClick);
        rendererRef.current.domElement.removeEventListener("mousemove", handlePointHover);
      }
      clearPointCloud();
      controlsRef.current?.dispose();
      rendererRef.current?.dispose();
      if (container && renderer.domElement && container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => { if (!isSceneReady) return; loadAnalysis(mode, threshold); }, [isSceneReady, mode, threshold, filterMode]);
  useEffect(() => { if (!controlsRef.current) return; controlsRef.current.autoRotate = autoRotate; }, [autoRotate]);
  useEffect(() => { if (gridRef.current) gridRef.current.visible = showGrid; }, [showGrid]);
  useEffect(() => { if (axesRef.current) axesRef.current.visible = showAxes; }, [showAxes]);
  useEffect(() => { if (pointCloudRef.current?.material) { pointCloudRef.current.material.size = pointSize; pointCloudRef.current.material.needsUpdate = true; } }, [pointSize]);
  useEffect(() => { measureModeRef.current = measureMode; }, [measureMode]);
  useEffect(() => { measurePointsRef.current = measurePoints; }, [measurePoints]);
  useEffect(() => { performanceModeRef.current = performanceMode; }, [performanceMode]);
  useEffect(() => { buildAISuggestions(); buildDefectClassification(); buildFixSuggestions(); }, [mode, pointCount, severityCounts, hotspotCount, hotspotSizes, maxDeviation, threshold, filterMode, performanceMode, alignmentQuality]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragStateRef.current.dragging) return;
      if (dragStateRef.current.panel === "left") setLeftPanelPos({ x: e.clientX - dragStateRef.current.offsetX, y: e.clientY - dragStateRef.current.offsetY });
      if (dragStateRef.current.panel === "right") setRightPanelPos({ x: e.clientX - dragStateRef.current.offsetX, y: e.clientY - dragStateRef.current.offsetY });
    };
    const handleMouseUp = () => { dragStateRef.current.dragging = false; dragStateRef.current.panel = null; };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, []);

  const startPanelDrag = (e, panel) => {
    const ref = panel === "left" ? leftPanelRef.current : rightPanelRef.current;
    if (!ref) return;
    const rect = ref.getBoundingClientRect();
    dragStateRef.current.dragging = true;
    dragStateRef.current.panel = panel;
    dragStateRef.current.offsetX = e.clientX - rect.left;
    dragStateRef.current.offsetY = e.clientY - rect.top;
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000", overflow: "hidden" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {hoveredPoint && (
        <div style={{ position: "fixed", left: tooltipPos.x, top: tooltipPos.y, zIndex: 40, background: "rgba(10,10,10,0.92)", color: "white", padding: "8px 10px", borderRadius: "8px", fontSize: "12px", lineHeight: 1.45, pointerEvents: "none" }}>
          <div><strong>Index:</strong> {hoveredPoint.index}</div>
          <div><strong>X:</strong> {hoveredPoint.x}</div>
          <div><strong>Y:</strong> {hoveredPoint.y}</div>
          <div><strong>Z:</strong> {hoveredPoint.z}</div>
          <div><strong>Deviation:</strong> {hoveredPoint.deviation}</div>
          <div><strong>Status:</strong> {hoveredPoint.severity}</div>
        </div>
      )}

      <div ref={leftPanelRef} style={{ position: "absolute", top: leftPanelPos.y, left: leftPanelPos.x, zIndex: 10, background: "rgba(8,8,8,0.88)", color: "white", padding: "12px 14px", borderRadius: "12px", width: "390px", maxHeight: "calc(100vh - 32px)", overflowY: "auto", overflowX: "hidden", fontFamily: "Arial, sans-serif", userSelect: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.35)", fontSize: "13px", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(6px)" }}>
        <div onMouseDown={(e) => startPanelDrag(e, "left")} style={{ cursor: "move", fontWeight: "bold", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid rgba(255,255,255,0.18)", fontSize: "15px" }}>
          Controls & Tools
        </div>

        <div style={{ marginBottom: "8px" }}><div style={{ fontSize: "12px", marginBottom: "4px" }}>Single File</div><input type="file" accept={ACCEPTED_FORMATS} onChange={handleFileUpload} /></div>
        <div style={{ marginTop: "8px" }}><div style={{ fontSize: "12px", marginBottom: "4px" }}>Reference</div><input type="file" accept={ACCEPTED_FORMATS} onChange={handleReferenceUpload} /></div>
        <div style={{ marginTop: "8px" }}><div style={{ fontSize: "12px", marginBottom: "4px" }}>Actual</div><input type="file" accept={ACCEPTED_FORMATS} onChange={handleActualUpload} /></div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px", marginTop: "10px" }}>
          <button onClick={async () => { setMode("raw"); await loadAnalysis("raw", threshold); }} style={{ ...baseButton, background: mode === "raw" ? "#2563eb" : "#444" }}>Raw</button>
          <button onClick={async () => { setMode("deviation"); await loadAnalysis("deviation", threshold); }} style={{ ...baseButton, background: mode === "deviation" ? "#dc2626" : "#444" }}>Deviation</button>
          <button onClick={() => setAutoRotate((prev) => !prev)} style={{ ...baseButton, background: autoRotate ? "#16a34a" : "#444" }}>{autoRotate ? "Rotate ON" : "Rotate OFF"}</button>
          <button onClick={resetView} style={{ ...baseButton, background: "#2563eb" }}>Reset View</button>
          <button onClick={async () => { setMode("comparison"); await loadAnalysis("comparison", threshold); }} style={{ ...baseButton, background: mode === "comparison" ? "#9333ea" : "#444" }}>Compare</button>
          <button onClick={captureScreenshot} style={{ ...baseButton, background: "#0891b2", fontWeight: 600 }}>Capture View</button>
          <button onClick={exportDeviationReport} style={{ ...baseButton, background: "#0f766e", fontWeight: 600 }}>Export CSV</button>
          <button onClick={exportPDFReport} style={{ ...baseButton, background: "#8b5cf6", fontWeight: 600 }}>Export PDF</button>
        </div>

        {mode !== "raw" && (
          <div style={{ marginTop: "10px" }}>
            <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "6px", color: "#d1d5db" }}>Filter View</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {["all", "acceptable", "warning", "critical"].map((f) => (
                <button key={f} onClick={() => setFilterMode(f)} style={{ ...smallButton, background: filterMode === f ? (f === "critical" ? "#dc2626" : f === "warning" ? "#ca8a04" : f === "acceptable" ? "#16a34a" : "#2563eb") : "#444", textTransform: "capitalize" }}>{f}</button>
              ))}
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>Measurement Tool</div>
          <button onClick={() => { setMeasureMode((prev) => !prev); clearMeasurement(); }} style={{ ...baseButton, background: measureMode ? "#16a34a" : "#444", marginBottom: "8px" }}>{measureMode ? "Measure Mode ON" : "Measure Mode OFF"}</button>
          <button onClick={clearMeasurement} style={{ ...baseButton, background: "#dc2626", marginBottom: "8px" }}>Clear Current Measurement</button>
          <button onClick={clearAllMeasurements} style={{ ...baseButton, background: "#7f1d1d", marginBottom: "8px" }}>Clear All Measurements</button>
          <div style={{ fontSize: "12px", color: "#d1d5db", lineHeight: 1.5 }}>
            <div>Selected Points: {measurePoints.length}/2</div>
            <div>Distance: <strong>{measureDistance !== null ? measureDistance.toFixed(4) : "Not measured"}</strong></div>
          </div>
          <div style={{ marginTop: "6px", fontSize: "11px", color: "#9ca3af" }}>Turn Measure Mode ON, then click two points in the 3D view.</div>

          <div style={{ marginTop: "10px", fontWeight: "bold", fontSize: "12px" }}>Measurement History</div>
          {measurementHistory.length === 0 ? (
            <div style={{ color: "#9ca3af", fontSize: "12px", marginTop: "6px" }}>No saved measurements yet.</div>
          ) : (
            measurementHistory.map((m, index) => (
              <div key={m.id} onClick={() => focusMeasurement(m)} style={{ marginTop: "6px", padding: "6px", borderRadius: "6px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}>
                <strong>M{index + 1}</strong>: {m.distance.toFixed(4)} units
                <input type="text" placeholder="Add note..." value={m.note || ""} onClick={(e) => e.stopPropagation()} onChange={(e) => updateMeasurementNote(m.id, e.target.value)} style={{ width: "100%", marginTop: "6px", padding: "6px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.35)", color: "white", fontSize: "11px" }} />
              </div>
            ))
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>View Controls</div>
          <div style={{ fontSize: "12px", marginBottom: "6px" }}>Point Size: {pointSize.toFixed(2)}</div>
          <input type="range" min="0.04" max="0.3" step="0.02" value={pointSize} onChange={(e) => setPointSize(parseFloat(e.target.value))} style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
            <button onClick={() => setShowGrid((prev) => !prev)}>{showGrid ? "Hide Grid" : "Show Grid"}</button>
            <button onClick={() => setShowAxes((prev) => !prev)}>{showAxes ? "Hide Axes" : "Show Axes"}</button>
            <button onClick={() => setCameraView("iso")}>Iso View</button>
            <button onClick={() => setCameraView("front")}>Front View</button>
            <button onClick={() => setCameraView("top")}>Top View</button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px" }}><span><strong>Threshold</strong></span><span>{threshold}</span></div>
          <input type="range" min="0.5" max="5" step="0.5" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "10px" }}>Heatmap Legend</div>
          <div style={{ display: "flex", gap: "12px", alignItems: "stretch" }}>
            <div style={{ width: "16px", borderRadius: "999px", background: "linear-gradient(to top, #22c55e 0%, #eab308 50%, #ef4444 100%)" }} />
            <div style={{ fontSize: "12px", color: "#d1d5db", lineHeight: 1.4 }}>
              <div><span style={{ color: "#ef4444" }}>■</span> Critical</div>
              <div><span style={{ color: "#eab308" }}>■</span> Warning</div>
              <div><span style={{ color: "#22c55e" }}>■</span> Acceptable</div>
            </div>
          </div>
          <div style={{ marginTop: "8px", fontSize: "11px", color: "#9ca3af", lineHeight: 1.5 }}>
            {mode === "comparison" ? (
              <><div>Green = actual point is close to reference</div><div>Yellow = moderate mismatch</div><div>Red = large mismatch from reference</div><div>Current threshold: {threshold} → effective compare tolerance: {(threshold / 10).toFixed(2)}</div></>
            ) : mode === "deviation" ? (
              <><div>Green = low deviation</div><div>Yellow = medium deviation</div><div>Red = high deviation</div><div>Current threshold: {threshold} → effective tolerance: {(threshold / 10).toFixed(2)}</div></>
            ) : (
              <div>Raw mode shows original points without deviation classification.</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: "10px", color: "#9ca3af", fontSize: "12px", lineHeight: 1.45 }}>
          <div>Drag panel header = move panel</div><div>Left mouse = rotate</div><div>Wheel = zoom</div><div>Right mouse = pan</div>
        </div>
      </div>

      <div ref={rightPanelRef} style={{ position: "absolute", top: rightPanelPos.y, left: rightPanelPos.x, zIndex: 10, background: "rgba(8,8,8,0.88)", color: "white", padding: "12px 14px", borderRadius: "12px", width: "380px", maxHeight: "calc(100vh - 32px)", overflowY: "auto", overflowX: "hidden", fontFamily: "Arial, sans-serif", userSelect: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.35)", fontSize: "13px", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(6px)" }}>
        <div onMouseDown={(e) => startPanelDrag(e, "right")} style={{ cursor: "move", fontWeight: "bold", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid rgba(255,255,255,0.18)", fontSize: "15px" }}>Analysis Results</div>

        <div style={{ ...cardStyle, lineHeight: 1.45 }}>
          <div><strong>File:</strong> {fileName}</div>
          {mode === "comparison" && <><div><strong>Reference:</strong> {referenceFileName}</div><div><strong>Actual:</strong> {actualFileName}</div></>}
          <div><strong>Points:</strong> {pointCount}</div><div><strong>Deviation Points:</strong> {deviationCount}</div><div><strong>Deviation %:</strong> {deviationPercent}%</div><div><strong>Max Dev:</strong> {maxDeviation}</div><div><strong>Avg Dev:</strong> {avgDeviation}</div>
          <div style={{ marginTop: "8px", fontSize: "12px", color: "#aaa" }}>Performance Mode: <b>{performanceMode.toUpperCase()}</b></div>
          <div style={{ marginTop: "8px", color: "#d1d5db", fontSize: "12px", lineHeight: 1.5 }}>{statusMessage}{mode !== "raw" && <div style={{ marginTop: "4px", color: "#9ca3af" }}>Current filter: {filterMode}</div>}</div>
        </div>

        {mode !== "raw" && <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ background: "rgba(34,197,94,0.14)", color: "#86efac", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "999px", padding: "6px 10px", fontSize: "11px", fontWeight: 600 }}>Acceptable: {severityCounts.acceptable} ({pointCount ? ((severityCounts.acceptable / pointCount) * 100).toFixed(1) : 0}%)</div>
          <div style={{ background: "rgba(234,179,8,0.14)", color: "#fde047", border: "1px solid rgba(234,179,8,0.25)", borderRadius: "999px", padding: "6px 10px", fontSize: "11px", fontWeight: 600 }}>Warning: {severityCounts.warning} ({pointCount ? ((severityCounts.warning / pointCount) * 100).toFixed(1) : 0}%)</div>
          <div style={{ background: "rgba(239,68,68,0.14)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "999px", padding: "6px 10px", fontSize: "11px", fontWeight: 600 }}>Critical: {severityCounts.critical} ({pointCount ? ((severityCounts.critical / pointCount) * 100).toFixed(1) : 0}%)</div>
        </div>}

        {mode !== "raw" && <div style={cardStyle}><div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>Overall Quality Score</div><div style={{ fontSize: "32px", fontWeight: "bold", color: qualityScore.score >= 90 ? "#22c55e" : qualityScore.score >= 75 ? "#84cc16" : qualityScore.score >= 55 ? "#eab308" : "#ef4444" }}>{qualityScore.score}/100</div><div style={{ fontSize: "12px", color: "#d1d5db", marginTop: "4px" }}>Status: <strong>{qualityScore.status}</strong></div></div>}

        {mode !== "raw" && <div style={cardStyle}><div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>Score Breakdown</div><div style={{ fontSize: "12px", color: "#d1d5db", lineHeight: 1.6 }}><div><strong>Deviation Impact:</strong> {Math.min(deviationPercent * 0.8, 45).toFixed(1)} penalty</div><div><strong>Hotspot Impact:</strong> {Math.min(hotspotCount * 2, 20)} penalty</div>{mode === "comparison" && <><div><strong>Alignment Boost:</strong> +{Math.min(alignmentQuality.fitness * 10, 10).toFixed(1)}</div><div><strong>Alignment Error:</strong> -{Math.min(alignmentQuality.rmse * 10, 15).toFixed(1)}</div></>}</div></div>}

        {mode !== "raw" && <div style={cardStyle}><div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>AI Defect Classification</div><div style={{ fontSize: "16px", fontWeight: "bold", color: defectClassification.type === "Low Risk" ? "#22c55e" : defectClassification.type === "Scan Noise / Borderline Issues" ? "#eab308" : "#ef4444" }}>{defectClassification.type}</div><div style={{ fontSize: "12px", color: "#d1d5db", marginTop: "6px" }}><strong>Confidence:</strong> {defectClassification.confidence}%</div><div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "6px", lineHeight: 1.45 }}>{defectClassification.reason}</div></div>}

        {mode === "comparison" && <div style={cardStyle}><div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>ICP Alignment Quality</div><div style={{ fontSize: "12px", color: "#d1d5db", lineHeight: 1.5 }}><div><strong>Status:</strong> <span style={{ color: alignmentQuality.status === "Good Alignment" ? "#22c55e" : alignmentQuality.status === "Moderate Alignment" ? "#eab308" : "#ef4444" }}>{alignmentQuality.status}</span></div><div><strong>Fitness:</strong> {alignmentQuality.fitness}</div><div><strong>RMSE:</strong> {alignmentQuality.rmse}</div></div></div>}

        {mode !== "raw" && <div style={cardStyle}><div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>Hotspot Detection</div><div style={{ fontSize: "12px", color: "#d1d5db", lineHeight: 1.5 }}><div><strong>Critical Hotspots:</strong> {hotspotCount}</div><div><strong>Marker Centers:</strong> {hotspotCenters.length || "None"}</div><div><strong>Hotspot IDs:</strong> {hotspotCenters.length ? hotspotCenters.slice(0, 6).map((c) => `H${c.id}`).join(", ") : "None"}</div><div><strong>Largest Clusters:</strong> {hotspotSizes.length ? hotspotSizes.slice(0, 3).join(", ") : "None"}</div></div></div>}

        {mode !== "raw" && <div style={cardStyle}><div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>AI Suggestions</div>{suggestions.map((s, i) => <div key={i} style={{ fontSize: "12px", color: "#d1d5db", marginBottom: "6px", lineHeight: 1.5 }}>• {s}</div>)}</div>}

        {mode !== "raw" && <div style={cardStyle}><div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>Fix Recommendations</div>{fixSuggestions.map((s, i) => <div key={i} style={{ fontSize: "12px", color: "#d1d5db", marginBottom: "6px", lineHeight: 1.5 }}>• {s}</div>)}</div>}

        <div style={cardStyle}><div style={{ fontSize: "12px", fontWeight: "bold", marginBottom: "8px" }}>Selected Point</div>{selectedPoint ? <div style={{ fontSize: "12px", color: "#d1d5db", lineHeight: 1.5 }}><div><strong>Index:</strong> {selectedPoint.index}</div><div><strong>X:</strong> {selectedPoint.x}</div><div><strong>Y:</strong> {selectedPoint.y}</div><div><strong>Z:</strong> {selectedPoint.z}</div><div><strong>Deviation:</strong> {selectedPoint.deviation}</div><div><strong>Status:</strong> {selectedPoint.severity}</div></div> : <div style={{ fontSize: "12px", color: "#9ca3af" }}>Click a point in the 3D view to inspect it.</div>}</div>
      </div>
    </div>
  );
}
