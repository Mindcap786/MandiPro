'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermission as useAdvancedPermission } from '@/hooks/use-permission';
import { Permission, hasPermission, Role } from '@/lib/rbac/definitions';
import { useAuth } from '@/components/auth/auth-provider';
import { Loader2, ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredPermission?: Permission;
    // Optional: also allow if a specific nav key is granted in the matrix
    navKey?: string;
}

// Map permission types to relevant nav keys for matrix-based access
const PERMISSION_TO_NAV_KEY: Partial<Record<Permission, string>> = {
    manage_settings: 'nav.settings',
    manage_users: 'nav.master_data',
    view_financials: 'nav.finance',
    view_reports: 'nav.finance',
    conduct_sales: 'nav.sales',
    manage_inventory: 'nav.inventory',
};

export function ProtectedRoute({ children, requiredPermission, navKey }: ProtectedRouteProps) {
    const { profile, loading: authLoading } = useAuth();
    const { can: canMatrix, loading: matrixLoading } = useAdvancedPermission();
    const router = useRouter();

    const role = (profile?.role || 'viewer') as Role;
    const isLoading = authLoading || matrixLoading;

    // Check 1: Role-based permission (classic check)
    const hasRolePerm = requiredPermission ? hasPermission(role, requiredPermission) : true;

    // Check 2: Matrix-based nav access (respects rbac_matrix grants)
    const mappedNavKey = navKey || PERMISSION_TO_NAV_KEY[requiredPermission];
    const hasMatrixAccess = mappedNavKey ? canMatrix(mappedNavKey) : false;

    // Grant access if EITHER role allows it OR matrix explicitly allows the nav key
    const isAllowed = hasRolePerm || hasMatrixAccess;

    useEffect(() => {
        if (!isLoading && !isAllowed) {
            // router.push('/');
        }
    }, [isLoading, isAllowed, router]);

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 text-[#0C831F] animate-spin" />
            </div>
        );
    }

    if (!isAllowed) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                    <ShieldAlert className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-2xl font-black uppercase tracking-tight">Access Denied</h1>
                    <p className="text-slate-500 font-medium max-w-sm mx-auto">
                        Your account does not have permission to view this page.
                        {role !== 'viewer' && (
                            <span className="block text-xs mt-1 text-slate-400">Role: <span className="font-bold uppercase">{role}</span></span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => router.back()}
                    className="px-6 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all"
                >
                    Go Back
                </button>
            </div>
        );
    }

    return <>{children}</>;
}
