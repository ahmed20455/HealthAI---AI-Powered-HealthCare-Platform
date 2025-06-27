// app/components/CancerForm.tsx

"use client"
import React, { useState } from "react"

export default function CancerForm() {
  const [formData, setFormData] = useState({
    Age: "",
    Gender: "",
    BMI: "",
    Smoking: "",
    GeneticRisk: "",
    PhysicalActivity: "",
    AlcoholIntake: "",
    CancerHistory: ""
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    for (const [key, value] of Object.entries(formData)) {
      if (value === "") {
        setError(`Please enter ${key}`)
        return
      }
      if (
        key !== "Gender" &&
        isNaN(Number(value))
      ) {
        setError(`${key} must be a number`)
        return
      }
    }

    try {
      const res = await fetch("http://127.0.0.1:5173/cancer_predict", {
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
      console.error("Error:", err)
      setError("Failed to connect to prediction server.")
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Cancer Risk Prediction</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {["Age", "BMI", "PhysicalActivity", "AlcoholIntake"].map((field) => (
          <div key={field}>
            <label className="block mb-1 font-medium">{field}</label>
            <input
              type="number"
              name={field}
              value={formData[field as keyof typeof formData]}
              onChange={handleChange}
              step="any"
              className="w-full border p-2 rounded"
              required
            />
          </div>
        ))}

        <div>
          <label className="block mb-1 font-medium">Gender</label>
          <select
            name="Gender"
            value={formData.Gender}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          >
            <option value="">Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        {["Smoking", "GeneticRisk", "CancerHistory"].map((field) => (
          <div key={field}>
            <label className="block mb-1 font-medium">{field}</label>
            <input
              type="number"
              name={field}
              value={formData[field as keyof typeof formData]}
              onChange={handleChange}
              className="w-full border p-2 rounded"
              required
            />
          </div>
        ))}

        <div className="flex gap-4">
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Predict
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="bg-gray-600 text-white px-4 py-2 rounded"
          >
            Go Back
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-100 text-green-700 rounded">{result}</div>
      )}
    </div>
  )
}
