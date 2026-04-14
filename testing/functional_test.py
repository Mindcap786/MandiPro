#!/usr/bin/env python3
"""
MandiGrow ERP - Functional Testing Script (Menu-by-Menu)
Automated E2E testing using Playwright
"""

import asyncio
from playwright.async_api import async_playwright, Page
from datetime import datetime
import json

class FunctionalTester:
    def __init__(self):
        self.base_url = "http://localhost:3000"
        self.results = {
            "timestamp": datetime.now().isoformat(),
            "tests": [],
            "summary": {}
        }
        self.passed = 0
        self.failed = 0
    
    async def log_test(self, module: str, test_name: str, status: str, details: str = ""):
        """Log test result"""
        result = {
            "module": module,
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
    
    async def test_login(self, page: Page):
        """Test 1: Login & Authentication"""
        print("\n" + "="*70)
        print("MODULE 1: LOGIN & AUTHENTICATION")
        print("="*70)
        
        try:
            await page.goto(f"{self.base_url}/login")
            await page.wait_for_load_state("networkidle")
            
            # Check if login page loads
            title = await page.title()
            if "login" in title.lower() or "mandi" in title.lower():
                await self.log_test("Login", "Login page loads", "PASS")
            else:
                await self.log_test("Login", "Login page loads", "FAIL", f"Unexpected title: {title}")
            
            # Check for login form elements
            email_input = await page.query_selector('input[type="email"], input[name="email"]')
            password_input = await page.query_selector('input[type="password"]')
            
            if email_input and password_input:
                await self.log_test("Login", "Login form elements present", "PASS")
            else:
                await self.log_test("Login", "Login form elements present", "FAIL", "Missing email or password field")
            
        except Exception as e:
            await self.log_test("Login", "Login page accessibility", "FAIL", str(e))
    
    async def test_dashboard(self, page: Page):
        """Test 2: Dashboard"""
        print("\n" + "="*70)
        print("MODULE 2: DASHBOARD")
        print("="*70)
        
        try:
            await page.goto(f"{self.base_url}/")
            await page.wait_for_load_state("networkidle", timeout=10000)
            
            # Check page loads
            await self.log_test("Dashboard", "Dashboard page loads", "PASS")
            
            # Check for key dashboard elements
            elements_to_check = [
                ("Dashboard heading", "h1, h2, [role='heading']"),
                ("Navigation menu", "nav, [role='navigation']"),
                ("Main content area", "main, [role='main']"),
            ]
            
            for name, selector in elements_to_check:
                element = await page.query_selector(selector)
                if element:
                    await self.log_test("Dashboard", f"{name} present", "PASS")
                else:
                    await self.log_test("Dashboard", f"{name} present", "FAIL", f"Selector: {selector}")
            
            # Check for console errors
            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            await page.wait_for_timeout(2000)
            
            if len(console_errors) == 0:
                await self.log_test("Dashboard", "No console errors", "PASS")
            else:
                await self.log_test("Dashboard", "No console errors", "FAIL", f"{len(console_errors)} errors found")
            
        except Exception as e:
            await self.log_test("Dashboard", "Dashboard accessibility", "FAIL", str(e))
    
    async def test_sales_module(self, page: Page):
        """Test 3: Sales/Invoicing Module"""
        print("\n" + "="*70)
        print("MODULE 3: SALES/INVOICING")
        print("="*70)
        
        try:
            await page.goto(f"{self.base_url}/sales")
            await page.wait_for_load_state("networkidle", timeout=10000)
            
            await self.log_test("Sales", "Sales page loads", "PASS")
            
            # Check for sales table/list
            table = await page.query_selector("table, [role='table'], .sales-list")
            if table:
                await self.log_test("Sales", "Sales list/table present", "PASS")
            else:
                await self.log_test("Sales", "Sales list/table present", "FAIL")
            
            # Check for "New Invoice" button
            new_invoice_btn = await page.query_selector("button:has-text('New Invoice'), button:has-text('New Sale'), button:has-text('Create')")
            if new_invoice_btn:
                await self.log_test("Sales", "New Invoice button present", "PASS")
                
                # Try to click and open form
                try:
                    await new_invoice_btn.click()
                    await page.wait_for_timeout(1000)
                    
                    # Check if form/dialog opened
                    form = await page.query_selector("form, [role='dialog'], .modal")
                    if form:
                        await self.log_test("Sales", "New Invoice form opens", "PASS")
                    else:
                        await self.log_test("Sales", "New Invoice form opens", "FAIL")
                except Exception as e:
                    await self.log_test("Sales", "New Invoice form opens", "FAIL", str(e))
            else:
                await self.log_test("Sales", "New Invoice button present", "FAIL")
            
        except Exception as e:
            await self.log_test("Sales", "Sales module accessibility", "FAIL", str(e))
    
    async def test_finance_module(self, page: Page):
        """Test 4: Finance Module"""
        print("\n" + "="*70)
        print("MODULE 4: FINANCE")
        print("="*70)
        
        try:
            await page.goto(f"{self.base_url}/finance")
            await page.wait_for_load_state("networkidle", timeout=10000)
            
            await self.log_test("Finance", "Finance page loads", "PASS")
            
            # Check for finance tabs/sections
            sections = [
                ("Buyer Receivables", "button:has-text('Buyer'), a:has-text('Receivable')"),
                ("Supplier Payables", "button:has-text('Supplier'), a:has-text('Payable')"),
                ("Reports", "button:has-text('Report'), a:has-text('Report')"),
            ]
            
            for name, selector in sections:
                element = await page.query_selector(selector)
                if element:
                    await self.log_test("Finance", f"{name} section present", "PASS")
                else:
                    await self.log_test("Finance", f"{name} section present", "FAIL")
            
        except Exception as e:
            await self.log_test("Finance", "Finance module accessibility", "FAIL", str(e))
    
    async def test_inventory_module(self, page: Page):
        """Test 5: Inventory/Stock Module"""
        print("\n" + "="*70)
        print("MODULE 5: INVENTORY/STOCK")
        print("="*70)
        
        try:
            await page.goto(f"{self.base_url}/inventory")
            await page.wait_for_load_state("networkidle", timeout=10000)
            
            await self.log_test("Inventory", "Inventory page loads", "PASS")
            
            # Check for stock items display
            stock_items = await page.query_selector("table, .stock-grid, .inventory-list")
            if stock_items:
                await self.log_test("Inventory", "Stock items display present", "PASS")
            else:
                await self.log_test("Inventory", "Stock items display present", "FAIL")
            
        except Exception as e:
            await self.log_test("Inventory", "Inventory module accessibility", "FAIL", str(e))
    
    async def test_arrivals_module(self, page: Page):
        """Test 6: Gate Entry/Arrivals Module"""
        print("\n" + "="*70)
        print("MODULE 6: GATE ENTRY/ARRIVALS")
        print("="*70)
        
        try:
            await page.goto(f"{self.base_url}/arrivals")
            await page.wait_for_load_state("networkidle", timeout=10000)
            
            await self.log_test("Arrivals", "Arrivals page loads", "PASS")
            
            # Check for new entry button
            new_entry_btn = await page.query_selector("button:has-text('New Entry'), button:has-text('New Arrival'), button:has-text('Add')")
            if new_entry_btn:
                await self.log_test("Arrivals", "New Entry button present", "PASS")
            else:
                await self.log_test("Arrivals", "New Entry button present", "FAIL")
            
        except Exception as e:
            await self.log_test("Arrivals", "Arrivals module accessibility", "FAIL", str(e))
    
    async def test_responsive_design(self, page: Page):
        """Test 7: Responsive Design"""
        print("\n" + "="*70)
        print("MODULE 7: RESPONSIVE DESIGN")
        print("="*70)
        
        viewports = [
            ("Desktop", 1920, 1080),
            ("Tablet", 768, 1024),
            ("Mobile", 375, 667),
        ]
        
        for name, width, height in viewports:
            try:
                await page.set_viewport_size({"width": width, "height": height})
                await page.goto(f"{self.base_url}/")
                await page.wait_for_load_state("networkidle")
                
                # Check if page is still accessible
                main_content = await page.query_selector("main, body")
                if main_content:
                    await self.log_test("Responsive", f"{name} ({width}x{height}) renders", "PASS")
                else:
                    await self.log_test("Responsive", f"{name} ({width}x{height}) renders", "FAIL")
            except Exception as e:
                await self.log_test("Responsive", f"{name} viewport", "FAIL", str(e))
    
    async def run_all_tests(self):
        """Execute all functional tests"""
        print("=" * 70)
        print("🧪 MANDIPRO ERP - FUNCTIONAL TESTING (MENU-BY-MENU)")
        print("=" * 70)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Run all test modules
            await self.test_login(page)
            await self.test_dashboard(page)
            await self.test_sales_module(page)
            await self.test_finance_module(page)
            await self.test_inventory_module(page)
            await self.test_arrivals_module(page)
            await self.test_responsive_design(page)
            
            await browser.close()
        
        # Generate summary
        self.generate_summary()
        self.save_results()
    
    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "=" * 70)
        print("📊 FUNCTIONAL TEST SUMMARY")
        print("=" * 70)
        
        total_tests = self.passed + self.failed
        pass_rate = (self.passed / total_tests * 100) if total_tests > 0 else 0
        
        self.results["summary"] = {
            "total_tests": total_tests,
            "passed": self.passed,
            "failed": self.failed,
            "pass_rate": round(pass_rate, 2)
        }
        
        print(f"\n📈 Overall Results:")
        print(f"  Total Tests: {total_tests}")
        print(f"  Passed: {self.passed} ✅")
        print(f"  Failed: {self.failed} ❌")
        print(f"  Pass Rate: {pass_rate:.2f}%")
        
        if pass_rate >= 90:
            print(f"\n✅ OVERALL VERDICT: EXCELLENT")
        elif pass_rate >= 75:
            print(f"\n✅ OVERALL VERDICT: PASS (Minor Issues)")
        elif pass_rate >= 60:
            print(f"\n⚠️  OVERALL VERDICT: MARGINAL (Needs Fixes)")
        else:
            print(f"\n❌ OVERALL VERDICT: FAIL (Critical Issues)")
    
    def save_results(self):
        """Save results to JSON file"""
        filename = f"functional_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f"\n💾 Results saved to: {filename}")

if __name__ == "__main__":
    tester = FunctionalTester()
    asyncio.run(tester.run_all_tests())
