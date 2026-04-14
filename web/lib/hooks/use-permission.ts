'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { Permission, hasPermission, Role } from '@/lib/rbac/definitions';

export function usePermission() {
    const { profile } = useAuth();

    // Default to 'viewer' if role is missing/invalid to be safe
    const role = (profile?.role || 'viewer') as Role;

    const can = (permission: Permission) => {
        return hasPermission(role, permission);
    };

    const is = (checkRole: Role) => {
        return role === checkRole;
    };

    return {
        role,
        can,
        is,
        isLoading: !profile
    };
}
