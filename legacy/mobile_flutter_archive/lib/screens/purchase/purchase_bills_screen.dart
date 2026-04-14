import 'package:flutter/material.dart';
import '../../widgets/mandi_drawer.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class PurchaseBillsScreen extends StatefulWidget {
  const PurchaseBillsScreen({super.key});

  @override
  State<PurchaseBillsScreen> createState() => _PurchaseBillsScreenState();
}

class _PurchaseBillsScreenState extends State<PurchaseBillsScreen> {
  final _client = Supabase.instance.client;
  bool _isLoading = true;
  List<Map<String, dynamic>> _suppliers = [];
  double _totalOwed = 0;

  @override
  void initState() {
    super.initState();
    _fetchSettlements();
  }

  Future<void> _fetchSettlements() async {
    setState(() => _isLoading = true);
    try {
      final userId = _client.auth.currentUser?.id;
      final profile = await _client.from('profiles').select('organization_id').eq('id', userId!).single();
      final orgId = profile['organization_id'];

      // 1. Fetch Balances
      final balanceData = await _client
          .from('view_party_balances')
          .select('*')
          .eq('organization_id', orgId);

      // 2. Filter for Farmers/Suppliers with negative balances (we owe them)
      final List<Map<String, dynamic>> suppliers = [];
      double total = 0;

      for (var b in balanceData) {
        final bal = (b['net_balance'] as num).toDouble();
        if (bal < 0) {
          suppliers.add(b);
          total += bal.abs();
        }
      }

      setState(() {
        _suppliers = suppliers;
        _totalOwed = total;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Settlements error: $e");
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      drawer: const MandiDrawer(),
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.menu, color: Colors.white),
          onPressed: () => Scaffold.of(context).openDrawer(),
        ),
        title: Text("PURCHASE SETTLEMENTS", style: GoogleFonts.robotoMono(fontWeight: FontWeight.w900, fontSize: 16)),
        backgroundColor: Colors.black,
      ),
      body: Column(
        children: [
          _buildSummaryCard(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetchSettlements,
              color: Colors.blueAccent,
              child: _isLoading 
                ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
                : _suppliers.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _suppliers.length,
                      itemBuilder: (context, index) {
                        return _buildSupplierCard(_suppliers[index]);
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [const Color(0xFF001133), const Color(0xFF000000)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.blueAccent.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("TOTAL OUTSTANDING LIABILITY", style: GoogleFonts.inter(color: Colors.blueAccent, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
          const SizedBox(height: 8),
          Text("₹${NumberFormat('#,##,###').format(_totalOwed)}", style: GoogleFonts.robotoMono(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
     return Center(
       child: Column(
         mainAxisAlignment: MainAxisAlignment.center,
         children: [
           Icon(Icons.receipt_long_outlined, size: 64, color: Colors.white10),
           const SizedBox(height: 16),
           Text("No pending settlements", style: GoogleFonts.inter(color: Colors.grey)),
         ],
       ),
     );
  }

  Widget _buildSupplierCard(Map<String, dynamic> supplier) {
    final balance = (supplier['net_balance'] as num).toDouble().abs();
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: Colors.blueAccent.withOpacity(0.1),
            child: Text(supplier['contact_name'][0], style: const TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(supplier['contact_name'], style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                Text(supplier['contact_type'].toString().toUpperCase(), style: GoogleFonts.inter(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text("₹${NumberFormat('#,##,###').format(balance)}", style: GoogleFonts.robotoMono(color: Colors.redAccent, fontWeight: FontWeight.w900, fontSize: 16)),
              Text("TO PAY", style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 8, fontWeight: FontWeight.w900)),
            ],
          ),
        ],
      ),
    );
  }
}
