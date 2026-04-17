"use client";

/**
 * generate-gst-pdf.tsx
 * Programmatic GSTR-1 PDF report — no html2canvas.
 * Output: ~80-150 KB, crisp vector text, GST-audit-ready.
 */

const INR = (n: number) =>
    Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const safe = (v: any, fallback = "—") =>
    v !== null && v !== undefined && String(v).trim() !== "" ? String(v) : fallback;

interface GSTSummary {
    totalTaxable: number;
    totalIgst: number;
    totalCgst: number;
    totalSgst: number;
    totalTax: number;
    b2bCount: number;
    b2cCount: number;
}

interface GSTReportInput {
    sales: any[];
    hsnData: any[];
    summary: GSTSummary;
    dateRange: { from: string; to: string };
    organizationName?: string;
    branding?: any;
}

export async function generateGSTPDF(input: GSTReportInput): Promise<Blob> {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const W = pdf.internal.pageSize.getWidth();   // 297
    const H = pdf.internal.pageSize.getHeight();  // 210
    const ML = 10;
    const MR = W - 10;
    const brandColor: [number,number,number] = input.branding?.brand_color
        ? hexToRgb(input.branding.brand_color) : [12, 131, 31];
    const dark: [number,number,number] = [26, 26, 46];
    const orgName = input.organizationName || "Mandi Organisation";

    // ─── PAGE 1: HEADER + SUMMARY ─────────────────────────────────────────────
    pdf.setFillColor(...brandColor);
    pdf.rect(0, 0, W, 22, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${orgName} — GST Compliance Report`, ML, 9);

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Period: ${input.dateRange.from} to ${input.dateRange.to}`, ML, 16);
    pdf.text("GSTR-1 Summary", MR, 9, { align: "right" });
    const genDate = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    pdf.text(`Generated: ${genDate} IST`, MR, 16, { align: "right" });

    let y = 28;

    // Summary Chips
    const s = input.summary;
    const chips = [
        { label: "Total Taxable", value: `Rs.${INR(s.totalTaxable)}`, bg: [220,252,231] as [number,number,number], tc: [21,128,61] as [number,number,number] },
        { label: "IGST", value: `Rs.${INR(s.totalIgst)}`, bg: [219,234,254] as [number,number,number], tc: [29,78,216] as [number,number,number] },
        { label: "CGST", value: `Rs.${INR(s.totalCgst)}`, bg: [237,233,254] as [number,number,number], tc: [109,40,217] as [number,number,number] },
        { label: "SGST", value: `Rs.${INR(s.totalSgst)}`, bg: [254,243,199] as [number,number,number], tc: [161,98,7] as [number,number,number] },
        { label: "Total Tax", value: `Rs.${INR(s.totalTax)}`, bg: [254,226,226] as [number,number,number], tc: [185,28,28] as [number,number,number] },
        { label: "B2B Invoices", value: String(s.b2bCount), bg: [240,253,244] as [number,number,number], tc: [22,101,52] as [number,number,number] },
        { label: "B2C Invoices", value: String(s.b2cCount), bg: [255,247,237] as [number,number,number], tc: [154,52,18] as [number,number,number] },
    ];
    const chipW = (MR - ML - chips.length * 2) / chips.length;
    chips.forEach((chip, i) => {
        const cx = ML + i * (chipW + 2);
        pdf.setFillColor(...chip.bg);
        pdf.roundedRect(cx, y, chipW, 14, 2, 2, "F");
        pdf.setFontSize(6.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...chip.tc);
        pdf.text(chip.label, cx + chipW / 2, y + 5, { align: "center" });
        pdf.setFontSize(9);
        pdf.text(chip.value, cx + chipW / 2, y + 11, { align: "center" });
    });
    y += 20;

    // ─── B2B SECTION ──────────────────────────────────────────────────────────
    const b2bSales = input.sales.filter(s => s.buyer_gstin);
    if (b2bSales.length > 0) {
        y = drawSectionHeader(pdf, y, ML, MR, "Section 4: B2B Outward Supplies (Invoice-wise)", brandColor);
        const cols = { no: ML, gstin: ML + 7, name: ML + 48, inv: ML + 95, date: ML + 125, val: ML + 155, igst: ML + 178, cgst: ML + 203, sgst: ML + 228, total: MR };
        y = drawTableHeader(pdf, y, ML, MR, [
            { label: "NO.", x: cols.no }, { label: "BUYER GSTIN", x: cols.gstin }, { label: "PARTY NAME", x: cols.name },
            { label: "INV#", x: cols.inv }, { label: "DATE", x: cols.date }, { label: "TAXABLE", x: cols.val },
            { label: "IGST", x: cols.igst }, { label: "CGST", x: cols.cgst }, { label: "SGST", x: cols.sgst },
            { label: "TOTAL", x: cols.total, align: "right" }
        ], dark);

        for (let i = 0; i < b2bSales.length; i++) {
            const s = b2bSales[i];
            if (y > H - 25) { addPageFooter(pdf, W, H, orgName); pdf.addPage(); y = 15; }

            const odd = i % 2 !== 0;
            if (odd) { pdf.setFillColor(250, 250, 250); pdf.rect(ML, y, MR - ML, 7, "F"); }
            pdf.setDrawColor(235, 235, 235);
            pdf.line(ML, y + 7, MR, y + 7);

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(7);
            pdf.setTextColor(...dark);
            pdf.text(String(i+1), cols.no + 1, y + 5);
            pdf.text(safe(s.buyer_gstin).slice(0,15), cols.gstin + 1, y + 5);
            const name = safe(s.contact?.name ?? s.buyer_name);
            pdf.text(name.length > 18 ? name.slice(0,16)+"…" : name, cols.name + 1, y + 5);
            pdf.text(safe(s.contact_bill_no ?? s.bill_no), cols.inv + 1, y + 5);
            pdf.text(formatDate(s.sale_date), cols.date + 1, y + 5);
            pdf.text(INR(s.total_amount || 0), cols.val + 1, y + 5);
            pdf.text(INR(s.igst_amount || 0), cols.igst + 1, y + 5);
            pdf.text(INR(s.cgst_amount || 0), cols.cgst + 1, y + 5);
            pdf.text(INR(s.sgst_amount || 0), cols.sgst + 1, y + 5);
            pdf.setFont("helvetica", "bold");
            pdf.text(`Rs.${INR(s.total_amount_inc_tax || s.total_amount || 0)}`, cols.total, y + 5, { align: "right" });
            y += 7;
        }
        y += 5;
    }

    // ─── B2C SECTION ──────────────────────────────────────────────────────────
    const b2cSales = input.sales.filter(s => !s.buyer_gstin);
    if (b2cSales.length > 0) {
        if (y > H - 40) { addPageFooter(pdf, W, H, orgName); pdf.addPage(); y = 15; }
        y = drawSectionHeader(pdf, y, ML, MR, "Section 7: B2C Outward Supplies (Consumer Rate-wise)", brandColor);
        const cols = { no: ML, name: ML + 8, inv: ML + 65, date: ML + 95, taxable: ML + 125, igst: ML + 155, cgst: ML + 185, sgst: ML + 215, total: MR };
        y = drawTableHeader(pdf, y, ML, MR, [
            { label: "NO.", x: cols.no }, { label: "PARTY NAME", x: cols.name }, { label: "INV#", x: cols.inv },
            { label: "DATE", x: cols.date }, { label: "TAXABLE", x: cols.taxable },
            { label: "IGST", x: cols.igst }, { label: "CGST", x: cols.cgst }, { label: "SGST", x: cols.sgst },
            { label: "TOTAL", x: cols.total, align: "right" }
        ], dark);

        for (let i = 0; i < b2cSales.length && i < 500; i++) {
            const s = b2cSales[i];
            if (y > H - 25) { addPageFooter(pdf, W, H, orgName); pdf.addPage(); y = 15; }
            const odd = i % 2 !== 0;
            if (odd) { pdf.setFillColor(250, 250, 250); pdf.rect(ML, y, MR - ML, 7, "F"); }
            pdf.setDrawColor(235, 235, 235);
            pdf.line(ML, y + 7, MR, y + 7);
            pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...dark);
            pdf.text(String(i+1), cols.no + 1, y + 5);
            const name = safe(s.contact?.name ?? s.buyer_name);
            pdf.text(name.length > 22 ? name.slice(0,20)+"…" : name, cols.name + 1, y + 5);
            pdf.text(safe(s.contact_bill_no ?? s.bill_no), cols.inv + 1, y + 5);
            pdf.text(formatDate(s.sale_date), cols.date + 1, y + 5);
            pdf.text(INR(s.total_amount || 0), cols.taxable + 1, y + 5);
            pdf.text(INR(s.igst_amount || 0), cols.igst + 1, y + 5);
            pdf.text(INR(s.cgst_amount || 0), cols.cgst + 1, y + 5);
            pdf.text(INR(s.sgst_amount || 0), cols.sgst + 1, y + 5);
            pdf.setFont("helvetica", "bold");
            pdf.text(`Rs.${INR(s.total_amount_inc_tax || s.total_amount || 0)}`, cols.total, y + 5, { align: "right" });
            y += 7;
        }
        y += 5;
    }

    // ─── HSN SUMMARY ──────────────────────────────────────────────────────────
    if (input.hsnData.length > 0) {
        if (y > H - 40) { addPageFooter(pdf, W, H, orgName); pdf.addPage(); y = 15; }
        y = drawSectionHeader(pdf, y, ML, MR, "Section 12: HSN-wise Summary", brandColor);
        const cols = { hsn: ML, desc: ML + 22, uqc: ML + 80, qty: ML + 112, taxable: ML + 145, igst: ML + 185, cgst: ML + 220, sgst: MR };
        y = drawTableHeader(pdf, y, ML, MR, [
            { label: "HSN CODE", x: cols.hsn }, { label: "DESCRIPTION", x: cols.desc }, { label: "UQC", x: cols.uqc },
            { label: "QUANTITY", x: cols.qty }, { label: "TAXABLE VALUE", x: cols.taxable },
            { label: "IGST", x: cols.igst }, { label: "CGST", x: cols.cgst }, { label: "SGST", x: cols.sgst, align: "right" }
        ], dark);

        for (let i = 0; i < input.hsnData.length; i++) {
            const h = input.hsnData[i];
            if (y > H - 25) { addPageFooter(pdf, W, H, orgName); pdf.addPage(); y = 15; }
            const odd = i % 2 !== 0;
            if (odd) { pdf.setFillColor(250, 250, 250); pdf.rect(ML, y, MR - ML, 7, "F"); }
            pdf.setDrawColor(235, 235, 235);
            pdf.line(ML, y + 7, MR, y + 7);
            pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...dark);
            pdf.text(safe(h.hsn), cols.hsn + 1, y + 5);
            const desc = safe(h.description, "Commodity");
            pdf.text(desc.length > 22 ? desc.slice(0,20)+"…" : desc, cols.desc + 1, y + 5);
            pdf.text(safe(h.unit, "BOX"), cols.uqc + 1, y + 5);
            pdf.text(INR(h.quantity || 0), cols.qty + 1, y + 5);
            pdf.text(`Rs.${INR(h.taxable || 0)}`, cols.taxable + 1, y + 5);
            pdf.text(`Rs.${INR(h.igst || 0)}`, cols.igst + 1, y + 5);
            pdf.text(`Rs.${INR(h.cgst || 0)}`, cols.cgst + 1, y + 5);
            pdf.setFont("helvetica", "bold");
            pdf.text(`Rs.${INR(h.sgst || 0)}`, cols.sgst, y + 5, { align: "right" });
            y += 7;
        }
    }

    addPageFooter(pdf, W, H, orgName);
    return pdf.output("blob");
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function drawSectionHeader(pdf: any, y: number, ML: number, MR: number, title: string, color: [number,number,number]) {
    pdf.setFillColor(color[0], color[1], color[2], 0.1);
    pdf.setFillColor(Math.min(255, color[0]+200), Math.min(255, color[1]+200), Math.min(255, color[2]+200));
    pdf.rect(ML, y, MR - ML, 8, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...color);
    pdf.text(title, ML + 2, y + 5.5);
    return y + 11;
}

function drawTableHeader(pdf: any, y: number, ML: number, MR: number, cols: { label: string; x: number; align?: string }[], dark: [number,number,number]) {
    pdf.setFillColor(245, 245, 245);
    pdf.rect(ML, y, MR - ML, 7, "F");
    pdf.setDrawColor(210, 210, 210);
    pdf.rect(ML, y, MR - ML, 7, "S");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6);
    pdf.setTextColor(80, 80, 80);
    for (const col of cols) {
        pdf.text(col.label, col.x + (col.align === "right" ? 0 : 1), y + 5, { align: col.align || "left" });
    }
    return y + 7;
}

function addPageFooter(pdf: any, W: number, H: number, orgName: string) {
    pdf.setFillColor(245, 245, 245);
    pdf.rect(0, H - 10, W, 10, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.setTextColor(130, 130, 130);
    pdf.text(`${orgName} — GST Report | Confidential | Generated by MandiGrow ERP`, W / 2, H - 4, { align: "center" });
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    if (h.length !== 6) return [12, 131, 31];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function formatDate(d: any) {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }); }
    catch { return String(d); }
}
