import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Helvetica', fontSize: 10, color: '#111' },
    border: { border: '2pt solid #000', padding: 12, marginBottom: 10 },
    title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 },
    subtitle: { fontSize: 8, textAlign: 'center', color: '#555', marginBottom: 2 },
    divider: { borderBottomWidth: 1, borderBottomColor: '#000', marginVertical: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    label: { fontSize: 8, color: '#555', textTransform: 'uppercase' },
    value: { fontSize: 10, fontWeight: 'bold' },
    bigValue: { fontSize: 16, fontWeight: 'bold', textAlign: 'right' },
    table: { marginTop: 8, borderWidth: 1, borderColor: '#000' },
    tableHead: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderBottomColor: '#000', padding: 5 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', padding: 5 },
    col1: { width: '35%', fontSize: 9 },
    col2: { width: '15%', textAlign: 'center', fontSize: 9 },
    col3: { width: '15%', textAlign: 'center', fontSize: 9 },
    col4: { width: '20%', textAlign: 'right', fontSize: 9 },
    col5: { width: '15%', textAlign: 'right', fontSize: 9 },
    footer: { marginTop: 20, borderTopWidth: 2, borderTopColor: '#000', paddingTop: 10 },
    sign: { width: '40%', borderTopWidth: 1, borderTopColor: '#000', paddingTop: 5, textAlign: 'center', fontSize: 8, marginTop: 30 },
    watermark: { position: 'absolute', top: '40%', left: '20%', fontSize: 60, color: '#f0f0f0', fontWeight: 'bold', transform: 'rotate(-30deg)', opacity: 0.3 },
});

interface WeightSlipProps {
    organization: { name: string; address?: string; gstin?: string; phone?: string };
    farmer: { name: string; village?: string; phone?: string };
    slipNo: string | number;
    date: Date;
    items: Array<{
        item_name: string;
        variety?: string;
        grade?: string;
        boxes: number;
        weight_per_box: number;
        total_weight: number;
        tare_weight?: number;
        net_weight: number;
        rate: number;
        amount: number;
    }>;
    vehicleNo?: string;
    driverName?: string;
    totalGrossWeight: number;
    totalNetWeight: number;
    totalAmount: number;
    advanceDeducted?: number;
    commissionDeducted?: number;
    netPayable: number;
    remarks?: string;
}

const formatDate = (d: Date) => {
    try { return format(d, 'dd/MM/yyyy HH:mm'); } catch { return ''; }
};

import { PDFWatermark } from '@/components/common/document-branding';

export const WeightSlipTemplate = ({ 
    organization, 
    farmer, 
    slipNo, 
    date, 
    items, 
    vehicleNo, 
    driverName, 
    totalGrossWeight, 
    totalNetWeight, 
    totalAmount, 
    advanceDeducted = 0, 
    commissionDeducted = 0, 
    netPayable, 
    remarks,
    branding
}: WeightSlipProps & { branding?: any }) => (
    <Document>
        <Page size="A5" orientation="landscape" style={styles.page}>
            {/* Global Watermark */}
            <PDFWatermark 
                text={branding?.watermark_text || "KATCHI PARCHI"} 
                enabled={branding?.is_watermark_enabled !== false} 
            />

            <View style={styles.border}>
                {/* Header */}
                <Text style={styles.title}>{branding?.document_header_text || organization.name}</Text>
                {organization.address && <Text style={styles.subtitle}>{organization.address}</Text>}
                {organization.phone && <Text style={styles.subtitle}>📞 {organization.phone}</Text>}
                {organization.gstin && <Text style={styles.subtitle}>GSTIN: {organization.gstin}</Text>}
                <View style={styles.divider} />

                {/* Title Bar */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', textDecoration: 'underline' }}>WEIGHT SLIP / कच्ची पर्ची</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold' }}>Slip No: {slipNo}</Text>
                        <Text style={{ fontSize: 9, color: '#555' }}>{formatDate(date)}</Text>
                    </View>
                </View>

                {/* Farmer + Vehicle Info */}
                <View style={{ flexDirection: 'row', gap: 20, marginBottom: 10 }}>
                    <View style={{ flex: 1 }}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Farmer / किसान:</Text>
                            <Text style={[styles.value, { fontSize: 12, color: '#111' }]}>{farmer.name}</Text>
                        </View>
                        {farmer.village && <View style={styles.row}><Text style={styles.label}>Village:</Text><Text style={styles.value}>{farmer.village}</Text></View>}
                    </View>
                    <View style={{ flex: 1 }}>
                        {vehicleNo && <View style={styles.row}><Text style={styles.label}>Vehicle No:</Text><Text style={styles.value}>{vehicleNo}</Text></View>}
                        {driverName && <View style={styles.row}><Text style={styles.label}>Driver:</Text><Text style={styles.value}>{driverName}</Text></View>}
                    </View>
                </View>

                {/* Items Table */}
                <View style={styles.table}>
                    <View style={styles.tableHead}>
                        <Text style={[styles.col1, { fontWeight: 'bold', fontSize: 8 }]}>Item / Grade</Text>
                        <Text style={[styles.col2, { fontWeight: 'bold', fontSize: 8 }]}>Boxes</Text>
                        <Text style={[styles.col3, { fontWeight: 'bold', fontSize: 8 }]}>Wt/Box (kg)</Text>
                        <Text style={[styles.col3, { fontWeight: 'bold', fontSize: 8 }]}>Gross (kg)</Text>
                        <Text style={[styles.col3, { fontWeight: 'bold', fontSize: 8 }]}>Net (kg)</Text>
                        <Text style={[styles.col4, { fontWeight: 'bold', fontSize: 8 }]}>Rate ₹/kg</Text>
                        <Text style={[styles.col5, { fontWeight: 'bold', fontSize: 8 }]}>Amount ₹</Text>
                    </View>
                    {items.map((item, i) => (
                        <View key={i} style={styles.tableRow}>
                            <Text style={styles.col1}>{item.item_name} {item.grade ? `(${item.grade})` : ''} {item.variety ? `· ${item.variety}` : ''}</Text>
                            <Text style={styles.col2}>{item.boxes}</Text>
                            <Text style={styles.col3}>{item.weight_per_box}</Text>
                            <Text style={styles.col3}>{item.total_weight.toFixed(1)}</Text>
                            <Text style={styles.col3}>{item.net_weight.toFixed(1)}</Text>
                            <Text style={styles.col4}>{item.rate.toFixed(2)}</Text>
                            <Text style={styles.col5}>{item.amount.toFixed(2)}</Text>
                        </View>
                    ))}
                </View>

                {/* Totals */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    <View style={{ width: '50%' }}>
                        {remarks && <Text style={{ fontSize: 8, color: '#555', marginTop: 4 }}>Remarks: {remarks}</Text>}
                        <Text style={{ fontSize: 7, color: '#999', marginTop: 8 }}>* This is a preliminary Katchi Parchi. Final settlement may vary.</Text>
                        <View style={{ marginTop: 10 }}>
                            <Text style={{ fontSize: 6, fontWeight: 'bold', color: '#666' }}>{branding?.document_footer_presented_by_text || 'Presented by MandiGrow'}</Text>
                            <Text style={{ fontSize: 5, color: '#999' }}>{branding?.document_footer_powered_by_text || 'Powered by MindT Corporation'}</Text>
                        </View>
                    </View>
                    <View style={{ width: '45%' }}>
                        <View style={styles.row}>
                            <Text style={styles.label}>Gross Weight:</Text>
                            <Text style={styles.value}>{totalGrossWeight.toFixed(1)} kg</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Net Weight:</Text>
                            <Text style={styles.value}>{totalNetWeight.toFixed(1)} kg</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>Gross Amount:</Text>
                            <Text style={styles.value}>₹{totalAmount.toFixed(2)}</Text>
                        </View>
                        {advanceDeducted > 0 && (
                            <View style={styles.row}>
                                <Text style={styles.label}>Less: Advance:</Text>
                                <Text style={[styles.value, { color: '#c00' }]}>-₹{advanceDeducted.toFixed(2)}</Text>
                            </View>
                        )}
                        {commissionDeducted > 0 && (
                            <View style={styles.row}>
                                <Text style={styles.label}>Less: Commission:</Text>
                                <Text style={[styles.value, { color: '#c00' }]}>-₹{commissionDeducted.toFixed(2)}</Text>
                            </View>
                        )}
                        <View style={[styles.row, { borderTopWidth: 1, borderTopColor: '#000', paddingTop: 4, marginTop: 4 }]}>
                            <Text style={{ fontSize: 11, fontWeight: 'bold' }}>NET PAYABLE:</Text>
                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#006600' }}>₹{netPayable.toFixed(2)}</Text>
                        </View>
                    </View>
                </View>

                {/* Signatures */}
                <View style={[styles.footer, { flexDirection: 'row', justifyContent: 'space-between' }]}>
                    <View style={styles.sign}><Text>Farmer Signature / किसान</Text></View>
                    <View style={styles.sign}><Text>Munim / मुनीम</Text></View>
                    <View style={styles.sign}><Text>Manager / प्रबंधक</Text></View>
                </View>
            </View>
        </Page>
    </Document>
);
