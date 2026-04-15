import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { phoneNumber, message, documentUrl } = body

        if (!phoneNumber || !message) {
            return NextResponse.json({ error: 'Missing phone number or message' }, { status: 400 })
        }

        // Mocking External API Call (e.g. Twilio or Meta WhatsApp Cloud API)
        console.log(`[WHATSAPP MOCK] Sending to ${phoneNumber}: "${message}"`)
        if (documentUrl) {
            console.log(`[WHATSAPP MOCK] Attaching PDF: ${documentUrl}`)
        }

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800))

        return NextResponse.json({ success: true, status: 'queued', messageId: 'wa_mock_' + Date.now() })
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
