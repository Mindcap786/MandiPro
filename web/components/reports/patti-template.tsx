"use client";

import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';

// Register fonts for Indian currency symbol support if needed, 
// using generic sans-serif for now for max compatibility
Font.register({
    family: 'Helvetica-Bold',
    src: 'https://fonts.gstatic.com/s/helveticaneue/v70/1Ptsg8zYS_SKggPNyC0IT4ttDfA.ttf'
});

const styles = StyleSheet.create({
    page: { flexDirection: 'column', backgroundColor: '#FFFFFF', padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
    header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 10 },
    title: { fontSize: 24, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 5 },
    subtitle: { fontSize: 10, color: '#666', marginBottom: 2 },

    metaGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    metaColumn: { flexDirection: 'column', width: '48%' },
    metaLabel: { color: '#888', marginBottom: 2, fontSize: 8, textTransform: 'uppercase' },
    metaValue: { fontSize: 12, fontWeight: 'bold' },

    table: { display: 'flex', width: 'auto', borderStyle: 'solid', borderWidth: 1, borderColor: '#EEE', borderRadius: 4, marginBottom: 20 },
    tableRow: { margin: 'auto', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EEE', minHeight: 30, alignItems: 'center' },
    tableHeader: { backgroundColor: '#F9FAFB' },
    tableCol: { width: '20%', borderRightWidth: 1, borderRightColor: '#EEE', padding: 5 },
    tableColLast: { width: '20%', padding: 5 }, // No right border
    tableCellHeader: { fontSize: 9, fontWeight: 'bold', color: '#444', textTransform: 'uppercase' },
    tableCell: { fontSize: 10 },

    // Footer / Totals
    totalsSection: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
    totalsBox: { width: '40%', borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 10 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    totalLabel: { color: '#666', fontSize: 10 },
    totalValue: { fontWeight: 'bold', fontSize: 10 },
    grandTotal: { borderTopWidth: 2, borderTopColor: '#000', paddingTop: 5, marginTop: 5 },
    grandTotalText: { fontSize: 14, fontWeight: 'bold' },

    footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', color: '#BBB', fontSize: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 }
});

import { PDFWatermark } from '@/components/common/document-branding';

export const PattiTemplate = ({ data, branding }: { data: any, branding?: any }) => {
    const fullAddress = [
        data.organization?.address_line1,
        data.organization?.address_line2,
        data.organization?.city,
        data.organization?.state,
        data.organization?.pincode
    ].filter(Boolean).join(", ");

    return (
        <Document>
            <Page size="A5" style={styles.page}> {/* A5 is typical for Pattis */}
                {/* Global Watermark */}
                <PDFWatermark 
                    text={branding?.watermark_text} 
                    enabled={branding?.is_watermark_enabled} 
                />

                {/* Header */}
                <View style={[styles.header, { flexDirection: 'row', gap: 10, alignItems: 'center' }]}>
                    {data.organization?.logo_url && (
                        <Image src={data.organization.logo_url} style={{ width: 40, height: 40, objectFit: 'contain' }} />
                    )}
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>{branding?.document_header_text || 'SUPPLIER PATTI'}</Text>
                        <Text style={styles.subtitle}>{data.organization?.name || 'MANDI MERCHANT'}</Text>
                        <Text style={styles.subtitle}>{fullAddress || data.organization?.address || 'Market Yard, City'}</Text>
                        {data.organization?.gstin && <Text style={[styles.subtitle, { fontSize: 8, marginTop: 1 }]}>GSTIN: {data.organization.gstin}</Text>}
                    </View>
                </View>

            {/* Meta Info */}
            <View style={styles.metaGrid}>
                <View style={styles.metaColumn}>
                    <Text style={styles.metaLabel}>FARMER / SUPPLIER</Text>
                    <Text style={styles.metaValue}>{data.supplier?.name}</Text>
                    <Text style={{ fontSize: 9, color: '#666' }}>{data.supplier?.city}</Text>
                </View>
                <View style={styles.metaColumn}>
                    <Text style={styles.metaLabel}>PATTI NO</Text>
                    <Text style={styles.metaValue}>#{data.bill_no}</Text>
                    <Text style={styles.metaLabel}>DATE</Text>
                    <Text style={styles.metaValue}>{format(new Date(data.date), 'dd MMM yyyy')}</Text>
                </View>
            </View>

            {/* Item Table */}
            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                    <View style={{ width: '40%', padding: 5 }}><Text style={styles.tableCellHeader}>Item / Lot</Text></View>
                    <View style={styles.tableCol}><Text style={[styles.tableCellHeader, { textAlign: 'right' }]}>Qty</Text></View>
                    <View style={styles.tableCol}><Text style={[styles.tableCellHeader, { textAlign: 'right' }]}>Rate</Text></View>
                    <View style={[styles.tableColLast, { width: '20%' }]}><Text style={[styles.tableCellHeader, { textAlign: 'right' }]}>Amount</Text></View>
                </View>

                {data.items?.map((item: any, i: number) => (
                    <View key={i} style={styles.tableRow}>
                        <View style={{ width: '40%', padding: 5 }}>
                            <Text style={styles.tableCell}>{item.lot_code}</Text>
                            <Text style={{ fontSize: 8, color: '#888' }}>{item.item_name}</Text>
                        </View>
                        <View style={styles.tableCol}><Text style={[styles.tableCell, { textAlign: 'right' }]}>{item.qty} {item.unit}</Text></View>
                        <View style={styles.tableCol}><Text style={[styles.tableCell, { textAlign: 'right' }]}>{item.rate}</Text></View>
                        <View style={[styles.tableColLast, { width: '20%' }]}><Text style={[styles.tableCell, { textAlign: 'right' }]}>{item.amount}</Text></View>
                    </View>
                ))}
            </View>

            {/* Totals & Deductions */}
            <View style={styles.totalsSection}>
                <View style={styles.totalsBox}>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Gross Amount:</Text>
                        <Text style={styles.totalValue}>{data.total_amount}</Text>
                    </View>

                    {/* Deductions */}
                    <View style={[styles.totalRow, { marginTop: 5 }]}>
                        <Text style={[styles.totalLabel, { color: '#E11D48' }]}>Less: Commission ({data.commission_pct}%)</Text>
                        <Text style={[styles.totalValue, { color: '#E11D48' }]}>- {data.commission_amount}</Text>
                    </View>
                    {data.hamali > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, { color: '#E11D48' }]}>Less: Hamali/Labor</Text>
                            <Text style={[styles.totalValue, { color: '#E11D48' }]}>- {data.hamali}</Text>
                        </View>
                    )}

                    {/* Net Payable */}
                    <View style={[styles.totalRow, styles.grandTotal]}>
                        <Text style={styles.grandTotalText}>NET PAYABLE:</Text>
                        <Text style={styles.grandTotalText}>{data.net_payable}</Text>
                    </View>
                </View>
            </View>

            {/* Footer */}
            <View style={{ position: 'absolute', bottom: 30, left: 30, right: 30, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'column', gap: 1 }}>
                    <Text style={{ fontSize: 7, fontWeight: 'bold', color: '#666' }}>{branding?.document_footer_presented_by_text || 'Presented by MandiGrow'}</Text>
                    <Text style={{ fontSize: 6, color: '#999' }}>{branding?.document_footer_powered_by_text || 'Powered by MindT Corporation'}</Text>
                    <Text style={{ fontSize: 5, fontStyle: 'italic', color: '#AAA' }}>{branding?.document_footer_developed_by_text || 'Developed by MindT Solutions'}</Text>
                </View>
                <Text style={{ fontSize: 7, color: '#BBB' }}>Auth Signature & Stamp</Text>
            </View>
        </Page>
    </Document>
);
};
