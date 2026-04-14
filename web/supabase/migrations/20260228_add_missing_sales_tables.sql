-- Create missing domains tables from public templates

-- Core Accounts
CREATE TABLE IF NOT EXISTS core.accounts (LIKE public.accounts INCLUDING ALL);
ALTER TABLE core.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users based on organization_id" ON core.accounts FOR ALL USING (organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid()));

-- Mandi Sale Returns
CREATE TABLE IF NOT EXISTS mandi.sale_returns (LIKE public.sale_returns INCLUDING ALL);
ALTER TABLE mandi.sale_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users based on organization_id" ON mandi.sale_returns FOR ALL USING (organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS mandi.sale_return_items (LIKE public.sale_return_items INCLUDING ALL);
ALTER TABLE mandi.sale_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users based on return_id" ON mandi.sale_return_items FOR ALL USING (return_id IN (SELECT id FROM mandi.sale_returns WHERE organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid())));

-- Mandi Sales Orders
CREATE TABLE IF NOT EXISTS mandi.sales_orders (LIKE public.sales_orders INCLUDING ALL);
ALTER TABLE mandi.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users based on organization_id" ON mandi.sales_orders FOR ALL USING (organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS mandi.sales_order_items (LIKE public.sales_order_items INCLUDING ALL);
ALTER TABLE mandi.sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users based on sales_order_id" ON mandi.sales_order_items FOR ALL USING (sales_order_id IN (SELECT id FROM mandi.sales_orders WHERE organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid())));

-- Mandi Delivery Challans
CREATE TABLE IF NOT EXISTS mandi.delivery_challans (LIKE public.delivery_challans INCLUDING ALL);
ALTER TABLE mandi.delivery_challans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users based on organization_id" ON mandi.delivery_challans FOR ALL USING (organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS mandi.delivery_challan_items (LIKE public.delivery_challan_items INCLUDING ALL);
ALTER TABLE mandi.delivery_challan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for users based on delivery_challan_id" ON mandi.delivery_challan_items FOR ALL USING (delivery_challan_id IN (SELECT id FROM mandi.delivery_challans WHERE organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid())));
