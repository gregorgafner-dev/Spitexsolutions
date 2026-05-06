"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ProductivityResult } from "@/lib/szs-admin/cockpit/types";

interface ProductivityChartProps {
  data: ProductivityResult[];
  title?: string;
}

export default function ProductivityChart({
  data,
  title = "Produktivitäts-Trend",
}: ProductivityChartProps) {
  const chartData = data.map((item) => ({
    name: item.identifier,
    Produktivität: item.productivity,
    "Ist-Stunden": item.actualHours,
    "Ziel-Stunden": item.targetHours,
  }));

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="Produktivität"
            stroke="#3b82f6"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="Ist-Stunden"
            stroke="#10b981"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="Ziel-Stunden"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}












