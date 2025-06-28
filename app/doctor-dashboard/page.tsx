// Test comment to check edit functionality
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Calendar,
  MessageCircle,
  Users,
  FileText,
  Video,
  Heart,
  Search,
  Bell,
  Settings,
  Plus,
  TrendingUp,
  AlertCircle,
  Stethoscope,
  Brain,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { createClient } from "@supabase/supabase-js"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Activity, CheckCircle } from "lucide-react"

// Define your backend API URL
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:5000"; // Default to localhost:5000

interface Patient {
  id: string;
  name: string;
  age?: number | string; // Made optional and type allows for 'N/A'
  condition?: string;   // Made optional
  lastVisit?: string;   // Made optional
  status?: string;      // Made optional
  // Add other fields as per your Supabase `users` table for patients
}

interface Appointment {
  id: string;
  patient_id: string; // Link to patient
  patientName: string; // Renamed for clarity, will need to be populated
  time: string;
  type: string;
  duration: string;
  status: string; 
  // Add other fields as per your Supabase `consultations` table
}

interface AIInsight {
  id: string;
  category: string;
  title: string;
  description: string;
  colorClass: string; // Tailwind color class for background and text
}

interface PerformanceMetric {
  label: string;
  value: string;
  percentage: number;
  colorClass: string; // Tailwind color class for progress bar
}

interface Message {
  id: string;
  senderName: string;
  subject: string;
  timestamp: string;
  read: boolean;
}

interface UrgentCase {
  id: string;
  patientName: string;
  description: string;
  timestamp: string;
}

interface Prescription {
  id: string;
  patient_id: string;
  doctor_id: string;
  medication_name: string;
  dosage: string;
  instructions: string;
  status: string;
  date_prescribed: string;
}

interface MedicalRecord {
  id: string;
  patient_id: string;
  doctor_id: string;
  record_type: string;
  title: string;
  description: string;
  file_name?: string;
  file_size?: number;
  ipfs_hash?: string;
  created_at: string;
  status: string;
}

interface DiagnosisResult {
  condition: string
  confidence: number
  category: string
  recommendations: string[]
  urgency: string
  next_steps: string[]
}

// Define interfaces for ML model inputs
interface HeartDiseaseInputs {
  age: number; sex: number; cp: number; trestbps: number; chol: number; fbs: number;
  restecg: number; thalach: number; exang: number; oldpeak: number; slope: number; ca: number; thal: number;
}

interface MedicalConditionInputs {
  age: number; gender: number; smoking_status: number; bmi: number; blood_pressure: number; glucose_levels: number;
}

interface CancerInputs {
  Age: number; Gender: string; BMI: number; Smoking: number; GeneticRisk: number;
  PhysicalActivity: number; AlcoholIntake: number; CancerHistory: number;
}

interface DiabetesInputs {
  GENDER: number; AGE: number; UREA: number; CR: number; HBA1C: number; CHOL: number;
  TG: number; HDL: number; LDL: number; VLDL: number; BMI: number;
}

interface KidneyStoneInputs {
  gravity: number; ph: number; osmo: number; cond: number; urea: number; calc: number;
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function handleDoctorFormSubmit(data: any) {
  await supabase.from("doctor_forms").insert([data])
}

async function handleLogout() {
  await supabase.auth.signOut()
  window.location.href = "/"
}

export default function DoctorDashboard() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState("")
  const [patients, setPatients] = useState<Patient[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [unreadMessages, setUnreadMessages] = useState<Message[]>([])
  const [urgentCases, setUrgentCases] = useState<UrgentCase[]>([])
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([])
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [doctorName, setDoctorName] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")

  // New state for ML model selection and inputs
  const [selectedMLModel, setSelectedMLModel] = useState("heart_disease")
  const [mlInputs, setMlInputs] = useState<HeartDiseaseInputs | MedicalConditionInputs | CancerInputs | DiabetesInputs | KidneyStoneInputs | {}>({
    age: 0, sex: 0, cp: 0, trestbps: 0, chol: 0, fbs: 0,
    restecg: 0, thalach: 0, exang: 0, oldpeak: 0, slope: 0, ca: 0, thal: 0,
  })
  const [mlPredictionResult, setMlPredictionResult] = useState<DiagnosisResult | null>(null)
  const [mlError, setMlError] = useState<string | null>(null)
  const [mlLoading, setMlLoading] = useState(false)

  // Function to handle changes in specific ML model inputs
  const handleMLInputChange = (modelType: string, field: string, value: string | number) => {
    console.log(`Input change: modelType=${modelType}, field=${field}, value=${value}`);
    const parsedValue = typeof value === 'string' && value.trim() !== '' ? parseFloat(value) : 0;
    console.log(`Parsed Value: ${parsedValue}`);
    setMlInputs(prevInputs => {
      const newInputs = {
        ...prevInputs,
        [field]: isNaN(parsedValue) ? 0 : parsedValue
      };
      console.log(`New mlInputs state:`, newInputs);
      return newInputs;
    })
  }

  // Function to reset ML inputs when model selection changes
  const resetMLInputs = (model: string) => {
    switch (model) {
      case "heart_disease":
        setMlInputs({ age: 0, sex: 0, cp: 0, trestbps: 0, chol: 0, fbs: 0, restecg: 0, thalach: 0, exang: 0, oldpeak: 0, slope: 0, ca: 0, thal: 0 });
        break;
      case "medical_condition":
        setMlInputs({ age: 0, gender: 0, smoking_status: 0, bmi: 0, blood_pressure: 0, glucose_levels: 0 });
        break;
      case "cancer_prediction":
        setMlInputs({ Age: 0, Gender: "male", BMI: 0, Smoking: 0, GeneticRisk: 0, PhysicalActivity: 0, AlcoholIntake: 0, CancerHistory: 0 });
        break;
      case "diabetes_prediction":
        setMlInputs({ GENDER: 0, AGE: 0, UREA: 0, CR: 0, HBA1C: 0, CHOL: 0, TG: 0, HDL: 0, LDL: 0, VLDL: 0, BMI: 0 });
        break;
      case "kidney_stone_detection":
        setMlInputs({ gravity: 0, ph: 0, osmo: 0, cond: 0, urea: 0, calc: 0 });
        break;
      default:
        setMlInputs({});
    }
  };

  // Function for ML input validation (copied from ai-diagnosis/page.tsx)
  const validateMLInputs = (model: string, inputs: any): boolean => {
    let isValid = true;
    let errorMessage = "";

    switch (model) {
      case "heart_disease":
        const hdInputs = inputs as HeartDiseaseInputs;
        if (hdInputs.age < 0 || hdInputs.age > 120) errorMessage = "Age must be between 0 and 120.";
        else if (hdInputs.sex !== 0 && hdInputs.sex !== 1) errorMessage = "Sex must be 0 (Female) or 1 (Male).";
        else if (hdInputs.cp < 0 || hdInputs.cp > 3) errorMessage = "Chest Pain Type (cp) must be between 0 and 3.";
        else if (hdInputs.trestbps < 70 || hdInputs.trestbps > 200) errorMessage = "Resting BP (trestbps) must be between 70 and 200.";
        else if (hdInputs.chol < 100 || hdInputs.chol > 600) errorMessage = "Cholesterol (chol) must be between 100 and 600.";
        else if (hdInputs.fbs !== 0 && hdInputs.fbs !== 1) errorMessage = "Fasting BS > 120 (fbs) must be 0 or 1.";
        else if (hdInputs.restecg < 0 || hdInputs.restecg > 2) errorMessage = "Resting ECG (restecg) must be between 0 and 2.";
        else if (hdInputs.thalach < 60 || hdInputs.thalach > 220) errorMessage = "Max HR (thalach) must be between 60 and 220.";
        else if (hdInputs.exang !== 0 && hdInputs.exang !== 1) errorMessage = "Exang must be 0 or 1.";
        else if (hdInputs.oldpeak < 0 || hdInputs.oldpeak > 7) errorMessage = "Oldpeak must be between 0 and 7.";
        else if (hdInputs.slope < 0 || hdInputs.slope > 2) errorMessage = "Slope must be between 0 and 2.";
        else if (hdInputs.ca < 0 || hdInputs.ca > 4) errorMessage = "CA must be between 0 and 4.";
        else if (hdInputs.thal < 0 || hdInputs.thal > 3) errorMessage = "Thal must be between 0 and 3.";
        break;
      case "medical_condition":
        const mcInputs = inputs as MedicalConditionInputs;
        if (mcInputs.age < 0 || mcInputs.age > 120) errorMessage = "Age must be between 0 and 120.";
        else if (mcInputs.gender !== 0 && mcInputs.gender !== 1) errorMessage = "Gender must be 0 (Female) or 1 (Male).";
        else if (mcInputs.smoking_status !== 0 && mcInputs.smoking_status !== 1) errorMessage = "Smoking Status must be 0 (No) or 1 (Yes).";
        else if (mcInputs.bmi < 10 || mcInputs.bmi > 60) errorMessage = "BMI must be between 10 and 60.";
        else if (mcInputs.blood_pressure < 70 || mcInputs.blood_pressure > 200) errorMessage = "Blood Pressure must be between 70 and 200.";
        else if (mcInputs.glucose_levels < 50 || mcInputs.glucose_levels > 300) errorMessage = "Glucose Levels must be between 50 and 300.";
        break;
      case "cancer_prediction":
        const cpInputs = inputs as CancerInputs;
        if (cpInputs.Age < 0 || cpInputs.Age > 120) errorMessage = "Age must be between 0 and 120.";
        else if (cpInputs.BMI < 10 || cpInputs.BMI > 60) errorMessage = "BMI must be between 10 and 60.";
        else if (cpInputs.Smoking !== 0 && cpInputs.Smoking !== 1) errorMessage = "Smoking must be 0 (No) or 1 (Yes).";
        else if (cpInputs.GeneticRisk !== 0 && cpInputs.GeneticRisk !== 1) errorMessage = "Genetic Risk must be 0 (Low) or 1 (High).";
        else if (cpInputs.PhysicalActivity < 0 || cpInputs.PhysicalActivity > 24) errorMessage = "Physical Activity (hours/week) must be between 0 and 24.";
        else if (cpInputs.AlcoholIntake < 0 || cpInputs.AlcoholIntake > 50) errorMessage = "Alcohol Intake (drinks/week) must be between 0 and 50.";
        else if (cpInputs.CancerHistory !== 0 && cpInputs.CancerHistory !== 1) errorMessage = "Cancer History must be 0 (No) or 1 (Yes).";
        break;
      case "diabetes_prediction":
        const dpInputs = inputs as DiabetesInputs;
        if (dpInputs.AGE < 0 || dpInputs.AGE > 120) errorMessage = "Age must be between 0 and 120.";
        else if (dpInputs.GENDER !== 0 && dpInputs.GENDER !== 1) errorMessage = "Gender must be 0 (Female) or 1 (Male).";
        else if (dpInputs.UREA < 0 || dpInputs.UREA > 100) errorMessage = "Urea must be between 0 and 100.";
        else if (dpInputs.CR < 0 || dpInputs.CR > 20) errorMessage = "CR must be between 0 and 20.";
        else if (dpInputs.HBA1C < 0 || dpInputs.HBA1C > 20) errorMessage = "HbA1c must be between 0 and 20.";
        else if (dpInputs.CHOL < 0 || dpInputs.CHOL > 500) errorMessage = "Cholesterol (CHOL) must be between 0 and 500.";
        else if (dpInputs.TG < 0 || dpInputs.TG > 1000) errorMessage = "TG must be between 0 and 1000.";
        else if (dpInputs.HDL < 0 || dpInputs.HDL > 200) errorMessage = "HDL must be between 0 and 200.";
        else if (dpInputs.LDL < 0 || dpInputs.LDL > 300) errorMessage = "LDL must be between 0 and 300.";
        else if (dpInputs.VLDL < 0 || dpInputs.VLDL > 100) errorMessage = "VLDL must be between 0 and 100.";
        else if (dpInputs.BMI < 10 || dpInputs.BMI > 60) errorMessage = "BMI must be between 10 and 60.";
        break;
      case "kidney_stone_detection":
        const ksdInputs = inputs as KidneyStoneInputs;
        if (ksdInputs.gravity < 1 || ksdInputs.gravity > 1.05) errorMessage = "Gravity must be between 1.000 and 1.050.";
        else if (ksdInputs.ph < 4.5 || ksdInputs.ph > 8) errorMessage = "pH must be between 4.5 and 8.0.";
        else if (ksdInputs.osmo < 200 || ksdInputs.osmo > 1300) errorMessage = "Osmo must be between 200 and 1300.";
        else if (ksdInputs.cond < 5 || ksdInputs.cond > 40) errorMessage = "Conductivity (cond) must be between 5 and 40.";
        else if (ksdInputs.urea < 10 || ksdInputs.urea > 1000) errorMessage = "Urea must be between 10 and 1000.";
        else if (ksdInputs.calc < 0 || ksdInputs.calc > 10) errorMessage = "Calcium (calc) must be between 0 and 10.";
        break;
      default:
        errorMessage = "Unknown model selected for validation.";
    }

    if (errorMessage) {
      setMlError(errorMessage);
      isValid = false;
    }
    return isValid;
  };

  const handleMLPrediction = async () => {
    if (!validateMLInputs(selectedMLModel, mlInputs as any)) {
      return; // Validation failed, error message already set
    }

    setMlLoading(true)
    setMlError("")
    setMlPredictionResult(null)

    try {
      const res = await fetch("/api/ml-diagnosis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          model_name: selectedMLModel,
          input_data: mlInputs,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `Failed to get prediction from ${selectedMLModel} model.`)
      }

      const data: DiagnosisResult = await res.json()
      setMlPredictionResult(data)

    } catch (err: any) {
      console.error(`ML prediction error for ${selectedMLModel}:`, err)
      setMlError(err.message || `Failed to connect to ML service for ${selectedMLModel}.`)
    } finally {
      setMlLoading(false)
    }
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency.toLowerCase()) {
      case "high":
        return "destructive"
      case "medium":
        return "secondary"
      case "low":
        return "default"
      default:
        return "default"
    }
  }

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency.toLowerCase()) {
      case "high":
        return <AlertTriangle className="h-4 w-4" />
      case "medium":
        return <Activity className="h-4 w-4" />
      case "low":
        return <CheckCircle className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  useEffect(() => {
    const user = localStorage.getItem("healthai_user")
    if (!user) {
      router.push("/auth")
    } else {
      try {
        const parsedUser = JSON.parse(user)
        setUserId(parsedUser.id)
        setAuthToken(parsedUser.token)
        const fetchDoctorName = async () => {
          if (parsedUser.id && parsedUser.token) {
            try {
              const res = await fetch(`${BACKEND_API_URL}/api/users/${parsedUser.id}`, {
                headers: {
                  "Authorization": `Bearer ${parsedUser.token}`,
                },
              });
              if (res.ok) {
                const data = await res.json();
                if (data && data.name) {
                  setDoctorName(data.name);
                } else {
                  console.warn("Doctor name not found in user data:", data);
                }
              } else {
                console.error("Failed to fetch doctor profile:", await res.json());
                setError(`Failed to load doctor profile: ${res.statusText}`);
              }
            } catch (err) {
              console.error("Error fetching doctor profile:", err);
              setError(`Error fetching doctor profile: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        };
        fetchDoctorName();
      } catch (e) {
        console.error("Error parsing user from localStorage", e)
        setError("Authentication error. Please log in again.")
        router.push("/auth")
      }
    }
  }, [router, BACKEND_API_URL])

  const fetchDashboardData = async () => {
    if (!userId || !authToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Fetch patients
      const patientsRes = await fetch(`${BACKEND_API_URL}/api/patients`, {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (patientsRes.ok) {
        const patientsData = await patientsRes.json();
        console.log("patientsData", patientsData); // Add this line for debugging
        setPatients(patientsData);
      } else {
        throw new Error(`Failed to fetch patients: ${patientsRes.statusText}`);
      }

      // Fetch appointments
      const appointmentsRes = await fetch(`${BACKEND_API_URL}/api/doctor/appointments?doctor_id=${userId}&time_range=today`, {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (appointmentsRes.ok) {
        const appointmentsData = await appointmentsRes.json();
        setAppointments(appointmentsData.appointments);
      } else {
        throw new Error(`Failed to fetch appointments: ${appointmentsRes.statusText}`);
      }

      // Fetch unread messages
      const messagesRes = await fetch(`${BACKEND_API_URL}/api/doctor/messages?doctor_id=${userId}`, {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (messagesRes.ok) {
        const messagesData = await messagesRes.json();
        setUnreadMessages(messagesData.messages);
      } else {
        throw new Error(`Failed to fetch messages: ${messagesRes.statusText}`);
      }

      // Fetch urgent cases
      const urgentCasesRes = await fetch(`${BACKEND_API_URL}/api/doctor/urgent-cases?doctor_id=${userId}`, {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (urgentCasesRes.ok) {
        const urgentCasesData = await urgentCasesRes.json();
        setUrgentCases(urgentCasesData.urgent_cases);
      } else {
        throw new Error(`Failed to fetch urgent cases: ${urgentCasesRes.statusText}`);
      }

      // Fetch AI insights
      const aiInsightsRes = await fetch(`${BACKEND_API_URL}/api/doctor/ai-insights?doctor_id=${userId}`, {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (aiInsightsRes.ok) {
        const aiInsightsData = await aiInsightsRes.json();
        setAiInsights(aiInsightsData.insights);
      } else {
        throw new Error(`Failed to fetch AI insights: ${aiInsightsRes.statusText}`);
      }

      // Fetch performance metrics
      const performanceRes = await fetch(`${BACKEND_API_URL}/api/doctor/performance-metrics?doctor_id=${userId}`, {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (performanceRes.ok) {
        const performanceData = await performanceRes.json();
        setPerformanceMetrics(performanceData.metrics);
      } else {
        throw new Error(`Failed to fetch performance metrics: ${performanceRes.statusText}`);
      }

    } catch (err: any) {
      console.error("Error fetching dashboard data:", err);
      if (err.message.includes("401") || err.message.includes("403")) {
        setError("Session expired or unauthorized access. Please log in again.");
        router.push("/auth");
      } else {
        setError(err.message || "Failed to load dashboard data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId && authToken) {
      fetchDashboardData();
    }
  }, [userId, authToken]);

  if (error && (error.includes("expired") || error.includes("unauthorized"))) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => router.push("/auth")} className="mt-4">Go to Login</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Activity className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-lg text-gray-700">Loading Dashboard...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-lg">
            <Stethoscope className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Doctor Dashboard</h1>
            <p className="text-gray-600 mt-2">
              {doctorName ? `Welcome back, Dr. ${doctorName}!` : "Overview of your patients, appointments, and practice insights."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/profile")}>Profile</Button>
          <Button variant="outline" onClick={handleLogout}>Logout</Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-8">
        {/* Diagnosis Options Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value);
            setError(""); // Clear general error when tab changes
            setMlError(""); // Clear ML error when tab changes
            setMlPredictionResult(null); // Clear ML result
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 max-w-lg"> {/* Adjusted grid-cols for new tab */}
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="patients">Patients</TabsTrigger>
            <TabsTrigger value="ai_models">
              <Brain className="h-4 w-4 mr-2" />
              <span>AI Model Diagnostics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Card 1: Total Patients */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
                  <Users className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{patients.length}</div>
                  <p className="text-xs text-gray-500">+20.1% from last month</p>
                </CardContent>
              </Card>

              {/* Card 2: Upcoming Appointments */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming Appointments</CardTitle>
                  <Calendar className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{appointments.length}</div>
                  <p className="text-xs text-gray-500">+180.1% from last month</p>
                </CardContent>
              </Card>

              {/* Card 3: Unread Messages */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unread Messages</CardTitle>
                  <MessageCircle className="h-4 w-4 text-gray-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{unreadMessages.length}</div>
                  <p className="text-xs text-gray-500">+19% from last month</p>
                </CardContent>
              </Card>
            </div>

            {/* Other Sections (AI Insights, Performance Metrics, Urgent Cases, Recent Patients) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* AI Insights */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>AI Insights</CardTitle>
                  <CardDescription>Intelligent observations from your practice data.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aiInsights && aiInsights.length > 0 ? (
                    aiInsights.map((insight) => (
                      <div key={insight.id} className={`p-4 rounded-lg ${insight.colorClass}`}>
                        <h4 className="font-semibold text-lg">{insight.title}</h4>
                        <p className="text-sm">{insight.description}</p>
                        <Badge variant="secondary" className="mt-2">{insight.category}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No AI insights available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Performance Metrics */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                  <CardDescription>Key metrics about your practice performance.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {performanceMetrics && performanceMetrics.length > 0 ? (
                    performanceMetrics.map((metric) => (
                      <div key={metric.label} className="flex items-center gap-4">
                        <span className="text-sm font-medium w-36">{metric.label}:</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                          <div
                            className={`${metric.colorClass} h-2.5 rounded-full`}
                            style={{ width: `${metric.percentage}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium w-12 text-right">{metric.value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No performance metrics available.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Urgent Cases and Recent Patients (if needed or moved from previous section) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Urgent Cases */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>Urgent Cases</CardTitle>
                  <CardDescription>High-priority patient alerts requiring immediate attention.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {urgentCases && urgentCases.length > 0 ? (
                    urgentCases.map((caseItem) => (
                      <div key={caseItem.id} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <div>
                          <h4 className="font-semibold text-red-800">Urgent: {caseItem.patientName}</h4>
                          <p className="text-sm text-red-700">{caseItem.description}</p>
                          <p className="text-xs text-red-500 mt-1">{new Date(caseItem.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No urgent cases at the moment.</p>
                  )}
                </CardContent>
              </Card>

              {/* Recent Patients */}
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>Recent Patients</CardTitle>
                  <CardDescription>Your most recently attended patients.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {patients && patients.length > 0 ? (
                    patients.slice(0, 5).map((patient) => (
                      <div key={patient.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${patient.name}`} />
                            <AvatarFallback>{patient.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{patient.name}</p>
                            <p className="text-sm text-gray-500">
                              {patient.age ? `${patient.age} years old` : 'Age N/A'}
                            </p>
                          </div>
                        </div>
                        <Link href={`/doctor-dashboard/patient-record/${patient.id}`}>
                          <Button variant="outline" size="sm">View Record</Button>
                        </Link>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No recent patients found.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="patients">
            <Card>
              <CardHeader>
                <CardTitle>All Patients</CardTitle>
                <CardDescription>Manage and view details of all your patients.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Search patients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-4"
                />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {patients && patients.filter(patient =>
                    patient.name.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map((patient) => (
                    <Card key={patient.id} className="p-4">
                      <h3 className="font-semibold text-lg">{patient.name}</h3>
                      <p className="text-sm text-gray-500">ID: {patient.id}</p>
                      <p className="text-sm text-gray-500">Age: {patient.age || 'N/A'}</p>
                      <p className="text-sm text-gray-500">Condition: {patient.condition || 'N/A'}</p>
                      <Link href={`/doctor-dashboard/patient-record/${patient.id}`} passHref>
                        <Button variant="outline" size="sm" className="mt-3 w-full">
                          View Details
                        </Button>
                      </Link>
                    </Card>
                  ))}
                </div>
                {(!patients || patients.length === 0) && !loading && (
                  <p className="text-center text-gray-500">No patients found.</p>
                )}
              </CardContent>
            </Card>

            <Link href="/doctor-dashboard/patients/add-patient">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 text-center">
                  <Plus className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <h3 className="font-semibold text-sm">Add Patient</h3>
                </CardContent>
              </Card>
            </Link>
            <Link href="/doctor-dashboard/appointments">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 text-center">
                  <Calendar className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <h3 className="font-semibold text-sm">Schedule Appointment</h3>
                </CardContent>
              </Card>
            </Link>
            <Link href="/doctor-dashboard/prescriptions/add">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 text-center">
                  <FileText className="w-8 h-8 text-pink-600 mx-auto mb-2" />
                  <h3 className="font-semibold text-sm">Add Prescription</h3>
                </CardContent>
              </Card>
            </Link>
          </TabsContent>

          {/* New Tab Content for ML Models (copied from ai-diagnosis/page.tsx) */}
          <TabsContent value="ai_models">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Specific AI Model Diagnostics
                </CardTitle>
                <CardDescription>
                  Select a specific AI model for specialized medical condition prediction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="ml-model-select">Select Model</Label>
                  <select
                    id="ml-model-select"
                    value={selectedMLModel}
                    onChange={(e) => {
                      setSelectedMLModel(e.target.value);
                      resetMLInputs(e.target.value);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="heart_disease">Heart Disease Prediction</option>
                    <option value="medical_condition">Medical Condition Prediction</option>
                    <option value="cancer_prediction">Cancer Prediction</option>
                    <option value="diabetes_prediction">Diabetes Prediction</option>
                    <option value="kidney_stone_detection">Kidney Stone Detection</option>
                  </select>
                </div>

                {/* Dynamic Input Forms based on selectedMLModel */}
                {selectedMLModel === "heart_disease" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Age</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).age)} onChange={(e) => handleMLInputChange("heart_disease", "age", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Sex (0=F, 1=M)</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).sex)} onChange={(e) => handleMLInputChange("heart_disease", "sex", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Chest Pain Type (cp)</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).cp)} onChange={(e) => handleMLInputChange("heart_disease", "cp", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Resting BP (trestbps)</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).trestbps)} onChange={(e) => handleMLInputChange("heart_disease", "trestbps", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Cholesterol (chol)</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).chol)} onChange={(e) => handleMLInputChange("heart_disease", "chol", e.target.value)} /></div>
                    <div className="space-y-2">
                      <Label>Fasting BS &gt; 120 (fbs)</Label>
                      <Input type="number" value={String((mlInputs as HeartDiseaseInputs).fbs)} onChange={(e) => handleMLInputChange("heart_disease", "fbs", e.target.value)} />
                    </div>
                    <div className="space-y-2"><Label>Resting ECG (restecg)</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).restecg)} onChange={(e) => handleMLInputChange("heart_disease", "restecg", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Max HR (thalach)</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).thalach)} onChange={(e) => handleMLInputChange("heart_disease", "thalach", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Exang</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).exang)} onChange={(e) => handleMLInputChange("heart_disease", "exang", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Oldpeak</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).oldpeak)} onChange={(e) => handleMLInputChange("heart_disease", "oldpeak", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Slope</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).slope)} onChange={(e) => handleMLInputChange("heart_disease", "slope", e.target.value)} /></div>
                    <div className="space-y-2"><Label>CA</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).ca)} onChange={(e) => handleMLInputChange("heart_disease", "ca", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Thal</Label><Input type="number" value={String((mlInputs as HeartDiseaseInputs).thal)} onChange={(e) => handleMLInputChange("heart_disease", "thal", e.target.value)} /></div>
                  </div>
                )}

                {selectedMLModel === "medical_condition" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Age</Label><Input type="number" value={String((mlInputs as MedicalConditionInputs).age)} onChange={(e) => handleMLInputChange("medical_condition", "age", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Gender (0=F, 1=M)</Label><Input type="number" value={String((mlInputs as MedicalConditionInputs).gender)} onChange={(e) => handleMLInputChange("medical_condition", "gender", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Smoking Status (0=No, 1=Yes)</Label><Input type="number" value={String((mlInputs as MedicalConditionInputs).smoking_status)} onChange={(e) => handleMLInputChange("medical_condition", "smoking_status", e.target.value)} /></div>
                    <div className="space-y-2"><Label>BMI</Label><Input type="number" value={String((mlInputs as MedicalConditionInputs).bmi)} onChange={(e) => handleMLInputChange("medical_condition", "bmi", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Blood Pressure</Label><Input type="number" value={String((mlInputs as MedicalConditionInputs).blood_pressure)} onChange={(e) => handleMLInputChange("medical_condition", "blood_pressure", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Glucose Levels</Label><Input type="number" value={String((mlInputs as MedicalConditionInputs).glucose_levels)} onChange={(e) => handleMLInputChange("medical_condition", "glucose_levels", e.target.value)} /></div>
                  </div>
                )}

                {selectedMLModel === "cancer_prediction" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Age</Label><Input type="number" value={String((mlInputs as CancerInputs).Age)} onChange={(e) => handleMLInputChange("cancer_prediction", "Age", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Gender</Label>
                      <select value={(mlInputs as CancerInputs).Gender} onChange={(e) => handleMLInputChange("cancer_prediction", "Gender", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background">
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </div>
                    <div className="space-y-2"><Label>BMI</Label><Input type="number" value={String((mlInputs as CancerInputs).BMI)} onChange={(e) => handleMLInputChange("cancer_prediction", "BMI", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Smoking (0=No, 1=Yes)</Label><Input type="number" value={String((mlInputs as CancerInputs).Smoking)} onChange={(e) => handleMLInputChange("cancer_prediction", "Smoking", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Genetic Risk (0=Low, 1=High)</Label><Input type="number" value={String((mlInputs as CancerInputs).GeneticRisk)} onChange={(e) => handleMLInputChange("cancer_prediction", "GeneticRisk", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Physical Activity (hours/week)</Label><Input type="number" value={String((mlInputs as CancerInputs).PhysicalActivity)} onChange={(e) => handleMLInputChange("cancer_prediction", "PhysicalActivity", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Alcohol Intake (drinks/week)</Label><Input type="number" value={String((mlInputs as CancerInputs).AlcoholIntake)} onChange={(e) => handleMLInputChange("cancer_prediction", "AlcoholIntake", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Cancer History (0=No, 1=Yes)</Label><Input type="number" value={String((mlInputs as CancerInputs).CancerHistory)} onChange={(e) => handleMLInputChange("cancer_prediction", "CancerHistory", e.target.value)} /></div>
                  </div>
                )}

                {selectedMLModel === "diabetes_prediction" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Gender (0=F, 1=M)</Label><Input type="number" value={String((mlInputs as DiabetesInputs).GENDER)} onChange={(e) => handleMLInputChange("diabetes_prediction", "GENDER", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Age</Label><Input type="number" value={String((mlInputs as DiabetesInputs).AGE)} onChange={(e) => handleMLInputChange("diabetes_prediction", "AGE", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Urea</Label><Input type="number" value={String((mlInputs as DiabetesInputs).UREA)} onChange={(e) => handleMLInputChange("diabetes_prediction", "UREA", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Cr</Label><Input type="number" value={String((mlInputs as DiabetesInputs).CR)} onChange={(e) => handleMLInputChange("diabetes_prediction", "CR", e.target.value)} /></div>
                    <div className="space-y-2"><Label>HbA1c</Label><Input type="number" value={String((mlInputs as DiabetesInputs).HBA1C)} onChange={(e) => handleMLInputChange("diabetes_prediction", "HBA1C", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Chol</Label><Input type="number" value={String((mlInputs as DiabetesInputs).CHOL)} onChange={(e) => handleMLInputChange("diabetes_prediction", "CHOL", e.target.value)} /></div>
                    <div className="space-y-2"><Label>TG</Label><Input type="number" value={String((mlInputs as DiabetesInputs).TG)} onChange={(e) => handleMLInputChange("diabetes_prediction", "TG", e.target.value)} /></div>
                    <div className="space-y-2"><Label>HDL</Label><Input type="number" value={String((mlInputs as DiabetesInputs).HDL)} onChange={(e) => handleMLInputChange("diabetes_prediction", "HDL", e.target.value)} /></div>
                    <div className="space-y-2"><Label>LDL</Label><Input type="number" value={String((mlInputs as DiabetesInputs).LDL)} onChange={(e) => handleMLInputChange("diabetes_prediction", "LDL", e.target.value)} /></div>
                    <div className="space-y-2"><Label>VLDL</Label><Input type="number" value={String((mlInputs as DiabetesInputs).VLDL)} onChange={(e) => handleMLInputChange("diabetes_prediction", "VLDL", e.target.value)} /></div>
                    <div className="space-y-2"><Label>BMI</Label><Input type="number" value={String((mlInputs as DiabetesInputs).BMI)} onChange={(e) => handleMLInputChange("diabetes_prediction", "BMI", e.target.value)} /></div>
                  </div>
                )}

                {selectedMLModel === "kidney_stone_detection" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Gravity</Label><Input type="number" value={String((mlInputs as KidneyStoneInputs).gravity)} onChange={(e) => handleMLInputChange("kidney_stone_detection", "gravity", e.target.value)} /></div>
                    <div className="space-y-2"><Label>pH</Label><Input type="number" value={String((mlInputs as KidneyStoneInputs).ph)} onChange={(e) => handleMLInputChange("kidney_stone_detection", "ph", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Osmo</Label><Input type="number" value={String((mlInputs as KidneyStoneInputs).osmo)} onChange={(e) => handleMLInputChange("kidney_stone_detection", "osmo", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Conductivity (cond)</Label><Input type="number" value={String((mlInputs as KidneyStoneInputs).cond)} onChange={(e) => handleMLInputChange("kidney_stone_detection", "cond", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Urea</Label><Input type="number" value={String((mlInputs as KidneyStoneInputs).urea)} onChange={(e) => handleMLInputChange("kidney_stone_detection", "urea", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Calcium (calc)</Label><Input type="number" value={String((mlInputs as KidneyStoneInputs).calc)} onChange={(e) => handleMLInputChange("kidney_stone_detection", "calc", e.target.value)} /></div>
                  </div>
                )}

                <Button
                  onClick={handleMLPrediction}
                  disabled={mlLoading}
                  className="w-full"
                >
                  {mlLoading ? (
                    <>
                      <Activity className="h-4 w-4 mr-2 animate-spin" />
                      Getting Prediction...
                    </>
                  ) : (
                    "Get Prediction"
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Error Display for ML */}
            {mlError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{mlError}</AlertDescription>
              </Alert>
            )}

            {/* Results Display for ML */}
            {mlPredictionResult && (
              <Card className="border-blue-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <Brain className="h-5 w-5" />
                    AI Diagnosis Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{mlPredictionResult!.condition}</h3>
                      <p className="text-gray-600 mt-1">Category: {mlPredictionResult!.category}</p>
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-2">
                      <Badge variant={getUrgencyColor(mlPredictionResult!.urgency)} className="flex items-center gap-1">
                        {getUrgencyIcon(mlPredictionResult!.urgency)}
                        {mlPredictionResult!.urgency.toUpperCase()} PRIORITY
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Confidence:</span>
                        <div className="w-24 bg-gray-200 rounded-full h-2.5">
                          <div
                            className="bg-blue-600 h-2.5 rounded-full"
                            style={{ width: `${mlPredictionResult!.confidence}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{mlPredictionResult!.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900">Recommendations:</h4>
                      <ul className="space-y-2">
                        {mlPredictionResult!.recommendations.map((rec, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <div className="mt-1 h-2 w-2 rounded-full bg-blue-500"></div>
                            <span className="text-gray-700">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900">Next Steps:</h4>
                      <ul className="space-y-2">
                        {mlPredictionResult!.next_steps.map((step, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <div className="mt-1 h-2 w-2 rounded-full bg-blue-500"></div>
                            <span className="text-gray-700">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {mlPredictionResult!.urgency === "high" && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Urgent Medical Attention Required</AlertTitle>
                      <AlertDescription>
                        This condition requires immediate medical attention. Please contact emergency services or visit the nearest emergency room without delay.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-500">
                      <strong>Disclaimer:</strong> This AI analysis is for informational purposes only and should not replace professional medical advice. Always consult with a qualified healthcare provider for diagnosis and treatment.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* General Error Display (if any) */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
