"use client"

import { useState } from "react"

export default function KidneyPredictPage() {
  const [formData, setFormData] = useState({
    gravity: "",
    ph: "",
    osmo: "",
    cond: "",
    urea: "",
    calc: ""
  })

  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError(null)
    setResult(null)
  }

  const handleSubmit = async () => {
    // Validate
    for (const [key, val] of Object.entries(formData)) {
      if (val === "") {
        setError(`Please enter ${key}`)
        return
      }
      if (isNaN(Number(val))) {
        setError(`${key} must be a number`)
        return
      }
    }

    try {
      const res = await fetch("http://localhost:5001/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Prediction failed")
        return
      }

      if (data.prediction === 1) {
        setResult("🔴 Positive: Kidney Stone Detected.")
      } else if (data.prediction === 0) {
        setResult("🟢 Negative: No Kidney Stone Detected.")
      } else {
        setError("Unexpected prediction result.")
      }
    } catch (err) {
      console.error("Error:", err)
      setError("Failed to connect to prediction server.")
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Kidney Stone Prediction</h1>

      {Object.keys(formData).map((key) => (
        <div key={key} className="mb-4">
          <label className="block mb-1 font-medium capitalize">{key}</label>
          <input
            type="number"
            name={key}
            value={formData[key as keyof typeof formData]}
            onChange={handleChange}
            step="any"
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
          className="bg-gray-600 text-white px-4 py-2 rounded"
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
