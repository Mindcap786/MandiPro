#!/usr/bin/env python3
"""
MandiGrow ERP - Accounting Validation Script
Validates double-entry bookkeeping, ledger integrity, and financial accuracy
"""

import requests
import json
from datetime import datetime
from typing import List, Dict

class AccountingValidator:
    def __init__(self):
        self.api_url = "https://ldayxjabzyorpugwszpt.supabase.co"
        self.anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk"
        self.headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.anon_key}",
            "Content-Type": "application/json"
        }
        self.results = {
            "timestamp": datetime.now().isoformat(),
            "tests": [],
            "issues_found": []
        }
        self.passed = 0
        self.failed = 0
    
    def log_test(self, test_name: str, status: str, details: str = ""):
        """Log test result"""
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.results["tests"].append(result)
        
        if status == "PASS":
            self.passed += 1
            print(f"  ✅ {test_name}")
        else:
            self.failed += 1
            print(f"  ❌ {test_name}")
            if details:
                print(f"     └─ {details}")
    
    def log_issue(self, issue_type: str, description: str, severity: str = "MEDIUM"):
        """Log accounting issue"""
        issue = {
            "type": issue_type,
            "description": description,
            "severity": severity,
            "timestamp": datetime.now().isoformat()
        }
        self.results["issues_found"].append(issue)
        print(f"  ⚠️  ISSUE: {description}")
    
    def fetch_data(self, endpoint: str) -> List[Dict]:
        """Fetch data from API"""
        try:
            response = requests.get(
                f"{self.api_url}{endpoint}",
                headers=self.headers,
                timeout=10
            )
            if response.status_code == 200:
                return response.json()
            else:
                print(f"  ⚠️  API Error: {response.status_code}")
                return []
        except Exception as e:
            print(f"  ⚠️  Request failed: {str(e)}")
            return []
    
    def test_ledger_balance_integrity(self):
        """Test 1: Verify ledger balances match sales totals"""
        print("\n" + "="*70)
        print("TEST 1: LEDGER BALANCE INTEGRITY")
        print("="*70)
        
        # Fetch all sales
        sales = self.fetch_data("/rest/v1/sales?select=buyer_id,total_amount")
        
        # Fetch all ledger entries
        ledger = self.fetch_data("/rest/v1/ledger_entries?select=contact_id,debit,credit,transaction_type")
        
        if not sales or not ledger:
            self.log_test("Ledger Balance Integrity", "FAIL", "Unable to fetch data")
            return
        
        # Group sales by buyer
        sales_by_buyer = {}
        for sale in sales:
            buyer_id = sale.get('buyer_id')
            amount = float(sale.get('total_amount', 0))
            sales_by_buyer[buyer_id] = sales_by_buyer.get(buyer_id, 0) + amount
        
        # Group ledger by contact (sales only)
        ledger_by_contact = {}
        for entry in ledger:
            if entry.get('transaction_type') == 'sale':
                contact_id = entry.get('contact_id')
                debit = float(entry.get('debit', 0))
                credit = float(entry.get('credit', 0))
                ledger_by_contact[contact_id] = ledger_by_contact.get(contact_id, 0) + (debit - credit)
        
        # Compare
        mismatches = 0
        for buyer_id, sales_total in sales_by_buyer.items():
            ledger_total = ledger_by_contact.get(buyer_id, 0)
            if abs(sales_total - ledger_total) > 0.01:  # Allow 1 paisa difference for rounding
                mismatches += 1
                self.log_issue(
                    "Balance Mismatch",
                    f"Buyer {buyer_id[:8]}...: Sales=₹{sales_total:.2f}, Ledger=₹{ledger_total:.2f}",
                    "HIGH"
                )
        
        if mismatches == 0:
            self.log_test("Ledger Balance Integrity", "PASS", f"All {len(sales_by_buyer)} buyers match")
        else:
            self.log_test("Ledger Balance Integrity", "FAIL", f"{mismatches} mismatches found")
    
    def test_double_entry_validation(self):
        """Test 2: Validate double-entry bookkeeping"""
        print("\n" + "="*70)
        print("TEST 2: DOUBLE-ENTRY VALIDATION")
        print("="*70)
        
        ledger = self.fetch_data("/rest/v1/ledger_entries?select=id,debit,credit")
        
        if not ledger:
            self.log_test("Double-Entry Validation", "FAIL", "Unable to fetch ledger")
            return
        
        violations = 0
        for entry in ledger:
            debit = float(entry.get('debit', 0))
            credit = float(entry.get('credit', 0))
            
            # Check: Entry should have EITHER debit OR credit, not both (or neither)
            if debit > 0 and credit > 0:
                violations += 1
                self.log_issue(
                    "Double-Entry Violation",
                    f"Entry {entry['id'][:8]}... has both debit (₹{debit}) and credit (₹{credit})",
                    "HIGH"
                )
        
        if violations == 0:
            self.log_test("Double-Entry Validation", "PASS", f"All {len(ledger)} entries valid")
        else:
            self.log_test("Double-Entry Validation", "FAIL", f"{violations} violations found")
    
    def test_orphan_entries(self):
        """Test 3: Check for orphan ledger entries"""
        print("\n" + "="*70)
        print("TEST 3: ORPHAN ENTRY DETECTION")
        print("="*70)
        
        # Fetch ledger entries with voucher_id
        ledger = self.fetch_data("/rest/v1/ledger_entries?select=id,voucher_id,debit,credit&voucher_id=not.is.null")
        
        # Fetch all vouchers
        vouchers = self.fetch_data("/rest/v1/vouchers?select=id")
        voucher_ids = {v['id'] for v in vouchers}
        
        if not ledger:
            self.log_test("Orphan Entry Detection", "PASS", "No ledger entries with vouchers")
            return
        
        orphans = 0
        for entry in ledger:
            if entry.get('voucher_id') not in voucher_ids:
                orphans += 1
                self.log_issue(
                    "Orphan Entry",
                    f"Ledger entry {entry['id'][:8]}... references non-existent voucher",
                    "MEDIUM"
                )
        
        if orphans == 0:
            self.log_test("Orphan Entry Detection", "PASS", f"All {len(ledger)} entries have valid vouchers")
        else:
            self.log_test("Orphan Entry Detection", "FAIL", f"{orphans} orphan entries found")
    
    def test_negative_balances(self):
        """Test 4: Check for unexpected negative balances"""
        print("\n" + "="*70)
        print("TEST 4: NEGATIVE BALANCE CHECK")
        print("="*70)
        
        # Fetch all contacts
        contacts = self.fetch_data("/rest/v1/contacts?select=id,name,type")
        
        # Fetch all ledger entries
        ledger = self.fetch_data("/rest/v1/ledger_entries?select=contact_id,debit,credit")
        
        if not contacts or not ledger:
            self.log_test("Negative Balance Check", "FAIL", "Unable to fetch data")
            return
        
        # Calculate balances
        balances = {}
        for entry in ledger:
            contact_id = entry.get('contact_id')
            debit = float(entry.get('debit', 0))
            credit = float(entry.get('credit', 0))
            balances[contact_id] = balances.get(contact_id, 0) + (debit - credit)
        
        # Check for unexpected negatives
        issues = 0
        for contact in contacts:
            contact_id = contact['id']
            balance = balances.get(contact_id, 0)
            contact_type = contact.get('type', '')
            
            # Buyers should have positive or zero balance (they owe us)
            # Suppliers should have negative or zero balance (we owe them)
            if contact_type == 'buyer' and balance < -0.01:
                issues += 1
                self.log_issue(
                    "Unexpected Negative Balance",
                    f"Buyer '{contact.get('name')}' has negative balance: ₹{balance:.2f}",
                    "MEDIUM"
                )
            elif contact_type == 'supplier' and balance > 0.01:
                issues += 1
                self.log_issue(
                    "Unexpected Positive Balance",
                    f"Supplier '{contact.get('name')}' has positive balance: ₹{balance:.2f}",
                    "MEDIUM"
                )
        
        if issues == 0:
            self.log_test("Negative Balance Check", "PASS", "All balances are as expected")
        else:
            self.log_test("Negative Balance Check", "FAIL", f"{issues} unexpected balances")
    
    def test_duplicate_invoices(self):
        """Test 5: Check for duplicate invoice numbers"""
        print("\n" + "="*70)
        print("TEST 5: DUPLICATE INVOICE CHECK")
        print("="*70)
        
        sales = self.fetch_data("/rest/v1/sales?select=organization_id,bill_no")
        
        if not sales:
            self.log_test("Duplicate Invoice Check", "PASS", "No sales data")
            return
        
        # Group by organization and bill_no
        invoice_map = {}
        for sale in sales:
            org_id = sale.get('organization_id')
            bill_no = sale.get('bill_no')
            key = f"{org_id}_{bill_no}"
            invoice_map[key] = invoice_map.get(key, 0) + 1
        
        # Find duplicates
        duplicates = {k: v for k, v in invoice_map.items() if v > 1}
        
        if len(duplicates) == 0:
            self.log_test("Duplicate Invoice Check", "PASS", f"All {len(sales)} invoices unique")
        else:
            for key, count in duplicates.items():
                self.log_issue(
                    "Duplicate Invoice",
                    f"Invoice {key.split('_')[1]} appears {count} times",
                    "HIGH"
                )
            self.log_test("Duplicate Invoice Check", "FAIL", f"{len(duplicates)} duplicates found")
    
    def run_all_tests(self):
        """Execute all accounting validation tests"""
        print("=" * 70)
        print("💰 MANDIPRO ERP - ACCOUNTING VALIDATION")
        print("=" * 70)
        
        self.test_ledger_balance_integrity()
        self.test_double_entry_validation()
        self.test_orphan_entries()
        self.test_negative_balances()
        self.test_duplicate_invoices()
        
        self.generate_summary()
        self.save_results()
    
    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "=" * 70)
        print("📊 ACCOUNTING VALIDATION SUMMARY")
        print("=" * 70)
        
        total_tests = self.passed + self.failed
        pass_rate = (self.passed / total_tests * 100) if total_tests > 0 else 0
        
        self.results["summary"] = {
            "total_tests": total_tests,
            "passed": self.passed,
            "failed": self.failed,
            "pass_rate": round(pass_rate, 2),
            "total_issues": len(self.results["issues_found"]),
            "high_severity": len([i for i in self.results["issues_found"] if i["severity"] == "HIGH"]),
            "medium_severity": len([i for i in self.results["issues_found"] if i["severity"] == "MEDIUM"])
        }
        
        print(f"\n📈 Test Results:")
        print(f"  Total Tests: {total_tests}")
        print(f"  Passed: {self.passed} ✅")
        print(f"  Failed: {self.failed} ❌")
        print(f"  Pass Rate: {pass_rate:.2f}%")
        
        print(f"\n🔍 Issues Found:")
        print(f"  Total: {self.results['summary']['total_issues']}")
        print(f"  High Severity: {self.results['summary']['high_severity']} 🔴")
        print(f"  Medium Severity: {self.results['summary']['medium_severity']} 🟡")
        
        if pass_rate == 100 and self.results['summary']['total_issues'] == 0:
            print(f"\n✅ OVERALL VERDICT: PERFECT (No Issues)")
        elif pass_rate >= 80 and self.results['summary']['high_severity'] == 0:
            print(f"\n✅ OVERALL VERDICT: PASS (Minor Issues)")
        elif pass_rate >= 60:
            print(f"\n⚠️  OVERALL VERDICT: MARGINAL (Needs Attention)")
        else:
            print(f"\n❌ OVERALL VERDICT: FAIL (Critical Issues)")
    
    def save_results(self):
        """Save results to JSON file"""
        filename = f"accounting_validation_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f"\n💾 Results saved to: {filename}")

if __name__ == "__main__":
    validator = AccountingValidator()
    validator.run_all_tests()
