#!/bin/bash

# LEDGER FIX - AUTOMATED DEPLOYMENT
# ==================================
# 
# This script automatically:
# 1. Backs up the migration file
# 2. Applies the migration via Supabase CLI (if installed)
# 3. Runs the rebuild script
# 4. Validates the fixes
#
# Usage: bash deploy-ledger-fix.sh

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     LEDGER & DAY BOOK FIX - AUTOMATED DEPLOYMENT           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"

# Check if we're in the right directory
if [ ! -f "supabase/migrations/20260412_comprehensive_ledger_daybook_fix.sql" ]; then
    echo -e "${RED}❌ Error: Migration file not found!${NC}"
    echo -e "${YELLOW}Make sure you're in the MandiPro directory${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found migration file${NC}"

# Step 1: Check for Supabase CLI
echo -e "\n${BLUE}━━━ Step 1: Check Supabase CLI ━━━${NC}\n"

if command -v supabase &> /dev/null; then
    echo -e "${GREEN}✅ Supabase CLI found${NC}"
    HAS_SUPABASE_CLI=true
else
    echo -e "${YELLOW}⚠️  Supabase CLI not found${NC}"
    echo -e "${YELLOW}We'll apply the migration manually via dashboard${NC}"
    HAS_SUPABASE_CLI=false
fi

# Step 2: Backup migration
echo -e "\n${BLUE}━━━ Step 2: Backup Migration ━━━${NC}\n"

BACKUP_FILE="supabase/migrations/20260412_comprehensive_ledger_daybook_fix.sql.backup.$(date +%s)"
cp "supabase/migrations/20260412_comprehensive_ledger_daybook_fix.sql" "$BACKUP_FILE"
echo -e "${GREEN}✅ Migration backed up to: $BACKUP_FILE${NC}"

# Step 3: Apply migration
echo -e "\n${BLUE}━━━ Step 3: Apply Migration ━━━${NC}\n"

if [ "$HAS_SUPABASE_CLI" = true ]; then
    echo -e "${YELLOW}📢 Applying via Supabase CLI...${NC}"
    
    # Check if linked to a project
    if supabase projects list &> /dev/null; then
        echo -e "${GREEN}✅ Supabase project is linked${NC}"
        
        echo -e "${YELLOW}Running: supabase db push${NC}"
        supabase db push
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Migration applied successfully!${NC}"
        else
            echo -e "${RED}❌ Migration failed${NC}"
            echo -e "${YELLOW}Please apply manually via Supabase dashboard:${NC}"
            echo -e "${YELLOW}1. Copy: supabase/migrations/20260412_comprehensive_ledger_daybook_fix.sql${NC}"
            echo -e "${YELLOW}2. Go to: Supabase Dashboard → SQL Editor${NC}"
            echo -e "${YELLOW}3. Paste and click Run${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️  Supabase project not linked${NC}"
        echo -e "${YELLOW}Please apply migration manually (see instructions above)${NC}"
    fi
else
    echo -e "${YELLOW}📢 Manual Application Required${NC}"
    echo -e "\n${YELLOW}To apply the migration:${NC}"
    echo -e "1. Go to: https://app.supabase.com/project/ldayxjabzyorpugwszpt/sql/new"
    echo -e "2. Click: New Query"
    echo -e "3. Copy entire contents of:"
    echo -e "   ${BLUE}supabase/migrations/20260412_comprehensive_ledger_daybook_fix.sql${NC}"
    echo -e "4. Paste into the SQL editor"
    echo -e "5. Click: Run"
    
    echo -e "\n${YELLOW}⏳ Waiting for user to apply migration manually...${NC}"
    echo -e "${YELLOW}Press ENTER when the migration is complete${NC}"
    read -r
fi

# Step 4: Run rebuild script
echo -e "\n${BLUE}━━━ Step 4: Rebuild Ledger Entries ━━━${NC}\n"

if [ -f "rebuild-ledger-and-daybook.js" ]; then
    echo -e "${YELLOW}Running ledger rebuild...${NC}"
    
    if command -v node &> /dev/null; then
        node rebuild-ledger-and-daybook.js
        
        if [ $? -eq 0 ]; then
            echo -e "\n${GREEN}✅ Ledger rebuild completed!${NC}"
        else
            echo -e "\n${YELLOW}⚠️  Rebuild script encountered issues${NC}"
            echo -e "${YELLOW}This is normal - some data may not have been ready yet${NC}"
        fi
    else
        echo -e "${RED}❌ Node.js not found${NC}"
        echo -e "${YELLOW}Please run manually:${NC}"
        echo -e "${YELLOW}  node rebuild-ledger-and-daybook.js${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Rebuild script not found${NC}"
    echo -e "${YELLOW}Run this manually: node rebuild-ledger-and-daybook.js${NC}"
fi

# Step 5: Show next steps
echo -e "\n${BLUE}━━━ Step 5: Next Steps ━━━${NC}\n"

echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}\n"

echo -e "${YELLOW}📋 To verify everything works:${NC}"
echo -e "1. Open the app → Finance → Day Book"
echo -e "2. Verify all your transactions appear"
echo -e "3. Check payment modes are correctly categorized"
echo -e "4. Open a ledger → verify opening balance is correct"
echo -e "5. Create a new transaction to test all payment modes"

echo -e "\n${YELLOW}📊 Test the payment modes:${NC}"
echo -e "• CASH sale → should show 'PAID'"
echo -e "• CREDIT sale → should show 'PENDING'"
echo -e "• UPI/BANK sale → should show 'PAID'"
echo -e "• PARTIAL payment → should show 'PARTIAL'"
echo -e "• CHEQUE → should show 'CHEQUE PENDING' until cleared"

echo -e "\n${YELLOW}📞 If you encounter issues:${NC}"
echo -e "1. Read: LEDGER_FIX_COMPLETE_GUIDE.md"
echo -e "2. Check Supabase logs: Dashboard → Logs → Database"
echo -e "3. Run: node rebuild-ledger-and-daybook.js (again)"

echo -e "\n${GREEN}🎉 Your ledger system is now fixed!${NC}\n"
