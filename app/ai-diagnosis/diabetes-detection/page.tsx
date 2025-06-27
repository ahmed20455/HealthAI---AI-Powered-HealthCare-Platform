"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"


export default function DiabetesPredictPage() {
  const [formData, setFormData] = useState({
    GENDER: "",
    AGE: "",
    UREA: "",
    CR: "",
    HBA1C: "",
    CHOL: "",
    TG: "",
    HDL: "",
    LDL: "",
    VLDL: "",
    BMI: ""
  })
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError(null)
    setResult(null)
  }

  const handleSubmit = async () => {
  // ... your validation code

  try {
    const res = await fetch("http://localhost:5000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || "Prediction error")
      setResult(null)
      return
    }

    // Save report to Supabase
    const { error: supabaseError } = await supabase
      .from("reports")
      .insert([
        {
          gender: Number(formData.GENDER),
          age: Number(formData.AGE),
          urea: Number(formData.UREA),
          cr: Number(formData.CR),
          hba1c: Number(formData.HBA1C),
          chol: Number(formData.CHOL),
          tg: Number(formData.TG),
          hdl: Number(formData.HDL),
          ldl: Number(formData.LDL),
          vldl: Number(formData.VLDL),
          bmi: Number(formData.BMI),
          prediction: data.prediction,
        },
      ])

    if (supabaseError) {
      console.error("Error saving report:", supabaseError)
      setError("Failed to save report to database.")
      return
    }

    if (data.prediction === 1) {
      setResult("🔴 Positive: Patient is likely to have diabetes.")
    } else if (data.prediction === 0) {
      setResult("🟢 Negative: Patient is NOT likely to have diabetes.")
    } else {
      setError("❌ Unexpected prediction result.")
      setResult(null)
    }
  } catch (err) {
    console.error("Prediction failed", err)
    setError("❌ Failed to get prediction.")
    setResult(null)
  }
}


  const handleGoBack = () => {
    setFormData({
      GENDER: "",
      AGE: "",
      UREA: "",
      CR: "",
      HBA1C: "",
      CHOL: "",
      TG: "",
      HDL: "",
      LDL: "",
      VLDL: "",
      BMI: ""
    })
    setResult(null)
    setError(null)
    window.history.back()
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Diabetes Prediction</h1>

      {/* Gender select dropdown */}
      <div className="mb-4">
        <label className="block mb-1 font-medium">Gender</label>
        <select
          name="GENDER"
          value={formData.GENDER}
          onChange={handleChange}
          className="w-full p-2 border rounded"
        >
          <option value="">Select Gender</option>
          <option value="1">Male</option>
          <option value="0">Female</option>
        </select>
      </div>

      {/* Other numeric inputs */}
      {Object.keys(formData)
        .filter((key) => key !== "GENDER")
        .map((key) => (
          <div key={key} className="mb-4">
            <label className="block mb-1 font-medium">{key}</label>
            <input
              type="number"
              step="any"
              name={key}
              value={formData[key as keyof typeof formData]}
              onChange={handleChange}
              className="w-full p-2 border rounded"
            />
          </div>
        ))}

      <div className="flex gap-4">
        <button
          onClick={handleSubmit}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Predict
        </button>

        <button
  onClick={() => window.history.back()}
  className="bg-gray-500 text-white px-4 py-2 rounded"
>
  Go Back
</button>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-100 text-green-700 rounded">{result}</div>
      )}
    </div>
  )
}
