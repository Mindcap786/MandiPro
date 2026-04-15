import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Initialize Supabase Admin Client (using service role if available, otherwise public for now since RLS might block if not logged in. 
// actually, for this demo we might need to bypass RLS or just be "logged in". 
// Since we are running locally, we can use the ANON key but we might hit RLS issues if we don't have a user.
// TRICK: We will insert data "as a user" if we can, or just disable RLS temporarily? No, that's bad practice.
// standard way: create a user, get session, insert.
// FAST WAY for DEMO: Use the Service_Role key if we had it, but we only have anon.
// Let's assume the user has "sign up" disabled or we can just use SQL Editor.
// Wait, I don't have the Service Role key in the env vars visible.
// I will try to use the existing client. If RLS blocks, I might need to make the seed public or Auth first.
// Let's try to just insert. If it fails, I'll know I need a user.

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Create/Get User (Mocking this might be hard without Admin)
    // Let's Check if we can just insert with a random UUID for owner if we relax RLS, 
    // BUT the schema enforces RLS.
    // Actually, I can use the `supabase/seed.sql` approach if I had access to CLI, but I don't.
    // ALTERNATIVE: I will use the `run_command` to execute SQL directly if I can? 
    // No, psql isn't available.

    // Okay, let's try to Sign Up a dummy user first.
    const email = `demo_${Date.now()}@mandi.com`
    const password = 'password123'

    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
    })

    if (authError) {
        // If sign up fails (maybe email taken), try sign in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        if (signInError) return NextResponse.json({ error: signInError.message }, { status: 400 })
    }

    // Now we have a user (authData.user or from sign in)
    // The client automatically uses the session if we use the instance from auth response? 
    // No, we need to set the session or just use the client returned by createClientComponentClient in a browser...
    // but here we are server side.

    // Let's try sending the SQL directly via the /api/seed route? NO.

    // Let's just return "Please Register manually" if we can't seed?
    // User wants "World Best". Manual is bad.

    // Let's use a simpler approach: 
    // We'll create a simple page "Setup Demo" that runs ON THE CLIENT SIDE (Browser) where we have the supabase client initialized and potentially a session (if user logged in).
    // If user is not logged in, we ask them to log in.

    return NextResponse.json({ message: "Seeding must be done from client side to ensure Auth context." })
}
