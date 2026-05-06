"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { TargetValue, TargetLevel } from "@/lib/szs-admin/cockpit/types";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";
import { BERUFSGRUPPEN } from "@/lib/szs-admin/cockpit/constants/berufsgruppen";

interface TargetValueFormData {
  level: TargetLevel;
  identifier: string;
  startDate: string;
  endDate: string;
  targetHours: number;
}

export default function TargetValueForm() {
  const [success, setSuccess] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEmployees(dataStore.getEmployees());
  }, []);

  const teams = Array.from(new Set(employees.map((e) => e.team)));
  // Verwende vordefinierte Berufsgruppen
  const berufsgruppen = BERUFSGRUPPEN;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<TargetValueFormData>();

  const level = watch("level");

  const getIdentifierOptions = () => {
    switch (level) {
      case "mitarbeiter":
        return employees.map((e) => ({ value: e.id, label: e.name }));
      case "team":
        return teams.map((t) => ({ value: t, label: t }));
      case "berufsgruppe":
        return berufsgruppen.map((bg) => ({ value: bg, label: bg }));
      case "betrieb":
        return [{ value: "betrieb", label: "Gesamter Betrieb" }];
      default:
        return [];
    }
  };

  const onSubmit = (data: TargetValueFormData) => {
    const targetValue: TargetValue = {
      id: `tv-${Date.now()}`,
      ...data,
    };

    dataStore.addTargetValue(targetValue);
    setSuccess(true);
    reset();
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4 text-gray-900">Zielwert hinzufügen</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ebene
          </label>
          <select
            {...register("level", { required: "Ebene ist erforderlich" })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="mitarbeiter">Mitarbeiter</option>
            <option value="team">Team</option>
            <option value="berufsgruppe">Berufsgruppe</option>
            <option value="betrieb">Betrieb</option>
          </select>
          {errors.level && (
            <p className="text-red-500 text-sm mt-1">{errors.level.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {level === "mitarbeiter"
              ? "Mitarbeiter"
              : level === "team"
              ? "Team"
              : level === "berufsgruppe"
              ? "Berufsgruppe"
              : "Betrieb"}
          </label>
          <select
            {...register("identifier", {
              required: "Auswahl ist erforderlich",
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100"
            disabled={level === "betrieb" || !mounted}
          >
            <option value="">
              {level === "betrieb" ? "Gesamter Betrieb" : "Bitte wählen..."}
            </option>
            {mounted && getIdentifierOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.identifier && (
            <p className="text-red-500 text-sm mt-1">
              {errors.identifier.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Startdatum
            </label>
            <input
              type="date"
              {...register("startDate", {
                required: "Startdatum ist erforderlich",
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            {errors.startDate && (
              <p className="text-red-500 text-sm mt-1">
                {errors.startDate.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enddatum
            </label>
            <input
              type="date"
              {...register("endDate", {
                required: "Enddatum ist erforderlich",
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            {errors.endDate && (
              <p className="text-red-500 text-sm mt-1">
                {errors.endDate.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Zielstunden
          </label>
          <input
            type="number"
            step="0.1"
            {...register("targetHours", {
              required: "Zielstunden sind erforderlich",
              min: { value: 0, message: "Muss >= 0 sein" },
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
          {errors.targetHours && (
            <p className="text-red-500 text-sm mt-1">
              {errors.targetHours.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition"
        >
          Zielwert hinzufügen
        </button>

        {success && (
          <p className="text-green-600 text-sm text-center">
            Zielwert erfolgreich hinzugefügt!
          </p>
        )}
      </form>
    </div>
  );
}

