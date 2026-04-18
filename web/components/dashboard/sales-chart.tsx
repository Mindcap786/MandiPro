import { useEffect, useState } from 'react'
import {
    Area,
    AreaChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"

interface SalesChartProps {
    data: { date: string; total: number }[]
}

export function SalesChart({ data }: SalesChartProps) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    if (!mounted) return <div className="h-[300px] w-full bg-slate-50/50 animate-pulse rounded-xl" />

    if (!data || data.length === 0) {
        return <div className="text-slate-400 font-bold text-center py-10 uppercase text-xs tracking-widest">No sales data available.</div>
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0C831F" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#0C831F" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        fontSize={10}
                        fontWeight={700}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                    />
                    <YAxis
                        stroke="#64748b"
                        fontSize={10}
                        fontWeight={700}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `₹${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "#fff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "12px",
                            padding: "12px",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                            color: "#1e293b"
                        }}
                        itemStyle={{ color: "#0C831F", fontWeight: 800 }}
                        labelStyle={{ fontWeight: 800, marginBottom: "4px", color: "#64748b" }}
                        formatter={(value: number) => [`₹${value.toLocaleString()}`, "Sales"]}
                    />
                    <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#0C831F"
                        strokeWidth={4}
                        fillOpacity={1}
                        fill="url(#colorTotal)"
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
