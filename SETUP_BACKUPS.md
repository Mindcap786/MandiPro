# ☁️ CLOUD STORAGE SETUP GUIDE (S3/R2)

To activate automated backups, you need a destination. We recommend **Cloudflare R2** because it has a huge free tier (10GB) and zero egress fees.

---

## 1️⃣ Set up Cloudflare R2 (Recommended)
1.  Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/).
2.  Go to **R2** → **Create Bucket**.
3.  Name it: `mandigrow-backups`.
4.  Go to **R2 Settings** → **Manage R2 API Tokens**.
5.  Click **Create API Token**.
    -   Permissions: **Object Read & Write**.
    -   Copy: `Access Key ID` and `Secret Access Key`.
    -   Copy: `S3 Endpoint` (looks like `https://<id>.r2.cloudflarestorage.com`).

---

## 2️⃣ Add Secrets to GitHub
Go to your GitHub Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add the following:
*   `DATABASE_URL`: Your Supabase connection string (`postgres://postgres:[pw]@[host]:5432/postgres`)
*   `AWS_S3_BACKUP_BUCKET`: `mandigrow-backups`
*   `AWS_ACCESS_KEY_ID`: [From R2]
*   `AWS_SECRET_ACCESS_KEY`: [From R2]
*   `AWS_S3_ENDPOINT`: [From R2]

---

## 3️⃣ Run a Test Backup
1.  In your GitHub Repository, click the **Actions** tab.
2.  Select **Daily Database Backup**.
3.  Click **Run workflow** → **Branch: main**.
4.  Verify that it completes and the file appears in your Cloudflare R2 dashboard.

---

## 📅 RETENTION WARNING
Remember to set a **Lifecycle Policy** in Cloudflare/S3 to automatically delete backups older than 30 days to keep costs at zero!
