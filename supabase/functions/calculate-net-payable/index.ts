import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { transaction_id } = await req.json();

    if (!transaction_id) {
      throw new Error("Transaction ID is required");
    }

    // 1. Fetch Transaction Details
    const { data: transaction, error: txError } = await supabaseClient
      .from('transactions')
      .select('*, merchant_id')
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) throw new Error("Transaction not found");

    // 2. Fetch Settings for this Merchant
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select('*')
      .eq('merchant_id', transaction.merchant_id)
      .single();
    
    // Default values if settings not found (or handle error)
    const commissionPct = settings?.commission_percentage || 0;
    const hamaliPerUnit = settings?.hamali_per_unit || 0;
    const marketFeePct = settings?.market_fee_percentage || 0;

    // 3. Calculate Values
    const grossAmount = transaction.rate * transaction.quantity;
    const commissionParam = (commissionPct / 100);
    const commissionAmount = grossAmount * commissionParam;
    const hamaliAmount = hamaliPerUnit * transaction.quantity;
    const marketFeeAmount = grossAmount * (marketFeePct / 100);

    const totalDeductions = commissionAmount + hamaliAmount + marketFeeAmount;
    const netPayable = grossAmount - totalDeductions;

    // 4. Update Transaction
    const { error: updateError } = await supabaseClient
      .from('transactions')
      .update({
        commission_amount: commissionAmount,
        labor_charge: hamaliAmount, // Mapping hamali to labor_charge
        net_payable: netPayable
      })
      .eq('id', transaction_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        success: true, 
        net_payable: netPayable,
        breakdown: {
          gross: grossAmount,
          commission: commissionAmount,
          hamali: hamaliAmount,
          market_fee: marketFeeAmount
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
