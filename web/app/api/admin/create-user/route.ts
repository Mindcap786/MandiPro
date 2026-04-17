import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password, role, fullName, orgId, employeeId, username } = body;

        // 1. VERIFY ACCESS
        const auth = await verifyAdminAccess(request, 'users', 'create');
        
        // If not super_admin, check if they are a tenant_admin for their own org
        if (auth.error) {
            // Get the user from the token to check organization_id
            const authHeader = request.headers.get('Authorization');
            const token = authHeader?.replace('Bearer ', '');
            if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            
            const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
            if (userError || !user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

            const { data: profile } = await supabaseAdmin.schema('core').from('profiles').select('organization_id, role, admin_status').eq('id', user.id).single();
            
            if (!profile) return NextResponse.json({ error: 'Admin profile not found' }, { status: 403 });

            // Enforce Account Status Limits
            if (profile.admin_status === 'suspended') return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
            if (profile.admin_status === 'locked') return NextResponse.json({ error: 'Account locked' }, { status: 403 });

            if (profile.role !== 'tenant_admin' && profile.role !== 'company_admin') {
                return NextResponse.json({ error: 'Forbidden: Unauthorized to create users' }, { status: 403 });
            }

            if (profile.organization_id !== orgId) {
                return NextResponse.json({ error: 'Forbidden: Cross-tenant operations blocked' }, { status: 403 });
            }

            // Tenant admins CANNOT create super_admins
            if (role === 'super_admin' || role === 'support_admin') {
                return NextResponse.json({ error: 'Forbidden: Role elevation blocked' }, { status: 403 });
            }
        }

        // 1. Fetch Organization
        const { data: org, error: orgErr } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .select('max_web_users, tenant_type, subscription_tier, status')
            .eq('id', orgId)
            .single();

        if (orgErr || !org) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }

        // NOTE: User creation limits are managed at the subscription level by Super Admin.
        // We do NOT block tenant_admins from creating staff on basic or trial plans —
        // this was causing misleading "User limit reached" errors for valid tenants.
        // The subscription API handles enforcement when plans are downgraded.

        // 2. Resolve User (STRICT UNIQUENESS CHECK)
        const { data: existingProfiles, error: checkError } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('email, username')
            .or(`email.eq.${email}${username ? `,username.eq.${username}` : ''}`);

        if (checkError) throw checkError;

        if (existingProfiles && existingProfiles.length > 0) {
            const hasEmail = existingProfiles.some(p => p.email?.toLowerCase() === email?.toLowerCase());
            const hasUsername = username && existingProfiles.some(p => p.username?.toLowerCase() === username?.toLowerCase());

            if (hasEmail) return NextResponse.json({ error: 'Email ID already present. Please select a different email.' }, { status: 409 });
            if (hasUsername) return NextResponse.json({ error: 'UserID already present. Please select a different UserID.' }, { status: 409 });
        }

        // Create New user (Skip independent onboarding)
        const { data: user, error: userError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { 
                full_name: fullName,
                org_id: orgId,
                skip_onboarding: true
            }
        });

        if (userError) {
            // Check if user already exists in Auth but not in our profiles table for some reason
            if (userError.message.includes('already been registered')) {
                return NextResponse.json({ error: 'This Email ID is already registered in the system. Please use a different email.' }, { status: 409 });
            }
            throw userError;
        }
        const userId = user.user.id;

        // 3. Create/Update Profile linked to Org
        const { error: profileError } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .upsert({
                id: userId,
                organization_id: orgId,
                role: (role === 'operator' || !role) ? 'member' : role, // Standardize 'operator' to 'member'
                full_name: fullName,
                email: email,
                username: username || null,
                business_domain: org.tenant_type || 'mandi'
            });

        if (profileError) throw profileError;

        // 4. Link Employee if ID provided
        if (employeeId) {
            const { error: linkError } = await supabaseAdmin
                .schema('mandi')
                .from('employees')
                .update({ user_id: userId })
                .eq('id', employeeId);
            
            if (linkError) {
                console.error('Failed to link employee:', linkError);
                // We don't fail the whole request since the user was created, but we log it.
            }
        } else {
            // Auto-generate employee record to maintain Master Data synchronization
            const { error: empError } = await supabaseAdmin
                .schema('mandi')
                .from('employees')
                .insert({
                    organization_id: orgId,
                    name: fullName || email.split('@')[0],
                    email: email,
                    user_id: userId,
                    role: role === 'owner' || role === 'tenant_admin' ? 'manager' : 'staff',
                    status: 'active'
                });
            if (empError) {
                console.error('[Admin] Failed to auto-create employee:', empError);
            }
        }

        return NextResponse.json({
            success: true,
            userId: userId,
            message: `User ${email} created successfully.`
        });

    } catch (error: any) {
        console.error('User creation failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
