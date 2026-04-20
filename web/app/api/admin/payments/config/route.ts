import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'core' } }
);

// GET: Fetch current config (Masking secrets)
export async function GET(req: NextRequest) {
    try {
        const auth = await verifyAdminAccess(req, 'payments', 'read');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { data, error } = await supabaseAdmin
            .from('payment_config')
            .select('*');

        if (error) throw error;

        // Mask secrets for frontend safety
        const maskedData = data.map(item => {
            const config = { ...item.config };
            if (config.secret_key) config.secret_key = '••••••••••••••••' + config.secret_key.slice(-4);
            if (config.key_secret) config.key_secret = '••••••••••••••••' + config.key_secret.slice(-4);
            if (config.webhook_secret) config.webhook_secret = '••••••••••••••••' + config.webhook_secret.slice(-4);
            return { ...item, config };
        });

        return NextResponse.json(maskedData);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Save config
export async function POST(request: NextRequest) {
    try {
        const auth = await verifyAdminAccess(request, 'payments', 'write');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { id, gateway_type, is_active, config } = await request.json();

        // 1. If this gateway is being set to active, deactivate all others
        if (is_active) {
            await supabaseAdmin
                .from('payment_config')
                .update({ is_active: false })
                .neq('gateway_type', gateway_type);
        }

        // 2. Fetch existing config to handle partial updates of masked secrets
        const { data: existing } = await supabaseAdmin
            .from('payment_config')
            .select('config')
            .eq('gateway_type', gateway_type)
            .single();

        const finalConfig = { ...(existing?.config || {}), ...config };
        
        // Don't overwrite secret if it was sent as masked placeholder
        Object.keys(config).forEach(key => {
            if (config[key].includes('••••')) {
                finalConfig[key] = existing?.config?.[key];
            }
        });

        const { data, error } = await supabaseAdmin
            .from('payment_config')
            .upsert({
                gateway_type,
                is_active,
                config: finalConfig,
                updated_at: new Date().toISOString() // Should be handled by DB or explicit timestamp
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
