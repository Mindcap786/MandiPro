import 'package:flutter/material.dart';
import '../../widgets/mandi_drawer.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class DayBookScreen extends StatefulWidget {
  const DayBookScreen({super.key});

  @override
  State<DayBookScreen> createState() => _DayBookScreenState();
}

class _DayBookScreenState extends State<DayBookScreen> {
  final _client = Supabase.instance.client;
  DateTime _selectedDate = DateTime.now();
  bool _isLoading = true;
  List<Map<String, dynamic>> _entries = [];
  double _totalDebit = 0;
  double _totalCredit = 0;

  @override
  void initState() {
    super.initState();
    _fetchDayBook();
  }

  Future<void> _fetchDayBook() async {
    setState(() => _isLoading = true);
    try {
      final userId = _client.auth.currentUser?.id;
      final profile = await _client.from('profiles').select('organization_id').eq('id', userId!).single();
      final orgId = profile['organization_id'];

      final start = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day, 0, 0, 0);
      final end = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day, 23, 59, 59);

      final data = await _client
          .from('ledger_entries')
          .select('''
            *,
            contact:contacts(name),
            account:accounts(name)
          ''')
          .eq('organization_id', orgId)
          .gte('entry_date', start.toIso8601String())
          .lte('entry_date', end.toIso8601String())
          .order('entry_date', ascending: false);

      double dr = 0;
      double cr = 0;
      for (var e in data) {
        dr += (e['debit'] as num).toDouble();
        cr += (e['credit'] as num).toDouble();
      }

      setState(() {
        _entries = List<Map<String, dynamic>>.from(data);
        _totalDebit = dr;
        _totalCredit = cr;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Daybook error: $e");
      setState(() => _isLoading = false);
    }
  }

  Future<void> _selectDate() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      builder: (context, child) {
        return Theme(
          data: ThemeData.dark().copyWith(
            colorScheme: const ColorScheme.dark(
              primary: Color(0xFF00FF00),
              onPrimary: Colors.black,
              surface: Color(0xFF1E1E1E),
              onSurface: Colors.white,
            ),
          ),
          child: child!,
        );
      }
    );
    if (picked != null && picked != _selectedDate) {
      setState(() => _selectedDate = picked);
      _fetchDayBook();
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
        title: Text("DAY BOOK (ROZNAMCHA)", style: GoogleFonts.robotoMono(fontWeight: FontWeight.w900, fontSize: 16)),
        backgroundColor: Colors.black,
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_month, color: Color(0xFF00FF00)),
            onPressed: _selectDate,
          )
        ],
      ),
      body: Column(
        children: [
          _buildVolumeHeader(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetchDayBook,
              color: const Color(0xFF00FF00),
              child: _isLoading 
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF00FF00)))
                : _entries.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _entries.length,
                      itemBuilder: (context, index) => _buildEntryRow(_entries[index]),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
     return Center(child: Text("No entries for ${DateFormat('dd MMM').format(_selectedDate)}", style: GoogleFonts.inter(color: Colors.grey)));
  }

  Widget _buildVolumeHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.05))),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("DEBIT (IN) VOLUME", style: GoogleFonts.inter(color: const Color(0xFF00FF00), fontSize: 8, fontWeight: FontWeight.w900)),
                Text("₹${NumberFormat('#,##,###').format(_totalDebit)}", style: GoogleFonts.robotoMono(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          Container(width: 1, height: 30, color: Colors.white10),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text("CREDIT (OUT) VOLUME", style: GoogleFonts.inter(color: Colors.redAccent, fontSize: 8, fontWeight: FontWeight.w900)),
                Text("₹${NumberFormat('#,##,###').format(_totalCredit)}", style: GoogleFonts.robotoMono(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEntryRow(Map<String, dynamic> e) {
    final dr = (e['debit'] as num).toDouble();
    final cr = (e['credit'] as num).toDouble();
    final name = e['contact']?['name'] ?? e['account']?['name'] ?? 'General';
    final date = DateTime.parse(e['entry_date']);
    
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.05)))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(DateFormat('hh:mm\na').format(date), style: GoogleFonts.robotoMono(color: Colors.grey, fontSize: 8, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14)),
                const SizedBox(height: 2),
                Text(e['description'] ?? '', style: GoogleFonts.inter(color: Colors.grey, fontSize: 10)),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(4)),
                  child: Text(e['transaction_type'].toString().toUpperCase(), style: GoogleFonts.robotoMono(color: Colors.grey, fontSize: 7, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (dr > 0) Text("+₹${NumberFormat('#,##,###').format(dr)}", style: GoogleFonts.robotoMono(color: const Color(0xFF00FF00), fontWeight: FontWeight.bold, fontSize: 14)),
              if (cr > 0) Text("-₹${NumberFormat('#,##,###').format(cr)}", style: GoogleFonts.robotoMono(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
              if (e['reference_no'] != null) Text("#${e['reference_no']}", style: GoogleFonts.robotoMono(color: Colors.grey, fontSize: 8)),
            ],
          ),
        ],
      ),
    );
  }
}
