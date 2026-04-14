import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'support', 'read');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    const supabaseAdmin = access.supabaseAdmin!;

    const { data: tickets, error } = await supabaseAdmin
        .schema('core')
        .from('support_tickets')
        .select(`
            *,
            org:organizations(id, name)
        `)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also get user emails manually if needed, but we can just return what we have
    return NextResponse.json({ tickets });
}

export async function PATCH(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'support', 'manage');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    
    const supabaseAdmin = access.supabaseAdmin!;
    const actingAdmin = access.profile;

    try {
        const body = await req.json();
        const { ticket_id, status, admin_notes } = body;

        if (!ticket_id || !status) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });

        const { data, error } = await supabaseAdmin
            .schema('core')
            .from('support_tickets')
            .update({ status, admin_notes, updated_at: new Date().toISOString() })
            .eq('id', ticket_id)
            .select()
            .single();

        if (error) throw error;

        await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
            action_type: 'TICKET_UPDATED',
            module: 'support',
            before_data: { acting_admin: actingAdmin.email, ticket_id },
            after_data: { status, admin_notes }
        });

        return NextResponse.json({ success: true, ticket: data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
