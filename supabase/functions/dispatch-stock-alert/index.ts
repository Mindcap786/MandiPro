import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Utility: simulated logging service like Sentry
const logToSentry = (level: string, message: string, context?: any) => {
    console.log(`[${level.toUpperCase()}] Sentry simulated:`, message, context);
}

// Helper: Extract mapping colors
const getSeverityColor = (severity: string) => {
    switch (severity) {
        case 'emergency': return '#7C3AED';
        case 'critical': return '#DC2626';
        case 'high': return '#F97316';
        case 'medium': return '#D97706';
        default: return '#1A6B3C';
    }
}

// Helper: Pretty alert titles
const getAlertTitle = (type: string, severity: string) => {
    switch (type) {
        case 'AGING_CRITICAL': return '🚨 Critical Stock Aging Action Needed';
        case 'AGING_WARNING': return '⚠️ Stock Aging Warning';
        case 'LOW_STOCK': return '📉 Low Stock Warning';
        case 'CRITICAL_STOCK': return '🚨 Critical Stock Alert';
        case 'OUT_OF_STOCK': return '❌ Out of Stock Alert';
        case 'VALUE_AT_RISK': return '💰 Value at Risk Alert';
        default: return 'Information Alert';
    }
}

serve(async (req) => {
    // Edge function to be invoked by Postgres Database Webhook on stock_alerts insert
    try {
        const payload = await req.json();
        
        // Ensure this is an INSERT trigger payload
        if (payload.type !== 'INSERT' || !payload.record) {
            return new Response(JSON.stringify({ message: "Ignored. Not an INSERT event." }), { status: 200 });
        }

        const alert = payload.record;
        
        // Initialize Supabase admin client to access push tokens and configs
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false } }
        );

        // 1. Fetch Organization Config
        const { data: config, error: configError } = await supabaseAdmin
            .from('alert_config')
            .select('*')
            .eq('organization_id', alert.organization_id)
            .single();

        if (configError || !config) {
            // Safe fallback, rely on real-time channel ONLY
            console.log("No explicit alert config. Relying on Realtime channel only base capabilities.");
            return new Response(JSON.stringify({ message: "Success. Realtime default applied" }), { status: 200 });
        }

        const notifiedChannels: string[] = [];
        const errorLog: record<string, string> = {};

        const alertMessage = `${alert.commodity_name} is triggering ${alert.alert_type}. Current: ${alert.current_value} ${alert.unit} (Threshold: ${alert.threshold_value} ${alert.unit}).`;

        // 2. CHANNEL B: CAPACITOR PUSH NOTIFICATION
        if (config.notify_push) {
            // Find all tokens for this org's users (ideally filtered by permission, skipping for simplicity)
            const { data: tokens } = await supabaseAdmin
                .from('push_notification_tokens')
                .select('token')
                .eq('organization_id', alert.organization_id);

            if (tokens && tokens.length > 0) {
                try {
                    // Send FCM requests to all devices
                    for (const row of tokens) {
                        const fcmPayload = {
                            message: {
                                token: row.token,
                                notification: {
                                    title: getAlertTitle(alert.alert_type, alert.severity),
                                    body: alertMessage,
                                },
                                data: {
                                    alert_id: alert.id,
                                    type: alert.alert_type,
                                    commodity: alert.commodity_name,
                                    route: `/stock`, // simple deep link
                                },
                                android: {
                                    priority: alert.severity === 'critical' || alert.severity === 'emergency' ? 'HIGH' : 'NORMAL',
                                    notification: {
                                        color: getSeverityColor(alert.severity),
                                        sound: 'default',
                                        channel_id: 'stock_alerts',
                                    }
                                },
                                apns: {
                                    headers: { 'apns-priority': alert.severity === 'critical' ? '10' : '5' },
                                    payload: {
                                        aps: { sound: 'default' }
                                    }
                                }
                            }
                        };
                        
                        // Fire external FCM (Assuming ENV variables hold google credentials)
                        // await fetch('https://fcm.googleapis.com/v1/projects/YOUR_PROJECT_ID/messages:send', { ... })
                        console.log("Simulating FCM PUSH dispatch to:", row.token);
                    }
                    notifiedChannels.push('PUSH');
                } catch (pushErr: any) {
                    errorLog['push'] = pushErr.message;
                    logToSentry('error', 'FCM Push failed', pushErr);
                }
            }
        }

        // 3. CHANNEL C: WHATSAPP (TWILIO)
        if (config.notify_whatsapp && config.phone_number) {
            try {
                const twilioMessage = `🚨 *MandiGrow Alert*
*${alert.commodity_name}* — ${alert.alert_type}
📍 Location: ${alert.location_name || 'N/A'}
📦 Current Stock/Age: ${alert.current_value} ${alert.unit}
⚠️ Threshold: ${alert.threshold_value} ${alert.unit}

View details: https://mandigrow.com/stock
Reply STOP to pause alerts`;

                // Fire external Twilio logic
                // await fetch('https://api.twilio.com/...', { ... })
                console.log("Simulating TWILIO WHATSAPP dispatch to: ", config.phone_number);
                notifiedChannels.push('WHATSAPP');
            } catch (waErr: any) {
                errorLog['whatsapp'] = waErr.message;
                logToSentry('error', 'WhatsApp Dispatch failed', waErr);
            }
        }

        // 4. CHANNEL D: SMS (MSG91)
        if (config.notify_sms && config.phone_number) {
            try {
                const smsMessage = `MandiGrow: ${alert.commodity_name} ${alert.alert_type} at ${alert.location_name}. Qty/Age: ${alert.current_value}. Open app to act.`;
                // Fire MSG91 external logic
                console.log("Simulating SMS dispatch to: ", config.phone_number);
                notifiedChannels.push('SMS');
            } catch (smsErr: any) {
                errorLog['sms'] = smsErr.message;
                logToSentry('error', 'SMS Dispatch failed', smsErr);
            }
        }

        // 5. UPDATE ALERT RECORD WITH DISPATCH META
        if (notifiedChannels.length > 0 || Object.keys(errorLog).length > 0) {
            await supabaseAdmin.from('stock_alerts').update({
                notified_channels: notifiedChannels,
                error_log: errorLog
            }).eq('id', alert.id);
        }

        return new Response(JSON.stringify({ 
            message: "Dispatched successfully", 
            channels: notifiedChannels 
        }), { status: 200, headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        // Never throw top level, always gracefully swallow for Supabase Webhook reliability but log to sentry
        logToSentry('fatal', 'Top level Webhook Crash', e.message);
        return new Response(JSON.stringify({ message: "Fatal recovery", error: e.message }), { status: 500 });
    }
})
