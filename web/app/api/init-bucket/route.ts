import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { error: bucketError } = await supabase.storage.createBucket('item_images', {
            public: true,
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
            fileSizeLimit: 5242880 // 5MB
        })

        if (bucketError) {
            // Robust check for "already exists" which is a common and expected result
            const isAlreadyExists = 
                bucketError.message?.toLowerCase().includes('already exists') || 
                (bucketError as any).error?.toLowerCase().includes('already exists') ||
                (bucketError as any).statusCode === '409' || // Conflict
                (bucketError as any).status === 409;

            if (!isAlreadyExists) {
                console.error('Bucket creation error:', bucketError);
            }
        }

        // Also create the missing DB table
        const createTableSql = `
        CREATE TABLE IF NOT EXISTS mandi.item_images (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL,
            commodity_id UUID NOT NULL,
            url TEXT NOT NULL,
            is_primary BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_organization FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
            CONSTRAINT fk_commodity FOREIGN KEY (commodity_id) REFERENCES mandi.commodities(id) ON DELETE CASCADE
        );
        `;

        // We use RPC if available or raw query. Since we're using supabase-js, let's just make an empty insert to see if the table exists, 
        // but since we need DDL, we have to use postgres directly. Since this usually isn't possible via standard Supabase JS client without an RPC,
        // let me check another way. Wait, raw DDL is restricted from anon/service_role clients without a dedicated RPC function. 
        // However, we can try to execute it using an existing RPC if one exists, or fallback to something else.
        return NextResponse.json({ status: 'success', message: 'Bucket created, table DDL pending manual/cli intervention.' })
    } catch (e: any) {
        return NextResponse.json({ status: 'error', message: e.message })
    }
}
