#!/usr/bin/env python3
"""
MandiGrow ERP - Performance Testing Script
Tests page load times, API response times, and database performance
"""

import time
import requests
import statistics
from datetime import datetime
from typing import List, Dict
import json

# Configuration
BASE_URL = "http://localhost:3000"
API_URL = "https://ldayxjabzyorpugwszpt.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk"

class PerformanceTester:
    def __init__(self):
        self.results = {
            "timestamp": datetime.now().isoformat(),
            "page_load_times": {},
            "api_response_times": {},
            "database_queries": {},
            "summary": {}
        }
    
    def test_page_load(self, path: str, name: str, iterations: int = 5) -> Dict:
        """Test page load time"""
        print(f"\n📄 Testing page: {name} ({path})")
        times = []
        
        for i in range(iterations):
            start = time.time()
            try:
                response = requests.get(f"{BASE_URL}{path}", timeout=10)
                elapsed = (time.time() - start) * 1000  # Convert to ms
                times.append(elapsed)
                status = "✅" if response.status_code == 200 else "❌"
                print(f"  Iteration {i+1}: {elapsed:.0f}ms {status}")
            except Exception as e:
                print(f"  Iteration {i+1}: ❌ FAILED - {str(e)}")
                times.append(10000)  # 10 second penalty for failure
        
        avg_time = statistics.mean(times)
        min_time = min(times)
        max_time = max(times)
        
        result = {
            "avg_ms": round(avg_time, 2),
            "min_ms": round(min_time, 2),
            "max_ms": round(max_time, 2),
            "iterations": iterations,
            "status": "PASS" if avg_time < 2000 else "FAIL"
        }
        
        self.results["page_load_times"][name] = result
        
        print(f"  📊 Average: {avg_time:.0f}ms | Min: {min_time:.0f}ms | Max: {max_time:.0f}ms")
        print(f"  {'✅ PASS' if result['status'] == 'PASS' else '❌ FAIL'} (Target: < 2000ms)")
        
        return result
    
    def test_api_endpoint(self, endpoint: str, name: str, iterations: int = 10) -> Dict:
        """Test API response time"""
        print(f"\n🔌 Testing API: {name}")
        times = []
        
        headers = {
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json"
        }
        
        for i in range(iterations):
            start = time.time()
            try:
                response = requests.get(
                    f"{API_URL}{endpoint}",
                    headers=headers,
                    timeout=5
                )
                elapsed = (time.time() - start) * 1000
                times.append(elapsed)
                status = "✅" if response.status_code == 200 else f"❌ ({response.status_code})"
                if i < 3:  # Only print first 3 iterations
                    print(f"  Iteration {i+1}: {elapsed:.0f}ms {status}")
            except Exception as e:
                print(f"  Iteration {i+1}: ❌ FAILED - {str(e)}")
                times.append(5000)
        
        avg_time = statistics.mean(times)
        p95_time = statistics.quantiles(times, n=20)[18]  # 95th percentile
        
        result = {
            "avg_ms": round(avg_time, 2),
            "p95_ms": round(p95_time, 2),
            "min_ms": round(min(times), 2),
            "max_ms": round(max(times), 2),
            "iterations": iterations,
            "status": "PASS" if avg_time < 500 else "FAIL"
        }
        
        self.results["api_response_times"][name] = result
        
        print(f"  📊 Average: {avg_time:.0f}ms | P95: {p95_time:.0f}ms")
        print(f"  {'✅ PASS' if result['status'] == 'PASS' else '❌ FAIL'} (Target: < 500ms)")
        
        return result
    
    def run_all_tests(self):
        """Execute all performance tests"""
        print("=" * 70)
        print("🚀 MANDIPRO ERP - PERFORMANCE TESTING")
        print("=" * 70)
        
        # Phase 1: Page Load Tests
        print("\n" + "=" * 70)
        print("PHASE 1: PAGE LOAD PERFORMANCE")
        print("=" * 70)
        
        pages = [
            ("/", "Dashboard"),
            ("/sales", "Sales Page"),
            ("/finance", "Finance Page"),
            ("/inventory", "Inventory Page"),
            ("/arrivals", "Arrivals Page"),
        ]
        
        for path, name in pages:
            self.test_page_load(path, name)
        
        # Phase 2: API Response Tests
        print("\n" + "=" * 70)
        print("PHASE 2: API RESPONSE TIMES")
        print("=" * 70)
        
        apis = [
            ("/rest/v1/sales?select=*&limit=10", "Fetch Sales (10 records)"),
            ("/rest/v1/contacts?select=*&limit=20", "Fetch Contacts (20 records)"),
            ("/rest/v1/ledger_entries?select=*&limit=50", "Fetch Ledger Entries (50 records)"),
            ("/rest/v1/items?select=*", "Fetch All Items"),
        ]
        
        for endpoint, name in apis:
            self.test_api_endpoint(endpoint, name)
        
        # Generate Summary
        self.generate_summary()
        
        # Save Results
        self.save_results()
    
    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "=" * 70)
        print("📊 TEST SUMMARY")
        print("=" * 70)
        
        page_passes = sum(1 for r in self.results["page_load_times"].values() if r["status"] == "PASS")
        page_total = len(self.results["page_load_times"])
        
        api_passes = sum(1 for r in self.results["api_response_times"].values() if r["status"] == "PASS")
        api_total = len(self.results["api_response_times"])
        
        total_passes = page_passes + api_passes
        total_tests = page_total + api_total
        
        self.results["summary"] = {
            "total_tests": total_tests,
            "passed": total_passes,
            "failed": total_tests - total_passes,
            "pass_rate": round((total_passes / total_tests) * 100, 2) if total_tests > 0 else 0,
            "page_load_tests": {"passed": page_passes, "total": page_total},
            "api_tests": {"passed": api_passes, "total": api_total}
        }
        
        print(f"\n📈 Overall Results:")
        print(f"  Total Tests: {total_tests}")
        print(f"  Passed: {total_passes} ✅")
        print(f"  Failed: {total_tests - total_passes} ❌")
        print(f"  Pass Rate: {self.results['summary']['pass_rate']}%")
        
        print(f"\n📄 Page Load Tests: {page_passes}/{page_total} passed")
        print(f"🔌 API Tests: {api_passes}/{api_total} passed")
        
        # Overall verdict
        if self.results['summary']['pass_rate'] >= 80:
            print(f"\n✅ OVERALL VERDICT: PASS (Performance Acceptable)")
        elif self.results['summary']['pass_rate'] >= 60:
            print(f"\n⚠️  OVERALL VERDICT: MARGINAL (Needs Optimization)")
        else:
            print(f"\n❌ OVERALL VERDICT: FAIL (Critical Performance Issues)")
    
    def save_results(self):
        """Save results to JSON file"""
        filename = f"performance_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f"\n💾 Results saved to: {filename}")

if __name__ == "__main__":
    tester = PerformanceTester()
    tester.run_all_tests()
