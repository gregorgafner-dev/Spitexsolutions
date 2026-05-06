"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { TimeEntry } from "@/lib/szs-admin/cockpit/types";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";

interface TimeEntryFormData {
  employeeId: string;
  date: string;
  aStunden: number;
  bStunden: number;
  cStunden: number;
  hwStunden: number;
}

export default function TimeEntryForm() {
  const [success, setSuccess] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEmployees(dataStore.getEmployees());
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<TimeEntryFormData>({
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
    },
  });

  const onSubmit = (data: TimeEntryFormData) => {
    const timeEntry: TimeEntry = {
      id: `te-${Date.now()}`,
      ...data,
    };

    dataStore.addTimeEntry(timeEntry);
    setSuccess(true);
    reset({
      date: new Date().toISOString().split("T")[0],
      aStunden: 0,
      bStunden: 0,
      cStunden: 0,
      hwStunden: 0,
    });
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4 text-gray-900">Zeiterfassung hinzufügen</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mitarbeiter
          </label>
          <select
            {...register("employeeId", {
              required: "Mitarbeiter ist erforderlich",
            })}
            disabled={!mounted}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100"
          >
            <option value="">Bitte wählen...</option>
            {mounted && employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.team})
              </option>
            ))}
          </select>
          {errors.employeeId && (
            <p className="text-red-500 text-sm mt-1">
              {errors.employeeId.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Datum
          </label>
          <input
            type="date"
            {...register("date", { required: "Datum ist erforderlich" })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
          {errors.date && (
            <p className="text-red-500 text-sm mt-1">{errors.date.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              A-Stunden
            </label>
            <input
              type="number"
              step="0.1"
              {...register("aStunden", {
                required: "A-Stunden sind erforderlich",
                min: { value: 0, message: "Muss >= 0 sein" },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            {errors.aStunden && (
              <p className="text-red-500 text-sm mt-1">
                {errors.aStunden.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              B-Stunden
            </label>
            <input
              type="number"
              step="0.1"
              {...register("bStunden", {
                required: "B-Stunden sind erforderlich",
                min: { value: 0, message: "Muss >= 0 sein" },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            {errors.bStunden && (
              <p className="text-red-500 text-sm mt-1">
                {errors.bStunden.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              C-Stunden
            </label>
            <input
              type="number"
              step="0.1"
              {...register("cStunden", {
                required: "C-Stunden sind erforderlich",
                min: { value: 0, message: "Muss >= 0 sein" },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            {errors.cStunden && (
              <p className="text-red-500 text-sm mt-1">
                {errors.cStunden.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              HW-Stunden
            </label>
            <input
              type="number"
              step="0.1"
              {...register("hwStunden", {
                required: "HW-Stunden sind erforderlich",
                min: { value: 0, message: "Muss >= 0 sein" },
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            {errors.hwStunden && (
              <p className="text-red-500 text-sm mt-1">
                {errors.hwStunden.message}
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition"
        >
          Zeiterfassung hinzufügen
        </button>

        {success && (
          <p className="text-green-600 text-sm text-center">
            Zeiterfassung erfolgreich hinzugefügt!
          </p>
        )}
      </form>
    </div>
  );
}

