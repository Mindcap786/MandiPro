import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
// Static export: API routes must declare generateStaticParams for dynamic segments
export const dynamic = 'force-static';
export async function generateStaticParams() { return []; }


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const auth = await verifyAdminAccess(request, 'tenants', 'create_owner');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const tenantId = params.id;

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // 1. Double check org exists
        const { data: org, error: orgError } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .select('name, id')
            .eq('id', tenantId)
            .single();

        if (orgError || !org) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
        }

        // 2. Check if owner already exists
        const { data: existingProfiles, error: profileErr } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('id, role')
            .eq('organization_id', tenantId);

        if (!profileErr && existingProfiles && existingProfiles.length > 0) {
            const hasOwner = existingProfiles.some(p => p.role === 'owner' || p.role === 'tenant_admin');
            if (hasOwner) {
                return NextResponse.json({ error: 'Tenant already has an owner or admin' }, { status: 400 });
            }
        }

        // 3. Create new auth user
        const slug = org.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const autoEmail = `owner@${slug || 'mandi'}-${tenantId.substring(0, 6)}.mandi.pro`;
        const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';

        const { data: authUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
            email: autoEmail,
            email_confirm: true,
            password: tempPassword,
            user_metadata: {
                full_name: `${org.name} Owner`,
            }
        });

        if (createAuthError || !authUser.user) {
            return NextResponse.json({ error: 'Failed to create auth user', details: createAuthError?.message }, { status: 500 });
        }

        // 4. Create profile
        const { error: insertProfileError } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .insert({
                id: authUser.user.id,
                organization_id: tenantId,
                role: 'owner',
                full_name: `${org.name} Owner`,
                email: autoEmail, // if there is an email column
            });

        // if insert fails, just log it, but wait, usually profile is auto-created by triggers.
        // In MandiGrow, let's check if the trigger created it. We can just UPDATE the profile role instead.
        if (insertProfileError) {
            console.warn('[Create Owner] Insert profile failed (maybe trigger ran?):', insertProfileError);
            // Try updating instead
            await supabaseAdmin
                .schema('core')
                .from('profiles')
                .update({ role: 'owner', organization_id: tenantId, full_name: `${org.name} Owner` })
                .eq('id', authUser.user.id);
        }

        // 5. Auto-create employee record
        const { error: empError } = await supabaseAdmin
            .schema('mandi')
            .from('employees')
            .upsert({
                user_id: authUser.user.id,
                organization_id: tenantId,
                name: `${org.name} Owner`,
                email: autoEmail,
                role: 'owner',
                status: 'active'
            }, { onConflict: 'user_id' });
            
        if (empError) {
            console.warn('[Create Owner] Employee creation failed:', empError.message);
        }

        // Return success
        return NextResponse.json({
            success: true,
            user: {
                id: authUser.user.id,
                email: autoEmail,
                password: tempPassword // We return it but it's not strictly needed for impersonation
            }
        });

    } catch (e: any) {
        console.error('[Create Owner] Error:', e);
        return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
    }
}
