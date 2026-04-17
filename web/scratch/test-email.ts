
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    console.log('--- DB TEST ---');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing Supabase env vars');
    } else {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data, error } = await supabase.schema('core').from('contact_submissions').select('count', { count: 'exact', head: true });
        if (error) {
            console.error('DB Error checking table:', error.message);
            if (error.message.includes('relation "core.contact_submissions" does not exist')) {
                console.log('CRITICAL: Table core.contact_submissions is missing!');
            }
        } else {
            console.log('DB Success: Table exists.');
        }
    }

    console.log('\n--- SMTP TEST ---');
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = process.env.SMTP_PORT || '587';
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
        console.error('Missing SMTP env vars');
    } else {
        console.log(`Connecting to ${smtpHost}:${smtpPort} as ${smtpUser}...`);
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: parseInt(smtpPort, 10),
            secure: smtpPort === '465',
            auth: { user: smtpUser, pass: smtpPass },
            connectionTimeout: 10000,
        });

        try {
            await transporter.verify();
            console.log('SMTP Success: Connection verified.');
            
            console.log(`Sending test email from ${smtpFrom} to mindt@mandigrow.com...`);
            const info = await transporter.sendMail({
                from: `"MandiGrow Test" <${smtpFrom}>`,
                to: 'mindt@mandigrow.com',
                subject: '🚨 SMTP Diagnostic Test',
                text: 'This is a test to verify SMTP configuration for the Contact Form.',
                html: '<b>Diagnostic Test</b><p>If you received this, SMTP is working correctly.</p>'
            });
            console.log('SMTP Success: Email sent!', info.messageId);
        } catch (err) {
            console.error('SMTP Error:', err.message);
        }
    }
}

test();
