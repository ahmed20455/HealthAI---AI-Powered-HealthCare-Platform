"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Brain, FileText, Activity, AlertTriangle, CheckCircle, Upload, Stethoscope } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { AnemiaDetectionCard } from "@/components/ui/anemia-detection-card"

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

export default function AIDiagnosisPage() {
  const router = useRouter()

  useEffect(() => {
    const user = localStorage.getItem("healthai_user");
    if (!user) {
      router.push("/auth");
    }
  }, [router]);

  const [symptoms, setSymptoms] = useState("")
  const [duration, setDuration] = useState("")
  const [severity, setSeverity] = useState(5)
  const [medicalHistory, setMedicalHistory] = useState("")
  const [vitalSigns, setVitalSigns] = useState({
    heart_rate: "",
    blood_pressure_systolic: "",
    blood_pressure_diastolic: "",
    temperature: "",
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [diagnosisType, setDiagnosisType] = useState("general") // This seems to be for internal use, not directly for tabs
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiagnosisResult | null>(null)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState("symptoms")

  // New state for ML model selection and inputs
  const [selectedMLModel, setSelectedMLModel] = useState("heart_disease") // Default to heart disease
  const [mlInputs, setMlInputs] = useState<HeartDiseaseInputs | MedicalConditionInputs | CancerInputs | DiabetesInputs | KidneyStoneInputs | {}>({
    // Initialize with default values for the first model (Heart Disease)
    age: 0, sex: 0, cp: 0, trestbps: 0, chol: 0, fbs: 0,
    restecg: 0, thalach: 0, exang: 0, oldpeak: 0, slope: 0, ca: 0, thal: 0,
  })

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

  // Update handleSymptomAnalysis to fetch from new API
  const handleSymptomAnalysis = async () => {
    if (!symptoms.trim()) {
      setError("Please describe your symptoms")
      return
    }

    setLoading(true)
    setError("")
    setResult(null) // Clear previous results

    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosisType: "symptoms",
          symptoms,
          duration,
          severity,
          medicalHistory,
          vitalSigns,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to get AI diagnosis for symptoms.")
      }

      const data: DiagnosisResult = await res.json()
      setResult(data)
    } catch (err: any) {
      console.error("Symptom analysis error:", err)
      setError(err.message || "Failed to connect to AI service for symptom analysis.")
    } finally {
      setLoading(false)
    }
  }

  const handleImageAnalysis = async () => {
    if (!selectedFile) {
      setError("Please select an image file")
      return
    }

    setLoading(true)
    setError("")
    setResult(null) // Clear previous results

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('diagnosis_type', 'eye_anemia'); // Explicitly set diagnosis type for anemia

      const res = await fetch("/api/ai/image-diagnosis", { // Updated endpoint
        method: "POST",
        body: formData, // Send as FormData
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to get AI diagnosis for image.");
      }

      const data: DiagnosisResult = await res.json();
      setResult(data);
      
    } catch (err: any) {
      console.error("Image analysis error:", err)
      setError(err.message || "Failed to analyze image.")
    } finally {
      setLoading(false)
    }
  }

  // New function to handle ML model predictions
  const handleMLPrediction = async () => {
    if (!validateMLInputs(selectedMLModel, mlInputs as any)) {
      return; // Validation failed, error message already set
    }

    setLoading(true)
    setError("")
    setResult(null)

    try {
      const user = localStorage.getItem("healthai_user");
      const token = user ? JSON.parse(user).token : null;

      if (!token) {
        setError("Authentication required. Please log in.");
        setLoading(false);
        router.push("/auth/login"); // Redirect to login page
        return;
      }

      const res = await fetch("/api/ml-diagnosis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`, // Add Authorization header
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
      setResult(data)

    } catch (err: any) {
      console.error(`ML prediction error for ${selectedMLModel}:`, err)
      setError(err.message || `Failed to connect to ML service for ${selectedMLModel}.`)
    } finally {
      setLoading(false)
    }
  }

  // New function for ML input validation
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
        else if (hdInputs.fbs !== 0 && hdInputs.fbs !== 1) errorMessage = "Fasting BS &gt; 120 (fbs) must be 0 or 1.";
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
      setError(errorMessage);
      isValid = false;
    }
    return isValid;
  };

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleRedirect = (href: string) => {
    const user = localStorage.getItem("healthai_user")
    if (!user) {
      router.push("/auth/login")
    } else {
      router.push(href)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
        <div className="bg-blue-100 p-3 rounded-lg">
          <Brain className="h-8 w-8 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Medical Diagnosis</h1>
          <p className="text-gray-600 mt-2">
            Advanced AI-powered symptom analysis and medical image diagnosis to help you understand potential health concerns
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-8">
        {/* Diagnosis Options Tabs */}
        <Tabs 
          value={activeTab} 
          onValueChange={(value) => {
            setActiveTab(value);
            setError(""); // Clear error when tab changes
            setResult(null); // Clear result when tab changes
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="symptoms">
              <Stethoscope className="h-4 w-4 mr-2" />
              <span>Symptom Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="image">
              <Upload className="h-4 w-4 mr-2" />
              <span>Image Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="ml_models">
              <Brain className="h-4 w-4 mr-2" />
              <span>Specific AI Models</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="symptoms">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Symptom Analysis
                </CardTitle>
                <CardDescription>
                  Describe your symptoms in detail for comprehensive AI-powered analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="symptoms">Symptoms Description *</Label>
                  <Textarea
                    id="symptoms"
                    placeholder="Describe your symptoms in detail (e.g., 'Sharp pain in lower right abdomen that started yesterday, worsens with movement')..."
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    className="min-h-[120px]"
                  />
                  <p className="text-sm text-gray-500">
                    Be as specific as possible about location, type of pain, triggers, and timing
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration</Label>
                    <Input
                      id="duration"
                      placeholder="e.g., '3 days', '2 hours'"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="severity">Severity (1-10)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        id="severity"
                        min={1}
                        max={10}
                        value={[severity]}
                        onValueChange={(value) => setSeverity(value[0])}
                        className="flex-1"
                      />
                      <span className="w-8 text-center font-medium">{severity}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medical-history">Medical History</Label>
                  <Input
                    id="medical-history"
                    placeholder="e.g., 'Diabetes, Hypertension, Asthma'"
                    value={medicalHistory}
                    onChange={(e) => setMedicalHistory(e.target.value)}
                  />
                  <p className="text-sm text-gray-500">
                    List any known medical conditions, separated by commas
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium">Vital Signs (Optional)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="heart-rate">Heart Rate (bpm)</Label>
                      <Input
                        id="heart-rate"
                        type="number"
                        placeholder="e.g., 72"
                        value={vitalSigns.heart_rate}
                        onChange={(e) => setVitalSigns((prev) => ({ ...prev, heart_rate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="temperature">Temperature (°F)</Label>
                      <Input
                        id="temperature"
                        type="number"
                        step="0.1"
                        placeholder="e.g., 98.6"
                        value={vitalSigns.temperature}
                        onChange={(e) => setVitalSigns((prev) => ({ ...prev, temperature: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bp-systolic">Blood Pressure (Systolic)</Label>
                      <Input
                        id="bp-systolic"
                        type="number"
                        placeholder="e.g., 120"
                        value={vitalSigns.blood_pressure_systolic}
                        onChange={(e) => setVitalSigns((prev) => ({ ...prev, blood_pressure_systolic: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bp-diastolic">Blood Pressure (Diastolic)</Label>
                      <Input
                        id="bp-diastolic"
                        type="number"
                        placeholder="e.g., 80"
                        value={vitalSigns.blood_pressure_diastolic}
                        onChange={(e) => setVitalSigns((prev) => ({ ...prev, blood_pressure_diastolic: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleSymptomAnalysis} 
                  disabled={loading || !symptoms.trim()} 
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Activity className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Analyze Symptoms"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="image">
            <AnemiaDetectionCard 
              selectedFile={selectedFile}
              onFileChange={handleFileChange}
              onAnalyze={handleImageAnalysis}
              loading={loading}
            />
          </TabsContent>

          {/* New Tab Content for ML Models */}
          <TabsContent value="ml_models">
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
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? (
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
          </TabsContent>
        </Tabs>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results Display */}
        {result && (
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
                  <h3 className="text-xl font-semibold text-gray-900">{result!.condition}</h3>
                  <p className="text-gray-600 mt-1">Category: {result!.category}</p>
                </div>
                <div className="flex flex-col items-start md:items-end gap-2">
                  <Badge variant={getUrgencyColor(result!.urgency)} className="flex items-center gap-1">
                    {getUrgencyIcon(result!.urgency)}
                    {result!.urgency.toUpperCase()} PRIORITY
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Confidence:</span>
                    <div className="w-24 bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${result!.confidence}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium">{result!.confidence}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">Recommendations:</h4>
                  <ul className="space-y-2">
                    {result!.recommendations.map((rec, index) => (
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
                    {result!.next_steps.map((step, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="mt-1 h-2 w-2 rounded-full bg-blue-500"></div>
                        <span className="text-gray-700">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {result!.urgency === "high" && (
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
      </div>
    </div>
  )
}
