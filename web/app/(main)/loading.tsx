'use client'

import React from 'react'

export default function Loading() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
      {/* Top Progress Bar */}
      <div className="h-1 w-full bg-emerald-100/30 overflow-hidden">
        <div className="h-full bg-emerald-600 w-full origin-left animate-progress-fast shadow-[0_0_10px_rgba(5,150,105,0.4)]"></div>
      </div>
      
      {/* Subtle Full-page Overlay (non-blocking) */}
      <div className="fixed inset-0 bg-white/5 backdrop-blur-[1px] animate-fade-in pointer-events-none"></div>

      <style jsx>{`
        @keyframes progress-fast {
          0% { transform: scaleX(0); }
          50% { transform: scaleX(0.7); }
          100% { transform: scaleX(1); opacity: 0; }
        }
        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .animate-progress-fast {
          animation: progress-fast 0.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
