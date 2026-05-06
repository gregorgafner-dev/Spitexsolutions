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

interface HoursDistributionChartProps {
  data: PersonalmixAnalysis[];
  title?: string;
}

export default function HoursDistributionChart({
  data,
  title = "Stunden-Verteilung",
}: HoursDistributionChartProps) {
  const chartData = data.map((item) => ({
    name: item.date.length > 20 ? item.date.substring(0, 10) : item.date,
    "A-Stunden": item.hours.aStunden,
    "B-Stunden": item.hours.bStunden,
    "C-Stunden": item.hours.cStunden,
    "HW-Stunden": item.hours.hwStunden,
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
          <Bar dataKey="A-Stunden" fill="#3b82f6" />
          <Bar dataKey="B-Stunden" fill="#10b981" />
          <Bar dataKey="C-Stunden" fill="#f59e0b" />
          <Bar dataKey="HW-Stunden" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}












