'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { hasPermission } from '@/lib/rbac/definitions'
import { MenuItem } from '@/lib/rbac/menus'

// Simple hash to detect profile.rbac_matrix changes and bust the employee cache
function hashMatrix(matrix: any): string {
    if (!matrix) return '';
    try { return JSON.stringify(Object.keys(matrix).sort().map(k => `${k}:${matrix[k]}`)); } 
    catch { return ''; }
}

export function usePermission() {
    const { profile } = useAuth()
    const [employee, setEmployee] = useState<any>(null)
    const [isImpersonating, setIsImpersonating] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setIsImpersonating(localStorage.getItem('mandi_impersonation_mode') === 'true')
        
        async function loadRBAC() {
            const email = (profile as any)?.email;
            const orgId = profile?.organization_id;
            
            if (email && orgId) {
                const cacheKey = `mandi_employee_rbac_${email}`;
                // Use the profile's current rbac_matrix as a version fingerprint.
                // If the admin updated permissions, the profile matrix changes → cache is busted.
                const profileMatrixHash = hashMatrix((profile as any)?.rbac_matrix);

                const cachedData = localStorage.getItem(cacheKey);
                if (cachedData) {
                    try {
                        const parsed = JSON.parse(cachedData);
                        const cacheIsValid =
                            parsed.email === email &&
                            parsed.orgId === orgId &&
                            parsed.profileMatrixHash === profileMatrixHash; // ← cache-busting key
                        if (cacheIsValid) {
                            setEmployee(parsed.data);
                            setLoading(false);
                            return; // ← SKIP REFETCH when cache is valid
                        } else {
                            // Permissions were updated — clear stale cache
                            localStorage.removeItem(cacheKey);
                        }
                    } catch (e) {
                        localStorage.removeItem(cacheKey);
                    }
                }

                // Only fetch from Supabase if cache is invalid or missing
                try {
                    const { supabase } = await import('@/lib/supabaseClient')
                    const { data, error } = await supabase
                        .schema('mandi')
                        .from('employees')
                        .select('rbac_matrix')
                        .eq('email', email)
                        .maybeSingle()

                    if (!error && data) {
                        setEmployee(data)
                        // Store cache with the profile matrix hash as version key
                        localStorage.setItem(cacheKey, JSON.stringify({ email, orgId, profileMatrixHash, data }));
                    }
                } catch (err) {
                    console.error("[RBAC] Load failed:", err)
                }
            }
            setLoading(false)
        }

        loadRBAC()
    }, [profile])

    const can = (item: MenuItem | string | any): boolean => {
        const tKey = typeof item === 'string' ? item : item?.tKey;
        const menuItem = typeof item === 'string' ? null : item;

        if (isImpersonating) return true;

        const role = profile?.role;
        const isSuperAdmin = role === 'super_admin';
        const isMandiAdmin = role === 'tenant_admin' || role === 'owner' || role === 'admin' || role === 'company_admin';

        // 1. Admins get access to everything by default
        //    still subject to explicit org-level matrix blocks.
        //    NOTE: Field Governance is given by default to tenant admins regardless of legacy orgMatrix false flags.
        if (isMandiAdmin) {
            const orgMatrix = (profile?.organization as any)?.rbac_matrix || {};
            if (orgMatrix[tKey] === false && tKey !== 'nav.field_governance') return false;
            return true;
        }

        // 2. Module Level filtering (only applies to non-admin users)
        if (menuItem?.module && profile?.organization?.enabled_modules) {
            const enabled = profile.organization.enabled_modules;
            if (!enabled.includes(menuItem.module)) {
                if (menuItem.module === 'finance' && (enabled.includes('mandi') || enabled.includes('wholesale'))) {
                    // allow common finance items even if 'finance' module not explicitly listed
                } else {
                    return false;
                }
            }
        }

        // 3. Matrix Overrides — deny if ANY level has explicit false
        const orgMatrix = (profile?.organization as any)?.rbac_matrix || {};
        const profileMatrix = (profile as any)?.rbac_matrix || {};
        const employeeMatrix = employee?.rbac_matrix || {};
        
        if (tKey) {
            if (orgMatrix[tKey] === false || profileMatrix[tKey] === false || employeeMatrix[tKey] === false) {
                return false;
            }
        }

        if (isSuperAdmin) return true;

        // 5. Role-based permission check for menu items with explicit permission requirements
        if (menuItem) {
            const permissionOk = !menuItem.permission || hasPermission(role, menuItem.permission as any);
            if (!permissionOk) return false;

            const domainOk = !menuItem.domain || profile?.business_domain === menuItem.domain;
            return domainOk;
        }

        return true;
    }

    return { can, employee, isImpersonating, profile, loading };
}
