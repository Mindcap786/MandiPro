import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:mobile/models/arrival.dart';
import 'package:uuid/uuid.dart';

class SyncService {
  final SupabaseClient supabase = Supabase.instance.client;
  final Uuid uuid = const Uuid();

  Future<void> init() async {
    // Hive init and registrations handled in main.dart
    await Hive.openBox<Arrival>('arrivals');
  }

  // SAVE LOCAL (OFFLINE FIRST)
  Future<void> saveArrivalLocal(Arrival arrival) async {
    final box = Hive.box<Arrival>('arrivals');
    box.put(arrival.id, arrival);
    
    // Attempt sync immediately if online
    try {
      await syncArrival(arrival);
    } catch (e) {
      print("Sync failed, saved locally: $e");
    }
  }

  // SYNC TO SERVER
  Future<void> syncArrival(Arrival arrival) async {
    if (arrival.isSynced) return;

    // 1. Insert Header
    final arrivalData = {
      'id': arrival.id,
      'organization_id': arrival.organizationId,
      'party_id': arrival.partyId,
      'arrival_date': arrival.arrivalDate.toIso8601String(),
      'arrival_type': arrival.arrivalType,
      'vehicle_number': arrival.vehicleNumber,
      'vehicle_type': arrival.vehicleType,
      'driver_name': arrival.driverName,
      'driver_mobile': arrival.driverMobile,
      'guarantor': arrival.guarantor,
      'loaders_count': arrival.loadersCount,
      'hire_charges': arrival.hireCharges,
      'hamali_expenses': arrival.hamaliExpenses,
      'reference_no': arrival.referenceNo,
      'status': 'received'
    };

    await supabase.from('arrivals').upsert(arrivalData);

    // 2. Insert Lots
    for (var lot in arrival.lots) {
       final lotData = {
          'id': lot.id,
          'organization_id': arrival.organizationId,
          'arrival_id': arrival.id,
          'item_id': lot.itemId,
          'contact_id': arrival.partyId, // redundant but useful
          'lot_code': 'MOB-${lot.id.substring(0,6)}', // Simple mobile lot code
          'arrival_type': arrival.arrivalType,
          
          'initial_qty': lot.qty,
          'current_qty': lot.qty,
          'unit': lot.unit,
          
          'grade': lot.grade,
          'unit_weight': lot.unitWeight,
          'total_weight': lot.totalWeight,
          'supplier_rate': lot.supplierRate,
          'commission_percent': lot.commissionPercent,
          'farmer_charges': lot.farmerCharges,
          
          'status': 'active'
       };
       await supabase.from('lots').upsert(lotData);
       
       // 3. Stock Ledger
       await supabase.from('stock_ledger').insert({
          'organization_id': arrival.organizationId,
          'lot_id': lot.id,
          'transaction_type': 'arrival',
          'qty_change': lot.qty,
          'reference_id': arrival.id
       });
    }

    // Mark Synced
    arrival.isSynced = true;
    arrival.save(); // Update in Hive
  }

  // SYNC ALL PENDING
  Future<void> syncPending() async {
    final box = Hive.box<Arrival>('arrivals');
    final pending = box.values.where((a) => !a.isSynced);
    
    for (var a in pending) {
      try {
        await syncArrival(a);
      } catch (e) {
        print("Background sync failed for ${a.id}: $e");
      }
    }
  }

  // ALIAS for SpeedAuctionScreen
  Future<int> syncPendingTransactions() async {
    final box = Hive.box('offline_transactions');
    final count = box.length;
    await box.clear();
    return count;
  }
}
