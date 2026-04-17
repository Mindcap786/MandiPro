import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../screens/inward/gate_entry_screen.dart';
import '../screens/inward/arrivals_screen.dart';
import '../screens/purchase/purchase_bills_screen.dart';
import '../screens/inventory/stock_view_screen.dart';
import '../screens/sales/sales_screen.dart';
import '../screens/finance/finance_screen.dart';
import '../screens/finance/payments_receipts_screen.dart';
import '../screens/reports/daybook_screen.dart';
import '../screens/reports/pl_screen.dart';
import '../screens/speed_auction_screen.dart';

class MandiDrawer extends StatelessWidget {
  const MandiDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    // If width > 900, we might want to return just the Column without the Drawer wrapper
    // for use as a permanent sidebar. But for now, let's just fix the items.
    
    return Drawer(
      backgroundColor: Colors.black,
      width: 280,
      child: Container(
        decoration: BoxDecoration(
          border: Border(right: BorderSide(color: Colors.white.withOpacity(0.05))),
        ),
        child: Column(
          children: [
            _buildHeader(context),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 20),
                children: [
                  _buildMenuItem(context, "Dashboard", Icons.dashboard_outlined, "/home"),
                  _buildMenuItem(context, "Auction (Boli)", Icons.bolt_rounded, null, screen: const SpeedAuctionScreen(), color: const Color(0xFF00FF00)),
                  
                  const _SidebarDivider(label: "INWARD LOGISTICS"),
                  _buildMenuItem(context, "Gate Entry", Icons.gavel_rounded, null, screen: const GateEntryScreen()),
                  _buildMenuItem(context, "Arrivals (History)", Icons.local_shipping_outlined, null, screen: const ArrivalsScreen()),
                  _buildMenuItem(context, "Purchase Bills", Icons.receipt_outlined, null, screen: const PurchaseBillsScreen()),
                  
                  const _SidebarDivider(label: "SALES & FINANCE"),
                  _buildMenuItem(context, "Sales Invoices", Icons.calculate_outlined, null, screen: const SalesScreen()),
                  _buildMenuItem(context, "Payments & Receipts", Icons.account_balance_wallet_outlined, null, screen: const PaymentsReceiptsScreen()),
                  _buildMenuItem(context, "Day Book", Icons.book_outlined, null, screen: const DayBookScreen()),
                  
                  const _SidebarDivider(label: "REPORTS & STOCK"),
                  _buildMenuItem(context, "Inventory Status", Icons.inventory_2_outlined, null, screen: const StockViewScreen()),
                  _buildMenuItem(context, "Financial Overview", Icons.description_outlined, null, screen: const FinanceScreen()),
                  _buildMenuItem(context, "Trading P&L", Icons.trending_up_rounded, null, screen: const TradingPLScreen()),
                  
                  const Divider(color: Colors.white10, height: 40),
                  _buildMenuItem(context, "Settings", Icons.settings_outlined, null),
                ],
              ),
            ),
            _buildFooter(context),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(top: 60, left: 24, right: 24, bottom: 24),
      child: Row(
        children: [
          Text(
            "MandiOS",
            style: GoogleFonts.blackOpsOne(
              color: const Color(0xFF00FF00), 
              fontSize: 22, 
              letterSpacing: 1.5
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: const Color(0xFF00FF00).withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.verified_user, color: Color(0xFF00FF00), size: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuItem(BuildContext context, String title, IconData icon, String? route, {Widget? screen, Color? color}) {
    return ListTile(
      leading: Icon(icon, color: color ?? Colors.grey[400], size: 20),
      title: Text(
        title,
        style: GoogleFonts.inter(
          color: color ?? Colors.grey[300],
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      onTap: () {
        // Only pop if it's used as a drawer
        if (Scaffold.maybeOf(context)?.hasDrawer ?? false) {
           Navigator.pop(context);
        }
        
        if (screen != null) {
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => screen));
        } else if (route != null) {
          Navigator.pushReplacementNamed(context, route);
        }
      },
      dense: true,
      visualDensity: VisualDensity.compact,
    );
  }

  Widget _buildFooter(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Divider(color: Colors.white10),
          const SizedBox(height: 12),
          TextButton.icon(
            onPressed: () async {
              await Supabase.instance.client.auth.signOut();
              final settingsBox = Hive.box('settings');
              await settingsBox.put('is_logged_in', false);
              if (context.mounted) {
                Navigator.pushReplacementNamed(context, '/login');
              }
            },
            icon: const Icon(Icons.logout, color: Colors.redAccent, size: 16),
            label: Text("LOGOUT", style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 12, fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
  }
}

class _SidebarDivider extends StatelessWidget {
  final String label;
  const _SidebarDivider({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 24, top: 24, bottom: 8),
      child: Text(
        label,
        style: GoogleFonts.inter(color: Colors.grey[600], fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1.2),
      ),
    );
  }
}
