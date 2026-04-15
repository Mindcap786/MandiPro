'use client'

import { supabase } from '@/lib/supabaseClient'
import { useState } from 'react'

export default function SeedPage() {
    const [status, setStatus] = useState('Idle')

    async function runSeed() {
        setStatus('Starting...')
        try {
            // 1. Check Auth
            const { data: { user } } = await supabase.auth.getUser()
            let merchantId = ''

            if (!user) {
                setStatus('Creating Demo Account...')
                const timestamp = Date.now()
                const email = `demo_${timestamp}@mandi.com`
                const password = 'demo_password_123'

                // Sign Up
                const { data: authData, error } = await supabase.auth.signUp({ email, password })
                if (error) {
                    console.error("Auth Signup Failed (likely exists or rate limit):", error)
                    setStatus('Auth Warning: ' + error.message + '. Proceeding with DB...')
                } else {
                    setStatus('Account Created: ' + email)
                }
            }

            // 2. Create Merchant
            setStatus('Creating Merchant...')
            const { data: merchant, error: mError } = await supabase
                .from('merchants')
                .insert({ name: 'Azadpur Premium Mandi', address: 'Shed 24, Delhi', phone: '9876543210' })
                .select()
                .single()

            if (mError) {
                // Should check if already exists, but for now just assuming success or ignore
                console.log("Merchant might exist or error", mError)
                // Fetch existing
                const { data: existing } = await supabase.from('merchants').select().limit(1).single()
                if (existing) merchantId = existing.id
                else throw mError
            } else {
                merchantId = merchant.id
            }

            // 3. Create Farmer
            setStatus('Creating Farmer...')
            const { data: farmer } = await supabase.from('farmers').insert({
                merchant_id: merchantId,
                name: 'Ramesh Kisan',
                village: 'Shimla',
                phone: '9988776655'
            }).select().single()

            // 4. Create Buyer
            setStatus('Creating Buyer...')
            const { data: buyer } = await supabase.from('buyers').insert({
                merchant_id: merchantId,
                name: 'Kalam Fruits',
                shop_name: 'Shop 101, Okhla',
                phone: '9123456789'
            }).select().single()

            // 5. Create Lot (Gate Entry)
            setStatus('Creating Gate Entry...')
            const { data: lot } = await supabase.schema('mandi').from('lots').insert({
                merchant_id: merchantId,
                farmer_id: farmer.id,
                lot_code: 'APP-24-001',
                item_type: 'Apple (Royal)',
                unit_type: 'Box',
                initial_quantity: 100,
                current_quantity: 50,
                truck_number: 'HR-55-A-1234',
                driver_name: 'Suresh',
                status: 'active'
            }).select().single()

            // Create an Active Inventory Lot (Unassigned)
            await supabase.schema('mandi').from('lots').insert({
                merchant_id: merchant.id,
                farmer_id: farmer.id,
                lot_code: `INV-${Math.floor(Math.random() * 1000)}`,
                item_type: 'Grapes (Nasik)',
                unit_type: 'Crate',
                initial_quantity: 500,
                current_quantity: 500,
                status: 'active',
                cold_storage_rack: null // Explicitly null
            }).select().single()

            // 6. Create Transactions (Auctions)
            setStatus('Creating Transactions...')
            await supabase.from('transactions').insert([
                {
                    merchant_id: merchantId,
                    lot_id: lot.id,
                    buyer_id: buyer.id,
                    rate: 1200,
                    quantity: 20,
                    payment_status: 'pending' // Unpaid, ready for billing
                },
                {
                    merchant_id: merchantId,
                    lot_id: lot.id,
                    buyer_id: buyer.id,
                    rate: 1150,
                    quantity: 30,
                    payment_status: 'pending'
                }
            ])

            setStatus('Success! Data Seeded.')

        } catch (e: any) {
            setStatus('Error: ' + e.message)
            console.error(e)
        }
    }

    return (
        <div className="bg-black text-white h-screen flex items-center justify-center flex-col">
            <h1 className="text-2xl mb-4">Demo Data Seeder</h1>
            <button onClick={runSeed} className="bg-neon-green text-black px-6 py-3 rounded font-bold">
                Inject Demo Data
            </button>
            <p className="mt-4 text-gray-400">{status}</p>
        </div>
    )
}
