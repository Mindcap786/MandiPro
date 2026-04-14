import 'package:hive/hive.dart';

@HiveType(typeId: 2)
class Receipt extends HiveObject {
  @HiveField(0)
  late String id;

  @HiveField(1)
  late String buyerId;

  @HiveField(2)
  late String receiptNumber;

  @HiveField(3)
  late double amount;

  @HiveField(4)
  late String paymentMode; // 'cash', 'online', 'cheque'

  @HiveField(5)
  late DateTime createdAt;

  @HiveField(6)
  String? invoiceId;

  @HiveField(7)
  String? remarks;

  Receipt({
    required this.id,
    required this.buyerId,
    required this.receiptNumber,
    required this.amount,
    required this.paymentMode,
    required this.createdAt,
    this.invoiceId,
    this.remarks,
  });

  // Factory from Supabase JSON
  factory Receipt.fromJson(Map<String, dynamic> json) {
    return Receipt(
      id: json['id'],
      buyerId: json['buyer_id'],
      receiptNumber: json['receipt_number'],
      amount: (json['amount'] as num).toDouble(),
      paymentMode: json['payment_mode'],
      createdAt: DateTime.parse(json['created_at']),
      invoiceId: json['invoice_id'],
      remarks: json['remarks'],
    );
  }

  // To JSON
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'buyer_id': buyerId,
      'receipt_number': receiptNumber,
      'amount': amount,
      'payment_mode': paymentMode,
      'created_at': createdAt.toIso8601String(),
      'invoice_id': invoiceId,
      'remarks': remarks,
    };
  }
}

// Manual Adapter
class ReceiptAdapter extends TypeAdapter<Receipt> {
  @override
  final int typeId = 2;

  @override
  Receipt read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Receipt(
      id: fields[0] as String,
      buyerId: fields[1] as String,
      receiptNumber: fields[2] as String,
      amount: fields[3] as double,
      paymentMode: fields[4] as String,
      createdAt: fields[5] as DateTime,
      invoiceId: fields[6] as String?,
      remarks: fields[7] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, Receipt obj) {
    writer
      ..writeByte(8)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.buyerId)
      ..writeByte(2)
      ..write(obj.receiptNumber)
      ..writeByte(3)
      ..write(obj.amount)
      ..writeByte(4)
      ..write(obj.paymentMode)
      ..writeByte(5)
      ..write(obj.createdAt)
      ..writeByte(6)
      ..write(obj.invoiceId)
      ..writeByte(7)
      ..write(obj.remarks);
  }
}
