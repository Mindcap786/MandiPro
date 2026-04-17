import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'finance', 'read');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    
    const supabaseAdmin = access.supabaseAdmin!;

    try {
        const { data, error } = await supabaseAdmin
            .schema('core')
            .from('subscription_coupons')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, coupons: data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'finance', 'manage');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    
    const supabaseAdmin = access.supabaseAdmin!;
    const actingAdmin = access.profile;

    try {
        const body = await req.json();
        const { code, discount_amount, discount_type, max_uses, expires_at } = body;

        if (!code || !discount_amount) {
            return NextResponse.json({ error: 'Code and discount amount are required' }, { status: 400 });
        }

        const cleanCode = code.toUpperCase().replace(/\s+/g, '');

        // Pre-check for duplicate code
        const { data: existing } = await supabaseAdmin.schema('core').from('subscription_coupons')
            .select('id')
            .eq('code', cleanCode)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ error: `Coupon code "${cleanCode}" already exists. Use a different code.` }, { status: 409 });
        }

        const { data, error } = await supabaseAdmin.schema('core').from('subscription_coupons').insert({
            code: cleanCode,
            discount_amount: parseFloat(discount_amount),
            discount_type,
            max_uses: max_uses ? parseInt(max_uses) : null,
            expires_at: expires_at || null,
            created_by: actingAdmin.id
        }).select().single();

        if (error) throw error;

        await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
            action_type: 'COUPON_GENERATED',
            module: 'finance',
            before_data: { acting_admin: actingAdmin.email },
            after_data: { coupon_id: data.id, code: data.code, discount: data.discount_amount }
        });

        return NextResponse.json({ success: true, coupon: data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }

}

export async function DELETE(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'finance', 'manage');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    
    const supabaseAdmin = access.supabaseAdmin!;
    const actingAdmin = access.profile;

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

        const { error } = await supabaseAdmin
            .schema('core')
            .from('subscription_coupons')
            .delete()
            .eq('id', id);

        if (error) throw error;

        await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
            action_type: 'COUPON_DELETED',
            module: 'finance',
            before_data: { coupon_id: id },
            after_data: { acting_admin: actingAdmin.email }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'finance', 'manage');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    
    const supabaseAdmin = access.supabaseAdmin!;
    const actingAdmin = access.profile;

    try {
        const body = await req.json();
        const { id, code, discount_amount, discount_type, max_uses, is_active, expires_at } = body;

        if (!id) return NextResponse.json({ error: 'Coupon ID is required' }, { status: 400 });

        const updateData: any = {};
        if (code !== undefined) updateData.code = code.toUpperCase().replace(/\s+/g, '');
        if (discount_amount !== undefined) updateData.discount_amount = parseFloat(discount_amount);
        if (discount_type !== undefined) updateData.discount_type = discount_type;
        if (max_uses !== undefined) updateData.max_uses = max_uses !== "" && max_uses != null ? parseInt(max_uses) : null;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (expires_at !== undefined) updateData.expires_at = expires_at || null;

        const { data, error } = await supabaseAdmin
            .schema('core')
            .from('subscription_coupons')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                return NextResponse.json({ error: 'Coupon code already exists.' }, { status: 409 });
            }
            throw error;
        }

        await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
            action_type: 'COUPON_UPDATED',
            module: 'finance',
            before_data: { coupon_id: id },
            after_data: { acting_admin: actingAdmin.email, updates: updateData }
        });

        return NextResponse.json({ success: true, coupon: data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
