'use client'

import { motion } from 'framer-motion'

export function SettingsSkeleton() {
    return (
        <div className="min-h-screen bg-slate-50 p-8 pb-32 animate-pulse">
            <div className="max-w-6xl mx-auto space-y-12">
                {/* Header Skeleton */}
                <header className="flex flex-col md:flex-row justify-between items-end gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="space-y-3 w-full md:w-1/2">
                        <div className="h-10 bg-slate-100 rounded-xl w-3/4" />
                        <div className="h-4 bg-slate-50 rounded-lg w-1/2" />
                    </div>
                    <div className="flex gap-4 w-full md:w-auto">
                        <div className="h-12 bg-slate-100 rounded-xl w-32" />
                        <div className="h-12 bg-slate-100 rounded-xl w-32" />
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {/* Form Skeleton */}
                    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                        <div className="h-4 bg-slate-50 rounded w-1/4 mb-4" />
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="h-3 bg-slate-50 rounded w-20" />
                                <div className="h-14 bg-slate-50 rounded-2xl w-full" />
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <div className="h-3 bg-slate-50 rounded w-20" />
                                    <div className="h-12 bg-slate-50 rounded-xl w-full" />
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 bg-slate-50 rounded w-20" />
                                    <div className="h-12 bg-slate-50 rounded-xl w-full" />
                                </div>
                            </div>
                        </div>
                        <div className="h-14 bg-slate-900 rounded-2xl w-full opacity-20" />
                    </div>

                    {/* Security Skeleton */}
                    <div className="p-8 bg-white border border-slate-200 rounded-[32px] shadow-sm space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                            <div className="space-y-2">
                                <div className="h-4 bg-slate-100 rounded w-24" />
                                <div className="h-3 bg-slate-50 rounded w-32" />
                            </div>
                            <div className="ml-auto w-14 h-7 bg-slate-100 rounded-full" />
                        </div>
                        <div className="h-20 bg-slate-50 rounded-2xl w-full" />
                    </div>
                </div>
            </div>
        </div>
    )
}
