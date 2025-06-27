"use client"

import { useState } from "react"

export default function ConditionForm() {
  const [formData, setFormData] = useState({
    age: "",
    gender: "",
    smoking_status: "",
    bmi: "",
    blood_pressure: "",
    glucose_levels: ""
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
      const res = await fetch("http://localhost:5002/predict_condition", {
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
      <h1 className="text-2xl font-bold mb-4">Medical Condition Prediction</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: "Age", name: "age" },
          { label: "BMI", name: "bmi" },
          { label: "Blood Pressure", name: "blood_pressure" },
          { label: "Glucose Levels", name: "glucose_levels" }
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

        <select
          name="gender"
          value={formData.gender}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          required
        >
          <option value="">Select Gender</option>
          <option value="1">Male</option>
          <option value="0">Female</option>
        </select>

        <select
          name="smoking_status"
          value={formData.smoking_status}
          onChange={handleChange}
          className="w-full border p-2 rounded"
          required
        >
          <option value="">Smoking Status</option>
          <option value="1">Smoker</option>
          <option value="0">Non-Smoker</option>
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
