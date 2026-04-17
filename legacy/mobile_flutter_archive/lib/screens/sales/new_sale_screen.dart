import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

class NewSaleScreen extends StatefulWidget {
  const NewSaleScreen({super.key});

  @override
  State<NewSaleScreen> createState() => _NewSaleScreenState();
}

class _NewSaleScreenState extends State<NewSaleScreen> {
  final _client = Supabase.instance.client;
  bool _isSubmitting = false;

  // Master Data
  List<Map<String, dynamic>> _buyers = [];
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _lots = [];

  // Form State
  Map<String, dynamic>? _selectedBuyer;
  DateTime _saleDate = DateTime.now();
  String _paymentMode = 'credit';
  List<Map<String, dynamic>> _saleItems = [];
  
  double _loadingCharges = 0;
  double _unloadingCharges = 0;
  double _otherExpenses = 0;

  // Tax Settings (Mock/Fetch from Org)
  double _marketFeePct = 1.0;
  double _nirashritPct = 0.5;
  double _miscFeePct = 0.0;

  @override
  void initState() {
    super.initState();
    _fetchMasters();
  }

  Future<void> _fetchMasters() async {
    try {
      final userId = _client.auth.currentUser?.id;
      final profile = await _client.from('profiles').select('organization_id').eq('id', userId!).single();
      final orgId = profile['organization_id'];

      // Buyers
      final buyerData = await _client.from('contacts').select('id, name, city').eq('organization_id', orgId).eq('type', 'buyer');
      // Items
      final itemData = await _client.from('items').select('id, name').eq('organization_id', orgId);
      // Lots
      final lotData = await _client.from('lots').select('*, contact:contacts(name)').eq('organization_id', orgId).gt('current_qty', 0).eq('status', 'active');
      
      // Org Settings
      final orgData = await _client.from('organizations').select('market_fee_percent, nirashrit_percent, misc_fee_percent').eq('id', orgId).single();

      setState(() {
        _buyers = List<Map<String, dynamic>>.from(buyerData);
        _items = List<Map<String, dynamic>>.from(itemData);
        _lots = List<Map<String, dynamic>>.from(lotData);
        _marketFeePct = (orgData['market_fee_percent'] as num).toDouble();
        _nirashritPct = (orgData['nirashrit_percent'] as num).toDouble();
        _miscFeePct = (orgData['misc_fee_percent'] as num).toDouble();
      });
    } catch (e) {
      debugPrint("Masters fetch error: $e");
    }
  }

  void _addItem() async {
    final newItem = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _AddItemModal(items: _items, lots: _lots),
    );

    if (newItem != null) {
      setState(() {
        _saleItems.add(newItem);
      });
    }
  }

  double get _itemsTotal => _saleItems.fold(0, (sum, item) => sum + (item['amount'] as double));

  Future<void> _submit() async {
    if (_selectedBuyer == null || _saleItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Select Buyer and Items")));
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final userId = _client.auth.currentUser?.id;
      final profile = await _client.from('profiles').select('organization_id').eq('id', userId!).single();
      final orgId = profile['organization_id'];

      final subTotal = _itemsTotal;
      final marketFee = (subTotal * _marketFeePct / 100).roundToDouble();
      final nirashrit = (subTotal * _nirashritPct / 100).roundToDouble();
      final miscFee = (subTotal * _miscFeePct / 100).roundToDouble();

      final response = await _client.rpc('confirm_sale_transaction', params: {
        'p_organization_id': orgId,
        'p_buyer_id': _selectedBuyer!['id'],
        'p_sale_date': DateFormat('yyyy-MM-dd').format(_saleDate),
        'p_payment_mode': _paymentMode,
        'p_total_amount': subTotal,
        'p_items': _saleItems,
        'p_market_fee': marketFee,
        'p_nirashrit': nirashrit,
        'p_misc_fee': miscFee,
        'p_loading_charges': _loadingCharges,
        'p_unloading_charges': _unloadingCharges,
        'p_other_expenses': _otherExpenses,
        'p_idempotency_key': const Uuid().v4(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Sale Recorded Successfully!"), backgroundColor: Color(0xFF00FF00)));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e"), backgroundColor: Colors.red));
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text("NEW INVOICE", style: GoogleFonts.robotoMono(fontWeight: FontWeight.w900, fontSize: 18)),
        backgroundColor: Colors.black,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Buyer Section
            _buildSectionLabel("BUYER DETAILS"),
            const SizedBox(height: 12),
            _buildBuyerSelector(),
            const SizedBox(height: 24),

            // Items Section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _buildSectionLabel("SALE ITEMS"),
                TextButton.icon(
                  onPressed: _addItem,
                  icon: const Icon(Icons.add_circle_outline, size: 18, color: Color(0xFF00E5FF)),
                  label: Text("ADD ITEM", style: GoogleFonts.inter(color: const Color(0xFF00E5FF), fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildItemsList(),
            if (_saleItems.isEmpty) 
               Container(
                 width: double.infinity,
                 padding: const EdgeInsets.all(40),
                 decoration: BoxDecoration(color: const Color(0xFF1E1E1E), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
                 child: Column(children: [const Icon(Icons.shopping_cart_outlined, color: Colors.grey, size: 40), const SizedBox(height: 12), Text("No items added", style: GoogleFonts.inter(color: Colors.grey))]),
               ),
            
            const SizedBox(height: 32),
            _buildSectionLabel("EXPENSES & TOTAL"),
            const SizedBox(height: 12),
            _buildSummary(),

            const SizedBox(height: 48),
            _buildSubmitButton(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionLabel(String label) {
    return Text(label, style: GoogleFonts.inter(color: Colors.grey, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5));
  }

  Widget _buildBuyerSelector() {
    return GestureDetector(
      onTap: () async {
        final buyer = await showSearch(context: context, delegate: _SelectBuyerDelegate(buyers: _buyers));
        if (buyer != null) setState(() => _selectedBuyer = buyer);
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1E1E),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _selectedBuyer == null ? Colors.white10 : const Color(0xFF00FF00).withOpacity(0.3)),
        ),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: _selectedBuyer == null ? Colors.white10 : const Color(0xFF00FF00).withOpacity(0.1),
              child: Icon(Icons.person, color: _selectedBuyer == null ? Colors.grey : const Color(0xFF00FF00)),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_selectedBuyer?['name'] ?? "Select Buyer", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  if (_selectedBuyer != null) Text(_selectedBuyer?['city'] ?? "City", style: GoogleFonts.inter(color: Colors.grey, fontSize: 12)),
                ],
              ),
            ),
            const Icon(Icons.arrow_drop_down, color: Colors.grey),
          ],
        ),
      ),
    );
  }

  Widget _buildItemsList() {
    return Column(
      children: _saleItems.asMap().entries.map((entry) {
        final idx = entry.key;
        final item = entry.value;
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: const Color(0xFF111111), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item['item_name'], style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text("Lot #${item['lot_code']} • Qty: ${item['qty']}", style: GoogleFonts.robotoMono(color: Colors.grey, fontSize: 10)),
                  ],
                ),
              ),
              Text("₹${item['amount']}", style: GoogleFonts.robotoMono(color: const Color(0xFF00E5FF), fontWeight: FontWeight.bold)),
              IconButton(onPressed: () => setState(() => _saleItems.removeAt(idx)), icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20)),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildSummary() {
    final subTotal = _itemsTotal;
    final market = (subTotal * _marketFeePct / 100).round();
    final nirashrit = (subTotal * _nirashritPct / 100).round();
    final total = subTotal + market + nirashrit + _loadingCharges + _unloadingCharges + _otherExpenses;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: const Color(0xFF1E1E1E), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        children: [
          _buildSummaryRow("SUB TOTAL", "₹${subTotal.toInt()}"),
          _buildSummaryRow("MARKET FEE ($_marketFeePct%)", "+ ₹$market", color: Colors.orange),
          _buildSummaryRow("NIRASHRIT ($_nirashritPct%)", "+ ₹$nirashrit", color: Colors.orange),
          _buildChargeInput("LOADING CHARGES", (val) => setState(() => _loadingCharges = val)),
          const Divider(color: Colors.white10, height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("NET PAYABLE", style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14)),
              Text("₹${total.toInt()}", style: GoogleFonts.robotoMono(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 24)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryRow(String label, String value, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: GoogleFonts.inter(color: Colors.grey, fontSize: 11, fontWeight: FontWeight.bold)),
          Text(value, style: GoogleFonts.robotoMono(color: color ?? Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildChargeInput(String label, Function(double) onChanged) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: GoogleFonts.inter(color: Colors.grey, fontSize: 11, fontWeight: FontWeight.bold)),
          SizedBox(
            width: 60,
            child: TextField(
              keyboardType: TextInputType.number,
              style: GoogleFonts.robotoMono(color: const Color(0xFFAA00FF), fontSize: 12, fontWeight: FontWeight.bold),
              textAlign: TextAlign.right,
              decoration: const InputDecoration(isDense: true, border: InputBorder.none, hintText: "0", hintStyle: TextStyle(color: Colors.white24)),
              onChanged: (val) => onChanged(double.tryParse(val) ?? 0),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubmitButton() {
    return SizedBox(
      width: double.infinity,
      height: 64,
      child: ElevatedButton(
        onPressed: _isSubmitting ? null : _submit,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF00FF00),
          foregroundColor: Colors.black,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
        child: _isSubmitting 
          ? const CircularProgressIndicator(color: Colors.black)
          : Text("CONFIRM SALE", style: GoogleFonts.inter(fontWeight: FontWeight.w900, fontSize: 18, letterSpacing: 1)),
      ),
    );
  }
}

class _SelectBuyerDelegate extends SearchDelegate<Map<String, dynamic>?> {
  final List<Map<String, dynamic>> buyers;
  _SelectBuyerDelegate({required this.buyers});

  @override
  List<Widget>? buildActions(BuildContext context) => [IconButton(onPressed: () => query = "", icon: const Icon(Icons.clear))];
  
  @override
  Widget? buildLeading(BuildContext context) => IconButton(onPressed: () => close(context, null), icon: const Icon(Icons.arrow_back));

  @override
  Widget buildResults(BuildContext context) => _buildList();

  @override
  Widget buildSuggestions(BuildContext context) => _buildList();

  Widget _buildList() {
    final filtered = buyers.where((b) => b['name'].toLowerCase().contains(query.toLowerCase())).toList();
    return Container(
      color: Colors.black,
      child: ListView.builder(
        itemCount: filtered.length,
        itemBuilder: (context, i) => ListTile(
          title: Text(filtered[i]['name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          subtitle: Text(filtered[i]['city'] ?? "", style: const TextStyle(color: Colors.grey)),
          onTap: () => close(context, filtered[i]),
        ),
      ),
    );
  }
}

class _AddItemModal extends StatefulWidget {
  final List<Map<String, dynamic>> items;
  final List<Map<String, dynamic>> lots;
  const _AddItemModal({required this.items, required this.lots});

  @override
  State<_AddItemModal> createState() => _AddItemModalState();
}

class _AddItemModalState extends State<_AddItemModal> {
  Map<String, dynamic>? _selectedItem;
  Map<String, dynamic>? _selectedLot;
  final _qtyController = TextEditingController(text: "10");
  final _rateController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final filteredLots = widget.lots.where((l) => l['item_id'] == _selectedItem?['id']).toList();

    return Container(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, top: 20, left: 20, right: 20),
      decoration: const BoxDecoration(color: Color(0xFF1E1E1E), borderRadius: BorderRadius.vertical(top: Radius.circular(32))),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 24),
          Text("ADD TO INVOICE", style: GoogleFonts.blackOpsOne(color: Colors.white, fontSize: 18)),
          const SizedBox(height: 20),
          
          DropdownButtonFormField<Map<String, dynamic>>(
            decoration: _inputDeco("Select Item"),
            dropdownColor: const Color(0xFF1E1E1E),
            items: widget.items.map((i) => DropdownMenuItem(value: i, child: Text(i['name']))).toList(),
            onChanged: (val) => setState(() { _selectedItem = val; _selectedLot = null; }),
          ),
          const SizedBox(height: 16),
          
          DropdownButtonFormField<Map<String, dynamic>>(
            decoration: _inputDeco("Select Lot"),
            dropdownColor: const Color(0xFF1E1E1E),
            value: _selectedLot,
            items: filteredLots.map((l) => DropdownMenuItem(value: l, child: Text("${l['contact']?['name']} (${l['lot_code']}) - ${l['current_qty']} ${l['unit']}"))).toList(),
            onChanged: (val) => setState(() => _selectedLot = val),
          ),
          const SizedBox(height: 16),
          
          Row(
            children: [
              Expanded(child: TextField(controller: _qtyController, decoration: _inputDeco("Qty"), keyboardType: TextInputType.number, style: const TextStyle(color: Colors.white))),
              const SizedBox(width: 16),
              Expanded(child: TextField(controller: _rateController, decoration: _inputDeco("Rate (₹)"), keyboardType: TextInputType.number, style: const TextStyle(color: Colors.white))),
            ],
          ),
          const SizedBox(height: 24),
          
          ElevatedButton(
            onPressed: () {
              if (_selectedItem == null || _selectedLot == null || _rateController.text.isEmpty) return;
              final qty = double.parse(_qtyController.text);
              final rate = double.parse(_rateController.text);
              Navigator.pop(context, {
                'item_id': _selectedItem!['id'],
                'item_name': _selectedItem!['name'],
                'lot_id': _selectedLot!['id'],
                'lot_code': _selectedLot!['lot_code'],
                'qty': qty,
                'rate': rate,
                'amount': qty * rate,
                'unit': _selectedLot!['unit'],
              });
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00E5FF), foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            child: const Text("ADD TO LIST", style: TextStyle(fontWeight: FontWeight.bold)),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  InputDecoration _inputDeco(String label) => InputDecoration(
    labelText: label,
    labelStyle: const TextStyle(color: Colors.grey),
    filled: true,
    fillColor: Colors.white.withOpacity(0.05),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
  );
}
