import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/auth/auth-provider';

export function useFieldGovernance(moduleId: string) {
    const { profile } = useAuth();
    const uniqueId = useRef(Math.random().toString(36).substring(7)).current;
    const [fieldConfigs, setFieldConfigs] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(false);

    const fetchConfigs = useCallback(async () => {
        if (!profile?.organization_id) return;

        setLoading(true);
        try {
            const schema = 'mandi';

            // Fetch both org-wide (user_id is null) and user-specific configs
            const { data, error } = await supabase
                .schema(schema)
                .from('field_configs')
                .select('field_key, is_visible, is_mandatory, label, default_value, field_type, user_id')
                .eq('organization_id', profile.organization_id)
                .eq('module_id', moduleId)
                .or(`user_id.is.null,user_id.eq.${profile.id}`);

            if (data) {
                const configMap: Record<string, any> = {};

                // Sort to ensure user-specific configs overwrite org-wide ones
                // org-wide (user_id null) comes first, then user-specific
                const sorted = [...data].sort((a, b) => {
                    if (a.user_id === b.user_id) return 0;
                    if (a.user_id === null) return -1;
                    return 1;
                });

                sorted.forEach(curr => {
                    configMap[curr.field_key] = curr;
                });
                setFieldConfigs(configMap);
            }
        } catch (err) {
            console.error('fetchConfigs error:', err);
        } finally {
            setLoading(false);
        }
    }, [profile?.organization_id, profile?.id, profile?.business_domain, moduleId]);

    useEffect(() => {
        fetchConfigs();

        if (!profile?.organization_id) return;

        const schema = 'mandi';

        const channel = supabase
            .channel(`field_governance_${moduleId}_${uniqueId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema,
                    table: 'field_configs',
                    filter: `organization_id=eq.${profile.organization_id}`
                },
                () => {
                    fetchConfigs();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchConfigs, profile?.organization_id, moduleId, profile?.business_domain]);

    const isVisible = (fieldKey: string) => {
        const config = fieldConfigs[fieldKey];
        if (!config) return true;
        return config.is_visible !== false;
    };

    const isMandatory = (fieldKey: string) => {
        const config = fieldConfigs[fieldKey];
        if (!config) return false;
        return config.is_mandatory === true;
    };

    const getLabel = (fieldKey: string, defaultLabel: string) => {
        if (!fieldConfigs[fieldKey]) return defaultLabel;
        return fieldConfigs[fieldKey].label || defaultLabel;
    };

    const getDefaultValue = (fieldKey: string, fieldType?: string): any => {
        const config = fieldConfigs[fieldKey];
        if (!config?.default_value) return null;

        const value = config.default_value;
        const type = fieldType || config.field_type || 'text';

        switch (type) {
            case 'number':
                return Number(value);
            case 'boolean':
                return value === 'true' || value === '1';
            case 'date':
                try { return new Date(value); } catch { return null; }
            default:
                return value;
        }
    };

    return { fieldConfigs, isVisible, isMandatory, getLabel, getDefaultValue, loading };
}
