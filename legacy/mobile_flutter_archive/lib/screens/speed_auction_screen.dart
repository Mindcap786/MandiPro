import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';
import '../services/sync_service.dart';
import '../widgets/mandi_drawer.dart';

class SpeedAuctionScreen extends StatefulWidget {
  const SpeedAuctionScreen({super.key});

  @override
  State<SpeedAuctionScreen> createState() => _SpeedAuctionScreenState();
}

class _SpeedAuctionScreenState extends State<SpeedAuctionScreen> {
  final _rateController = TextEditingController();
  final _quantityController = TextEditingController();
  final FocusNode _rateFocus = FocusNode();
  final FocusNode _quantityFocus = FocusNode();
  final _syncService = SyncService();

  // Mock Data
  String _currentLot = "LOT-101";
  String _selectedBuyer = "Raju Buyer";
  // Buyers list for Speed Dial
  final List<String> _topBuyers = ["Raju", "Shamim", "Arif", "Nasir", "Babu"];

  @override
  void initState() {
    super.initState();
    _rateFocus.requestFocus();
  }

  void _onNumpadTap(String value) {
    TextEditingController activeController;
    if (_rateFocus.hasFocus) {
      activeController = _rateController;
    } else {
      activeController = _quantityController;
    }

    if (value == 'BACK') {
      if (activeController.text.isNotEmpty) {
        activeController.text = activeController.text.substring(0, activeController.text.length - 1);
      }
    } else if (value == 'NEXT') {
      if (_rateFocus.hasFocus) {
        _quantityFocus.requestFocus();
      } else {
        _submitBid();
      }
    } else {
      activeController.text += value;
    }
  }

  Future<void> _submitBid() async {
    if (_rateController.text.isEmpty || _quantityController.text.isEmpty) return;

    final box = Hive.box('offline_transactions');
    final transaction = {
      'id': const Uuid().v4(),
      'lot_id': _currentLot,
      'buyer_id': _selectedBuyer,
      'rate': double.parse(_rateController.text),
      'quantity': double.parse(_quantityController.text),
      'timestamp': DateTime.now().toIso8601String(),
      'status': 'PENDING',
    };

    await box.add(transaction);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text("Bid Saved (Offline)"),
        backgroundColor: Color(0xFF00FF00),
        duration: Duration(milliseconds: 500),
      ),
    );

    _rateController.clear();
    _quantityController.clear();
    _rateFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    // Check if we should show permanent sidebar (Web/Tablet)
    final bool isWide = MediaQuery.of(context).size.width > 900;

    return Scaffold(
      backgroundColor: Colors.black,
      drawer: isWide ? null : const MandiDrawer(),
      body: Row(
        children: [
          if (isWide) const MandiDrawer(),
          Expanded(
            child: Column(
              children: [
                _buildAppBar(context, isWide),
                _buildBuyerSelection(),
                Expanded(
                  child: Row(
                    children: [
                      _buildInputsSection(),
                      _buildNumpadSection(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.large(
        onPressed: () {},
        backgroundColor: Colors.white,
        child: const Icon(Icons.mic, color: Colors.black, size: 40),
      ),
    );
  }

  Widget _buildAppBar(BuildContext context, bool isWide) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      height: 60,
      child: Row(
        children: [
          if (!isWide)
            IconButton(
              icon: const Icon(Icons.menu, color: Colors.white),
              onPressed: () => Scaffold.of(context).openDrawer(),
            ),
          Text(
            "Auction: $_currentLot",
            style: GoogleFonts.robotoMono(fontWeight: FontWeight.bold, fontSize: 18),
          ),
          const Spacer(),
          IconButton(onPressed: () {}, icon: const Icon(Icons.print, color: Colors.white)),
          IconButton(
            onPressed: () async {
              final count = await _syncService.syncPendingTransactions();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text("Synced $count transactions"),
                    backgroundColor: const Color(0xFF00FF00),
                  ),
                );
              }
            },
            icon: const Icon(Icons.cloud_upload, color: Colors.grey),
          ),
        ],
      ),
    );
  }

  Widget _buildBuyerSelection() {
    return SizedBox(
      height: 80,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _topBuyers.length,
        itemBuilder: (context, index) {
          final buyer = _topBuyers[index];
          final isSelected = _selectedBuyer == buyer;
          return GestureDetector(
            onTap: () => setState(() => _selectedBuyer = buyer),
            child: Container(
              width: 80,
              margin: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFF00FF00) : const Color(0xFF333333),
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Text(
                buyer,
                style: TextStyle(
                  color: isSelected ? Colors.black : Colors.white,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildInputsSection() {
    return Expanded(
      flex: 4,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text("Quantity (Crates)", style: GoogleFonts.inter(color: Colors.grey)),
            TextField(
              controller: _quantityController,
              focusNode: _quantityFocus,
              readOnly: true,
              style: GoogleFonts.robotoMono(fontSize: 40, color: Colors.white),
              decoration: const InputDecoration(border: InputBorder.none),
            ),
            const Divider(color: Colors.grey),
            Text("Rate (₹)", style: GoogleFonts.inter(color: Colors.grey)),
            TextField(
              controller: _rateController,
              focusNode: _rateFocus,
              readOnly: true,
              style: GoogleFonts.robotoMono(
                fontSize: 60,
                color: const Color(0xFF00FF00),
                fontWeight: FontWeight.bold,
              ),
              decoration: const InputDecoration(border: InputBorder.none),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNumpadSection() {
    return Expanded(
      flex: 3,
      child: Container(
        color: const Color(0xFF111111),
        child: Column(
          children: [
            _buildNumRow(['7', '8', '9']),
            _buildNumRow(['4', '5', '6']),
            _buildNumRow(['1', '2', '3']),
            _buildNumRow(['.', '0', 'BACK']),
            Expanded(
              child: GestureDetector(
                onTap: () => _onNumpadTap('NEXT'),
                child: Container(
                  margin: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF00FF00),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    "ENTER",
                    style: GoogleFonts.inter(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.black),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNumRow(List<String> keys) {
    return Expanded(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: keys.map((key) {
          return Expanded(
            child: GestureDetector(
              onTap: () => _onNumpadTap(key),
              child: Container(
                margin: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: const Color(0xFF333333),
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: key == 'BACK'
                    ? const Icon(Icons.backspace, color: Colors.white)
                    : Text(key, style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.bold)),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
