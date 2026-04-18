# Immediate Logoff After Login - Comprehensive Debug Guide

## 🔴 Problem Statement
User logs in successfully, gets redirected to /dashboard, then **IMMEDIATELY** gets logged out (within 1-3 seconds).

## 📋 What We've Implemented - Diagnostic Phase

### Latest Deployment (Commit 279005346)
Added comprehensive logging throughout the auth flow to identify the EXACT source of logoff.

---

## 🛠️ HOW TO DEBUG THIS

### **STEP 1: Open Browser DevTools**
1. Press `F12` or `Cmd+Option+I` (Mac)
2. Click **Console** tab
3. Make sure to NOT clear the console

### **STEP 2: Test Login & IMMEDIATELY Capture Logs**

1. **Clear localStorage first** (to start clean):
   ```javascript
   localStorage.clear()
   sessionStorage.clear()
   ```

2. **Enable maximum logging** (in console):
   ```javascript
   localStorage.setItem('mandi_debug', 'true')
   ```

3. **Login** using your test account

4. **IMMEDIATELY after login**, scroll through console and **COPY ALL TEXT** before it disappears

### **STEP 3: What to Look For in Logs**

#### **If You See This Pattern:**
```
[Auth Init] Set session_version in localStorage: 1
[Auth] Version Check: { localV: "1", currentV: 1, remoteV: 2, hasProfile: true, pathname: "/dashboard" }
[Auth] Session version mismatch (local:1 < remote:2). Time since set: 150ms
[Auth] Version mismatch detected but too soon - likely race condition. Skipping logout.
```
✅ **GOOD** - Race condition prevented, user should stay logged in

---

#### **If You See This Pattern:**
```
[Auth] Version Check: { localV: null, currentV: 0, remoteV: 1, hasProfile: true, pathname: "/dashboard" }
[Auth] *** signOut() called ***
[Auth] SignOut stack trace - finding caller
```
❌ **BAD** - This shows WHO called signOut()

---

#### **If You See This Pattern:**
```
[Auth] *** CRITICAL: Session replaced — signing out. ***
[Auth] Session eviction stack trace
```
❌ **BAD** - Polling detected a session token mismatch

---

### **STEP 4: Copy Everything & Share**

**Please run this in console after login fails:**
```javascript
// Get all auth-related logs
const logs = Array.from(document.querySelectorAll('.console-message'))
    .filter(m => m.textContent.includes('[Auth'))
    .map(m => m.textContent)
    
console.log(JSON.stringify(logs, null, 2))
```

---

## 🔍 Detailed Analysis: Where Could signOut() Be Called?

### **Root Cause #1: Session Version Mismatch** (Most Likely)
**File:** `web/components/auth/auth-provider.tsx:660-690`

```typescript
if (currentV > 0 && currentV < profile.session_version) {
    // LOGOUT HAPPENS HERE
    signOut();
}
```

**Diagnostic Info Needed:**
- What does `[Auth] Version Check:` log show?
- Are `localV` and `remoteV` different?

---

### **Root Cause #2: Session Eviction (Polling)** (Medium Likely)
**File:** `web/components/auth/auth-provider.tsx:470-495`

This happens if:
- Polling detects `mandi_active_token` mismatch with server metadata
- OR JWT was revoked by admin.signOut('others') call

**Diagnostic Info Needed:**
- Is there a `[Auth] *** CRITICAL: Session replaced/revoked` error?

---

### **Root Cause #3: Idle Timeout** (Unlikely)
**File:** `web/lib/hooks/useIdleTimeout.ts`

This wouldn't trigger in ~1 second (idle timeout is 10 minutes)

**Diagnostic Info Needed:**
- Do you see `[Auth] Session Expired` toast message?

---

### **Root Cause #4: Business Domain Check** (Unlikely)
**File:** `web/app/login/PageClient.tsx:376`

```typescript
if (profile && profile.role !== 'super_admin' && profile.business_domain && profile.business_domain !== 'mandi') {
    await supabase.auth.signOut();
}
```

**Diagnostic Info Needed:**
- Does your profile have `business_domain = 'mandi'`?

---

## 📊 Database Check - Run These Queries

Open Supabase console and run:

```sql
-- Check your profile
SELECT id, email, role, business_domain, session_version 
FROM core.profiles 
WHERE email = 'your-email@domain.com'
LIMIT 1;

-- Check session version distribution  
SELECT session_version, COUNT(*) 
FROM core.profiles 
GROUP BY session_version;
```

---

## 🎯 What We Need From You

**Please provide (in order of importance):**

1. **Browser console logs** (screenshot or copy-paste)
   - Look for lines starting with `[Auth`
   - Stack traces showing function call chain
   - Timestamps

2. **Your login email address**
   - So we can query the database for your profile

3. **Browser you're using**
   - Chrome, Firefox, Safari?
   - Version?

4. **localStorage state** (run in console after login fails):
   ```javascript
   console.log({
       mandi_session_v: localStorage.getItem('mandi_session_v'),
       mandi_active_token: localStorage.getItem('mandi_active_token'),
       mandi_profile_cache: localStorage.getItem('mandi_profile_cache')?.substring(0, 100) + '...',
   })
   ```

---

## 🧪 Quick Self-Service Diagnostic

**Run this sequence in browser console:**

```javascript
// 1. Clear everything
localStorage.clear()
sessionStorage.clear()
console.clear()

// 2. Login (do this in UI)
// After redirect happens, immediately paste this:

// 3. Check current state
console.group('AUTH STATE DIAGNOSTIC')
console.log('Session Version (local):', localStorage.getItem('mandi_session_v'))
console.log('Session Token:', localStorage.getItem('mandi_active_token')?.substring(0, 8) + '...')
console.log('Session Set At:', localStorage.getItem('mandi_session_v_set_at'))
console.log('Current Time:', Date.now())
console.groupEnd()

// 4. Check profile  
try {
    const profile = JSON.parse(localStorage.getItem('mandi_profile_cache') || '{}')
    console.log('Profile Session Version:', profile.session_version)
    console.log('Profile Role:', profile.role)
    console.log('Profile Business Domain:', profile.business_domain)
} catch(e) { console.error('Profile parse error:', e) }
```

---

## 🚀 Next Steps Based on Your Logs

Once you provide the logs, we'll be able to:

1. **Pinpoint exact line** causing logoff
2. **Identify root cause** (version, eviction, timeout, domain)
3. **Apply targeted fix** to only that specific issue
4. **Verify fix works** before pushing to production

---

## 📞 Questions to Self-Check

- [ ] Are you using the LATEST deployed code? (check network tab for file timestamps)
- [ ] Have you cleared browser cache? (Ctrl+Shift+Delete / Cmd+Shift+Delete)
- [ ] Is this happening on multiple browsers or just one?
- [ ] Does it happen consistently or intermittently?
- [ ] Any error messages shown in red text?
- [ ] Do you see a "Signed Out" toast notification appear?

