import React from 'react'

interface Column<T> {
    header: string
    accessorKey: keyof T | ((row: T) => React.ReactNode)
    className?: string
}

interface DataTableProps<T> {
    columns: Column<T>[]
    data: T[]
    onRowClick?: (row: T) => void
}

export function DataTable<T>({ columns, data, onRowClick }: DataTableProps<T>) {
    return (
        <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neon-green via-blue-500 to-purple-500 opacity-30"></div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-white/5 text-gray-400 uppercase text-[10px] font-bold tracking-widest border-b border-white/10">
                        <tr>
                            {columns.map((col, idx) => (
                                <th key={idx} className={`px-6 py-4 ${col.className || ''}`}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                                    No data available
                                </td>
                            </tr>
                        ) : (
                            data.map((row, rowIdx) => (
                                <tr
                                    key={rowIdx}
                                    className={`group hover:bg-white/5 transition-all duration-200 ${onRowClick ? 'cursor-pointer hover:shadow-lg hover:translate-x-1' : ''}`}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {columns.map((col, colIdx) => (
                                        <td key={colIdx} className="px-6 py-5 text-gray-300 group-hover:text-white first:font-bold">
                                            {typeof col.accessorKey === 'function'
                                                ? col.accessorKey(row)
                                                : (row[col.accessorKey] as React.ReactNode)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
