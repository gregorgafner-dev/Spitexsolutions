"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Employee, EmployeeStatus, EmployeeCategory } from "@/lib/szs-admin/cockpit/types";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";
import { BERUFSGRUPPEN } from "@/lib/szs-admin/cockpit/constants/berufsgruppen";

interface EmployeeFormData {
  name: string;
  team: string;
  berufsgruppe: string;
  status: EmployeeStatus;
  category: EmployeeCategory;
  fta: number;
}

export default function EmployeeForm() {
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EmployeeFormData>();

  const onSubmit = (data: EmployeeFormData) => {
    const employee: Employee = {
      id: `emp-${Date.now()}`,
      ...data,
    };

    dataStore.addEmployee(employee);
    setSuccess(true);
    reset();
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4 text-gray-900">Mitarbeiter hinzufügen</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            {...register("name", { required: "Name ist erforderlich" })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Team
          </label>
          <input
            {...register("team", { required: "Team ist erforderlich" })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
          {errors.team && (
            <p className="text-red-500 text-sm mt-1">{errors.team.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Berufsgruppe
          </label>
          <select
            {...register("berufsgruppe", {
              required: "Berufsgruppe ist erforderlich",
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="">Bitte wählen...</option>
            {BERUFSGRUPPEN.map((bg) => (
              <option key={bg} value={bg}>
                {bg}
              </option>
            ))}
          </select>
          {errors.berufsgruppe && (
            <p className="text-red-500 text-sm mt-1">
              {errors.berufsgruppe.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            {...register("status", { required: "Status ist erforderlich" })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="produktiv">Produktiv</option>
            <option value="overhead">Overhead</option>
          </select>
          {errors.status && (
            <p className="text-red-500 text-sm mt-1">{errors.status.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Kategorie
          </label>
          <select
            {...register("category", {
              required: "Kategorie ist erforderlich",
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="diplomiert">Diplomiert</option>
            <option value="fachangestellt">Fachangestellt</option>
            <option value="pflegehelfend">Pflegehelfend</option>
            <option value="ohne_ausbildung">Ohne Ausbildung</option>
            <option value="overhead">Overhead</option>
          </select>
          {errors.category && (
            <p className="text-red-500 text-sm mt-1">
              {errors.category.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            FTA (Full Time Equivalent)
          </label>
          <input
            type="number"
            step="0.1"
            {...register("fta", {
              required: "FTA ist erforderlich",
              min: { value: 0, message: "FTA muss >= 0 sein" },
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
          {errors.fta && (
            <p className="text-red-500 text-sm mt-1">{errors.fta.message}</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition"
        >
          Mitarbeiter hinzufügen
        </button>

        {success && (
          <p className="text-green-600 text-sm text-center">
            Mitarbeiter erfolgreich hinzugefügt!
          </p>
        )}
      </form>
    </div>
  );
}

