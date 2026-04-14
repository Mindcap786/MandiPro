import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../utils/commodity_mapping.dart';

class StockViewScreen extends StatefulWidget {
  const StockViewScreen({super.key});

  @override
  State<StockViewScreen> createState() => _StockViewScreenState();
}

class _StockViewScreenState extends State<StockViewScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _allStock = [];
  List<Map<String, dynamic>> _filteredStock = [];
  String _searchQuery = "";
  String _activeFilter = "All";

  @override
  void initState() {
    super.initState();
    _fetchStock();
  }

  Future<void> _fetchStock() async {
    setState(() => _isLoading = true);
    try {
      final client = Supabase.instance.client;
      final userId = client.auth.currentUser?.id;
      if (userId == null) return;

      final profile = await client.from('profiles').select('organization_id').eq('id', userId).single();
      final orgId = profile['organization_id'];

      // Fetch active lots with item details (including image_url)
      final response = await client.from('lots').select('''
        id, lot_code, current_qty, original_qty, unit, arrival_type,
        items (name, image_url)
      ''').eq('organization_id', orgId).gt('current_qty', 0).order('created_at', ascending: false);

      setState(() {
        _allStock = List<Map<String, dynamic>>.from(response);
        _applyFilters();
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Stock Fetch Error: $e");
      setState(() => _isLoading = false);
    }
  }

  void _applyFilters() {
    setState(() {
      _filteredStock = _allStock.where((lot) {
        final item = lot['items'];
        final matchesSearch = item['name'].toString().toLowerCase().contains(_searchQuery.toLowerCase());
        final matchesFilter = _activeFilter == "All" || lot['arrival_type'].toString().toLowerCase() == _activeFilter.toLowerCase();
        return matchesSearch && matchesFilter;
      }).toList();
    });
  }

  Future<void> _adjustWastage(String lotId, double newVal) async {
     setState(() {
       final idx = _allStock.indexWhere((l) => l['id'] == lotId);
       if (idx != -1) _allStock[idx]['current_qty'] = newVal;
       _applyFilters();
     });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.menu, color: Colors.white),
          onPressed: () => Scaffold.of(context).openDrawer(),
        ),
        title: Text("LIVE INVENTORY", style: GoogleFonts.blackOpsOne(letterSpacing: 1.2, fontSize: 18, color: Colors.white)),
        backgroundColor: Colors.black,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF00FF00)),
            onPressed: _fetchStock,
          )
        ],
      ),
      body: Column(
        children: [
          _buildSearchAndFilters(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF00FF00)))
              : _filteredStock.isEmpty 
                ? _buildEmptyState()
                : RefreshIndicator(
                    onRefresh: _fetchStock,
                    color: const Color(0xFF00FF00),
                    backgroundColor: const Color(0xFF1E1E1E),
                    child: ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        itemCount: _filteredStock.length,
                        itemBuilder: (context, index) {
                          final lot = _filteredStock[index];
                          final item = lot['items'];
                          final itemName = item['name'] ?? 'Unknown';
                          final imageUrl = item['image_url'];
                          
                          // Intelligent visual Mapping
                          final visual = CommodityMapping.getVisual(itemName);
                          
                          final currentQty = (lot['current_qty'] as num).toDouble();
                          final originalQty = (lot['original_qty'] as num).toDouble();
                          
                          return Container(
                            margin: const EdgeInsets.only(bottom: 20),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E1E1E),
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(color: Colors.white.withOpacity(0.05)),
                            ),
                            child: Column(
                              children: [
                                // Header with Image
                                ClipRRect(
                                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                                  child: Stack(
                                    children: [
                                      if (imageUrl != null && imageUrl.toString().isNotEmpty)
                                        Image.network(
                                          imageUrl,
                                          height: 160,
                                          width: double.infinity,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) => _buildVisualAsset(visual),
                                        )
                                      else
                                        _buildVisualAsset(visual),
                                      
                                      Positioned.fill(
                                        child: Container(
                                          decoration: BoxDecoration(
                                            gradient: LinearGradient(
                                              begin: Alignment.topCenter,
                                              end: Alignment.bottomCenter,
                                              colors: [Colors.transparent, Colors.black.withOpacity(0.8)],
                                            ),
                                          ),
                                        ),
                                      ),
                                      
                                      Positioned(
                                        bottom: 12,
                                        left: 16,
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              itemName.toString().toUpperCase(),
                                              style: GoogleFonts.inter(fontWeight: FontWeight.w900, color: Colors.white, fontSize: 18),
                                            ),
                                            Text(
                                              "LOT #${lot['lot_code']}",
                                              style: GoogleFonts.robotoMono(color: const Color(0xFF00FF00), fontSize: 10, fontWeight: FontWeight.bold),
                                            ),
                                          ],
                                        ),
                                      ),
                                      
                                      Positioned(
                                        top: 12,
                                        right: 12,
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: Colors.black.withOpacity(0.7),
                                            borderRadius: BorderRadius.circular(8),
                                            border: Border.all(color: Colors.white10),
                                          ),
                                          child: Text(
                                            lot['arrival_type'].toString().toUpperCase(),
                                            style: GoogleFonts.inter(color: Colors.grey, fontSize: 8, fontWeight: FontWeight.bold),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                
                                // Stats Section
                                Padding(
                                  padding: const EdgeInsets.all(20),
                                  child: Column(
                                    children: [
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          _buildMinorStat("AVAILABLE", "${currentQty.toInt()} ${lot['unit']}"),
                                          _buildMinorStat("ORIGINAL", "${originalQty.toInt()} ${lot['unit']}"),
                                        ],
                                      ),
                                      const SizedBox(height: 16),
                                      
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text("SHRINKAGE / WASTAGE", style: GoogleFonts.inter(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.bold)),
                                          Text(
                                            "${(originalQty - currentQty).toInt()} ${lot['unit']}",
                                            style: GoogleFonts.robotoMono(color: Colors.redAccent, fontSize: 12, fontWeight: FontWeight.bold),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      SliderTheme(
                                        data: SliderTheme.of(context).copyWith(
                                          trackHeight: 2,
                                          thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                                          overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
                                        ),
                                        child: Slider(
                                          value: currentQty,
                                          min: 0,
                                          max: originalQty,
                                          activeColor: const Color(0xFF00FF00),
                                          inactiveColor: Colors.white10,
                                          onChanged: (val) => _adjustWastage(lot['id'], val),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchAndFilters() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          TextField(
            onChanged: (val) {
              _searchQuery = val;
              _applyFilters();
            },
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: "Search Inventory...",
              hintStyle: const TextStyle(color: Colors.grey),
              prefixIcon: const Icon(Icons.search, color: Color(0xFF00FF00)),
              filled: true,
              fillColor: const Color(0xFF1E1E1E),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildFilterChip("All"),
                _buildFilterChip("Commission"),
                _buildFilterChip("Direct"),
                _buildFilterChip("Commission_Supplier", label: "Supplier"),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String filter, {String? label}) {
    final bool isSelected = _activeFilter == filter;
    return GestureDetector(
      onTap: () {
        setState(() {
          _activeFilter = filter;
          _applyFilters();
        });
      },
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF00FF00) : const Color(0xFF1E1E1E),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: isSelected ? Colors.transparent : Colors.white10),
        ),
        child: Text(
          label ?? filter,
          style: TextStyle(
            color: isSelected ? Colors.black : Colors.grey,
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildVisualAsset(VisualAsset visual) {
    if (visual.type == 'img' && visual.src != null) {
      return Image.asset(
        visual.src!,
        height: 160,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildPlaceholder(),
      );
    }
    return _buildPlaceholder(icon: _getIconFromName(visual.iconName));
  }

  IconData _getIconFromName(String? name) {
    switch (name) {
      case 'apple': return Icons.apple;
      case 'citrus': return Icons.circle;
      case 'grape': return Icons.auto_awesome_mosaic;
      case 'package':
      default: return Icons.inventory_2_outlined;
    }
  }

  Widget _buildPlaceholder({IconData? icon}) {
    return Container(
      height: 160,
      width: double.infinity,
      color: const Color(0xFF2A2A2A),
      child: Icon(icon ?? Icons.inventory_2_outlined, color: Colors.white10, size: 48),
    );
  }

  Widget _buildMinorStat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: GoogleFonts.inter(color: Colors.grey, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
        const SizedBox(height: 2),
        Text(value, style: GoogleFonts.robotoMono(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.inventory_2_outlined, color: Colors.white10, size: 80),
          const SizedBox(height: 16),
          Text("No Active Stock Found", style: GoogleFonts.inter(color: Colors.grey, fontSize: 16)),
          const SizedBox(height: 8),
          Text("Try searching for something else.", style: GoogleFonts.inter(color: Colors.white24, fontSize: 12)),
        ],
      ),
    );
  }
}
