import 'package:flutter/material.dart';
import '../../widgets/mandi_drawer.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class TradingPLScreen extends StatefulWidget {
  const TradingPLScreen({super.key});

  @override
  State<TradingPLScreen> createState() => _TradingPLScreenState();
}

class _TradingPLScreenState extends State<TradingPLScreen> {
  final _client = Supabase.instance.client;
  bool _isLoading = true;
  double _totalRevenue = 0;
  double _totalCost = 0;
  double _totalProfit = 0;
  double _margin = 0;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _fetchPL();
  }

  Future<void> _fetchPL() async {
    setState(() => _isLoading = true);
    try {
      final userId = _client.auth.currentUser?.id;
      final profile = await _client.from('profiles').select('organization_id').eq('id', userId!).single();
      final orgId = profile['organization_id'];

      final data = await _client
          .from('sale_items')
          .select('''
            *,
            sale:sales!inner(sale_date, organization_id),
            lot:lots!left(id, lot_code, supplier_rate, arrival_type, commission_percent, item:items(name))
          ''')
          .eq('sale.organization_id', orgId)
          .order('created_at', ascending: false)
          .limit(50);

      double rev = 0;
      double cost = 0;
      final List<Map<String, dynamic>> processed = [];

      for (var saleItem in data) {
        if (saleItem['lot'] == null) continue;

        final qty = (saleItem['qty'] as num).toDouble();
        final saleRate = (saleItem['rate'] as num).toDouble();
        final revenue = qty * saleRate;
        final isDirect = saleItem['lot']['arrival_type'] == 'direct';
        
        double itemCost = 0;
        double profit = 0;
        
        if (isDirect) {
          final costRate = (saleItem['lot']['supplier_rate'] as num).toDouble();
          itemCost = qty * costRate;
          profit = revenue - itemCost;
        } else {
          final commPercent = (saleItem['lot']['commission_percent'] as num).toDouble();
          profit = revenue * (commPercent / 100);
          itemCost = revenue - profit;
        }

        rev += revenue;
        cost += itemCost;
        
        processed.add({
          'item': saleItem['lot']['item']['name'],
          'lot_code': saleItem['lot']['lot_code'],
          'profit': profit,
          'revenue': revenue,
          'qty': qty,
          'date': saleItem['sale']['sale_date'],
        });
      }

      setState(() {
        _totalRevenue = rev;
        _totalCost = cost;
        _totalProfit = rev - cost;
        _margin = cost > 0 ? ((rev - cost) / cost) * 100 : 0;
        _items = processed;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("PL error: $e");
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
        title: Text("TRADING P&L", style: GoogleFonts.robotoMono(fontWeight: FontWeight.w900, fontSize: 16)),
        backgroundColor: Colors.black,
      ),
      body: _isLoading 
        ? const Center(child: CircularProgressIndicator(color: Color(0xFF00FF00)))
        : RefreshIndicator(
            onRefresh: _fetchPL,
            color: const Color(0xFF00FF00),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildProfitSummary(),
                const SizedBox(height: 16),
                _buildSecondaryStats(),
                const SizedBox(height: 24),
                Text("RECENT TRADES", style: GoogleFonts.inter(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
                const SizedBox(height: 12),
                ..._items.map((item) => _buildTradeRow(item)),
              ],
            ),
          ),
    );
  }

  Widget _buildProfitSummary() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF0F2015), Colors.black], begin: Alignment.topLeft),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF00FF00).withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(width: 8, height: 8, decoration: const BoxDecoration(color: Color(0xFF00FF00), shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text("TOTAL NET PROFIT", style: GoogleFonts.inter(color: const Color(0xFF00FF00), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
            ],
          ),
          const SizedBox(height: 12),
          Text("₹${NumberFormat('#,##,###').format(_totalProfit)}", style: GoogleFonts.robotoMono(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text("Margin: ${_margin.toStringAsFixed(1)}%", style: GoogleFonts.inter(color: Colors.grey, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildSecondaryStats() {
    return Row(
      children: [
        _buildMiniCard("REVENUE", "₹${NumberFormat.compact().format(_totalRevenue)}", Colors.white),
        const SizedBox(width: 12),
        _buildMiniCard("COST", "₹${NumberFormat.compact().format(_totalCost)}", Colors.redAccent),
      ],
    );
  }

  Widget _buildMiniCard(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1E1E),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: GoogleFonts.inter(color: Colors.grey, fontSize: 8, fontWeight: FontWeight.w900)),
            Text(value, style: GoogleFonts.robotoMono(color: color, fontSize: 16, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildTradeRow(Map<String, dynamic> item) {
    final profit = item['profit'] as double;
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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item['item'], style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold)),
                Text("Lot ${item['lot_code']} • ${item['qty']} units", style: GoogleFonts.robotoMono(color: Colors.grey, fontSize: 10)),
              ],
            ),
          ),
          Text(
            "${profit >= 0 ? '+' : ''}₹${NumberFormat('#,###').format(profit)}",
            style: GoogleFonts.robotoMono(color: profit >= 0 ? const Color(0xFF00FF00) : Colors.redAccent, fontWeight: FontWeight.w900),
          ),
        ],
      ),
    );
  }
}
