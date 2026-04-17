import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart';

class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});

  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _balances = [];
  double _totalReceivable = 0;
  double _totalPayable = 0;
  String _filter = 'all'; // all, buyer, supplier

  @override
  void initState() {
    super.initState();
    _fetchBalances();
  }

  Future<void> _fetchBalances() async {
    setState(() => _isLoading = true);
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return;

    // Get Organization ID (Assuming stored in profile or we fetch it)
    // For simplicity, we'll just query the view directly as it likely RLS protected anyway or we filter by org
    // But since we don't have easy access to profile context here, we'll try to fetch safely.
    
    try {
      // 1. Get Organization ID from profile
      final profile = await Supabase.instance.client
          .from('profiles')
          .select('organization_id')
          .eq('id', userId)
          .single();
      
      final orgId = profile['organization_id'];

      // 2. Fetch Balances
      final data = await Supabase.instance.client
          .from('view_party_balances')
          .select('*')
          .eq('organization_id', orgId)
          .order('net_balance', ascending: true); // Payables (negative) first

      if (data != null) {
        final List<Map<String, dynamic>> balances = List<Map<String, dynamic>>.from(data);
        
        // Calculate Totals
        double rec = 0;
        double pay = 0;
        for (var b in balances) {
          final bal = (b['net_balance'] as num).toDouble();
          if (bal > 0) rec += bal;
          if (bal < 0) pay += bal.abs();
        }

        setState(() {
          _balances = balances;
          _totalReceivable = rec;
          _totalPayable = pay;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _shareOnWhatsApp(String text) async {
    final url = Uri.parse("https://wa.me/?text=${Uri.encodeComponent(text)}");
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      // Fallback
      print("Could not launch WhatsApp");
    }
  }

  @override
  Widget build(BuildContext context) {
    final filteredBalances = _filter == 'all' 
        ? _balances 
        : _balances.where((b) => b['contact_type'] == _filter).toList();

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.menu, color: Colors.white),
          onPressed: () => Scaffold.of(context).openDrawer(),
        ),
        title: Text("Financials", style: GoogleFonts.inter(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.black,
        actions: [
          IconButton(
            icon: const Icon(Icons.share, color: Color(0xFF00FF00)),
            onPressed: () {
               final text = "*Financial Overview*\n"
                            "Receivables: ₹${NumberFormat('#,##,###').format(_totalReceivable)}\n"
                            "Payables: ₹${NumberFormat('#,##,###').format(_totalPayable)}";
               _shareOnWhatsApp(text);
            },
          )
        ],
      ),
      body: _isLoading 
        ? const Center(child: CircularProgressIndicator(color: Color(0xFF00FF00))) 
        : Column(
            children: [
              // 1. KPI Cards
              SizedBox(
                height: 140,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.all(16),
                  children: [
                    _buildKPICard("Receivables", _totalReceivable, const Color(0xFF00FF00), Icons.arrow_downward),
                    _buildKPICard("Payables", _totalPayable, Colors.redAccent, Icons.arrow_upward),
                  ],
                ),
              ),

              // 2. Filters
              SizedBox(
                height: 50,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    _buildFilterChip('all', 'All'),
                    _buildFilterChip('buyer', 'Buyers'),
                    _buildFilterChip('supplier', 'Suppliers'),
                    _buildFilterChip('farmer', 'Farmers'),
                  ],
                ),
              ),

              // 3. List
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: filteredBalances.length,
                  itemBuilder: (context, index) {
                    final item = filteredBalances[index];
                    final balance = (item['net_balance'] as num).toDouble();
                    final isPayable = balance < 0;
                    
                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E1E1E),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white10),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item['contact_name'] ?? 'Unknown',
                                  style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.bold),
                                ),
                                Text(
                                  item['contact_type']?.toString().toUpperCase() ?? '',
                                  style: GoogleFonts.inter(fontSize: 10, color: Colors.grey, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                "₹${NumberFormat('#,##,###').format(balance.abs())}",
                                style: GoogleFonts.robotoMono(
                                  fontSize: 16, 
                                  fontWeight: FontWeight.bold,
                                  color: isPayable ? Colors.redAccent : const Color(0xFF00FF00)
                                ),
                              ),
                              Text(
                                isPayable ? "To Pay (Dr)" : "To Receive (Cr)",
                                style: GoogleFonts.inter(fontSize: 10, color: Colors.grey),
                              ),
                            ],
                          ),
                          const SizedBox(width: 12),
                          IconButton(
                            icon: const Icon(Icons.chat_bubble_outline, color: Color(0xFF25D366)),
                            onPressed: () {
                              final text = "Hello *${item['contact_name']}*,\n\n"
                                           "Your current outstanding balance is *₹${NumberFormat('#,##,###').format(balance.abs())}* ${isPayable ? '(Cr)' : '(Dr)'}.\n"
                                           "Please Review.";
                              _shareOnWhatsApp(text);
                            },
                          )
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
    );
  }

  Widget _buildKPICard(String title, double amount, Color color, IconData icon) {
    return Container(
      width: 160,
      margin: const EdgeInsets.only(right: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 16),
              const SizedBox(width: 8),
              Text(title, style: GoogleFonts.inter(color: color, fontSize: 12, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            "₹${NumberFormat.compact().format(amount)}", 
            style: GoogleFonts.inter(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String key, String label) {
    final isSelected = _filter == key;
    return GestureDetector(
      onTap: () => setState(() => _filter = key),
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.white10,
          borderRadius: BorderRadius.circular(20),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: GoogleFonts.inter(
            color: isSelected ? Colors.black : Colors.white, 
            fontWeight: FontWeight.bold
          ),
        ),
      ),
    );
  }
}
