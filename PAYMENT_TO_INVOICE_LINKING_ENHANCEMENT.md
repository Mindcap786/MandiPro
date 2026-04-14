# PAYMENT-TO-INVOICE LINKING ENHANCEMENT

**Objective**: When payments are recorded, link them to specific invoices so the ledger shows which payment corresponds to which sale.

**Current State**: ❌ Payments recorded but not linked to invoices  
**Desired State**: ✅ Payments linked to invoice numbers with clear tracking in ledger

---

## 🎯 THE REQUIREMENT

When you record a payment from a buyer:
```
Payment Received: Rs 3,000
Issue: Which invoice is this payment for? (Inv #1, #2, or both?)
Solution: Allow user to select which invoice(s) this payment covers
```

---

## 📊 EXISTING DATABASE STRUCTURE

### Vouchers Table (Already Has Support!)
```sql
vouchers:
  id                → Unique voucher ID
  type              → 'receipt', 'payment', etc
  invoice_id        → ✅ Links to which sale invoice!
  contact_id        → Who received/paid
  amount            → Payment amount
  date              → Payment date
```

### Ledger Entries Table (Already Has Support!)
```sql
ledger_entries:
  bill_number                  → From sales/arrivals
  payment_against_bill_number  → Which bill this payment is for
  lot_items_json              → Item details
```

---

## 📝 IMPLEMENTATION PLAN

### Phase 1: Database Enhancement
**Update Trigger**: Make `populate_ledger_bill_details()` also handle payment entries
```sql
-- When transaction_type = 'receipt' (payment):
-- Look up voucher.invoice_id
-- Get the sale's bill_number from mandi.sales
-- Populate: NEW.payment_against_bill_number = 'SALE-' || bill_no
```

### Phase 2: Payment Recording RPC
**Enhance `record_advance_payment()` or Create New RPC**: Accept invoice_id parameter
```sql
-- Function call:
record_payment(
  p_organization_id,
  p_party_id,
  p_amount,
  p_date,
  p_mode (cash/bank/cheque),
  p_invoice_id  ← ✅ NEW PARAMETER (which invoice is this payment for?)
)
```

### Phase 3: Frontend Enhancement
**Update Payment Dialog**: Let user select which invoice to apply payment to
```tsx
-- Add new field in new-receipt-dialog.tsx:
<SelectField
  name="invoice_id"
  label="Payment For (Invoice)"
  options={invoices}  // Show unpaid invoices for this buyer
/>

-- In onSubmit, pass to RPC:
rpc('record_payment', {
  ...
  p_invoice_id: values.invoice_id  // ← ✅ NEW
})
```

### Phase 4: Ledger Statement Display
**Update Ledger Display**: Show bill number for payments
```
Date | Particulars | Debit | Credit | Balance
-----|----------|-------|--------|----------
13 Apr | Inv #1 | 3,000 | - | 3,000 DR
13 Apr | Inv #2 | 3,000 | - | 6,000 DR
13 Apr | Payment (For Inv #1) | - | 3,000 | 3,000 DR ← Shows which invoice!
```

---

## 🔧 STEP 1: ENHANCE THE TRIGGER

Update `populate_ledger_bill_details()` to handle payment entries:

```sql
CREATE OR REPLACE FUNCTION mandi.populate_ledger_bill_details()
RETURNS TRIGGER AS $$
DECLARE
    v_bill_number TEXT;
    v_lot_items JSONB;
    v_payment_bill TEXT;
BEGIN
    -- EXISTING: Handle sales & purchases ✓
    IF NEW.reference_id IS NOT NULL 
       AND NEW.transaction_type IN ('sale', 'goods') THEN
        -- ...existing code...
    END IF;
    
    -- ✅ NEW: Handle payments
    IF NEW.transaction_type = 'receipt' THEN
        -- Look up if this is a payment voucher
        SELECT v.invoice_id INTO v_payment_bill
        FROM mandi.vouchers v
        WHERE v.id = NEW.reference_id;
        
        -- If payment is linked to an invoice, get the bill number
        IF v_payment_bill IS NOT NULL THEN
            SELECT 'SALE-' || s.bill_no::TEXT INTO v_bill_number
            FROM mandi.sales s
            WHERE s.id = v_payment_bill::uuid;
            
            -- Set the payment against bill
            NEW.payment_against_bill_number := v_bill_number;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 🔧 STEP 2: CREATE/UPDATE PAYMENT RPC

Create a new RPC function or update existing `record_advance_payment`:

```sql
CREATE OR REPLACE FUNCTION mandi.record_payment(
    p_organization_id UUID,
    p_party_id UUID,
    p_amount NUMERIC,
    p_date DATE,
    p_mode TEXT,       -- 'cash', 'bank', 'cheque'
    p_invoice_id UUID, -- ✅ NEW: Which invoice is this payment for?
    p_remarks TEXT DEFAULT NULL,
    p_cheque_no TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_bank_name TEXT DEFAULT NULL
)
RETURNS TABLE (voucher_id UUID, ledger_count INT) AS $$
DECLARE
    v_voucher_id UUID;
    v_ledger_count INT := 0;
BEGIN
    -- Step 1: Create voucher record with invoice_id
    INSERT INTO mandi.vouchers (
        organization_id, type, date, amount, contact_id, 
        invoice_id,      ← ✅ Link to invoice
        payment_mode, cheque_no, cheque_date, bank_name,
        narration
    ) VALUES (
        p_organization_id, 'receipt', p_date, p_amount, p_party_id,
        p_invoice_id,      ← Store which invoice this pays
        p_mode, p_cheque_no, p_cheque_date, p_bank_name,
        p_remarks
    )
    RETURNING id INTO v_voucher_id;
    
    -- Step 2: Create ledger entries (which will trigger our enhancement)
    INSERT INTO mandi.ledger_entries (
        organization_id, transaction_type, reference_id, amount, ...
    ) VALUES (
        p_organization_id, 'receipt', v_voucher_id, p_amount, ...
    );
    
    -- Step 3: The trigger will automatically populate payment_against_bill_number!
    
    SELECT COUNT(*) INTO v_ledger_count FROM mandi.ledger_entries 
    WHERE reference_id = v_voucher_id;
    
    RETURN QUERY SELECT v_voucher_id, v_ledger_count;
END;
$$ LANGUAGE plpgsql;
```

---

## 🎨 STEP 3: UPDATE PAYMENT DIALOG

Current code (new-receipt-dialog.tsx):
```tsx
// ❌ CURRENT: No invoice selection
const onSubmit = async (values) => {
    const { error } = await supabase
        .rpc('receive_payment', {
            p_organization_id: profile?.organization_id,
            p_party_id: values.party_id,
            p_amount: values.amount,
            // Missing: Which invoice is this payment for?
        });
};
```

✅ **ENHANCED VERSION**:
```tsx
// Add to form schema:
const formSchema = z.object({
    party_id: z.string().min(1, "Select a party"),
    amount: z.coerce.number().min(1),
    payment_mode: z.enum(["cash", "upi_bank", "cheque"]),
    payment_date: z.date(),
    invoice_id: z.string().optional(),  // ✅ NEW
    remarks: z.string().optional(),
    // ...cheque fields...
});

// In component:
const [invoices, setInvoices] = useState<any[]>([]);

useEffect(() => {
    if (selectedPartyId) {
        fetchUnpaidInvoices(selectedPartyId);  // ✅ NEW
    }
}, [selectedPartyId]);

const fetchUnpaidInvoices = async (partyId: string) => {
    // Get sales where buyer hasn't paid full amount
    const { data } = await supabase
        .schema('mandi')
        .from('sales')
        .select('id, bill_no, total_amount_inc_tax, payment_status, created_at')
        .eq('buyer_id', partyId)
        .eq('organization_id', profile?.organization_id)
        .in('payment_status', ['pending', 'partial'])  // Only unpaid
        .order('created_at', { ascending: false });
    
    if (data) setInvoices(data);
};

// In form:
<FormField
    control={form.control}
    name="invoice_id"
    render={({ field }) => (
        <FormItem>
            <FormLabel className="uppercase text-[10px] font-bold">
                Payment For (Optional)
            </FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                    <SelectTrigger className="bg-white/5 border-white/10 h-10">
                        <SelectValue placeholder="Select Invoice (or leave for advance)" />
                    </SelectTrigger>
                </FormControl>
                <SelectContent className="bg-[#0A0A12] border-white/10 text-white">
                    {invoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                            Inv #{inv.bill_no} - Rs{inv.total_amount_inc_tax} 
                            ({inv.payment_status})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <FormDescription className="text-xs text-gray-500">
                Leave blank to record as advance payment
            </FormDescription>
        </FormItem>
    )}
/>

// In onSubmit:
const onSubmit = async (values) => {
    const { error } = await supabase
        .rpc('record_payment', {  // ← Call new RPC
            p_organization_id: profile?.organization_id,
            p_party_id: values.party_id,
            p_amount: values.amount,
            p_date: values.payment_date.toISOString(),
            p_mode: values.payment_mode === 'upi_bank' ? 'bank' : values.payment_mode,
            p_invoice_id: values.invoice_id || null,  // ← ✅ NEW
            p_remarks: values.remarks,
            p_cheque_no: values.payment_mode === 'cheque' ? values.cheque_no : null,
            p_cheque_date: (values.payment_mode === 'cheque' && values.cheque_date) 
                ? values.cheque_date.toISOString() 
                : null,
            p_bank_name: values.payment_mode === 'cheque' ? values.bank_name : null,
        });
};
```

---

## 📊 RESULT AFTER ENHANCEMENT

### Ledger Statement - BEFORE (Current)
```
Date | Particulars | Debit | Credit | Balance
-----|----------|-------|--------|----------
13 Apr | Inv #1 | 3,000 | - | 3,000 DR
13 Apr | Inv #2 | 3,000 | - | 6,000 DR
13 Apr | Payment Received | - | 3,000 | 3,000 DR
           ↑ Which invoice did this payment cover? Unclear!
```

### Ledger Statement - AFTER (Enhanced)
```
DATE   | PARTICULARS                    | DEBIT    | CREDIT   | BALANCE
-------|--------------------------------|----------|----------|----------
13 Apr | Inv #1 - Apple (10 Box)       | 3,000.00 | -        | 3,000.00 DR
13 Apr | Inv #2 - Mango (10 Box)       | 3,000.00 | -        | 6,000.00 DR
13 Apr | Payment Received (For Inv #1) | -        | 3,000.00 | 3,000.00 DR
           ↑ Clearly shows which invoice this paid for! ✅
```

---

## ✅ BENEFITS

1. **Clear Tracking**: See which payment goes with which invoice
2. **Better Reconciliation**: Match payments to sales easily
3. **Partial Payments**: Record multiple payments per customer clearly
4. **Advance Payments**: If no invoice selected, recorded as advance
5. **Customer Statements**: Customers can see their invoice VS payment history
6. **Audit Trail**: Complete linkage between sales, payments, and ledger

---

## 🔄 DATA FLOW

```
User fills payment form + selects Invoice #1
    ↓
Frontend calls: record_payment(..., p_invoice_id='inv_uuid')
    ↓
Backend RPC:
  1. Creates voucher with invoice_id = 'inv_uuid'
  2. Inserts ledger entries with reference_id = voucher_id
  3. ✅ Trigger fires!
    ↓
Trigger populate_ledger_bill_details():
  1. Detects: transaction_type = 'receipt'
  2. Looks up: voucher.invoice_id
  3. Finds: sale.bill_no = 'SL-2024-001'
  4. Sets: payment_against_bill_number = 'SALE-SL-2024-001'
    ↓
✅ Ledger now shows:
   Payment Received (For SALE-SL-2024-001)
   ↑ Clear linkage established!
```

---

## 🚀 IMPLEMENTATION PRIORITY

1. **HIGH**: Update trigger to handle payment entries (Phase 1)
2. **HIGH**: Create record_payment RPC (Phase 2)
3. **MEDIUM**: Update payment dialog (Phase 3)
4. **NICE-TO-HAVE**: Display enhancement in ledger (Phase 4)

---

## 📋 READY TO IMPLEMENT?

When you're ready, I'll:
1. ✅ Update the trigger function to link payments to invoices
2. ✅ Create the record_payment RPC function
3. ✅ Update the payment dialog frontend
4. ✅ Verify payment entries now show which invoice they're for

This will give you exactly what you asked for: **"When payment done as part of sale record that payment received as part of #invoice number"** ✅
