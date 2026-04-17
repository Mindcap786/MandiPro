import 'package:hive/hive.dart';

@HiveType(typeId: 1)
class Invoice extends HiveObject {
  @HiveField(0)
  late String id;

  @HiveField(1)
  late String buyerId;

  @HiveField(2)
  late String invoiceNumber;

  @HiveField(3)
  late double totalAmount;

  @HiveField(4)
  late String status; // 'generated', 'paid', 'cancelled'

  @HiveField(5)
  late DateTime createdAt;

  @HiveField(6)
  late String pdfUrl;

  Invoice({
    required this.id,
    required this.buyerId,
    required this.invoiceNumber,
    required this.totalAmount,
    this.status = 'generated',
    required this.createdAt,
    this.pdfUrl = '',
  });

  // Factory to create from Supabase JSON
  factory Invoice.fromJson(Map<String, dynamic> json) {
    return Invoice(
      id: json['id'],
      buyerId: json['buyer_id'],
      invoiceNumber: json['invoice_number'],
      totalAmount: (json['total_amount'] as num).toDouble(),
      status: json['status'] ?? 'generated',
      createdAt: DateTime.parse(json['created_at']),
      pdfUrl: json['pdf_url'] ?? '',
    );
  }

  // To JSON for Supabase
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'buyer_id': buyerId,
      'invoice_number': invoiceNumber,
      'total_amount': totalAmount,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'pdf_url': pdfUrl,
    };
  }
}

// Manual Adapter to avoid build_runner dependency for User
class InvoiceAdapter extends TypeAdapter<Invoice> {
  @override
  final int typeId = 1;

  @override
  Invoice read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Invoice(
      id: fields[0] as String,
      buyerId: fields[1] as String,
      invoiceNumber: fields[2] as String,
      totalAmount: fields[3] as double,
      status: fields[4] as String,
      createdAt: fields[5] as DateTime,
      pdfUrl: fields[6] as String,
    );
  }

  @override
  void write(BinaryWriter writer, Invoice obj) {
    writer
      ..writeByte(7) // Number of fields
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.buyerId)
      ..writeByte(2)
      ..write(obj.invoiceNumber)
      ..writeByte(3)
      ..write(obj.totalAmount)
      ..writeByte(4)
      ..write(obj.status)
      ..writeByte(5)
      ..write(obj.createdAt)
      ..writeByte(6)
      ..write(obj.pdfUrl);
  }
}
