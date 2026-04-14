import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, phone, subject, message, tenant_id } = body;

        if (!name || !email || !message) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        console.log(`[ContactAPI] New submission from ${name} (${email})`);
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Save to Supabase
        const { data: dbData, error } = await supabase
            .schema('core')
            .from('contact_submissions')
            .insert({ name, email, phone, subject, message, tenant_id: tenant_id || null, status: 'new' })
            .select()
            .single();

        if (error) {
            console.error('[ContactAPI] Database error:', error.message);
            throw error;
        }
        console.log('[ContactAPI] Saved to database with ID:', dbData.id);

        // Fetch configured support email destination from the database
        const { data: settings } = await supabase
            .schema('core')
            .from('site_contact_settings')
            .select('email_support')
            .maybeSingle();

        const supportEmail = settings?.email_support || 'mindt@mandigrow.com';

        // Send via SMTP — reuse the same credentials configured in Supabase Authentication SMTP
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER;

        if (smtpHost && smtpUser) {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: process.env.SMTP_PORT === '465',
                auth: {
                    user: smtpUser,
                    pass: process.env.SMTP_PASS,
                },
                // Fail fast — don't hang the request
                connectionTimeout: 8000,
                greetingTimeout: 5000,
                socketTimeout: 8000,
            });

            console.log(`[ContactAPI] Connecting to SMTP ${smtpHost}...`);
            // Verify connection before sending (throws if SMTP creds are wrong)
            await transporter.verify();
            console.log('[ContactAPI] SMTP Connection verified.');

            const smtpFrom = process.env.SMTP_FROM || smtpUser;

            // Sanitize values to prevent header injection
            const safeName    = (name    as string).replace(/[\r\n]/g, ' ').slice(0, 200);
            const safeSubject = (subject as string || 'General Inquiry').replace(/[\r\n]/g, ' ').slice(0, 200);

            const result = await transporter.sendMail({
                from: `"MandiGrow Contact" <${smtpFrom}>`,
                to: supportEmail,
                replyTo: email as string,
                subject: `New Contact: ${safeSubject}`,
                text: `New Contact Form Submission\n\nName: ${safeName}\nEmail: ${email}\nPhone: ${phone || '—'}\nTopic: ${safeSubject}\n\nMessage:\n${message}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
                        <h2 style="color: #064e3b; margin-bottom: 16px;">📬 New Contact Form Submission</h2>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280; width: 100px;">Name</td><td style="padding: 8px 0;">${safeName}</td></tr>
                            <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
                            <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Phone</td><td style="padding: 8px 0;">${phone || '—'}</td></tr>
                            <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Topic</td><td style="padding: 8px 0;">${safeSubject}</td></tr>
                        </table>
                        <hr style="margin: 16px 0; border-color: #f3f4f6;" />
                        <p style="font-weight: bold; color: #6b7280; margin-bottom: 8px;">Message:</p>
                        <p style="background: #f9fafb; padding: 16px; border-radius: 8px; line-height: 1.6;">${(message as string).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>
                        <p style="font-size: 11px; color: #9ca3af; margin-top: 24px;">Sent via MandiGrow Contact Form — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
                    </div>
                `,
            });

            console.log(`[ContactAPI] Email sent to ${supportEmail}. MessageId: ${result.messageId}`);
        } else {
            // SMTP not configured — submission is saved to DB but no email sent
            console.warn('[ContactAPI] SMTP env vars missing (SMTP_HOST / SMTP_USER). Email not sent.');
        }

        return NextResponse.json({ success: true, message: 'Message received. We will get back to you soon!', id: dbData.id });

    } catch (e: any) {
        console.error('[ContactAPI] Error:', e);
        return NextResponse.json({ error: e.message || 'Failed to send message' }, { status: 500 });
    }
}
