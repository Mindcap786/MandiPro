'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { useMemo } from 'react';

export interface SubscriptionState {
  status: string;
  planId: string | null;
  planName: string | null;
  planInterval: string | null;
  isTrialing: boolean;
  isActive: boolean;
  isPastDue: boolean;
  isGracePeriod: boolean;
  isSoftLocked: boolean;
  isExpired: boolean;
  isCancelled: boolean;
  isAdminSuspended: boolean;
  isAdminGifted: boolean;
  isWriteAllowed: boolean;  // true for active, trial, grace, past_due
  isFullyBlocked: boolean;  // true for soft_locked, expired, admin_suspended
  trialDaysRemaining: number | null;
  currentPeriodEnd: string | null;
  gracePeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  features: {
    advanced_reports: boolean;
    multi_location: boolean;
    api_access: boolean;
    bulk_import: boolean;
    custom_fields: boolean;
    audit_logs: boolean;
    tds_management: boolean;
    whatsapp_alerts: boolean;
    priority_support: boolean;
    data_export: boolean;
    gst_reports: boolean;
    white_label: boolean;
  };
  limits: {
    max_users: number;
    max_mobile_users: number;
    max_commodities: number;
    max_transactions: number;
  };
  allowedMenus: string[];
  shouldShowBanner: boolean;
  bannerUrgency: 'info' | 'warning' | 'danger' | 'none';
}

const WRITE_ALLOWED_STATUSES = new Set([
  'trialing', 'trial', 'active', 'past_due', 'grace_period',
  'grace', 'cancelled', 'admin_gifted'
]);

const FULLY_BLOCKED_STATUSES = new Set([
  'soft_locked', 'expired', 'trial_expired', 'admin_suspended', 'suspended'
]);

export function useSubscription(): SubscriptionState {
  const { profile } = useAuth();

  return useMemo(() => {
    const org = profile?.organization as any;
    const sub = profile?.subscription as any;

    // Derive status from subscription data or org status
    const rawStatus = sub?.status || org?.status || 'none';

    // Derive trial days remaining
    const trialEnd = sub?.trial_ends_at || org?.trial_ends_at;
    const trialDaysRemaining = trialEnd
      ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86_400_000))
      : null;

    const isTrialing = rawStatus === 'trialing' || rawStatus === 'trial';
    const isActive = rawStatus === 'active';
    const isPastDue = rawStatus === 'past_due';
    const isGracePeriod = rawStatus === 'grace_period' || rawStatus === 'grace';
    const isSoftLocked = rawStatus === 'soft_locked';
    const isExpired = rawStatus === 'expired' || rawStatus === 'trial_expired';
    const isCancelled = rawStatus === 'cancelled';
    const isAdminSuspended = rawStatus === 'admin_suspended' || rawStatus === 'suspended';
    const isAdminGifted = rawStatus === 'admin_gifted';

    const isWriteAllowed = WRITE_ALLOWED_STATUSES.has(rawStatus);
    const isFullyBlocked = FULLY_BLOCKED_STATUSES.has(rawStatus);

    // Determine banner urgency
    let bannerUrgency: 'info' | 'warning' | 'danger' | 'none' = 'none';
    let shouldShowBanner = false;

    if (isTrialing) {
      shouldShowBanner = true;
      bannerUrgency = trialDaysRemaining !== null && trialDaysRemaining <= 3
        ? 'danger'
        : trialDaysRemaining !== null && trialDaysRemaining <= 7
        ? 'warning'
        : 'info';
    } else if (isExpired || isSoftLocked) {
      shouldShowBanner = true;
      bannerUrgency = 'danger';
    } else if (isPastDue || isGracePeriod) {
      shouldShowBanner = true;
      bannerUrgency = isGracePeriod ? 'danger' : 'warning';
    } else if (isCancelled) {
      shouldShowBanner = true;
      bannerUrgency = 'info';
    }

    // Extract features from subscription context
    const features = sub?.features || {
      advanced_reports: false,
      multi_location: false,
      api_access: false,
      bulk_import: false,
      custom_fields: false,
      audit_logs: false,
      tds_management: false,
      whatsapp_alerts: false,
      priority_support: false,
      data_export: true,
      gst_reports: true,
      white_label: false,
    };

    const limits = {
      max_users:        sub?.limits?.max_users || org?.max_web_users || 2,
      max_mobile_users: sub?.limits?.max_mobile_users || org?.max_mobile_users || 0,
      max_commodities:  sub?.limits?.max_commodities || 50,
      max_transactions: sub?.limits?.max_transactions_per_month || 500,
    };

    const allowedMenus: string[] = sub?.allowed_menus || [];

    return {
      status: rawStatus,
      planId: sub?.subscription_tier || org?.subscription_tier || null,
      planName: sub?.org_name || null,
      planInterval: sub?.plan_interval || null,
      isTrialing,
      isActive,
      isPastDue,
      isGracePeriod,
      isSoftLocked,
      isExpired,
      isCancelled,
      isAdminSuspended,
      isAdminGifted,
      isWriteAllowed,
      isFullyBlocked,
      trialDaysRemaining,
      currentPeriodEnd: sub?.current_period_end || org?.current_period_end || null,
      gracePeriodEnd: org?.grace_period_ends_at || sub?.grace_period_ends_at || null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end || false,
      features,
      limits,
      allowedMenus,
      shouldShowBanner,
      bannerUrgency,
    };
  }, [profile]);
}
