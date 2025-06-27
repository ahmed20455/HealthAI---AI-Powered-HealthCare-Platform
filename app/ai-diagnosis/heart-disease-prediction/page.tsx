"use client"

import { useState } from "react"

export default function HeartDiseaseForm() {
  const [formData, setFormData] = useState({
    age: "",
    sex: "",
    cp: "",
    trestbps: "",
    chol: "",
    fbs: "",
    restecg: "",
    thalach: "",
    exang: "",
    oldpeak: "",
    slope: "",
    ca: "",
    thal: ""
  })

  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError(null)
    setResult(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    for (const [key, val] of Object.entries(formData)) {
      if (val === "") {
        setError(`Please enter ${key}`)
        return
      }
      if (isNaN(Number(val))) {
        setError(`${key} must be a valid number`)
        return
      }
    }

    try {
      const res = await fetch("http://localhost:5003/heart_disease_prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Prediction failed")
        return
      }

      setResult(data.message)
    } catch (err) {
      console.error("Request failed:", err)
      setError("Failed to connect to prediction server.")
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Heart Disease Prediction</h1>
      <form onSubmit={handleSubmit} className="space-y-4">

        {[
          { label: "Age", name: "age" },
          { label: "Resting Blood Pressure (trestbps)", name: "trestbps" },
          { label: "Serum Cholesterol (chol)", name: "chol" },
          { label: "Max Heart Rate Achieved (thalach)", name: "thalach" },
          { label: "Oldpeak", name: "oldpeak" },
          { label: "Number of Major Vessels (ca)", name: "ca" }
        ].map(({ label, name }) => (
          <input
            key={name}
            type="number"
            step="any"
            name={name}
            placeholder={label}
            value={(formData as any)[name]}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        ))}

        <select name="sex" value={formData.sex} onChange={handleChange} className="w-full border p-2 rounded" required>
          <option value="">Select Sex</option>
          <option value="1">Male</option>
          <option value="0">Female</option>
        </select>

        <select name="cp" value={formData.cp} onChange={handleChange} className="w-full border p-2 rounded" required>
          <option value="">Chest Pain Type</option>
          <option value="0">Typical Angina</option>
          <option value="1">Atypical Angina</option>
          <option value="2">Non-anginal Pain</option>
          <option value="3">Asymptomatic</option>
        </select>

        <select name="fbs" value={formData.fbs} onChange={handleChange} className="w-full border p-2 rounded" required>
          <option value="">Fasting Blood Sugar &gt; 120 mg/dl</option>
          <option value="1">Yes</option>
          <option value="0">No</option>
        </select>

        <select name="restecg" value={formData.restecg} onChange={handleChange} className="w-full border p-2 rounded" required>
          <option value="">Resting ECG Results</option>
          <option value="0">Normal</option>
          <option value="1">ST-T Wave Abnormality</option>
          <option value="2">Left Ventricular Hypertrophy</option>
        </select>

        <select name="exang" value={formData.exang} onChange={handleChange} className="w-full border p-2 rounded" required>
          <option value="">Exercise-Induced Angina</option>
          <option value="1">Yes</option>
          <option value="0">No</option>
        </select>

        <select name="slope" value={formData.slope} onChange={handleChange} className="w-full border p-2 rounded" required>
          <option value="">Slope of ST Segment</option>
          <option value="0">Upsloping</option>
          <option value="1">Flat</option>
          <option value="2">Downsloping</option>
        </select>

        <select name="thal" value={formData.thal} onChange={handleChange} className="w-full border p-2 rounded" required>
          <option value="">Thalassemia</option>
          <option value="1">Fixed Defect</option>
          <option value="2">Normal</option>
          <option value="3">Reversible Defect</option>
        </select>

        <div className="flex gap-4">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
            Predict
          </button>
          <button
            onClick={() => window.history.back()}
            className="bg-gray-600 text-white px-4 py-2 rounded"
          >
            Go Back
          </button>
        </div>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && <p className="mt-4 text-green-700 font-semibold">{result}</p>}
    </div>
  )
}
