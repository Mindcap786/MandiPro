import 'package:flutter/material.dart';
import '../../widgets/mandi_drawer.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class ArrivalsScreen extends StatefulWidget {
  const ArrivalsScreen({super.key});

  @override
  State<ArrivalsScreen> createState() => _ArrivalsScreenState();
}

class _ArrivalsScreenState extends State<ArrivalsScreen> {
  final _client = Supabase.instance.client;
  bool _isLoading = true;
  List<Map<String, dynamic>> _arrivals = [];

  @override
  void initState() {
    super.initState();
    _fetchArrivals();
  }

  Future<void> _fetchArrivals() async {
    setState(() => _isLoading = true);
    try {
      final userId = _client.auth.currentUser?.id;
      final profile = await _client.from('profiles').select('organization_id').eq('id', userId!).single();
      final orgId = profile['organization_id'];

      final data = await _client
          .from('arrivals')
          .select('*, contact:contacts(name)')
          .eq('organization_id', orgId)
          .order('arrival_date', ascending: false)
          .limit(20);

      setState(() {
        _arrivals = List<Map<String, dynamic>>.from(data);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Arrivals fetch error: $e");
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
        title: Text("ARRIVALS (INWARD)", style: GoogleFonts.robotoMono(fontWeight: FontWeight.w900, fontSize: 18)),
        backgroundColor: Colors.black,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle, color: Color(0xFF00FF00)),
            onPressed: () {
              // Navigation to Gate Entry as it's the first step of arrival
              Navigator.pop(context); // From Drawer if opened
            },
          )
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchArrivals,
        color: const Color(0xFF00FF00),
        child: _isLoading 
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF00FF00)))
          : _arrivals.isEmpty
            ? _buildEmptyState()
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _arrivals.length,
                itemBuilder: (context, index) {
                  final arrival = _arrivals[index];
                  return _buildArrivalCard(arrival);
                },
              ),
      ),
    );
  }

  Widget _buildEmptyState() {
     return Center(
       child: Column(
         mainAxisAlignment: MainAxisAlignment.center,
         children: [
           Icon(Icons.local_shipping_outlined, size: 64, color: Colors.white10),
           const SizedBox(height: 16),
           Text("No arrivals found", style: GoogleFonts.inter(color: Colors.grey)),
         ],
       ),
     );
  }

  Widget _buildArrivalCard(Map<String, dynamic> arrival) {
    final date = DateTime.parse(arrival['arrival_date']);
    final contactName = arrival['contact']?['name'] ?? 'Walk-in Farmer';
    final type = arrival['arrival_type'] ?? 'N/A';
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: Colors.white.withOpacity(0.02),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text("DOC #${arrival['id'].toString().substring(0, 8).toUpperCase()}", style: GoogleFonts.robotoMono(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.bold)),
                  Text(DateFormat('dd MMM yyyy').format(date), style: GoogleFonts.robotoMono(color: Colors.grey, fontSize: 10)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: const Color(0xFF00FF00).withOpacity(0.1), shape: BoxShape.circle),
                    child: const Icon(Icons.person_pin, color: Color(0xFF00FF00), size: 20),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(contactName, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                        Text(type.toString().toUpperCase(), style: GoogleFonts.inter(color: Colors.blueAccent, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.5)),
                      ],
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios, color: Colors.grey, size: 14),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
