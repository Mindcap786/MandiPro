# 🔑 How to Get Your Sentry DSN (Free Account)

**Total Time:** 3 minutes  
**Cost:** $0 (FREE!)

---

## Step 1: Create Free Account (1 minute)

1. **Go to Sentry:**
   ```
   👉 https://sentry.io/signup/
   ```

2. **Sign up with:**
   - Email + Password, OR
   - GitHub account (recommended - faster!)

3. **Verify your email** (if using email signup)

---

## Step 2: Create Your First Project (1 minute)

After signing up, Sentry will ask you to create a project:

1. **Select Platform:**
   - Choose: **Next.js**
   - (Or search for "Next.js" in the search box)

2. **Set Alert Frequency:**
   - Choose: **Alert me on every new issue** (recommended for now)

3. **Name Your Project:**
   - Enter: `mandigrow-erp` (or any name you like)

4. **Click:** "Create Project"

---

## Step 3: Get Your DSN (30 seconds)

After creating the project, Sentry will show you setup instructions.

**You'll see a code snippet like this:**

```javascript
Sentry.init({
  dsn: "https://1234567890abcdef@o123456.ingest.sentry.io/1234567",
  // ...
});
```

**👆 That's your DSN!**

Copy the entire URL that starts with `https://` and ends with a number.

**Example DSN format:**
```
https://[public-key]@[organization].ingest.sentry.io/[project-id]
```

---

## Step 4: Add DSN to Your Project (30 seconds)

1. **Open or create:** `web/.env.local`

2. **Add this line:**
   ```env
   NEXT_PUBLIC_SENTRY_DSN=https://your-actual-dsn-here
   ```

3. **Replace** `https://your-actual-dsn-here` with your actual DSN from Step 3

4. **Save the file**

---

## Step 5: Restart Dev Server (30 seconds)

Your dev server should auto-restart. If not:

```bash
# Stop current server (Ctrl+C)
# Then restart:
cd web
npm run dev
```

---

## ✅ Verification

**Test that it's working:**

1. Add this test button to any page (e.g., `app/page.tsx`):

```tsx
<button 
  onClick={() => { throw new Error('🧪 Test Sentry Error!'); }}
  className="bg-red-500 text-white px-4 py-2 rounded"
>
  Test Sentry
</button>
```

2. Click the button

3. Go to Sentry dashboard: https://sentry.io/

4. You should see the error appear within 5-10 seconds! ✅

---

## 🎯 Alternative: Find DSN Later

If you already created a project and need to find your DSN:

1. **Go to:** https://sentry.io/
2. **Click:** Your project name
3. **Click:** Settings (gear icon) → Projects → [Your Project]
4. **Click:** "Client Keys (DSN)" in the left sidebar
5. **Copy:** The DSN shown

**Direct link format:**
```
https://sentry.io/settings/[your-org]/projects/[your-project]/keys/
```

---

## 💰 Pricing Breakdown

### **Free Forever Plan:**
- 5,000 errors/month
- 10,000 performance units/month
- 50 replays/month
- **Perfect for:** Development, pilot launch, small apps

### **When to Upgrade:**

**Team Plan ($26/month):**
- When you exceed free tier limits
- When you need more than 90 days retention
- When you have 100+ active users

**Business Plan ($80/month):**
- For production apps with 1000+ users
- Advanced features (custom alerts, integrations)

### **For Your Use Case:**

| Stage | Users | Recommended Plan | Cost |
|-------|-------|------------------|------|
| **Development** | 1-5 | Free | $0 |
| **Pilot Launch** | 5-10 | Free | $0 |
| **Beta** | 50-100 | Free | $0 |
| **Production** | 100-500 | Free or Team | $0-26 |
| **Scale** | 500+ | Team | $26+ |

**You can stay on FREE for months!**

---

## 🔍 What If I Hit the Free Limit?

If you exceed 5,000 errors/month:

1. **Option 1:** Upgrade to Team plan ($26/month)
2. **Option 2:** Reduce sample rate:
   ```typescript
   // In sentry.client.config.ts
   tracesSampleRate: 0.05, // Only track 5% instead of 10%
   ```
3. **Option 3:** Fix the errors! (That's the point of Sentry 😄)

---

## 📧 Example: Complete Setup

Here's what your `web/.env.local` should look like:

```env
# Supabase (you already have these)
NEXT_PUBLIC_SUPABASE_URL=https://ldayxjabzyorpugwszpt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Sentry (add these)
NEXT_PUBLIC_SENTRY_DSN=https://abc123def456@o789012.ingest.sentry.io/345678
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
```

---

## 🎓 Pro Tips

1. **Use GitHub signup** - It's faster and you can use SSO
2. **Enable email alerts** - Get notified when errors happen
3. **Invite team members** - Free on all plans!
4. **Set up Slack integration** - Get alerts in Slack (optional)

---

## ❓ Common Questions

**Q: Do I need a credit card?**  
A: No! Free tier doesn't require a credit card.

**Q: Will I be charged automatically?**  
A: No! You'll get warnings when approaching limits. You must manually upgrade.

**Q: Can I use it in production for free?**  
A: Yes! As long as you stay under 5,000 errors/month.

**Q: What happens if I exceed the limit?**  
A: Sentry stops accepting new errors until next month, OR you upgrade.

---

## 🚀 Quick Start (TL;DR)

```bash
# 1. Sign up (free)
open https://sentry.io/signup/

# 2. Create project (Next.js)
# 3. Copy your DSN

# 4. Add to .env.local
echo 'NEXT_PUBLIC_SENTRY_DSN=your-dsn-here' >> web/.env.local

# 5. Restart server
cd web && npm run dev

# 6. Test it!
# Add test button → Click → Check Sentry dashboard
```

---

## 📞 Need Help?

- **Sentry Docs:** https://docs.sentry.io/platforms/javascript/guides/nextjs/
- **Pricing:** https://sentry.io/pricing/
- **Support:** https://sentry.io/support/

---

**🎉 You're all set! Sentry is FREE and takes 3 minutes to set up!**
