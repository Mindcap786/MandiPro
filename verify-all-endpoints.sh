#!/bin/bash

# ============================================================
# COMPREHENSIVE API & DATA LOADING VERIFICATION SCRIPT
# Purpose: Verify all API endpoints return 200 before confirming fix
# Usage: bash verify-all-endpoints.sh
# ============================================================

set -e

# Configuration
SUPABASE_URL="https://ldayxjabzyorpugwszpt.supabase.co"
PROJECT_ID="ldayxjabzyorpugwszpt"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzemx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzA0MDQzNjYsImV4cCI6MTk4NTk4NDM2Nn0.Jz5XXxEjGBb7C6eoZYYDxmfRJDpkrxJZrMSmSuhnb1A"
ORG_ID="619cd49c-8556-4c7d-96ab-9c2939d76ca8"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL=0
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local query=$4
    
    echo -e "\n${BLUE}Testing: ${name}${NC}"
    TOTAL=$((TOTAL + 1))
    
    # Build the request
    local url="${SUPABASE_URL}/rest/v1${endpoint}"
    
    # Make the request
    response=$(curl -s -w "\n%{http_code}" \
        -X "$method" \
        -H "apikey: ${ANON_KEY}" \
        -H "Authorization: Bearer ${ANON_KEY}" \
        -H "Content-Type: application/json" \
        "$url$query")
    
    # Extract status code
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    # Check result
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✅ Status: $http_code${NC}"
        # Show data count if applicable
        if [[ "$body" == *"["* ]]; then
            count=$(echo "$body" | grep -o '"id"' | wc -l)
            echo -e "${GREEN}   Records: $count${NC}"
        fi
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ Status: $http_code${NC}"
        if [ -n "$body" ]; then
            echo -e "${RED}   Response: $(echo $body | head -c 200)${NC}"
        fi
        FAILED=$((FAILED + 1))
    fi
}

# ============================================================
# TEST SUITE 1: BASIC CONNECTIVITY
# ============================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}PHASE 1: BASIC CONNECTIVITY${NC}"
echo -e "${BLUE}========================================${NC}"

test_endpoint "Health Check" "GET" "/mandi/sales" "?select=id&limit=1"

# ============================================================
# TEST SUITE 2: TABLES - SINGLE QUERIES
# ============================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}PHASE 2: TABLE ACCESS (Simple Queries)${NC}"
echo -e "${BLUE}========================================${NC}"

test_endpoint "Sales Table" "GET" "/mandi/sales" "?select=*&limit=10"
test_endpoint "Arrivals Table" "GET" "/mandi/arrivals" "?select=*&limit=10"
test_endpoint "Lots Table" "GET" "/mandi/lots" "?select=*&limit=10"
test_endpoint "Contacts Table" "GET" "/mandi/contacts" "?select=*&limit=10"
test_endpoint "Commodities Table" "GET" "/mandi/commodities" "?select=*&limit=10"

# ============================================================
# TEST SUITE 3: FILTERED QUERIES (WITH ORG_ID)
# ============================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}PHASE 3: FILTERED QUERIES (By Org)${NC}"
echo -e "${BLUE}========================================${NC}"

test_endpoint "Sales for Org" "GET" "/mandi/sales" "?select=*&organization_id=eq.${ORG_ID}"
test_endpoint "Arrivals for Org" "GET" "/mandi/arrivals" "?select=*&organization_id=eq.${ORG_ID}"
test_endpoint "Lots for Org" "GET" "/mandi/lots" "?select=*&organization_id=eq.${ORG_ID}"
test_endpoint "Contacts for Org" "GET" "/mandi/contacts" "?select=*&organization_id=eq.${ORG_ID}"

# ============================================================
# TEST SUITE 4: NESTED QUERIES (WITH JOINS)
# ============================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}PHASE 4: NESTED QUERIES (WITH JOINS)${NC}"
echo -e "${BLUE}========================================${NC}"

test_endpoint "Sales with Contacts" "GET" "/mandi/sales" "?select=*,contact:contacts(*)"
test_endpoint "Sales with Sale Items" "GET" "/mandi/sales" "?select=*,sale_items(*)"
test_endpoint "Sales with Lots" "GET" "/mandi/sales" "?select=*,sale_items(lot:lots(*))"
test_endpoint "Lots with Commodity" "GET" "/mandi/lots" "?select=*,item:commodities(*)"

# ============================================================
# TEST SUITE 5: RLS SECURITY (Should be filtered)
# ============================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}PHASE 5: RLS SECURITY (Org Filtering)${NC}"
echo -e "${BLUE}========================================${NC}"

# These should return data
test_endpoint "Sales for Org (Filtered)" "GET" "/mandi/sales" "?organization_id=eq.${ORG_ID}&select=id,sale_date,total_amount"

# Count check
echo -e "\n${BLUE}Checking data count for org:${NC}"
response=$(curl -s \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    "${SUPABASE_URL}/rest/v1/mandi/sales?organization_id=eq.${ORG_ID}&select=id" | jq 'length' 2>/dev/null || echo "0")
echo -e "${GREEN}Sales records for org: $response${NC}"

# ============================================================
# TEST SUITE 6: RPC FUNCTIONS
# ============================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}PHASE 6: RPC FUNCTIONS${NC}"
echo -e "${BLUE}========================================${NC}"

test_endpoint "RPC: get_account_id" "POST" "/rpc/get_account_id" "" #"?p_org_id=${ORG_ID}&p_code=1001"
test_endpoint "RPC: get_user_org_id" "POST" "/rpc/get_user_org_id" ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}TEST SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
else
    echo -e "${GREEN}Failed: $FAILED${NC}"
fi

# Success rate
if [ $TOTAL -gt 0 ]; then
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
    echo -e "Success Rate: ${SUCCESS_RATE}%"
fi

# Final verdict
echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED - SYSTEM IS READY${NC}"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED - SYSTEM NEEDS FIXES${NC}"
    exit 1
fi
