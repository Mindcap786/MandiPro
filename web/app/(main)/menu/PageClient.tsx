"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { isNativePlatform } from "@/lib/capacitor-utils";
import { NativeMenuApp } from "@/components/mobile/NativeMenuApp";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MenuPage() {
    const router = useRouter();

    useEffect(() => {
        if (!isNativePlatform()) {
            router.replace("/dashboard");
        }
    }, [router]);

    if (!isNativePlatform()) return null;

    return (
        <ProtectedRoute>
            <NativeMenuApp />
        </ProtectedRoute>
    );
}
