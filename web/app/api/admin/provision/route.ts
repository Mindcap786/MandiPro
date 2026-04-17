
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { NextRequest, NextResponse } from 'next/server';

// Create a Supabase client with the SERVICE ROLE KEY
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

// Parse plan key like 'basic_monthly', 'vip_plan_yearly' into { planName, billingCycle }
// The last segment is always the billing interval; everything before it is the plan name.
function parsePlanKey(fullPlan: string): { planName: string; billingCycle: 'monthly' | 'yearly' } {
    const parts = fullPlan.toLowerCase().split('_');
    const lastPart = parts[parts.length - 1];
    const isYearly = lastPart === 'yearly';
    const planName = isYearly || lastPart === 'monthly'
        ? parts.slice(0, -1).join('_')   // remove the interval suffix
        : fullPlan;                        // no suffix → treat whole string as plan name
    return {
        planName: planName || fullPlan,
        billingCycle: isYearly ? 'yearly' : 'monthly',
    };
}

export async function POST(request: NextRequest) {
    try {
        // 0. VERIFY ADMIN ACCESS — super_admin bypass happens first inside verifyAdminAccess
        const auth = await verifyAdminAccess(request, 'tenants', 'create');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { orgName, plan: fullPlan, email, password, adminName, username, phone } = await request.json();

        if (!orgName || !email || !password) {
            return NextResponse.json({ error: 'orgName, email, and password are required.' }, { status: 400 });
        }

        // 1. PARSE PLAN
        const { planName, billingCycle } = parsePlanKey(fullPlan || 'basic');

        console.log('Provisioning new tenant:', orgName, email, username, '| Plan:', planName, '| Cycle:', billingCycle);

        // 2. STRICT UNIQUENESS CHECK
        const { data: existingProfiles, error: checkError } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('email, username')
            .or(`email.eq.${email}${username ? `,username.eq.${username}` : ''}`);

        if (checkError) throw checkError;

        if (existingProfiles && existingProfiles.length > 0) {
            const hasEmail = existingProfiles.some(p => p.email?.toLowerCase() === email?.toLowerCase());
            const hasUsername = username && existingProfiles.some(p => p.username?.toLowerCase() === username?.toLowerCase());

            if (hasEmail) return NextResponse.json({ error: 'Email already registered. Use a different email.' }, { status: 409 });
            if (hasUsername) return NextResponse.json({ error: 'Username already taken. Use a different username.' }, { status: 409 });
        }

        // 3. LOOK UP PLAN (before creating anything, so we fail fast if plan is invalid)
        const { data: planData, error: planLookupError } = await supabaseAdmin
            .schema('core')
            .from('app_plans')
            .select('*')
            .ilike('name', planName)
            .maybeSingle();

        if (planLookupError) console.warn('Plan lookup error (non-fatal):', planLookupError.message);

        // 4. CALCULATE DATES
        const now = new Date();
        const trialDays = planData?.trial_days ?? 30;
        const trialEnds = new Date(now);
        trialEnds.setDate(now.getDate() + trialDays);

        const periodEnd = new Date(now);
        if (billingCycle === 'yearly') {
            periodEnd.setFullYear(now.getFullYear() + 1);
        } else {
            periodEnd.setDate(now.getDate() + 30);
        }

        // 5. CREATE ORGANIZATION
        const { data: org, error: orgError } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .insert({
                name: orgName,
                subscription_tier: planName,
                tenant_type: 'mandi',
                is_active: true,
                status: 'trial',
                trial_ends_at: trialEnds.toISOString(),
                billing_cycle: billingCycle,
                current_period_end: periodEnd.toISOString(),
                max_web_users: planData?.max_web_users ?? 5,
                max_mobile_users: planData?.max_mobile_users ?? 5,
                enabled_modules: planData?.enabled_modules ?? [],
            })
            .select('id')
            .single();

        if (orgError) throw orgError;

        // 6. CREATE AUTH USER (triggers handle_new_user INSERT trigger for profile seed)
        const { data: user, error: userError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: adminName,
                username: username?.toLowerCase() || null,
                phone: phone || null,
                organization_id: org.id,
                role: 'tenant_admin',             // passed to trigger so initial role is correct
            }
        });

        if (userError) {
            // Roll back org if user creation fails
            await supabaseAdmin.schema('core').from('organizations').delete().eq('id', org.id);
            throw userError;
        }

        // 7. UPSERT PROFILE (authoritative — overrides what the trigger seeded)
        const { error: profileError } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .upsert({
                id: user.user.id,
                organization_id: org.id,
                role: 'tenant_admin',
                full_name: adminName,
                email,
                phone: phone || null,
                username: username?.toLowerCase() || null,
                business_domain: 'mandi',
                admin_status: 'active',
                rbac_matrix: { 'nav.field_governance': false },
            });

        if (profileError) throw profileError;

        // 8. UPDATE THE AUTO-CREATED SUBSCRIPTION (trigger creates it on org INSERT)
        //    We update it with the actual selected plan details instead of creating a duplicate.
        const mrrAmount = planData
            ? (billingCycle === 'yearly'
                ? (planData.price_yearly ?? planData.price_monthly * 12)
                : planData.price_monthly)
            : 0;

        const { data: existingSub } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select('id')
            .eq('organization_id', org.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        let subscriptionId: string | null = existingSub?.id ?? null;

        if (subscriptionId) {
            // Update the auto-created subscription with real plan details
            await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .update({
                    plan_id: planData?.id ?? null,
                    status: 'trial',
                    billing_cycle: billingCycle,
                    plan_interval: billingCycle,
                    trial_ends_at: trialEnds.toISOString(),
                    current_period_end: periodEnd.toISOString(),
                    next_invoice_date: periodEnd.toISOString(),
                    mrr_amount: mrrAmount,
                    max_web_users: planData?.max_web_users ?? 5,
                    max_mobile_users: planData?.max_mobile_users ?? 5,
                    updated_at: now.toISOString(),
                })
                .eq('id', subscriptionId);
        } else {
            // No auto-created sub found — create fresh
            const { data: newSub } = await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .insert({
                    organization_id: org.id,
                    plan_id: planData?.id ?? null,
                    status: 'trial',
                    billing_cycle: billingCycle,
                    plan_interval: billingCycle,
                    trial_starts_at: now.toISOString(),
                    trial_ends_at: trialEnds.toISOString(),
                    current_period_end: periodEnd.toISOString(),
                    next_invoice_date: periodEnd.toISOString(),
                    mrr_amount: mrrAmount,
                    max_web_users: planData?.max_web_users ?? 5,
                    max_mobile_users: planData?.max_mobile_users ?? 5,
                    retry_count: 0,
                })
                .select('id')
                .single();
            subscriptionId = newSub?.id ?? null;
        }

        // 9. LINK SUBSCRIPTION BACK TO ORG
        if (subscriptionId) {
            await supabaseAdmin
                .schema('core')
                .from('organizations')
                .update({ current_subscription_id: subscriptionId, is_active: true })
                .eq('id', org.id);
        }

        // 10. LOG THE PROVISIONING ACTION
        await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
            admin_id: auth.user?.id,
            target_tenant_id: org.id,
            action_type: 'TENANT_PROVISIONED',
            module: 'tenants',
            after_data: { orgName, email, plan: planName, billingCycle },
        });

        return NextResponse.json({ success: true, orgId: org.id, userId: user.user.id });

    } catch (error: any) {
        console.error('Provisioning failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
