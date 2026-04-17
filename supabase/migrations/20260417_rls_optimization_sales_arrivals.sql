-- Optimized Org ID lookup for Mandi schema
CREATE OR REPLACE FUNCTION mandi.get_user_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mandi, core, public, pg_temp'
AS $function$
  SELECT core.get_my_org_id();
$function$;

-- Optimize RLS for Mandi Sales
DROP POLICY IF EXISTS "sales_select" ON mandi.sales;
DROP POLICY IF EXISTS "sales_insert" ON mandi.sales;
DROP POLICY IF EXISTS "sales_update" ON mandi.sales;
DROP POLICY IF EXISTS "tenant_isolation" ON mandi.sales;

CREATE POLICY "mandi_sales_isolation" ON mandi.sales
    FOR ALL TO public
    USING (organization_id = mandi.get_user_org_id())
    WITH CHECK (organization_id = mandi.get_user_org_id());

-- Optimize RLS for Mandi Arrivals
DROP POLICY IF EXISTS "arrivals_select" ON mandi.arrivals;
DROP POLICY IF EXISTS "arrivals_insert" ON mandi.arrivals;
DROP POLICY IF EXISTS "arrivals_update" ON mandi.arrivals;
DROP POLICY IF EXISTS "arrivals_delete" ON mandi.arrivals;
DROP POLICY IF EXISTS "tenant_isolation" ON mandi.arrivals;

CREATE POLICY "mandi_arrivals_isolation" ON mandi.arrivals
    FOR ALL TO public
    USING (organization_id = mandi.get_user_org_id())
    WITH CHECK (organization_id = mandi.get_user_org_id());

-- Optimize RLS for Mandi Lots
DROP POLICY IF EXISTS "lots_select" ON mandi.lots;
DROP POLICY IF EXISTS "lots_insert" ON mandi.lots;
DROP POLICY IF EXISTS "lots_update" ON mandi.lots;
DROP POLICY IF EXISTS "lots_delete" ON mandi.lots;
DROP POLICY IF EXISTS "tenant_isolation" ON mandi.lots;

CREATE POLICY "mandi_lots_isolation" ON mandi.lots
    FOR ALL TO public
    USING (organization_id = mandi.get_user_org_id())
    WITH CHECK (organization_id = mandi.get_user_org_id());

-- Optimize RLS for Mandi Cheques
DROP POLICY IF EXISTS "org_cheques_select" ON mandi.cheques;
DROP POLICY IF EXISTS "org_cheques_insert" ON mandi.cheques;
DROP POLICY IF EXISTS "org_cheques_update" ON mandi.cheques;

CREATE POLICY "mandi_cheques_isolation" ON mandi.cheques
    FOR ALL TO public
    USING (organization_id = mandi.get_user_org_id())
    WITH CHECK (organization_id = mandi.get_user_org_id());

-- Optimize RLS for Mandi Vouchers
DROP POLICY IF EXISTS "vouchers_org_select" ON mandi.vouchers;
DROP POLICY IF EXISTS "vouchers_org_insert" ON mandi.vouchers;
DROP POLICY IF EXISTS "vouchers_org_update" ON mandi.vouchers;
DROP POLICY IF EXISTS "vouchers_org_delete" ON mandi.vouchers;
DROP POLICY IF EXISTS "tenant_isolation_vouchers" ON mandi.vouchers;
DROP POLICY IF EXISTS "mandi_vouchers_insert" ON mandi.vouchers;
DROP POLICY IF EXISTS "mandi_vouchers_update" ON mandi.vouchers;
DROP POLICY IF EXISTS "mandi_vouchers_delete" ON mandi.vouchers;

CREATE POLICY "mandi_vouchers_isolation" ON mandi.vouchers
    FOR ALL TO public
    USING (organization_id = mandi.get_user_org_id())
    WITH CHECK (organization_id = mandi.get_user_org_id());

-- Fix Sale Items (Ensuring visibility through sales)
DROP POLICY IF EXISTS "sale_items_org_select" ON mandi.sale_items;
DROP POLICY IF EXISTS "sale_items_org_insert" ON mandi.sale_items;
DROP POLICY IF EXISTS "sale_items_org_update" ON mandi.sale_items;
DROP POLICY IF EXISTS "sale_items_org_delete" ON mandi.sale_items;
DROP POLICY IF EXISTS "mandi_sale_items_insert" ON mandi.sale_items;
DROP POLICY IF EXISTS "mandi_sale_items_update" ON mandi.sale_items;
DROP POLICY IF EXISTS "mandi_sale_items_delete" ON mandi.sale_items;

CREATE POLICY "mandi_sale_items_isolation" ON mandi.sale_items
    FOR ALL TO public
    USING (EXISTS (SELECT 1 FROM mandi.sales s WHERE s.id = sale_id AND s.organization_id = mandi.get_user_org_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM mandi.sales s WHERE s.id = sale_id AND s.organization_id = mandi.get_user_org_id()));

-- Verify and Fix mandi_settings
DROP POLICY IF EXISTS "tenant_isolation_mandi_settings" ON mandi.mandi_settings;
DROP POLICY IF EXISTS "mandi_settings_all_policy" ON mandi.mandi_settings;

CREATE POLICY "mandi_settings_isolation" ON mandi.mandi_settings
    FOR ALL TO public
    USING (organization_id = mandi.get_user_org_id())
    WITH CHECK (organization_id = mandi.get_user_org_id());

-- Force cache reload
NOTIFY pgrst, 'reload schema';
