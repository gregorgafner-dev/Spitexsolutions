"use client";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: "blue" | "green" | "red" | "yellow";
}

export default function KPICard({
  title,
  value,
  subtitle,
  trend,
  color = "blue",
}: KPICardProps) {
  const colorClasses = {
    blue: "bg-blue-50 border-blue-200",
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    yellow: "bg-yellow-50 border-yellow-200",
  };

  const valueColorClasses = {
    blue: "text-blue-600",
    green: "text-green-600",
    red: "text-red-600",
    yellow: "text-yellow-600",
  };

  return (
    <div
      className={`p-6 rounded-lg border-2 ${colorClasses[color]} shadow-sm`}
    >
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <div className="flex items-baseline justify-between">
        <p className={`text-3xl font-bold ${valueColorClasses[color]}`}>
          {typeof value === "number" ? value.toFixed(1) : value}
          {typeof value === "number" && title.includes("%") && "%"}
        </p>
        {trend && (
          <span
            className={`text-sm font-medium ${
              trend.isPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-sm text-gray-500 mt-2">{subtitle}</p>
      )}
    </div>
  );
}












