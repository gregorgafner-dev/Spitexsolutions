"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { PersonalmixAnalysis } from "@/lib/szs-admin/cockpit/types";

interface PersonalmixChartProps {
  data: PersonalmixAnalysis[];
  title?: string;
}

export default function PersonalmixChart({
  data,
  title = "Personalmix-Verteilung",
}: PersonalmixChartProps) {
  const chartData = data.map((item) => ({
    name: item.date.length > 20 ? item.date.substring(0, 10) : item.date,
    Diplomiert: item.categories.diplomiert,
    Fachangestellt: item.categories.fachangestellt,
    Pflegehelfend: item.categories.pflegehelfend,
    "Ohne Ausbildung": item.categories.ohneAusbildung,
    Overhead: item.categories.overhead,
  }));

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="Diplomiert" stackId="a" fill="#3b82f6" />
          <Bar dataKey="Fachangestellt" stackId="a" fill="#10b981" />
          <Bar dataKey="Pflegehelfend" stackId="a" fill="#f59e0b" />
          <Bar dataKey="Ohne Ausbildung" stackId="a" fill="#ef4444" />
          <Bar dataKey="Overhead" stackId="a" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}












