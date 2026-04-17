import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase Edge Function: subscription-automation
// Triggered by pg_cron via HTTP or directly from admin panel
// Handles all lifecycle automation jobs server-side

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { job } = await req.json().catch(() => ({ job: 'all' }));
    const results: Record<string, any> = {};

    const runJob = async (name: string, fn: () => Promise<any>) => {
      try {
        results[name] = await fn();
      } catch (e: any) {
        results[name] = { error: e.message };
        console.error(`[AutomationJob:${name}]`, e.message);
      }
    };

    // ── Job: Expire Trials ───────────────────────────────────────────────────
    if (job === 'all' || job === 'expire_trials') {
      await runJob('expire_trials', async () => {
        const { data, error } = await supabase.rpc('expire_trials');
        if (error) throw error;
        return { expired: data };
      });
    }

    // ── Job: Send Trial Reminders ────────────────────────────────────────────
    if (job === 'all' || job === 'send_trial_reminders') {
      await runJob('send_trial_reminders', async () => {
        // Get subscriptions needing reminders
        const now = new Date();
        const { data: subs } = await supabase
          .schema('core')
          .from('subscriptions')
          .select('id, organization_id, trial_ends_at')
          .in('status', ['trialing', 'trial'])
          .eq('trial_converted', false)
          .gt('trial_ends_at', now.toISOString());

        let sent = 0;
        for (const sub of (subs || [])) {
          const trialEnd = new Date(sub.trial_ends_at);
          const daysLeft = Math.floor((trialEnd.getTime() - now.getTime()) / 86400000);

          if ([7, 3, 1, 0].includes(daysLeft)) {
            // Check if reminder already sent today
            const { data: existing } = await supabase
              .schema('core')
              .from('subscription_events')
              .select('id')
              .eq('subscription_id', sub.id)
              .eq('event_type', 'trial.reminder_sent')
              .contains('metadata', { days_left: daysLeft })
              .gte('created_at', new Date(now.getTime() - 20 * 3600000).toISOString())
              .limit(1);

            if (!existing?.length) {
              // Queue notification
              await supabase.functions.invoke('send-subscription-notification', {
                body: {
                  org_id: sub.organization_id,
                  event_type: 'trial.reminder_sent',
                  metadata: { days_left: daysLeft, trial_ends_at: sub.trial_ends_at }
                }
              });

              await supabase.schema('core').from('subscription_events').insert({
                organization_id: sub.organization_id,
                subscription_id: sub.id,
                event_type: 'trial.reminder_sent',
                triggered_by: 'system_cron',
                metadata: { days_left: daysLeft }
              });

              sent++;
            }
          }
        }
        return { sent };
      });
    }

    // ── Job: Expire Grace Periods → Soft Lock ───────────────────────────────
    if (job === 'all' || job === 'expire_grace_periods') {
      await runJob('expire_grace_periods', async () => {
        const { data, error } = await supabase.rpc('expire_grace_periods');
        if (error) throw error;

        // Send lock notifications for newly locked orgs
        const { data: locked } = await supabase
          .schema('core')
          .from('subscription_events')
          .select('organization_id')
          .eq('event_type', 'lock.soft_started')
          .gte('created_at', new Date(Date.now() - 3600000).toISOString());

        for (const evt of (locked || [])) {
          await supabase.functions.invoke('send-subscription-notification', {
            body: { org_id: evt.organization_id, event_type: 'lock.soft_started', metadata: {} }
          });
        }

        return { locked: data };
      });
    }

    // ── Job: Apply Scheduled Downgrades ─────────────────────────────────────
    if (job === 'all' || job === 'apply_scheduled_changes') {
      await runJob('apply_scheduled_changes', async () => {
        const { data, error } = await supabase.rpc('apply_scheduled_changes');
        if (error) throw error;
        return { applied: data };
      });
    }

    // ── Job: Expire Cancelled Subscriptions ─────────────────────────────────
    if (job === 'all' || job === 'expire_subscriptions') {
      await runJob('expire_subscriptions', async () => {
        const { data, error } = await supabase.rpc('expire_subscriptions');
        if (error) throw error;
        return { expired: data };
      });
    }

    // ── Job: Send Renewal Reminders ─────────────────────────────────────────
    if (job === 'all' || job === 'send_renewal_reminders') {
      await runJob('send_renewal_reminders', async () => {
        const { data: subs } = await supabase
          .schema('core')
          .from('subscriptions')
          .select('id, organization_id, current_period_end')
          .eq('status', 'active')
          .gt('current_period_end', new Date().toISOString())
          .lt('current_period_end', new Date(Date.now() + 8 * 86400000).toISOString());

        const now = new Date();
        let sent = 0;

        for (const sub of (subs || [])) {
          const endDate = new Date(sub.current_period_end);
          const daysLeft = Math.floor((endDate.getTime() - now.getTime()) / 86400000);

          if ([7, 3, 1].includes(daysLeft)) {
            const { data: existing } = await supabase
              .schema('core')
              .from('subscription_events')
              .select('id')
              .eq('subscription_id', sub.id)
              .eq('event_type', 'renewal.reminder_sent')
              .contains('metadata', { days_left: daysLeft })
              .gte('created_at', new Date(now.getTime() - 20 * 3600000).toISOString())
              .limit(1);

            if (!existing?.length) {
              await supabase.functions.invoke('send-subscription-notification', {
                body: {
                  org_id: sub.organization_id,
                  event_type: 'renewal.reminder_sent',
                  metadata: { days_left: daysLeft, period_end: sub.current_period_end }
                }
              });

              await supabase.schema('core').from('subscription_events').insert({
                organization_id: sub.organization_id,
                subscription_id: sub.id,
                event_type: 'renewal.reminder_sent',
                triggered_by: 'system_cron',
                metadata: { days_left: daysLeft }
              });

              sent++;
            }
          }
        }
        return { sent };
      });
    }

    return new Response(
      JSON.stringify({ success: true, timestamp: new Date().toISOString(), results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (e: any) {
    console.error('[SubscriptionAutomation] Fatal error:', e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
