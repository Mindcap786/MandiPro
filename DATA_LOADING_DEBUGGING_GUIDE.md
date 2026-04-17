# 🔍 DATA LOADING ISSUE - COMPLETE DEBUGGING GUIDE

## Root Cause Analysis (What We Found)

### Status of System
✅ **Database**: Working correctly
- 331 sales records exist
- 298 arrivals records exist  
- 295 lots records exist

✅ **RLS Policies**: Correct
- mandi_sales_select uses get_user_org_id() function
- mandi_arrivals_select_v2 uses get_user_org_id() function
- Authentication-based security working

✅ **User Profiles**: Exist and working
- core.profiles has 53 user records
- Organizations linked correctly
- get_user_org_id() function working

✅ **Application Code**: Correct
- Uses `.schema("mandi")` correctly
- Filters by organization_id properly
- Error handling in place

---

## BUT: Why Is No Data Showing?

There are 3 possibilities:

### Possibility 1: User's Organization Has No Data
**What it means**: The logged-in user belongs to an organization that has 0 sales/arrivals
- Solution: Check which organization the user belongs to in database

### Possibility 2: Profile Not Loading in Frontend
**What it means**: profile.organization_id is undefined, so query doesn't filter by anything
- Solution: Check if profile is loading in browser

### Possibility 3: API Response Error
**What it means**: Database returns error (RLS, permission, connection issue)
- Solution: Check browser console and network tab for errors

---

## How to Diagnose: Step-by-Step

### STEP 1: Run the Debug Test

1. Open your application in browser
2. Go to any page (Sales, Arrivals, etc.)
3. Open **DevTools** (F12)
4. Go to **Console** tab
5. Copy-paste this code and run it:

```javascript
// DEBUG TEST: Data Loading Issue Diagnosis
async function debugDataLoading() {
    const supabase = window.supabase;
    
    console.log("🔍 DEBUGGING DATA LOADING ISSUE...\n");
    
    // TEST 1: Check if user is authenticated
    console.log("TEST 1: Authentication");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.error("❌ NOT AUTHENTICATED:", authError?.message);
        return;
    }
    console.log("✅ Authenticated as:", user.email);
    console.log("   User ID:", user.id, "\n");
    
    // TEST 2: Fetch profile via RPC (same as app)
    console.log("TEST 2: Fetch Profile via RPC");
    const { data: rpcContext, error: rpcError } = await supabase.rpc('get_full_user_context', {
        p_user_id: user.id
    });
    
    if (rpcError) {
        console.warn("⚠️  RPC failed:", rpcError.message);
    } else if (rpcContext) {
        console.log("✅ RPC Context loaded");
        console.log("   Org ID:", rpcContext.organization?.id);
        console.log("   Org Name:", rpcContext.organization?.name);
    }
    
    // TEST 3: Direct profile lookup (fallback)
    console.log("\nTEST 3: Direct Profile Lookup");
    const { data: directProfile, error: directError } = await supabase
        .schema('core')
        .from('profiles')
        .select('*, organization:organization_id(*)')
        .eq('id', user.id)
        .maybeSingle();
    
    if (directError) {
        console.error("❌ Direct lookup failed:", directError.message);
    } else if (directProfile) {
        console.log("✅ Direct profile found");
        console.log("   Organization ID:", directProfile.organization_id);
    }
    
    const orgId = rpcContext?.organization?.id || directProfile?.organization_id;
    
    if (!orgId) {
        console.error("\n❌ CRITICAL: Cannot determine organization ID");
        return;
    }
    
    console.log(`\n✅ Using Organization ID: ${orgId}\n`);
    
    // TEST 4: Fetch sales
    console.log("TEST 4: Fetch Sales Data");
    const { data: salesData, error: salesError } = await supabase
        .schema('mandi')
        .from('sales')
        .select('id, sale_date, total_amount')
        .eq('organization_id', orgId)
        .limit(5);
    
    if (salesError) {
        console.error("❌ Sales fetch failed:", salesError.message);
    } else {
        console.log("✅ Query succeeded");
        console.log(`   Sales returned: ${salesData?.length || 0}`);
        if (salesData?.length > 0) {
            console.log("   Sample:", salesData[0]);
        }
    }
    
    // TEST 5: Arrivals
    console.log("\nTEST 5: Fetch Arrivals Data");
    const { data: arrivalsData, error: arrivalsError } = await supabase
        .schema('mandi')
        .from('arrivals')
        .select('id, arrival_date')
        .eq('organization_id', orgId)
        .limit(5);
    
    if (arrivalsError) {
        console.error("❌ Arrivals fetch failed:", arrivalsError.message);
    } else {
        console.log("✅ Query succeeded");
        console.log(`   Arrivals returned: ${arrivalsData?.length || 0}`);
    }
}

debugDataLoading();
```

6. Read the output carefully

---

### STEP 2: Check What You See

**✅ If you see:**
```
✅ Authenticated as: user@example.com
✅ RPC Context loaded
   Org ID: (some uuid)
   Org Name: IMRAN SIR MANDI
✅ Query succeeded
   Sales returned: 10
   Sample: {id: "...", ...}
```
→ **Database and API are working!** 
→ **Problem is in the UI/React code**
→ Go to STEP 3

**❌ If you see:**
```
❌ Sales fetch failed: 403 Forbidden
```
or
```
❌ Sales fetch failed: relation "mandi.sales" does not exist
```
→ **Database problem**
→ Tell me the exact error message

**❌ If you see:**
```
❌ CRITICAL: Cannot determine organization ID
```
→ **Profile loading issue**
→ The app can't get the user's organization

---

### STEP 3: If API Works But UI Doesn't

The problem is in how the **React component processes data**. Check:

1. **Is the hook providing correct profile?**
   ```javascript
   // In browser console
   // After opening Sales page, type this:
   localStorage.getItem('mandi_profile_cache')
   
   // You should see a JSON with organization_id field
   // If it's empty or missing organization_id: ❌ PROFILE CACHE ISSUE
   ```

2. **Is the component calling the API?**
   - Open DevTools → Network tab
   - Go to Sales page
   - Look for requests to: `ldayxjabzyorpugwszpt.supabase.co/rest/v1/mandi/...`
   - Should see multiple requests (stats, sales, etc.)
   - Status should be `200`

3. **Check the error:**
   - In Console tab, look for red errors
   - Copy the exact error message

---

## Quick Diagnostic Checklist

```
QUICK CHECKS:

1. User Authenticated?
   ✅ Yes / ❌ No / ⚠️ Not Sure
   
2. Profile Loading  (run test)?
   ✅ Yes, shows org ID / ❌ No / ⚠️ Shows null

3. Sales Query Works (run test)?
   ✅ Yes, returns data / ❌ No, returns error / ⚠️ Returns empty

4. Arrivals Query Works (run test)?
   ✅ Yes, returns data / ❌ No, returns error / ⚠️ Returns empty

5. Network Requests Made?
   ✅ Yes, status 200 / ❌ No requests / ⚠️ Getting 403/404
   
6. Browser Errors?
   ✅ No errors / ❌ Has errors showing
```

---

## What to Tell Me

Once you run the debug test, tell me:

1. **Copy-paste the ENTIRE console output**
   - Include all the TEST results
   
2. **Screenshot of Network tab**
   - Show the requests being made
   - Show their status codes

3. **Any error messages**
   - Red text in console
   - Full error details

4. **Your organization name**
   - From the "Imran sir Mandi" dropdown
   - Your login email

---

## Expected Behavior After Fix

✅ **When you refresh the Sales page:**
```
1. Page shows loading spinner (briefly)
2. Spinner goes away
3. Sales list appears with data
4. No console errors
5. Network shows successful requests (200 status)
```

✅ **When you go to Arrivals page:**
```
1. Form loads
2. Arrivals list appears (or you can search)
3. "No results found" ONLY if you're searching and that search has no results
```

❌ **If you see "No results found" on initial load:**
- That means the page loaded but returned 0 records
- Could mean: 
  - Your org has no arrivals/sales
  - OR data loading is still broken

---

## Next Actions

1. **Run the debug test NOW** (copy-paste code above)
2. **Share the output** with exact details
3. **I'll identify the exact issue** based on the results
4. **We'll fix it** with targeted changes

The issue is NOW ISOLATED to one of:
- User authentication / profile not loading
- org_id mismatch (user belongs to org with no data)
- Frontend React code issue
- API permission issue

Once I have the debug output, I can pinpoint it **100%**.

---

**Status**: Ready for user-side debugging  
**Next Step**: Run the test and share output
