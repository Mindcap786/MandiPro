'use client';

import { useSubscription } from './use-subscription';

type FeatureKey =
  | 'advanced_reports' | 'multi_location' | 'api_access'
  | 'bulk_import' | 'custom_fields' | 'audit_logs'
  | 'tds_management' | 'whatsapp_alerts' | 'priority_support'
  | 'data_export' | 'gst_reports' | 'white_label';

// useFeatureFlag — checks if a specific feature is enabled for the current plan
// Usage: const { enabled, requiredPlan } = useFeatureFlag('advanced_reports')

export function useFeatureFlag(featureKey: FeatureKey) {
  const { features, planId, status } = useSubscription();

  // Features available on which plan
  const PLAN_REQUIREMENTS: Record<FeatureKey, string> = {
    data_export:       'basic',
    gst_reports:       'basic',
    tds_management:    'standard',
    audit_logs:        'standard',
    advanced_reports:  'standard',
    bulk_import:       'standard',
    whatsapp_alerts:   'standard',
    multi_location:    'enterprise',
    api_access:        'enterprise',
    custom_fields:     'enterprise',
    white_label:       'enterprise',
    priority_support:  'enterprise',
  };

  const PLAN_DISPLAY_NAMES: Record<string, string> = {
    basic:      'Basic',
    standard:   'Standard',
    enterprise: 'Enterprise',
  };

  const enabled = features?.[featureKey] ?? false;
  const requiredPlan = PLAN_REQUIREMENTS[featureKey] || 'standard';
  const requiredPlanName = PLAN_DISPLAY_NAMES[requiredPlan] || 'Standard';

  return {
    enabled,
    requiredPlan,
    requiredPlanName,
    currentPlan: planId,
  };
}
