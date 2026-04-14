import 'package:flutter/material.dart';
import 'package:mobile/models/arrival.dart';
import 'package:mobile/services/sync_service.dart';
import 'package:uuid/uuid.dart';
import 'package:intl/intl.dart';

class ArrivalEntryScreen extends StatefulWidget {
  const ArrivalEntryScreen({super.key});

  @override
  State<ArrivalEntryScreen> createState() => _ArrivalEntryScreenState();
}

class _ArrivalEntryScreenState extends State<ArrivalEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  final SyncService _syncService = SyncService();
  
  // Header Controllers
  final TextEditingController _partyController = TextEditingController();
  final TextEditingController _vehicleNoController = TextEditingController();
  final TextEditingController _driverNoteController = TextEditingController(); // Name + Mobile
  String _arrivalType = 'commission'; // commission, direct
  
  // Expenses Controllers
  final TextEditingController _loadersController = TextEditingController(text: '0');
  final TextEditingController _hireController = TextEditingController(text: '0');
  final TextEditingController _hamaliController = TextEditingController(text: '0');

  // Items State
  List<Lot> _items = [];

  @override
  void initState() {
    super.initState();
    _syncService.init(); // In real app, init at higher level
    _addItem(); // Start with 1 empty item
  }

  void _addItem() {
    setState(() {
      _items.add(Lot(
        id: const Uuid().v4(), 
        itemId: '', // In real app, select from dropdown
        qty: 10, 
        unit: 'Box',
        grade: 'A',
        unitWeight: 10,
        commissionPercent: 6,
      ));
    });
  }

  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
    });
  }

  Future<void> _saveArrival() async {
    if (!_formKey.currentState!.validate()) return;

    final arrival = Arrival(
      id: const Uuid().v4(),
      organizationId: '8c11de72-6a71-4fd3-a442-7f653a710876', // Hardcoded for now
      arrivalDate: DateTime.now(),
      partyId: 'DEMO-PARTY-ID', // Needs autocomplete
      arrivalType: _arrivalType,
      vehicleNumber: _vehicleNoController.text,
      driverName: _driverNoteController.text,
      loadersCount: int.tryParse(_loadersController.text) ?? 0,
      hireCharges: double.tryParse(_hireController.text) ?? 0.0,
      hamaliExpenses: double.tryParse(_hamaliController.text) ?? 0.0,
      lots: _items,
    );

    await _syncService.saveArrivalLocal(arrival);
    
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Arrival Saved! Syncing...')),
      );
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('New Arrival', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      backgroundColor: const Color(0xFF0A0A15), // MandiPro Dark Theme
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildSectionHeader('Basic Info'),
            _buildTextField(_partyController, 'Farmer / Supplier Code'),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _buildRadioOption('Commission', 'commission')),
                Expanded(child: _buildRadioOption('Direct Purchase', 'direct')),
              ],
            ),

            const SizedBox(height: 20),
            _buildSectionHeader('Transport & Expenses'),
            Row(
              children: [
                Expanded(child: _buildTextField(_vehicleNoController, 'Vehicle No')),
                const SizedBox(width: 10),
                Expanded(child: _buildTextField(_driverNoteController, 'Driver Info')),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _buildNumField(_loadersController, 'Loaders')),
                const SizedBox(width: 10),
                Expanded(child: _buildNumField(_hireController, 'Hire (\$)')),
                const SizedBox(width: 10),
                Expanded(child: _buildNumField(_hamaliController, 'Hamali (\$)')),
              ],
            ),

            const SizedBox(height: 20),
            _buildSectionHeader('Consignment Items'),
            ..._items.asMap().entries.map((entry) {
              int idx = entry.key;
              Lot item = entry.value;
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white10),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                         Text('#\${idx + 1}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                         const Spacer(),
                         IconButton(
                           icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                           onPressed: () => _removeItem(idx),
                         )
                      ],
                    ),
                    Row(
                       children: [
                         Expanded(child: _buildMiniDataField('Item', (val) => item.itemId = val)),
                         const SizedBox(width: 8),
                         Expanded(child: _buildMiniDataField('Grade', (val) => item.grade = val, init: 'A')),
                       ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                       children: [
                         Expanded(child: _buildMiniNumField('Qty', (val) => item.qty = double.tryParse(val) ?? 0, init: '10')),
                         const SizedBox(width: 8),
                         Expanded(child: _buildMiniNumField('Wgt/Unit', (val) => item.unitWeight = double.tryParse(val) ?? 0, init: '10')),
                         const SizedBox(width: 8),
                         Expanded(child: _buildMiniNumField('Rate', (val) => item.supplierRate = double.tryParse(val) ?? 0, init: '0')),
                       ],
                    ),
                  ],
                ),
              );
            }).toList(),

            ElevatedButton.icon(
              onPressed: _addItem,
              icon: const Icon(Icons.add),
              label: const Text('Add Item'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white10,
                foregroundColor: Colors.white,
              ),
            ),
            
            const SizedBox(height: 40),
            ElevatedButton(
              onPressed: _saveArrival,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF39FF14), // Neon Green
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 20),
                textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              child: const Text('SAVE ARRIVAL'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(color: const Color(0xFF39FF14).withOpacity(0.7), letterSpacing: 1.5, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _buildRadioOption(String label, String value) {
    return RadioListTile<String>(
      title: Text(label, style: const TextStyle(color: Colors.white, fontSize: 12)),
      value: value,
      groupValue: _arrivalType,
      activeColor: const Color(0xFF39FF14),
      onChanged: (val) => setState(() => _arrivalType = val!),
      contentPadding: EdgeInsets.zero,
    );
  }

  Widget _buildTextField(TextEditingController controller, String label) {
    return TextFormField(
      controller: controller,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.grey),
        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
        focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFF39FF14))),
        fillColor: Colors.white.withOpacity(0.05),
        filled: true,
      ),
    );
  }

  Widget _buildNumField(TextEditingController controller, String label) {
    return TextFormField(
      controller: controller,
      keyboardType: TextInputType.number,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.grey, fontSize: 10),
        contentPadding: const EdgeInsets.all(12),
        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
        fillColor: Colors.white.withOpacity(0.05),
        filled: true,
      ),
    );
  }

   Widget _buildMiniDataField(String label, Function(String) onChanged, {String init = ''}) {
    return TextFormField(
      initialValue: init,
      onChanged: onChanged,
      style: const TextStyle(color: Colors.white, fontSize: 12),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.grey, fontSize: 10),
        contentPadding: const EdgeInsets.all(8),
        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
        fillColor: Colors.black,
        filled: true,
      ),
    );
  }

  Widget _buildMiniNumField(String label, Function(String) onChanged, {String init = ''}) {
    return TextFormField(
      initialValue: init,
      onChanged: onChanged,
      keyboardType: TextInputType.number,
      style: const TextStyle(color: Colors.white, fontSize: 12),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.grey, fontSize: 10),
        contentPadding: const EdgeInsets.all(8),
        enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
        fillColor: Colors.black,
        filled: true,
      ),
    );
  }
}
