import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { toWords } from '@/lib/number-to-words';
import { formatCommodityName } from '@/lib/utils/commodity-utils';

// Create styles
const styles = StyleSheet.create({
    page: {
        padding: 15,
        fontFamily: 'Helvetica',
        fontSize: 8.5,
        color: '#333'
    },
    header: {
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 4,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 4,
        textAlign: 'center'
    },
    subtitle: {
        fontSize: 10,
        color: '#666'
    },
    billDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        backgroundColor: '#f9f9f9',
        padding: 5,
    },
    col: {
        flexDirection: 'column',
        gap: 2
    },
    label: {
        fontSize: 8,
        color: '#888',
        textTransform: 'uppercase'
    },
    value: {
        fontSize: 10,
        fontWeight: 'bold'
    },
    table: {
        width: '100%',
        marginBottom: 10
    },
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1.5,
        borderBottomColor: '#000',
        backgroundColor: '#f5f5f5',
        paddingVertical: 6,
        paddingHorizontal: 5,
    },
    tableHeaderText: {
        fontSize: 7.5,
        fontWeight: 'bold',
        color: '#000',
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        padding: 5,
    },
    col1: { width: '5%', textAlign: 'center' },
    col2: { width: '55%' },
    col3: { width: '10%', textAlign: 'right' },
    col4: { width: '12%', textAlign: 'right' },
    col5: { width: '18%', textAlign: 'right' },
    col7: { width: '18%', textAlign: 'right' },

    footer: {
        marginTop: 15,
        borderTopWidth: 2,
        borderTopColor: '#000',
        paddingTop: 8,
        flexDirection: 'row',
        gap: 20
    },
    footerLeft: {
        width: '45%',
        flexDirection: 'column',
        gap: 15
    },
    footerRight: {
        width: '50%',
        marginLeft: 'auto'
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3
    },
    grandTotal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: '#000',
        paddingTop: 4,
        marginTop: 4,
        fontSize: 11,
        fontWeight: 'bold'
    },
    paymentSection: {
        marginTop: 0,
        paddingTop: 0,
        flexDirection: 'column',
        gap: 10
    },
    qrBlock: {
        alignItems: 'center',
        padding: 6,
        backgroundColor: '#f9f9f9',
        alignSelf: 'flex-start'
    },
    qrImage: {
        width: 70,
        height: 70
    },
    bankBlock: {
        flexDirection: 'column',
        gap: 2
    },
    payLabel: {
        fontSize: 7,
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: 3,
        fontWeight: 'bold'
    },
    bankRow: {
        flexDirection: 'row',
        marginBottom: 2
    },
    bankKey: {
        fontSize: 7,
        color: '#666',
        width: 75
    },
    bankVal: {
        fontSize: 7.5,
        fontWeight: 'bold',
        color: '#111',
        flex: 1
    },
    summarySection: {
        marginTop: 15,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 8
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
        paddingLeft: 5,
        borderLeftWidth: 1,
        borderLeftColor: '#eee'
    }
});

interface PaymentSettings {
    upi_id?: string;
    upi_name?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    account_holder?: string;
    print_upi_qr?: boolean;
    print_bank_details?: boolean;
    qr_data_url?: string; // pre-generated data URL
}

import { PDFWatermark } from '@/components/common/document-branding';

interface InvoiceProps {
    organization: {
        name: string,
        city: string,
        gstin?: string,
        phone?: string,
        email?: string,
        address?: string,
        address_line1?: string,
        address_line2?: string,
        state?: string,
        pincode?: string,
        logo_url?: string
    };
    buyer: { name: string, city: string, gstin?: string, state_code?: string };
    billNo: string;
    date: Date;
    items: any[];
    payment_summary?: { balance_due: number; amount_received?: number; amount_paid?: number };
    marketFee?: number;
    nirashrit?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    isIgst?: boolean;
    placeOfSupply?: string;
    paymentSettings?: PaymentSettings;
    paymentMode?: string;
    branding?: any;
    amount_received?: number;
};

// Helper to format currency without the rupee symbol (Helvetica can't render it)
const fmtCurrency = (n: number) => `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInt = (n: number) => `Rs.${n.toLocaleString()}`;

export const InvoiceTemplate = ({
    organization,
    buyer,
    billNo,
    date,
    items = [],
    marketFee = 0,
    nirashrit = 0,
    loadingCharges = 0,
    unloadingCharges = 0,
    otherExpenses = 0,
    miscFee = 0,
    cgst = 0,
    sgst = 0,
    igst = 0,
    isIgst = false,
    placeOfSupply = '',
    paymentSettings,
    paymentMode = 'CREDIT',
    payment_summary,
    branding
}: InvoiceProps & {
    payment_summary?: { balance_due: number };
    marketFee?: number;
    nirashrit?: number;
    loadingCharges?: number;
    unloadingCharges?: number;
    otherExpenses?: number;
    miscFee?: number;
}) => {
    const isCash = paymentMode?.toLowerCase() === 'cash';
    const showQr = !isCash && paymentSettings?.print_upi_qr && paymentSettings?.qr_data_url;
    const showBank = !isCash && paymentSettings?.print_bank_details && paymentSettings?.account_number;
    const safeItems = Array.isArray(items) ? items : [];
    const subTotal = safeItems.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.rate || 0)), 0);

    const totalGst = Number(cgst || 0) + Number(sgst || 0) + Number(igst || 0);
    const amountReceived = Number(payment_summary?.amount_received ?? payment_summary?.amount_paid ?? 0);

    // Calculate total with all fees
    const finalTotal = subTotal + totalGst +
        Number(marketFee || 0) +
        Number(nirashrit || 0) +
        Number(miscFee || 0) +
        Number(loadingCharges || 0) +
        Number(unloadingCharges || 0) +
        Number(otherExpenses || 0);

    const balanceDue = Math.max(0, finalTotal - amountReceived);

    const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0);
    const avgRate = totalQty > 0 ? (finalTotal / totalQty) : 0;

    const formatSafeDate = (d: any) => {
        try {
            if (!d) return "N/A";
            const dateObj = new Date(d);
            if (isNaN(dateObj.getTime())) return "N/A";
            return format(dateObj, 'dd MMM yyyy');
        } catch (e) {
            return "N/A";
        }
    };

    const fullAddress = [
        organization.address_line1,
        organization.address_line2,
        organization.city,
        organization.state,
        organization.pincode
    ].filter(Boolean).join(", ");

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Global Watermark */}
                <PDFWatermark
                    text={branding?.watermark_text}
                    enabled={branding?.is_watermark_enabled}
                />

                {/* Header */}
                <View style={[styles.header, { marginBottom: 15, borderBottomWidth: 2, borderBottomColor: '#000', paddingBottom: 8, flexDirection: 'row', position: 'relative' }]}>
                    {/* Left: Identity */}
                    <View style={{ width: '33%', flexDirection: 'row', gap: 8 }}>
                        {organization.logo_url && organization.logo_url.startsWith('http') ? (
                            <Image src={organization.logo_url} style={{ width: 45, height: 45, borderRadius: 8 }} />
                        ) : (
                            <View style={{ width: 45, height: 45, borderRadius: 8, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
                                    {(organization.name || 'M').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>{organization.name || "ORGANIZATION"}</Text>
                            <Text style={[styles.subtitle, { fontSize: 7, color: '#999', marginTop: 2 }]}>{fullAddress || organization.city}</Text>
                        </View>
                    </View>

                    {/* Center: Title */}
                    <View style={{ width: '34%' }}>
                        <Text style={styles.title}>INVOICE</Text>
                        <View style={{ height: 1.5, width: 25, backgroundColor: '#000', alignSelf: 'center', marginTop: 2 }} />
                    </View>

                    {/* Right: Contact Details */}
                    <View style={{ width: '33%', alignItems: 'flex-end', gap: 1 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Contact Details</Text>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#000' }}>Ph: {organization.phone || 'N/A'}</Text>
                        {organization.gstin && <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#000' }}>GST: {organization.gstin}</Text>}
                        {organization.email && <Text style={{ fontSize: 7, color: '#666' }}>{organization.email}</Text>}
                    </View>
                </View>

                {/* Details Consolidated Row */}
                <View style={[styles.billDetails, { paddingBottom: 5, backgroundColor: 'transparent', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }]}>
                    {/* Left: Billed To */}
                    <View style={styles.col}>
                        <Text style={styles.label}>Billed To</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                            <Text style={[styles.value, { fontSize: 13 }]}>{buyer.name}</Text>
                            <Text style={[styles.subtitle, { textTransform: 'uppercase', fontSize: 8 }]}>{buyer.city}</Text>
                        </View>
                        {buyer.gstin && <Text style={[styles.subtitle, { marginTop: 2, fontSize: 8 }]}>GSTIN: {buyer.gstin}</Text>}
                    </View>

                    {/* Right: Invoice Info */}
                    <View style={[styles.col, { alignItems: 'flex-end', justifyContent: 'flex-end' }]}>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                            <Text style={styles.label}>Invoice #:</Text>
                            <Text style={styles.value}>{billNo}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                            <Text style={styles.label}>Date:</Text>
                            <Text style={styles.value}>{formatSafeDate(date)}</Text>
                        </View>
                        <View style={[styles.summaryRow, { borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 4, marginBottom: 4 }]}>
                            <Text style={styles.label}>Tax (GST)</Text>
                            <Text style={styles.value}>{fmtInt(totalGst)}</Text>
                        </View>

                        <View style={styles.summaryRow}>
                            <Text style={styles.label}>Total Qty</Text>
                            <Text style={styles.value}>{totalQty} Units</Text>
                        </View>

                        <View style={[styles.summaryRow, { marginTop: 8 }]}>
                            <Text style={styles.label}>Payment:</Text>
                            <Text style={styles.value}>{paymentMode?.toUpperCase() || 'CREDIT'}</Text>
                        </View>
                    </View>
                </View>

                {/* Table */}
                <View style={styles.table}>
                    {/* Table Header */}
                    <View style={styles.tableHeader}>
                        <Text style={[styles.col1, styles.tableHeaderText]}>#</Text>
                        <Text style={[styles.col2, styles.tableHeaderText]}>Item / Lot Number</Text>
                        <Text style={[styles.col3, styles.tableHeaderText]}>Qty</Text>
                        <Text style={[styles.col4, styles.tableHeaderText]}>Rate</Text>
                        <Text style={[styles.col5, styles.tableHeaderText]}>Amount</Text>
                    </View>

                    {/* Table Body */}
                    {safeItems.map((item: any, index: number) => (
                        <View key={item.id || index} style={styles.tableRow}>
                            <Text style={[styles.col1, { fontSize: 6.5 }]}>{index + 1}</Text>
                            <View style={styles.col2}>
                                <Text style={{ fontWeight: 'bold', fontSize: 7.5, textTransform: 'uppercase' }}>
                                    {formatCommodityName(item.lot?.item?.name || item.item_name || 'Item', item.lot?.item?.custom_attributes || item.custom_attributes)}
                                </Text>
                                <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: '#f97316', marginTop: 1 }}>
                                    {item.lot?.lot_code || 'N/A'}
                                </Text>
                            </View>
                            <View style={[styles.col3, { flexDirection: 'row', justifyContent: 'flex-end', gap: 2 }]}>
                                <Text style={{ fontSize: 7.5, fontWeight: 'bold' }}>{item.qty || 0}</Text>
                                <Text style={{ fontSize: 5, color: '#888', marginTop: 2 }}>{item.unit || 'Unit'}</Text>
                            </View>
                            <Text style={[styles.col4, { fontSize: 7.5, fontWeight: 'bold' }]}>
                                {fmtInt(Number(item.rate || 0))}
                            </Text>
                            <Text style={[styles.col5, { fontSize: 8, fontWeight: 'bold' }]}>
                                {fmtInt(Math.round(Number(item.amount || 0)))}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Totals & Payment Section */}
                <View style={styles.footer}>
                    {/* Left Side: Payment */}
                    <View style={styles.footerLeft}>
                        {(showQr || showBank) && (
                            <View style={styles.paymentSection}>
                                {showQr && (
                                    <View style={styles.qrBlock}>
                                        <Text style={styles.payLabel}>Scan to Pay</Text>
                                        <Image style={styles.qrImage} src={paymentSettings!.qr_data_url!} />
                                        {paymentSettings?.upi_id && (
                                            <Text style={{ fontSize: 6, color: '#666', marginTop: 2 }}>{paymentSettings.upi_id}</Text>
                                        )}
                                    </View>
                                )}
                                {showBank && (
                                    <View style={styles.bankBlock}>
                                        <Text style={styles.payLabel}>Bank Transfer Details</Text>
                                        {paymentSettings?.account_holder && (
                                            <View style={styles.bankRow}>
                                                <Text style={styles.bankKey}>Holder</Text>
                                                <Text style={styles.bankVal}>{paymentSettings.account_holder}</Text>
                                            </View>
                                        )}
                                        <View style={styles.bankRow}>
                                            <Text style={styles.bankKey}>A/C No</Text>
                                            <Text style={styles.bankVal}>{paymentSettings?.account_number}</Text>
                                        </View>
                                        <View style={styles.bankRow}>
                                            <Text style={styles.bankKey}>IFSC</Text>
                                            <Text style={styles.bankVal}>{paymentSettings?.ifsc_code}</Text>
                                        </View>
                                        {paymentSettings?.bank_name && (
                                            <View style={styles.bankRow}>
                                                <Text style={styles.bankKey}>Bank</Text>
                                                <Text style={styles.bankVal}>{paymentSettings.bank_name}</Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        )}

                        <View style={{ marginTop: 'auto' }}>
                            <Text style={styles.label}>Terms & Conditions:</Text>
                            <Text style={[styles.subtitle, { marginTop: 3 }]}>1. Goods once sold will not be taken back.</Text>
                            <Text style={styles.subtitle}>2. Interest @ 24% p.a. will be charged after due date.</Text>
                        </View>
                    </View>

                    {/* Right Side: Totals and Summary */}
                    <View style={styles.footerRight}>
                        <View style={styles.totalRow}>
                            <Text>Sub Total</Text>
                            <Text>{subTotal.toFixed(2)}</Text>
                        </View>
                        {Number(marketFee) > 0 && (
                            <View style={styles.totalRow}>
                                <Text>Market Fee</Text>
                                <Text>{Number(marketFee).toFixed(2)}</Text>
                            </View>
                        )}
                        {Number(nirashrit) > 0 && (
                            <View style={styles.totalRow}>
                                <Text>Nirashrit</Text>
                                <Text>{Number(nirashrit).toFixed(2)}</Text>
                            </View>
                        )}
                        <View style={styles.grandTotal}>
                            <Text>TOTAL (Incl. GST)</Text>
                            <Text>{fmtCurrency(finalTotal + totalGst)}</Text>
                        </View>

                        <View style={[styles.totalRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#f0f0f0' }]}>
                            <Text style={{ fontSize: 8, color: '#666' }}>Amount Received</Text>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#059669' }}>{fmtCurrency(amountReceived)}</Text>
                        </View>

                        <View style={[styles.totalRow, { backgroundColor: '#fef2f2', padding: 4 }]}>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#991b1b' }}>Pending Balance</Text>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#b91c1c' }}>{fmtCurrency(balanceDue)}</Text>
                        </View>

                        <Text style={[styles.subtitle, { textAlign: 'right', marginTop: 2, fontStyle: 'italic' }]}>
                            Rupees {toWords(finalTotal + totalGst)} Only
                        </Text>
                        <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
                            <View style={{ backgroundColor: '#f9f9f9', paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#eee' }}>
                                <Text style={{ fontSize: 7, fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Average Price / Qty</Text>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', marginTop: 2 }}>{fmtCurrency(avgRate)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={{ position: 'absolute', bottom: 15, left: 15, right: 15, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'column', gap: 1 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', color: '#333' }}>{branding?.document_footer_presented_by_text || 'Presented by MandiGrow'}</Text>
                        <Text style={{ fontSize: 6, color: '#999' }}>{branding?.document_footer_powered_by_text || 'Powered by MindT Corporation'}</Text>
                        <Text style={{ fontSize: 5, fontStyle: 'italic', color: '#aaa' }}>{branding?.document_footer_developed_by_text || 'Developed by MindT Solutions'}</Text>
                    </View>
                    <Text style={{ fontSize: 8, color: '#333', fontWeight: 'bold' }}>Auth Signature & Stamp</Text>
                </View>
            </Page>
        </Document>
    );
};
