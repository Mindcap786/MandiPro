"use client";

import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { format } from "date-fns";
import { toWords } from "@/lib/number-to-words";
import { PDFWatermark } from "@/components/common/document-branding";

const INR = (n: number) =>
    "Rs." + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const s = StyleSheet.create({
    page:     { padding: 40, backgroundColor: "#fff", fontFamily: "Helvetica", fontSize: 9 },

    /* Header */
    hdrRow:   { flexDirection: "row", justifyContent: "space-between", borderBottom: 2, borderBottomColor: "#111", paddingBottom: 14, marginBottom: 20 },
    orgName:  { fontSize: 22, fontWeight: "bold", color: "#000", letterSpacing: -0.5 },
    orgSub:   { fontSize: 8, color: "#666", marginTop: 3 },
    badgeBox: { alignItems: "flex-end" },
    badge:    { backgroundColor: "#000", color: "#fff", fontSize: 9, fontWeight: "bold", paddingVertical: 3, paddingHorizontal: 8, marginBottom: 4, letterSpacing: 1 },
    dateRng:  { fontSize: 8, color: "#888" },

    /* Party */
    partyBox: { marginBottom: 18, padding: 10, borderWidth: 1, borderColor: "#ddd", borderRadius: 6, backgroundColor: "#f9f9f9" },
    partyLbl: { fontSize: 7.5, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
    partyNm:  { fontSize: 16, fontWeight: "bold", color: "#111" },

    /* Table */
    tbl:      { width: "100%", marginTop: 6 },
    tblHdr:   { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#111", paddingVertical: 7, paddingHorizontal: 4 },
    tblRow:   { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#eee", paddingVertical: 7, paddingHorizontal: 4 },
    tblOB:    { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#eee", paddingVertical: 7, paddingHorizontal: 4, backgroundColor: "#fffbe6" },
    tblFoot:  { flexDirection: "row", borderTopWidth: 2, borderTopColor: "#111", paddingVertical: 10, paddingHorizontal: 4, backgroundColor: "#f9f9f9" },
    tblWords: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: "#eee", paddingVertical: 6, paddingHorizontal: 4 },

    cDate:    { width: "12%" },
    cDesc:    { width: "40%" },
    cDr:      { width: "16%", textAlign: "right" },
    cCr:      { width: "16%", textAlign: "right" },
    cBal:     { width: "16%", textAlign: "right" },

    hdrTxt:   { fontSize: 7.5, fontWeight: "bold", color: "#555", textTransform: "uppercase", letterSpacing: 0.8 },
    cell:     { fontSize: 8.5, color: "#444" },
    cellBold: { fontSize: 8.5, fontWeight: "bold", color: "#111" },
    drAmt:    { fontSize: 8.5, fontWeight: "bold", color: "#b91c1c" },
    crAmt:    { fontSize: 8.5, fontWeight: "bold", color: "#065f46" },
    dim:      { fontSize: 8.5, color: "#bbb" },

    /* Summary */
    sumLbl:   { fontSize: 9, color: "#666", textAlign: "right" },
    sumVal:   { fontSize: 15, fontWeight: "bold", color: "#111", textAlign: "right" },
    sumWords: { fontSize: 8, color: "#666", fontStyle: "italic", textAlign: "right", marginTop: 3 },

    /* Footer */
    footer:   { position: "absolute", bottom: 30, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 10 },
    footerTxt:{ fontSize: 7, color: "#aaa" },
    sigLine:  { width: 140, borderBottomWidth: 0.5, borderBottomColor: "#bbb", marginBottom: 4 },
    sigLbl:   { fontSize: 7.5, fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" },
});

interface LedgerPDFReportProps {
    organization: any;
    contactName: string;
    entries: {
        entry_date: string;
        description: string;
        debit: number;
        credit: number;
        running_balance: number;
        line_items?: string;
        products?: any[];
        charges?: any[];
    }[];
    summary: { totalDebit: number; totalCredit: number; finalBalance: number };
    openingBalance: number;
    startDate: Date;
    endDate: Date;
    branding?: any;
}

export const LedgerPDFReport = ({
    organization, contactName, entries, summary,
    openingBalance, startDate, endDate, branding
}: LedgerPDFReportProps) => {

    const fullAddress = [
        organization?.address_line1, organization?.address_line2,
        organization?.city, organization?.state, organization?.pincode
    ].filter(Boolean).join(", ");

    const fmtDate = (d: any) => {
        try { const dt = new Date(d); return isNaN(dt.getTime()) ? "-" : format(dt, "dd MMM yy"); }
        catch { return "-"; }
    };

    const closingBal = summary.finalBalance;
    const isPositive = (n: number) => n >= 0;

    return (
        <Document>
            <Page size="A4" style={s.page}>
                <PDFWatermark text={branding?.watermark_text} enabled={branding?.is_watermark_enabled} />

                {/* ── Header ── */}
                <View style={s.hdrRow}>
                    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                        {organization?.logo_url && organization.logo_url.startsWith("http") && (
                            <Image src={organization.logo_url} style={{ width: 44, height: 44, objectFit: "contain" }} />
                        )}
                        <View>
                            <Text style={s.orgName}>{organization?.name || "MandiGrow"}</Text>
                            {fullAddress ? <Text style={s.orgSub}>{fullAddress}</Text> : null}
                            {organization?.gstin ? <Text style={[s.orgSub, { marginTop: 2 }]}>GSTIN: {organization.gstin}</Text> : null}
                        </View>
                    </View>
                    <View style={s.badgeBox}>
                        <Text style={s.badge}>STATEMENT OF ACCOUNT</Text>
                        <Text style={s.dateRng}>
                            {format(startDate, "dd MMM yyyy")} – {format(endDate, "dd MMM yyyy")}
                        </Text>
                    </View>
                </View>

                {/* ── Party ── */}
                <View style={s.partyBox}>
                    <Text style={s.partyLbl}>Account Of</Text>
                    <Text style={s.partyNm}>{contactName}</Text>
                </View>

                {/* ── Table ── */}
                <View style={s.tbl}>
                    {/* Header row */}
                    <View style={s.tblHdr}>
                        <View style={s.cDate}><Text style={s.hdrTxt}>Date</Text></View>
                        <View style={s.cDesc}><Text style={s.hdrTxt}>Particulars</Text></View>
                        <View style={s.cDr}><Text style={s.hdrTxt}>Debit (Out)</Text></View>
                        <View style={s.cCr}><Text style={s.hdrTxt}>Credit (In)</Text></View>
                        <View style={s.cBal}><Text style={s.hdrTxt}>Balance</Text></View>
                    </View>

                    {/* Opening balance row */}
                    <View style={s.tblOB}>
                        <View style={s.cDate}><Text style={s.cell}>{format(startDate, "dd MMM yy")}</Text></View>
                        <View style={s.cDesc}><Text style={s.cellBold}>Opening Balance</Text></View>
                        <View style={s.cDr}>
                            <Text style={openingBalance > 0 ? s.drAmt : s.dim}>
                                {openingBalance > 0 ? INR(openingBalance) : "-"}
                            </Text>
                        </View>
                        <View style={s.cCr}>
                            <Text style={openingBalance < 0 ? s.crAmt : s.dim}>
                                {openingBalance < 0 ? INR(openingBalance) : "-"}
                            </Text>
                        </View>
                        <View style={s.cBal}>
                            <Text style={[s.cellBold, { color: isPositive(openingBalance) ? "#b91c1c" : "#065f46" }]}>
                                {INR(openingBalance)} {isPositive(openingBalance) ? "DR" : "CR"}
                            </Text>
                        </View>
                    </View>

                    {/* Transaction rows */}
                    {entries.map((e, i) => (
                        <View key={i} style={s.tblRow} wrap={false}>
                            <View style={s.cDate}><Text style={s.cell}>{fmtDate(e.entry_date)}</Text></View>
                            <View style={s.cDesc}>
                                <Text style={s.cellBold}>{e.description || "-"}</Text>
                            </View>
                            <View style={s.cDr}>
                                <Text style={e.debit > 0 ? s.drAmt : s.dim}>{e.debit > 0 ? INR(e.debit) : "-"}</Text>
                            </View>
                            <View style={s.cCr}>
                                <Text style={e.credit > 0 ? s.crAmt : s.dim}>{e.credit > 0 ? INR(e.credit) : "-"}</Text>
                            </View>
                            <View style={s.cBal}>
                                <Text style={[s.cellBold, { color: isPositive(e.running_balance) ? "#b91c1c" : "#065f46" }]}>
                                    {INR(e.running_balance)} {isPositive(e.running_balance) ? "DR" : "CR"}
                                </Text>
                            </View>
                        </View>
                    ))}

                    {/* Closing balance footer */}
                    <View style={s.tblFoot}>
                        <View style={[s.cDate, { width: "72%" }]}>
                            <Text style={[s.hdrTxt, { textAlign: "right" }]}>Closing Balance:</Text>
                        </View>
                        <View style={[s.cBal, { width: "28%" }]}>
                            <Text style={[{ fontSize: 11, fontWeight: "bold", textAlign: "right" },
                                { color: isPositive(closingBal) ? "#b91c1c" : "#065f46" }]}>
                                {INR(closingBal)} {isPositive(closingBal) ? "DR" : "CR"}
                            </Text>
                        </View>
                    </View>

                    {/* Amount in words */}
                    <View style={s.tblWords}>
                        <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}>
                            <Text style={[s.cell, { color: "#888", marginRight: 6, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.5 }]}>
                                Amount in Words:
                            </Text>
                            <Text style={[s.cell, { color: "#555", fontStyle: "italic" }]}>
                                Rupees {toWords(Math.abs(closingBal))} Only
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Footer ── */}
                <View style={s.footer} fixed>
                    <View>
                        <Text style={s.footerTxt}>{branding?.document_footer_presented_by_text || "Presented by MandiGrow"}</Text>
                        <Text style={[s.footerTxt, { fontWeight: "bold", color: "#666", marginTop: 2 }]}>
                            {branding?.document_footer_powered_by_text || "Powered by MindT Corporation"}
                        </Text>
                    </View>
                    <View style={{ alignItems: "center" }}>
                        <View style={s.sigLine} />
                        <Text style={s.sigLbl}>Accountant Signature</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
};
