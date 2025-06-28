"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Plus, Save, AlertTriangle, Activity } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:5000";

interface Patient {
  id: string;
  name: string;
}

export default function DoctorAppointmentsPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string>("")
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(undefined)
  const [appointmentTime, setAppointmentTime] = useState("")
  const [appointmentType, setAppointmentType] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const user = localStorage.getItem("healthai_user");
    if (!user) {
      router.push("/auth/login");
    } else {
      const parsedUser = JSON.parse(user);
      if (parsedUser.role !== "doctor") {
        setError("Access Denied: Only doctors can schedule appointments.");
        return;
      }
      fetchPatients(parsedUser.token);
    }
  }, [router]);

  const fetchPatients = async (token: string) => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/patients`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch patients.");
      }

      const data = await res.json();
      if (data.success) {
        setPatients(data.patients);
      } else {
        throw new Error(data.error || "Failed to retrieve patients.");
      }
    } catch (err: any) {
      console.error("Error fetching patients:", err);
      setError(err.message || "Failed to load patients for selection.");
      toast({
        title: "Error",
        description: err.message || "Failed to load patients.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPatientId || !appointmentDate || !appointmentTime || !appointmentType) {
      setError("Please fill in all required appointment fields.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const user = localStorage.getItem("healthai_user");
      const token = user ? JSON.parse(user).token : null;

      if (!token) {
        setError("Authentication required. Please log in.");
        setLoading(false);
        router.push("/auth/login");
        return;
      }

      const formattedDate = format(appointmentDate, "yyyy-MM-dd");
      const appointmentDateTime = `${formattedDate} ${appointmentTime}:00`; // Assuming time is HH:MM

      const res = await fetch(`${BACKEND_API_URL}/api/consultations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          time: appointmentDateTime, // Send combined date and time
          type: appointmentType,
          description: description,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to schedule appointment.");
      }

      const data = await res.json();
      if (data.success) {
        toast({
          title: "Success",
          description: "Appointment scheduled successfully!",
          variant: "default",
        });
        // Clear form
        setSelectedPatientId("");
        setAppointmentDate(undefined);
        setAppointmentTime("");
        setAppointmentType("");
        setDescription("");
      } else {
        throw new Error(data.error || "Failed to schedule appointment.");
      }
    } catch (err: any) {
      console.error("Error scheduling appointment:", err);
      setError(err.message || "An unexpected error occurred while scheduling appointment.");
      toast({
        title: "Error",
        description: err.message || "Failed to schedule appointment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
        <div className="bg-green-100 p-3 rounded-lg">
          <Calendar className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Schedule Appointment</h1>
          <p className="text-gray-600 mt-2">
            Set up new consultations with your patients.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appointment Details</CardTitle>
          <CardDescription>Fill in the details for the new appointment.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patient-select">Patient *</Label>
                <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                  <SelectTrigger id="patient-select">
                    <SelectValue placeholder="Select a patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.length > 0 ? (
                      patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>No patients found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-date">Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !appointmentDate && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {appointmentDate ? format(appointmentDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={appointmentDate}
                      onSelect={(date) => setAppointmentDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-time">Time *</Label>
                <Input
                  id="appointment-time"
                  type="time"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-type">Appointment Type *</Label>
                <Input
                  id="appointment-type"
                  placeholder="e.g., Consultation, Follow-up"
                  value={appointmentType}
                  onChange={(e) => setAppointmentType(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Any specific notes for the appointment..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <> <Activity className="h-4 w-4 mr-2 animate-spin" /> Scheduling...</>
              ) : (
                <> <Plus className="h-4 w-4 mr-2" /> Schedule Appointment</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
