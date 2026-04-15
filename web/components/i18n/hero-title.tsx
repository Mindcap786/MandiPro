"use client"

import React from 'react'
import { cn } from '@/lib/utils'

interface HeroTitleProps {
    text: string
    className?: string
    gradientClassName?: string
}

/**
 * HeroTitle Component
 * Parses a string with a <g>...</g> tag and applies a gradient to the tagged portion.
 * Example: "The Global OS for <g>Modern Mandis</g>"
 */
export function HeroTitle({ text, className, gradientClassName }: HeroTitleProps) {
    // Regex to split by <g> and </g> and capture the content
    const parts = text.split(/<g>(.*?)<\/g>/g);

    return (
        <h1 className={cn("text-5xl lg:text-7xl font-black tracking-tighter leading-[1.1]", className)}>
            {parts.map((part, index) => {
                // Every odd index (1, 3, 5...) is a captured group (the gradient part)
                if (index % 2 === 1) {
                    return (
                        <span 
                            key={index} 
                            className={cn(
                                "text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-500", 
                                gradientClassName
                            )}
                        >
                            {part}
                        </span>
                    );
                }
                
                // Even indices are plain text. Handle \n for line breaks.
                return (
                    <React.Fragment key={index}>
                        {part.split('\n').map((line, i) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < part.split('\n').length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </React.Fragment>
                );
            })}
        </h1>
    );
}
