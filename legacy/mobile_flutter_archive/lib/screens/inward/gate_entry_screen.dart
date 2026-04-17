import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';

class GateEntryScreen extends StatefulWidget {
  const GateEntryScreen({super.key});

  @override
  State<GateEntryScreen> createState() => _GateEntryScreenState();
}

class _GateEntryScreenState extends State<GateEntryScreen> {
  final _truckController = TextEditingController();
  final _driverController = TextEditingController(); // Auto-fill mock
  final _itemController = TextEditingController(text: "Apple");
  final _quantityController = TextEditingController();

  final _formKey = GlobalKey<FormState>();

  void _onTruckNumberChanged(String value) {
    // Mock OCR / Auto-fill logic
    if (value.length > 4) {
      setState(() {
        _driverController.text = "Ramesh Kumar (9876543210)";
      });
    }
  }

  Future<void> _generateLot() async {
    if (!_formKey.currentState!.validate()) return;

    final lotId = const Uuid().v4();
    final lotCode = "APP-${DateTime.now().millisecond}"; // Simple Lot Code

    // Save to Hive (Offline)
    // We would put this in a 'lots' box in a real app
    // For now showing the success UI
    
    // Show Print Dialog (Mock)
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.black,
        title: Text("Lot Generated: $lotCode", style: const TextStyle(color: Color(0xFF00FF00))),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.qr_code_2, size: 100, color: Colors.white),
            const SizedBox(height: 16),
            const Text("Printing Sticker...", style: TextStyle(color: Colors.white)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context); // Close Dialog
              Navigator.pop(context); // Go back to Home
            },
            child: const Text("DONE", style: TextStyle(color: Color(0xFF00FF00))),
          )
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("Gate Entry (Inward)", style: GoogleFonts.robotoMono(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.black,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              _buildSectionHeader("Truck Info"),
              TextFormField(
                controller: _truckController,
                decoration: _inputDecoration("Truck Number (e.g. MH-12-AB-1234)"),
                style: const TextStyle(color: Colors.white),
                onChanged: _onTruckNumberChanged,
                validator: (val) => val!.isEmpty ? "Required" : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _driverController,
                decoration: _inputDecoration("Driver Name"),
                style: const TextStyle(color: Colors.white),
                readOnly: true, // Auto-filled
              ),
              const SizedBox(height: 32),
              
              _buildSectionHeader("Lot Details"),
              TextFormField(
                controller: _itemController,
                decoration: _inputDecoration("Item (e.g. Apple)"),
                style: const TextStyle(color: Colors.white),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _quantityController,
                decoration: _inputDecoration("Quantity (Crates)"),
                style: const TextStyle(color: Colors.white),
                keyboardType: TextInputType.number,
                validator: (val) => val!.isEmpty ? "Required" : null,
              ),

              const SizedBox(height: 48),
              SizedBox(
                height: 60,
                child: ElevatedButton.icon(
                  onPressed: _generateLot,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00FF00),
                    foregroundColor: Colors.black,
                  ),
                  icon: const Icon(Icons.print),
                  label: Text("GENERATE LOT & PRINT", style: GoogleFonts.inter(fontWeight: FontWeight.bold, fontSize: 16)),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: Text(title.toUpperCase(), style: const TextStyle(color: Colors.grey, fontSize: 12, letterSpacing: 1.5)),
    );
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Colors.grey),
      enabledBorder: OutlineInputBorder(
        borderSide: const BorderSide(color: Colors.grey),
        borderRadius: BorderRadius.circular(8),
      ),
      focusedBorder: OutlineInputBorder(
        borderSide: const BorderSide(color: Color(0xFF00FF00)),
        borderRadius: BorderRadius.circular(8),
      ),
      filled: true,
      fillColor: const Color(0xFF111111),
    );
  }
}
