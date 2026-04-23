import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/lib/database.types'
import { verifyAdminAccess } from '@/lib/admin-auth'

// Initialize Supabase Admin Client
// Note: This requires SUPABASE_SERVICE_ROLE_KEY to be set in environment variables
// Client initialized inside handler for safety

export async function POST(req: NextRequest) {
    try {
        // 0. ADMIN ACCESS GATE — super_admin only (matches /api/admin/provision)
        const auth = await verifyAdminAccess(req, 'tenants', 'create');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        // 1. Check for Service Role Key (Security Check)
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json(
                { error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is missing.' },
                { status: 500 }
            )
        }

        const supabaseAdmin = createClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        const body = await req.json()
        const { name, city, email, password, tier } = body

        // 2. Validate Input
        if (!name || !email || !password) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        // 3. Create Organization
        const { data: org, error: orgError } = await supabaseAdmin
            .schema('core' as any)
            .from('organizations')
            .insert({
                name,
                subscription_tier: tier || 'enterprise',
                tenant_type: 'mandi',
                settings: { city: city || 'Unknown' }
            })
            .select()
            .single()

        if (orgError) {
            console.error('Org Creation Error:', orgError)
            return NextResponse.json(
                { error: 'Failed to create organization' },
                { status: 500 }
            )
        }

        // 4. Create Admin User
        const { data: user, error: userError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: `${name} Admin`
            }
        })

        if (userError) {
            // Rollback Org (Optional but recommended)
            await supabaseAdmin.schema('core' as any).from('organizations').delete().eq('id', org.id)

            console.error('User Creation Error:', userError)
            return NextResponse.json(
                { error: userError.message },
                { status: 500 }
            )
        }

        // 5. Link User to Org via Profile
        // Note: The 'profiles' trigger might have already created a row, so we should upsert or update
        // But assuming standard setup, we update the profile to set role and org_id

        // Wait a small bit for trigger (if any) or just upsert
        const { error: profileError } = await supabaseAdmin
            .schema('core' as any)
            .from('profiles')
            .upsert({
                id: user.user.id,
                organization_id: org.id,
                role: 'admin',
                full_name: `${name} Admin`
            })

        if (profileError) {
            console.error('Profile Link Error:', profileError)
            // This is non-fatal for creation, but critical for access. 
            // We might want to return a warning or handle it manually.
            return NextResponse.json(
                { error: 'Created user but failed to link profile. Please contact support.' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Mandi created successfully',
            organization: org,
            user: { id: user.user.id, email: user.user.email }
        })

    } catch (error: any) {
        console.error('Unexpected Error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        )
    }
}
