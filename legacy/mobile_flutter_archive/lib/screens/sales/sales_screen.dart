import 'package:flutter/material.dart';
import '../../widgets/mandi_drawer.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

class SalesScreen extends StatefulWidget {
  const SalesScreen({super.key});

  @override
  State<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends State<SalesScreen> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _invoices = [];
  bool _isLoading = false;
  bool _hasMore = true;
  int _page = 0;
  final int _pageSize = 20;
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _fetchInvoices();
    _searchController.addListener(_onSearchChanged);
  }

  void _onSearchChanged() {
    if (_searchController.text != _searchQuery) {
      setState(() {
        _searchQuery = _searchController.text;
        _page = 0;
        _invoices.clear();
        _hasMore = true;
      });
      _fetchInvoices();
    }
  }

  Future<void> _fetchInvoices() async {
    if (_isLoading || !_hasMore) return;
    setState(() => _isLoading = true);

    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId == null) return;
      
      // Get Org ID
      final profile = await Supabase.instance.client
          .from('profiles')
          .select('organization_id')
          .eq('id', userId)
          .single();
      final orgId = profile['organization_id'];

      // Query Builder
      var q = Supabase.instance.client.from('sales').select(
        '*, contact:contacts!sales_buyer_id_fkey(*)'
      ).eq('organization_id', orgId);

      if (_searchQuery.isNotEmpty) {
        if (int.tryParse(_searchQuery) != null) {
           q = q.eq('bill_no', int.parse(_searchQuery));
        }
      }

      final response = await q.order('created_at', ascending: false)
       .range(_page * _pageSize, (_page + 1) * _pageSize - 1);
      
      final List<Map<String, dynamic>> data = List<Map<String, dynamic>>.from(response as List);
      
      if (data.length < _pageSize) {
        _hasMore = false;
      }

      setState(() {
        _invoices.addAll(data);
        _page++;
        _isLoading = false;
      });

    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error fetching sales: $e")));
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _shareInvoice(Map<String, dynamic> invoice) async {
    final buyerName = invoice['contact']?['name'] ?? 'Buyer';
    final date = DateFormat('dd MMM yyyy').format(DateTime.parse(invoice['sale_date']));
    final billNo = invoice['bill_no'];
    final amount = NumberFormat('#,##,###').format(invoice['total_amount']);

    final text = "*INVOICE #$billNo*\n"
                 "Date: $date\n"
                 "Buyer: $buyerName\n"
                 "Amount: ₹$amount\n\n"
                 "Please find invoice details attached.";
    
    final url = Uri.parse("https://wa.me/?text=${Uri.encodeComponent(text)}");
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
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
        title: Text("Sales Invoices", style: GoogleFonts.inter(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.black,
      ),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: "Search Invoice No...",
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                filled: true,
                fillColor: const Color(0xFF1E1E1E),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                hintStyle: GoogleFonts.inter(color: Colors.grey),
              ),
              style: GoogleFonts.inter(color: Colors.white),
            ),
          ),

          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _invoices.length + 1,
              itemBuilder: (context, index) {
                if (index == _invoices.length) {
                  return _hasMore 
                      ? Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Center(child: ElevatedButton(
                            onPressed: _fetchInvoices, 
                            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E1E1E)),
                            child: const Text("Load More", style: TextStyle(color: Colors.white)),
                          )),
                        )
                      : const SizedBox(height: 50);
                }

                final invoice = _invoices[index];
                final buyerName = invoice['contact']?['name'] ?? 'Unknown Buyer';
                final amount = (invoice['total_amount'] as num).toDouble();
                final isPaid = invoice['payment_status'] == 'paid';

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E1E1E),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                "#${invoice['bill_no']}",
                                style: GoogleFonts.robotoMono(fontSize: 14, color: Colors.grey.shade400, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                buyerName,
                                style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                               Text(
                                "₹${NumberFormat('#,##,###').format(amount)}",
                                style: GoogleFonts.robotoMono(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: isPaid ? const Color(0xFF00FF00).withOpacity(0.1) : Colors.orange.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(color: isPaid ? const Color(0xFF00FF00) : Colors.orange, width: 0.5),
                                ),
                                child: Text(
                                  isPaid ? "PAID" : "PENDING",
                                  style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.bold, color: isPaid ? const Color(0xFF00FF00) : Colors.orange),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const Divider(color: Colors.white10, height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            DateFormat('dd MMM yyyy, hh:mm a').format(DateTime.parse(invoice['created_at'])),
                            style: GoogleFonts.inter(fontSize: 12, color: Colors.grey),
                          ),
                          Row(
                            children: [
                              IconButton(
                                icon: const Icon(Icons.share, color: Colors.white70, size: 20),
                                onPressed: () => _shareInvoice(invoice),
                              ),
                              IconButton(
                                icon: const Icon(Icons.chat_bubble_outline, color: Color(0xFF25D366), size: 20),
                                onPressed: () => _shareInvoice(invoice),
                              ),
                            ],
                          )
                        ],
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
}
