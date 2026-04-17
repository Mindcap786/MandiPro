import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase Edge Function: send-subscription-notification
// Dispatches email (Resend) + push (FCM) + WhatsApp (MSG91) for all subscription events
// All notifications are automated — zero manual sending ever

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  org_id: string;
  event_type: string;
  metadata?: Record<string, any>;
}

// Email templates for each lifecycle event
function buildEmailContent(eventType: string, orgName: string, metadata: any) {
  const baseGreeting = `Dear ${orgName} Team,`;
  const baseFooter = `\n\nFor help, contact us at support@mandigrow.in or call 1800-XXX-XXXX.\n\nWarm regards,\nMandiGrow Team`;

  const templates: Record<string, { subject: string; body: string }> = {
    'trial.started': {
      subject: `🎉 Welcome to MandiGrow! Your 14-day free trial has started`,
      body: `${baseGreeting}\n\nYour free trial is now active! You have full access to all MandiGrow features for the next 14 days — no credit card required.\n\n✅ Manage arrivals, stock & lots\n✅ Track buyers, suppliers & ledgers\n✅ Generate GST reports\n✅ Mobile app access included\n\nStart by adding your first commodity at https://app.mandigrow.in/stock\n\nYour trial ends on: ${metadata?.trial_ends_at ? new Date(metadata.trial_ends_at).toLocaleDateString('en-IN') : '14 days from today'}${baseFooter}`
    },
    'trial.reminder_sent': {
      subject: `⏰ ${metadata?.days_left || 'Few'} days left in your MandiGrow trial`,
      body: `${baseGreeting}\n\nYour free trial expires in ${metadata?.days_left} day${metadata?.days_left !== 1 ? 's' : ''}.\n\n${metadata?.days_left <= 3 ? '⚠️ Act now to keep your data and continue without interruption.' : 'Upgrade now to keep full access and preserve all your data.'}\n\nChoose a plan that fits your business:\n• Starter: ₹999/month — 2 users, core features\n• Standard: ₹2,499/month — 10 users, advanced reports + WhatsApp alerts\n• Enterprise: ₹5,999/month — Unlimited users, all features\n\n🔗 Upgrade now: https://app.mandigrow.in/settings/billing\n\nYour data is safe — all records are preserved after trial ends.${baseFooter}`
    },
    'trial.expired': {
      subject: `Your MandiGrow trial has ended — your data is safe`,
      body: `${baseGreeting}\n\nYour 14-day free trial has ended. Don't worry — all your data is safely preserved.\n\nTo continue using MandiGrow, please activate a subscription:\n🔗 https://app.mandigrow.in/settings/billing\n\nYour data will be kept safe for 30 days. After that, archived data will require a paid plan to access.${baseFooter}`
    },
    'subscription.activated': {
      subject: `✅ MandiGrow subscription activated — Welcome aboard!`,
      body: `${baseGreeting}\n\nThank you for subscribing to MandiGrow! Your plan is now active.\n\nPlan: ${metadata?.plan_name || 'Standard'}\nBilling: ${metadata?.billing_cycle || 'Monthly'}\nNext renewal: ${metadata?.period_end ? new Date(metadata.period_end).toLocaleDateString('en-IN') : 'In 30 days'}\n\nYour invoice has been sent to your registered email address.\n\n🚀 Start using your premium features: https://app.mandigrow.in/dashboard${baseFooter}`
    },
    'renewal.reminder_sent': {
      subject: `Your MandiGrow subscription renews in ${metadata?.days_left} days`,
      body: `${baseGreeting}\n\nThis is a reminder that your MandiGrow subscription will automatically renew on ${metadata?.period_end ? new Date(metadata.period_end).toLocaleDateString('en-IN') : 'the renewal date'}.\n\nNo action needed if your payment method is up to date.\n\nTo manage your subscription: https://app.mandigrow.in/settings/billing${baseFooter}`
    },
    'payment.failed': {
      subject: `⚠️ Payment failed — Update your payment method`,
      body: `${baseGreeting}\n\nWe were unable to process your payment for MandiGrow.\n\nPlease update your payment method to avoid service interruption:\n🔗 https://app.mandigrow.in/settings/billing\n\nYour access continues for now. We will retry the payment in 3 days.${baseFooter}`
    },
    'grace.started': {
      subject: `🔴 URGENT: Update payment in 7 days or account will be locked`,
      body: `${baseGreeting}\n\nYour MandiGrow account is in grace period due to a failed payment.\n\n⚠️ You have 7 days to update your payment method before your account is locked.\n\nAll your data is safe. Update now to avoid interruption:\n🔗 https://app.mandigrow.in/settings/billing${baseFooter}`
    },
    'lock.soft_started': {
      subject: `🔒 MandiGrow account locked — Update payment to restore access`,
      body: `${baseGreeting}\n\nYour MandiGrow account has been locked due to non-payment.\n\nYou can still view your existing data. To restore full access:\n🔗 https://app.mandigrow.in/settings/billing\n\nContact us immediately if you need assistance: support@mandigrow.in${baseFooter}`
    },
    'subscription.cancelled': {
      subject: `Subscription cancelled — Access continues until ${metadata?.period_end ? new Date(metadata.period_end).toLocaleDateString('en-IN') : 'period end'}`,
      body: `${baseGreeting}\n\nYour MandiGrow subscription has been cancelled as requested.\n\nYou continue to have full access until: ${metadata?.period_end ? new Date(metadata.period_end).toLocaleDateString('en-IN') : 'your billing period ends'}\n\nAfter that, your data will be in read-only mode for 90 days.\n\nChanged your mind? Resubscribe anytime: https://app.mandigrow.in/settings/billing\n\nWe'd love to know how we can improve: support@mandigrow.in${baseFooter}`
    },
    'admin.plan_assigned': {
      subject: `Your MandiGrow plan has been updated`,
      body: `${baseGreeting}\n\nYour MandiGrow subscription plan has been updated by our team.\n\nNew Plan: ${metadata?.plan_name || 'Updated Plan'}\n\nIf you have questions about this change, please contact us at support@mandigrow.in${baseFooter}`
    },
    'admin.trial_extended': {
      subject: `🎉 Good news! Your MandiGrow trial has been extended`,
      body: `${baseGreeting}\n\nGreat news! We've extended your free trial.\n\nNew trial end date: ${metadata?.new_trial_end ? new Date(metadata.new_trial_end).toLocaleDateString('en-IN') : 'Extended'}\n\nEnjoy the extra time to explore MandiGrow! Questions? support@mandigrow.in${baseFooter}`
    }
  };

  return templates[eventType] || {
    subject: `MandiGrow Account Update`,
    body: `${baseGreeting}\n\nYour MandiGrow account has been updated. Please log in to see the latest status.${baseFooter}`
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const payload: NotificationPayload = await req.json();
    const { org_id, event_type, metadata = {} } = payload;

    if (!org_id || !event_type) {
      return new Response(
        JSON.stringify({ error: 'org_id and event_type are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Fetch org + owner email
    const { data: org } = await supabase
      .schema('core')
      .from('organizations')
      .select('id, name, email, phone')
      .eq('id', org_id)
      .single();

    if (!org) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Get owner email from profiles
    const { data: ownerProfile } = await supabase
      .schema('core')
      .from('profiles')
      .select('email, full_name')
      .eq('organization_id', org_id)
      .eq('role', 'tenant_admin')
      .limit(1)
      .maybeSingle();

    const toEmail = ownerProfile?.email || org.email;
    const orgName = org.name;
    const results: Record<string, string> = {};

    // ── Send Email via Resend ────────────────────────────────────────────────
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (RESEND_API_KEY && toEmail) {
      const emailContent = buildEmailContent(event_type, orgName, metadata);

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MandiGrow <noreply@mandigrow.in>',
            to: [toEmail],
            subject: emailContent.subject,
            text: emailContent.body,
          })
        });

        if (emailRes.ok) {
          results.email = 'sent';
        } else {
          const err = await emailRes.text();
          results.email = `error: ${err}`;
          console.error('[Notification] Email error:', err);
        }
      } catch (e: any) {
        results.email = `error: ${e.message}`;
      }
    } else {
      results.email = 'skipped: no api key or email';
    }

    // ── Send WhatsApp via MSG91 (for urgent events) ──────────────────────────
    const MSG91_KEY = Deno.env.get('MSG91_API_KEY');
    const urgentEvents = ['trial.reminder_sent', 'grace.started', 'lock.soft_started', 'payment.failed'];
    const phone = org.phone || ownerProfile?.email;

    if (MSG91_KEY && phone && urgentEvents.includes(event_type)) {
      try {
        const daysLeft = metadata?.days_left;
        const whatsappMsg = event_type === 'trial.reminder_sent'
          ? `MandiGrow: Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Upgrade now: https://app.mandigrow.in/settings/billing`
          : event_type === 'grace.started'
          ? `MandiGrow: URGENT - Update payment in 7 days or account locks. https://app.mandigrow.in/settings/billing`
          : `MandiGrow: Action required on your account. https://app.mandigrow.in/settings/billing`;

        const waRes = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/', {
          method: 'POST',
          headers: {
            'authkey': MSG91_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrated_number: '919XXXXXXXXX', // Your MSG91 number
            content_type: 'template',
            payload: {
              messaging_product: 'whatsapp',
              type: 'template',
              to: phone.replace(/\D/g, ''),
              template: {
                name: 'subscription_alert',
                language: { code: 'en' },
                components: [{
                  type: 'body',
                  parameters: [{ type: 'text', text: whatsappMsg }]
                }]
              }
            }
          })
        });

        results.whatsapp = waRes.ok ? 'sent' : 'error';
      } catch (e: any) {
        results.whatsapp = `error: ${e.message}`;
      }
    } else {
      results.whatsapp = 'skipped';
    }

    // Log the notification in subscription_events
    await supabase.schema('core').from('subscription_events').insert({
      organization_id: org_id,
      event_type: `notification.${event_type.replace('.', '_')}`,
      triggered_by: 'system_cron',
      metadata: { ...metadata, delivery: results }
    }).then(() => {});

    return new Response(
      JSON.stringify({ success: true, org_id, event_type, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (e: any) {
    console.error('[SendSubscriptionNotification] Error:', e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
