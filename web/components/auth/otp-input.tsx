'use client'

import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface OTPInputProps {
    length?: number;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    error?: boolean;
}

export function OTPInput({ length = 6, value, onChange, disabled, error }: OTPInputProps) {
    const [otp, setOtp] = useState<string[]>(new Array(length).fill(""))
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    // Update internal state if value prop changes
    useEffect(() => {
        const valArr = value.split("").slice(0, length)
        const newOtp = [...new Array(length)].map((_, i) => valArr[i] || "")
        setOtp(newOtp)
    }, [value, length])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const val = e.target.value
        if (isNaN(Number(val))) return

        const newOtp = [...otp]
        // Get only the last character (in case of multiple chars pasted)
        newOtp[index] = val.substring(val.length - 1)
        setOtp(newOtp)
        onChange(newOtp.join(""))

        // Move to next input
        if (val && index < length - 1) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault()
        const data = e.clipboardData.getData("text").slice(0, length)
        if (!/^\d+$/.test(data)) return

        const newOtp = [...otp]
        data.split("").forEach((char, i) => {
            newOtp[i] = char
        })
        setOtp(newOtp)
        onChange(newOtp.join(""))
        
        // Focus the last filled input or the next empty one
        const nextIndex = Math.min(data.length, length - 1)
        inputRefs.current[nextIndex]?.focus()
    }

    return (
        <div className="flex gap-2.5 sm:gap-4 justify-between" onPaste={handlePaste}>
            {otp.map((digit, index) => (
                <input
                    key={index}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{1}"
                    maxLength={1}
                    value={digit}
                    disabled={disabled}
                    ref={(el) => { inputRefs.current[index] = el }}
                    onChange={(e) => handleChange(e, index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    className={cn(
                        "w-full aspect-square sm:w-14 sm:h-14 text-center text-2xl font-black rounded-xl border-2 transition-all outline-none",
                        digit 
                            ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm" 
                            : "border-[#c8d6b0] bg-white text-gray-500 hover:border-emerald-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10",
                        error && "border-red-500 bg-red-50 text-red-900",
                        disabled && "opacity-50 cursor-not-allowed bg-gray-50 border-gray-200"
                    )}
                />
            ))}
        </div>
    )
}
