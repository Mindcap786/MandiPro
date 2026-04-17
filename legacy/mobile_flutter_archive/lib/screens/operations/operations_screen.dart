import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../sales/sales_screen.dart';
import '../sales/new_sale_screen.dart';
import '../finance/finance_screen.dart';
import '../inward/gate_entry_screen.dart';
import '../inventory/stock_view_screen.dart';
import '../speed_auction_screen.dart';

class OperationsScreen extends StatelessWidget {
  const OperationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.menu, color: Colors.white),
                    onPressed: () => Scaffold.of(context).openDrawer(),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    "OPERATIONS",
                    style: GoogleFonts.blackOpsOne(color: Colors.white, fontSize: 24, letterSpacing: 1.5),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                "Mandi Management & Floor Controls",
                style: GoogleFonts.inter(color: Colors.grey, fontSize: 14),
              ),
              const SizedBox(height: 32),
              Expanded(
                child: GridView.count(
                  crossAxisCount: 2,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  children: [
                    _buildOpCard(
                      context,
                      "SPEED AUCTION",
                      "Boli Live",
                      Icons.gavel_rounded,
                      const Color(0xFF00FF00),
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SpeedAuctionScreen())),
                    ),
                    _buildOpCard(
                      context,
                      "NEW INVOICE",
                      "Direct Sale",
                      Icons.receipt_long_rounded,
                      const Color(0xFF00E5FF),
                      () {
                         Navigator.push(context, MaterialPageRoute(builder: (_) => const NewSaleScreen()));
                      },
                    ),
                    _buildOpCard(
                      context,
                      "GATE ENTRY",
                      "Incoming",
                      Icons.local_shipping_rounded,
                      const Color(0xFFAA00FF),
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const GateEntryScreen())),
                    ),
                    _buildOpCard(
                      context,
                      "LIVE STOCK",
                      "Inventory",
                      Icons.inventory_2_rounded,
                      const Color(0xFFFFAB00),
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const StockViewScreen())),
                    ),
                    _buildOpCard(
                      context,
                      "LEDGERS",
                      "Financials",
                      Icons.account_balance_wallet_rounded,
                      const Color(0xFFFF1744),
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FinanceScreen())),
                    ),
                    _buildOpCard(
                      context,
                      "REPORTS",
                      "Analytics",
                      Icons.bar_chart_rounded,
                      Colors.grey,
                      () {},
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOpCard(BuildContext context, String title, String sub, IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1E1E1E),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
          boxShadow: [
            BoxShadow(color: color.withOpacity(0.05), blurRadius: 20, offset: const Offset(0, 10)),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 32),
            ),
            const SizedBox(height: 12),
            Text(title, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 0.5)),
            const SizedBox(height: 4),
            Text(sub, style: GoogleFonts.inter(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    ).animate()
      .fadeIn(duration: 500.ms)
      .scale(begin: const Offset(0.9, 0.9), curve: Curves.easeOutBack);
  }
}
