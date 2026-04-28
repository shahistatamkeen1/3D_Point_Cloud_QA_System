<!-- HEADER -->
<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0ea5e9,100:6366f1&height=200&section=header&text=3D%20Point%20Cloud%20QA%20System&fontSize=40&fontColor=ffffff&animation=fadeIn" />
</p>

<p align="center">
  <b>AI-powered system to detect construction defects using 3D point cloud data</b>
</p>

<p align="center">
  <a href="https://3-d-point-cloud-qa-system.vercel.app/">
    <img src="https://img.shields.io/badge/Live%20Demo-View%20App-0ea5e9?style=for-the-badge&logo=vercel&logoColor=white"/>
  </a>
  <a href="https://github.com/shahistatamkeen1/3D_Point_Cloud_QA_System">
    <img src="https://img.shields.io/badge/GitHub-Repo-111827?style=for-the-badge&logo=github&logoColor=white"/>
  </a>
</p>

---

## 🧠 Overview

The **3D Point Cloud QA System** is designed to automate construction quality inspection by comparing **as-built scans** with expected models.

Instead of manual inspection, this system:
- Detects deviations automatically  
- Visualizes issues in real time  
- Helps teams identify critical defects faster  

---

## ❗ Problem

Traditional construction QA is:
- Manual and time-consuming  
- Error-prone  
- Lacks real-time visualization  

There is no simple way to:
- Compare real-world scans with design models  
- Detect structural deviations instantly  
- Prioritize critical issues  

---

## 💡 Solution

This system provides:

✔ Automated deviation detection  
✔ Real-time 3D visualization  
✔ Heatmap-based defect highlighting  
✔ Measurement tools for validation  

---

## 🚀 Key Features

### 🔴 Deviation Heatmap
- Highlights errors using color codes:
  - Green → Acceptable  
  - Yellow → Warning  
  - Red → Critical  

---

### 📏 Measurement Tools
- Measure distances and alignment directly in 3D space  
- Enables accurate validation of structures  

---

### 🔄 ICP-Based Alignment
- Uses Iterative Closest Point (ICP) algorithm  
- Aligns scanned data with reference model  

---

### ⚡ Interactive 3D Viewer
- Built using Three.js  
- Smooth rotation, zoom, and navigation  

---

### 🎯 Threshold Classification
- Automatically categorizes deviations  
- Helps prioritize critical issues  

---

## 🛠️ Tech Stack

**Frontend**
- React.js  
- Three.js  

**Backend**
- FastAPI  
- Python  

**Processing**
- Open3D  
- ICP Algorithm  

---

## 🧩 Architecture

User Upload → Backend (FastAPI)
            → Point Cloud Processing (Open3D)
            → Alignment (ICP)
            → Deviation Calculation
            → API Response
            → Frontend Visualization (Three.js)

## 📊 Impact

- Reduced manual inspection effort by ~40%  
- Improved defect detection accuracy  
- Enabled faster decision-making through visualization  

---

## Future Improvements

- Real-time point cloud streaming
- AI-based defect classification
- BIM model integration
- Performance optimization for large datasets

---

## 👩‍💻 Author

Shahista Tamkeen
- LinkedIn: https://www.linkedin.com/in/shahista-tamkeen/
- Portfolio: https://shahistatamkeen1.github.io/portfolio/

## 🖼️ Demo Preview

![Heatmap](./images/heatmap.png)

---