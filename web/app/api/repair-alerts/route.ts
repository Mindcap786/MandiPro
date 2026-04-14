import { NextResponse } from 'next/server';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

export async function GET() {
    console.log("🚀 API-Triggered Database Repair starting...");
    
    const client = new Client({
        connectionString: "postgresql://postgres:9SjI2m*M@ldayxjabzyorpugwszpt.supabase.co:5432/postgres",
    });

    try {
        await client.connect();
        
        // Use a more direct path for the migration file
        const sqlPath = path.join(process.cwd(), 'supabase/migrations/20260410_fix_stock_alerts.sql');
        // Execute permissions and schema reload
        await client.query("GRANT ALL ON public.stock_alerts TO authenticated, anon, service_role;");
        await client.query("NOTIFY pgrst, 'reload schema';");
        
        return NextResponse.json({ success: true, message: "Database permissions granted and PostgREST schema reloaded. 404s should now be resolved." });
    } catch (err: any) {
        console.error("❌ API Repair Failed:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
        await client.end();
    }
}
