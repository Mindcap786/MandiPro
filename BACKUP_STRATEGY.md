# 🗄️ DATABASE BACKUP STRATEGY

**Issue:** No off-site backup system in place.
**Impact:** Total data loss in case of database corruption or provider failure.
**Priority:** CRITICAL
**Target:** Daily automated backups to S3-compatible storage.

---

## 🛡️ THE 3-2-1 BACKUP RULE
We are implementing the industry standard for MandiGrow:
*   **3** copies of data (Production, Local Dev, Off-site Cloud).
*   **2** different media types (PostgreSQL, Compressed SQL File).
*   **1** off-site location (AWS S3 or Cloudflare R2).

---

## 🚀 IMPLEMENTATION OPTIONS

### Option A: GitHub Actions + S3 (Recommended)
Automatically runs every night at 00:00 UTC. 
*   **Cost:** $0 (utilizing free tiers).
*   **Pros:** Fully automated, independent of the main server.

### Option B: Local Cron Job
Runs on your local machine/server.
*   **Cost:** $0.
*   **Pros:** Simplest to set up if you have a 24/7 server.

---

## 🛠️ REQUIRED TOOLS
1.  **Supabase CLI:** To dump the database.
2.  **AWS CLI / S3cmd:** To upload to the cloud.
3.  **GitHub Actions:** To automate the process.

---

## 📅 RETENTION POLICY
*   **Daily Backups:** Kept for 7 days.
*   **Weekly Backups:** Kept for 4 weeks.
*   **Monthly Backups:** Kept for 12 months.

---

## ✅ RECOVERY PROCEDURE
To restore from a backup:
1.  Download the `.sql.gz` file from S3.
2.  Extract: `gunzip backup_file.sql.gz`
3.  Restore: `psql -h db_host -U postgres -d postgres -f backup_file.sql`

---

## 🎯 NEXT STEPS
1.  Create the backup script (`scripts/backup-db.sh`).
2.  Set up Cloudflare R2 or AWS S3 bucket.
3.  Configure GitHub Secrets.
4.  Activate the Workflow.
