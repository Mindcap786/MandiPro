export type Role = 'owner' | 'manager' | 'accountant' | 'operator' | 'viewer' | 'admin' | 'super_admin' | 'tenant_admin' | 'member' | 'company_admin';

export type Permission =
    | 'manage_organization' // Full control
    | 'manage_users'        // Invite/Remove users
    | 'manage_settings'     // Financial settings
    | 'view_financials'     // P&L, Ledgers
    | 'edit_financials'     // Post manual journal entries
    | 'view_reports'        // Day book, Stock reports
    | 'conduct_sales'       // Create sales
    | 'manage_inventory'    // Gate entry, stock adjustment
    | 'delete_records';     // Hard delete (rare)

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    tenant_admin: [
        'manage_organization',
        'manage_users',
        'manage_settings',
        'view_financials',
        'edit_financials',
        'view_reports',
        'conduct_sales',
        'manage_inventory',
        'delete_records'
    ],
    super_admin: [
        'manage_organization',
        'manage_users',
        'manage_settings',
        'view_financials',
        'edit_financials',
        'view_reports',
        'conduct_sales',
        'manage_inventory',
        'delete_records'
    ],
    owner: [
        'manage_organization',
        'manage_users',
        'manage_settings',
        'view_financials',
        'edit_financials',
        'view_reports',
        'conduct_sales',
        'manage_inventory',
        'delete_records'
    ],
    // Admin is effectively an owner alias in some contexts, but let's keep it separate if needed.
    // For now, map 'admin' (which is the legacy string often used) to owner-like permissions.
    admin: [
        'manage_organization',
        'manage_users',
        'manage_settings',
        'view_financials',
        'edit_financials',
        'view_reports',
        'conduct_sales',
        'manage_inventory',
        'delete_records'
    ],
    member: [
        'manage_settings',
        'view_financials',
        'edit_financials',
        'view_reports',
        'conduct_sales',
        'manage_inventory'
    ],
    manager: [
        'view_financials', // Read-only financials
        'view_reports',
        'conduct_sales',
        'manage_inventory'
    ],
    accountant: [
        'manage_settings', // Often needs to set tax rates
        'view_financials',
        'edit_financials',
        'view_reports'
    ],
    operator: [
        'conduct_sales',
        'manage_inventory',
        'view_reports' // Can see stock reports
    ],
    viewer: [
        'view_reports',
        'view_financials' // Maybe? Let's say yes for now, usually investors.
    ],
    company_admin: [
        'manage_organization',
        'manage_users',
        'manage_settings',
        'view_financials',
        'edit_financials',
        'view_reports',
        'conduct_sales',
        'manage_inventory',
        'delete_records'
    ]
};

export function hasPermission(role: Role | string | undefined, permission: Permission): boolean {
    if (!role) return false;
    // Normalize role string just in case
    const normalizedRole = role.toLowerCase() as Role;
    const permissions = ROLE_PERMISSIONS[normalizedRole];
    return permissions?.includes(permission) || false;
}
