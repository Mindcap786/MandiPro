// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'arrival.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class ArrivalAdapter extends TypeAdapter<Arrival> {
  @override
  final int typeId = 1;

  @override
  Arrival read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Arrival(
      id: fields[0] as String,
      organizationId: fields[1] as String,
      partyId: fields[2] as String?,
      arrivalDate: fields[3] as DateTime,
      vehicleNumber: fields[4] as String?,
      vehicleType: fields[5] as String?,
      driverName: fields[6] as String?,
      driverMobile: fields[7] as String?,
      arrivalType: fields[8] as String,
      guarantor: fields[9] as String?,
      loadersCount: fields[10] as int,
      hireCharges: fields[11] as double,
      hamaliExpenses: fields[12] as double,
      referenceNo: fields[13] as String?,
      isSynced: fields[14] as bool,
      lots: (fields[15] as List).cast<Lot>(),
    );
  }

  @override
  void write(BinaryWriter writer, Arrival obj) {
    writer
      ..writeByte(16)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.organizationId)
      ..writeByte(2)
      ..write(obj.partyId)
      ..writeByte(3)
      ..write(obj.arrivalDate)
      ..writeByte(4)
      ..write(obj.vehicleNumber)
      ..writeByte(5)
      ..write(obj.vehicleType)
      ..writeByte(6)
      ..write(obj.driverName)
      ..writeByte(7)
      ..write(obj.driverMobile)
      ..writeByte(8)
      ..write(obj.arrivalType)
      ..writeByte(9)
      ..write(obj.guarantor)
      ..writeByte(10)
      ..write(obj.loadersCount)
      ..writeByte(11)
      ..write(obj.hireCharges)
      ..writeByte(12)
      ..write(obj.hamaliExpenses)
      ..writeByte(13)
      ..write(obj.referenceNo)
      ..writeByte(14)
      ..write(obj.isSynced)
      ..writeByte(15)
      ..write(obj.lots);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ArrivalAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}

class LotAdapter extends TypeAdapter<Lot> {
  @override
  final int typeId = 2;

  @override
  Lot read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Lot(
      id: fields[0] as String,
      itemId: fields[1] as String,
      qty: fields[2] as double,
      unit: fields[3] as String,
      grade: fields[4] as String,
      unitWeight: fields[5] as double,
      totalWeight: fields[6] as double,
      supplierRate: fields[7] as double,
      commissionPercent: fields[8] as double,
      farmerCharges: fields[9] as double,
    );
  }

  @override
  void write(BinaryWriter writer, Lot obj) {
    writer
      ..writeByte(10)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.itemId)
      ..writeByte(2)
      ..write(obj.qty)
      ..writeByte(3)
      ..write(obj.unit)
      ..writeByte(4)
      ..write(obj.grade)
      ..writeByte(5)
      ..write(obj.unitWeight)
      ..writeByte(6)
      ..write(obj.totalWeight)
      ..writeByte(7)
      ..write(obj.supplierRate)
      ..writeByte(8)
      ..write(obj.commissionPercent)
      ..writeByte(9)
      ..write(obj.farmerCharges);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LotAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
