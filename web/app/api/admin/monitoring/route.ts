import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'monitoring', 'read');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const [healthRes, alertsRes, orgCountRes] = await Promise.allSettled([
        // Platform-wide health summary
        supabaseAdmin.rpc('get_platform_health_summary'),
        // Recent unresolved Platform alerts (last 24h)
        supabaseAdmin.schema('core').from('system_alerts')
            .select('id, alert_type, severity, message, domain, organization_id, created_at')
            .eq('is_resolved', false)
            .is('organization_id', null) // Only fetch platform-level alerts, exclude tenant-specific alerts
            .order('created_at', { ascending: false })
            .limit(20),
        // Tenant breakdown
        supabaseAdmin.schema('core').from('organizations')
            .select('status', { count: 'exact' }),
    ]);

    const health = healthRes.status === 'fulfilled' ? healthRes.value.data : null;
    const alerts = alertsRes.status === 'fulfilled' ? (alertsRes.value.data || []) : [];

    // Group active alerts by severity for dashboard widgets
    const critical = alerts.filter((a: any) => a.severity === 'critical');
    const warnings = alerts.filter((a: any) => a.severity === 'warning');

    return NextResponse.json({
        health,
        critical_alerts: critical,
        warning_alerts: warnings,
        total_unresolved: alerts.length,
        platform_status: health?.status ?? (critical.length > 0 ? 'critical' : warnings.length > 0 ? 'degraded' : 'operational'),
    });
}
