"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { OverheadRatio } from "@/lib/szs-admin/cockpit/types";

interface OverheadRatioChartProps {
  data: OverheadRatio;
  title?: string;
}

const COLORS = ["#3b82f6", "#ef4444"];

export default function OverheadRatioChart({
  data,
  title = "Overhead-Verhältnis",
}: OverheadRatioChartProps) {
  const chartData = [
    { name: "Produktive FTA", value: data.productiveFTA },
    { name: "Overhead FTA", value: data.overheadFTA },
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          Verhältnis: <span className="font-semibold">{data.ratio.toFixed(1)}%</span>
        </p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) =>
              `${name}: ${(percent * 100).toFixed(0)}%`
            }
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}












