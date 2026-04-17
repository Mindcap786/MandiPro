import 'package:hive/hive.dart';

@HiveType(typeId: 3)
class Arrival extends HiveObject {
  @HiveField(0)
  String id;

  @HiveField(1)
  String organizationId;

  @HiveField(2)
  String? partyId; // Farmer/Supplier ID

  @HiveField(3)
  DateTime arrivalDate;

  // Transport
  @HiveField(4)
  String? vehicleNumber;
  
  @HiveField(5)
  String? vehicleType;
  
  @HiveField(6)
  String? driverName;
  
  @HiveField(7)
  String? driverMobile;

  // Business
  @HiveField(8)
  String arrivalType; // 'direct' or 'commission'
  
  @HiveField(9)
  String? guarantor;

  // Expenses
  @HiveField(10)
  int loadersCount;
  
  @HiveField(11)
  double hireCharges;
  
  @HiveField(12)
  double hamaliExpenses;

  @HiveField(13)
  String? referenceNo;

  @HiveField(14)
  bool isSynced;

  @HiveField(15)
  List<Lot> lots;

  Arrival({
    required this.id,
    required this.organizationId,
    this.partyId,
    required this.arrivalDate,
    this.vehicleNumber,
    this.vehicleType,
    this.driverName,
    this.driverMobile,
    required this.arrivalType,
    this.guarantor,
    this.loadersCount = 0,
    this.hireCharges = 0.0,
    this.hamaliExpenses = 0.0,
    this.referenceNo,
    this.isSynced = false,
    this.lots = const [],
  });
}

@HiveType(typeId: 4)
class Lot extends HiveObject {
  @HiveField(0)
  String id;

  @HiveField(1)
  String itemId;

  @HiveField(2)
  double qty;

  @HiveField(3)
  String unit; // Box, Crate, Kg

  @HiveField(4)
  String grade; // A, B, Mix

  @HiveField(5)
  double unitWeight;

  @HiveField(6)
  double totalWeight;

  @HiveField(7)
  double supplierRate;

  @HiveField(8)
  double commissionPercent;

  @HiveField(9)
  double farmerCharges;

  Lot({
    required this.id,
    required this.itemId,
    required this.qty,
    required this.unit,
    this.grade = 'A',
    this.unitWeight = 0.0,
    this.totalWeight = 0.0,
    this.supplierRate = 0.0,
    this.commissionPercent = 0.0,
    this.farmerCharges = 0.0,
  });
}
