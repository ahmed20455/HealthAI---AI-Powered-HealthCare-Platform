# HealthAI – AI-Powered Healthcare Platform

HealthAI is a full-stack, AI-powered healthcare platform designed to enable secure telemedicine, digital health records, and real-time analytics for doctors, patients, and clinics. The platform leverages modern web technologies, AI/ML, and blockchain concepts to deliver a seamless healthcare experience.

---

## 🚀 Features

- **User Authentication:** Secure login for doctors, patients, and staff (wallet-based and email)
- **AI Symptom Analysis:** OpenAI-powered symptom checker and medical image diagnosis
- **Medical Records:** Secure upload, storage, and retrieval of patient records (with IPFS support)
- **Telemedicine:** Video calls, chat, and appointment scheduling
- **Emergency Alerts:** Real-time emergency case creation and notifications
- **Analytics Dashboard:** Health trends, doctor performance, and patient insights
- **Blockchain Integration:** Prescription and record verification
- **Supabase Database:** Secure, scalable, and HIPAA-compliant data storage

---

## 🏗️ Tech Stack

- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** Flask (Python)
- **Database:** Supabase (PostgreSQL)
- **AI/ML:** Gemini, Custom ML models
- **File Storage:** IPFS via Pinata


---

## ⚡ Quick Start

### 1. Clone the repository

```sh
git clone https://github.com/ahmed20455/HealthAI---AI-Powered-HealthCare-Platform.git
cd HealthAI
```

### 2. Set up environment variables

Create a `.env` file in the backend directory with:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
Gemini_API_KEY=your_gemini_api_key
```

### 3. Install backend dependencies

```sh
cd HealthAI
pip install -r requirements.txt
```

### 4. Start the backend server

```sh
python run.py
```
By default, the backend runs on [http://localhost:3000](http://localhost:3000).

### 5. Start the frontend

```sh
cd app
npm install
npm run dev
```
Frontend runs on [http://localhost:3001](http://localhost:3001) (or as configured).

---

## 📋 Key API Endpoints

- `POST /api/auth/wallet-login` — Wallet authentication
- `POST /api/ai/symptom-analysis` — AI symptom analysis
- `POST /api/ai/image-diagnosis` — Medical image analysis
- `POST /api/medical-records` — Upload medical records
- `POST /api/emergency/alert` — Create emergency alert
- `GET /api/analytics/dashboard` — Dashboard analytics

---

## 📝 Project Highlights

- Secure, encrypted patient data and blockchain-based verification
- Real-time AI-powered health insights and emergency response
- Modern, responsive UI for doctors and patients
- Scalable, cloud-ready architecture

---
