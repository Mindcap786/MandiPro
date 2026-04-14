import 'package:flutter/material.dart';
import '../../widgets/mandi_drawer.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class PaymentsReceiptsScreen extends StatefulWidget {
  const PaymentsReceiptsScreen({super.key});

  @override
  State<PaymentsReceiptsScreen> createState() => _PaymentsReceiptsScreenState();
}

class _PaymentsReceiptsScreenState extends State<PaymentsReceiptsScreen> {
  final _client = Supabase.instance.client;
  bool _isLoading = true;
  List<Map<String, dynamic>> _transactions = [];

  @override
  void initState() {
    super.initState();
    _fetchTransactions();
  }

  Future<void> _fetchTransactions() async {
    setState(() => _isLoading = true);
    try {
      final userId = _client.auth.currentUser?.id;
      final profile = await _client.from('profiles').select('organization_id').eq('id', userId!).single();
      final orgId = profile['organization_id'];

      final data = await _client
          .from('vouchers')
          .select('''
            id, date, type, voucher_no, narration, created_at,
            lines:ledger_entries(debit, credit, contact:contacts(name))
          ''')
          .eq('organization_id', orgId)
          .order('date', ascending: false)
          .limit(20);

      final List<Map<String, dynamic>> formatted = [];
      for (var v in data) {
        double amount = 0;
        String partyName = "General";
        final lines = v['lines'] as List;
        final partyEntry = lines.firstWhere((l) => l['contact'] != null, orElse: () => null);
        
        if (partyEntry != null) {
          partyName = partyEntry['contact']['name'];
          amount = v['type'] == 'receipt' ? (partyEntry['credit'] as num).toDouble() : (partyEntry['debit'] as num).toDouble();
        } else {
          partyName = v['narration'] ?? "Expense/Other";
          // Sum debits for amount
          amount = lines.fold(0.0, (sum, l) => sum + (l['debit'] as num).toDouble());
        }
        
        formatted.add({
          ...v,
          'display_amount': amount,
          'display_party': partyName,
        });
      }

      setState(() {
        _transactions = formatted;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Transactions error: $e");
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
        title: Text("PAYMENTS & RECEIPTS", style: GoogleFonts.robotoMono(fontWeight: FontWeight.w900, fontSize: 16)),
        backgroundColor: Colors.black,
      ),
      body: Column(
        children: [
          _buildQuickActions(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(
              children: [
                const Icon(Icons.history, color: Colors.grey, size: 16),
                const SizedBox(width: 8),
                Text("RECENT TRANSACTIONS", style: GoogleFonts.inter(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetchTransactions,
              color: const Color(0xFF00FF00),
              child: _isLoading 
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF00FF00)))
                : _transactions.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _transactions.length,
                      itemBuilder: (context, index) => _buildTransactionCard(_transactions[index]),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    return Container(
      height: 120,
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _buildActionCard("RECEIVE", Icons.south_west_rounded, const Color(0xFF00FF00), "IN"),
          _buildActionCard("PAY", Icons.north_east_rounded, Colors.redAccent, "OUT"),
          _buildActionCard("EXPENSE", Icons.wallet_rounded, Colors.orangeAccent, "EXP"),
        ],
      ),
    );
  }

  Widget _buildActionCard(String title, IconData icon, Color color, String sub) {
    return Container(
      width: 140,
      margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.05),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -10,
            bottom: -10,
            child: Text(sub, style: GoogleFonts.inter(color: color.withOpacity(0.05), fontSize: 40, fontWeight: FontWeight.w900)),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Icon(icon, color: color, size: 24),
                Text(title, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
     return Center(child: Text("No transactions yet.", style: GoogleFonts.inter(color: Colors.grey)));
  }

  Widget _buildTransactionCard(Map<String, dynamic> tx) {
    final isReceipt = tx['type'] == 'receipt';
    final amount = tx['display_amount'] as double;
    final date = DateTime.parse(tx['date']);
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: (isReceipt ? const Color(0xFF00FF00) : Colors.redAccent).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isReceipt ? Icons.arrow_downward : Icons.arrow_upward,
              color: isReceipt ? const Color(0xFF00FF00) : Colors.redAccent,
              size: 18,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tx['display_party'], style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                Text("${tx['type'].toString().toUpperCase()} • ${DateFormat('dd MMM').format(date)}", style: GoogleFonts.inter(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                "${isReceipt ? '+' : '-'} ₹${NumberFormat('#,##,###').format(amount)}",
                style: GoogleFonts.robotoMono(
                  color: isReceipt ? const Color(0xFF00FF00) : Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 15,
                ),
              ),
              Text("#${tx['voucher_no'] ?? 'N/A'}", style: GoogleFonts.robotoMono(color: Colors.grey, fontSize: 8)),
            ],
          ),
        ],
      ),
    );
  }
}
