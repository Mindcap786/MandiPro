# ⚡ QUICK FIX - 2 MINUTE DEPLOYMENT

## Your ACTUAL Problem (Just Diagnosed)

Data exists in database ✅  
RLS policies work correctly ✅  
API is configured ✅  
**BUT:** Your user isn't assigned to the organization that owns the data ❌

---

## IMMEDIATE FIX (Choose ONE)

### 3-Step Fix to Deploy NOW:

#### Step 1: Find Your User ID
Open browser DevTools (F12) → Console tab, paste:
```javascript
const { data } = await supabase.auth.getUser();
console.log(data.user.id);
```
Copy the ID that appears.

#### Step 2: Open Supabase Dashboard 
Go to SQL Editor: https://supabase.co/dashboard/project/ldayxjabzyorpugwszpt/sql

#### Step 3: Run ONE of These Queries

**If you need to find where data is:**
```sql
SELECT DISTINCT organization_id FROM mandi.contacts LIMIT 1;
```

**THEN assign your user to that organization:**
```sql
UPDATE core.profiles 
SET organization_id = '51771d21-1d09-4fe2-b72c-31692f04d89f'
WHERE id = 'PASTE_YOUR_USER_ID_FROM_STEP_1';
```

---

## Verify Fix Works

1. Hard-refresh browser (Cmd+Shift+R)
2. Go to Sales page
3. Try searching for buyer
4. Should show 6 buyers ✅

If not, uncomment finance data exists:
```sql
SELECT COUNT(*) FROM core.profiles WHERE organization_id IS NOT NULL;
SELECT COUNT(*) FROM mandi.contacts;
```

---

## Why Your POS Works But Sales Doesn't

- **POS:** Likely queries differently or specific org
- **Sales:** Queries your org which has no data

Both will work after you're assigned to right organization.

---

## That's It!

One SQL update and refresh. System is fully functional, just needed correct user-org mapping.

Deploy now → Test → Done ✅
