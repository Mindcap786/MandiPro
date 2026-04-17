"use client";

/**
 * generate-finance-pdf.tsx
 * Programmatic jsPDF party-balances report.
 * No html2canvas — output: ~60-120 KB, crisp vector text.
 */

const INR = (n: number) => {
    const abs = Math.abs(n);
    const formatted = abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? "-" : "") + "Rs." + formatted;
};

const safe = (v: any, fallback = "—") =>
    v !== null && v !== undefined && String(v).trim() !== "" ? String(v) : fallback;

export async function generateFinancePDF(
    reportData: any[],
    filterType: string,
    subFilter: string,
    organizationName: string,
    branding?: any
): Promise<Blob> {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const ML = 12;
    const MR = W - 12;
    const brandColor: [number,number,number] = branding?.brand_color
        ? hexToRgb(branding.brand_color) : [12, 131, 31];
    const dark: [number,number,number] = [26, 26, 46];
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    let y = 0;

    // ─── HEADER ──────────────────────────────────────────────────────────────
    pdf.setFillColor(...brandColor);
    pdf.rect(0, 0, W, 24, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(organizationName || "Mandi Organisation", ML, 10);

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    const filterLabel = filterType === "all" ? "All Parties" :
        filterType.charAt(0).toUpperCase() + filterType.slice(1) + "s";
    const subLabel = subFilter === "receivable" ? " — Receivables" :
        subFilter === "payable" ? " — Payables" : "";
    pdf.text(`CONSOLIDATED FINANCIAL STATEMENT — ${filterLabel}${subLabel}`, ML, 17);
    pdf.text(`Generated on ${dateStr}`, MR, 17, { align: "right" });

    y = 30;

    // ─── SUMMARY TOTALS ───────────────────────────────────────────────────────
    let totalReceivable = 0;
    let totalPayable = 0;

    for (const row of reportData) {
        const bal = Number(row.net_balance || 0);
        if (bal > 0) totalReceivable += bal;
        else totalPayable += Math.abs(bal);
    }

    // Summary chips
    const chipW = (MR - ML - 8) / 2;
    // Receivable chip
    pdf.setFillColor(220, 252, 231);
    pdf.roundedRect(ML, y, chipW, 14, 3, 3, "F");
    pdf.setTextColor(22, 101, 52);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text("TOTAL RECEIVABLE", ML + 4, y + 5);
    pdf.setFontSize(11);
    pdf.text(INR(totalReceivable), ML + 4, y + 11);

    // Payable chip
    const cx2 = ML + chipW + 8;
    pdf.setFillColor(254, 226, 226);
    pdf.roundedRect(cx2, y, chipW, 14, 3, 3, "F");
    pdf.setTextColor(185, 28, 28);
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.text("TOTAL PAYABLE", cx2 + 4, y + 5);
    pdf.setFontSize(11);
    pdf.text(INR(totalPayable), cx2 + 4, y + 11);

    y += 20;

    // ─── TABLE HEADER ─────────────────────────────────────────────────────────
    const ROW_H = 7.5;
    const COL = { no: ML, type: ML + 8, name: ML + 22, city: ML + 80, phone: ML + 115, outstanding: MR };

    pdf.setFillColor(245, 245, 245);
    pdf.rect(ML, y, MR - ML, ROW_H, "F");
    pdf.setDrawColor(210, 210, 210);
    pdf.rect(ML, y, MR - ML, ROW_H, "S");

    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "bold");
    pdf.text("NO.", COL.no + 1, y + 5);
    pdf.text("TYPE", COL.type + 1, y + 5);
    pdf.text("PARTY NAME", COL.name + 1, y + 5);
    pdf.text("CITY", COL.city + 1, y + 5);
    pdf.text("PHONE", COL.phone + 1, y + 5);
    pdf.text("OUTSTANDING", COL.outstanding, y + 5, { align: "right" });
    y += ROW_H;

    // ─── TABLE ROWS ───────────────────────────────────────────────────────────
    let rowNum = 0;
    for (const row of reportData) {
        if (y > H - 30) {
            // Footer on current page
            addPageFooter(pdf, W, H, organizationName);
            pdf.addPage();
            y = 15;
            // Re-draw table header
            pdf.setFillColor(245, 245, 245);
            pdf.rect(ML, y, MR - ML, ROW_H, "F");
            pdf.setDrawColor(210, 210, 210);
            pdf.rect(ML, y, MR - ML, ROW_H, "S");
            pdf.setTextColor(80, 80, 80);
            pdf.setFontSize(6.5);
            pdf.setFont("helvetica", "bold");
            pdf.text("NO.", COL.no + 1, y + 5);
            pdf.text("TYPE", COL.type + 1, y + 5);
            pdf.text("PARTY NAME", COL.name + 1, y + 5);
            pdf.text("CITY", COL.city + 1, y + 5);
            pdf.text("PHONE", COL.phone + 1, y + 5);
            pdf.text("OUTSTANDING", COL.outstanding, y + 5, { align: "right" });
            y += ROW_H;
        }

        rowNum++;
        const balance = Number(row.net_balance || 0);
        const isReceivable = balance > 0;
        const contactType = safe(row.contact_type, "");
        const typeLabel = contactType.charAt(0).toUpperCase() + contactType.slice(1, 7);
        const name = safe(row.contact_name);
        const city = safe(row.contact_city ?? row.city);
        const phone = safe(row.contact_phone ?? row.phone);

        // Alternate row bg
        if (rowNum % 2 === 0) {
            pdf.setFillColor(250, 250, 250);
            pdf.rect(ML, y, MR - ML, ROW_H, "F");
        }
        pdf.setDrawColor(235, 235, 235);
        pdf.line(ML, y + ROW_H, MR, y + ROW_H);

        pdf.setTextColor(...dark);
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(rowNum), COL.no + 1, y + 5);
        pdf.setTextColor(isReceivable ? 22 : 185, isReceivable ? 101 :28, isReceivable ? 52 : 28);
        pdf.setFont("helvetica", "bold");
        pdf.text(typeLabel, COL.type + 1, y + 5);
        pdf.setTextColor(...dark);
        pdf.setFont("helvetica", "normal");

        const truncName = name.length > 28 ? name.slice(0, 26) + "…" : name;
        pdf.text(truncName, COL.name + 1, y + 5);
        pdf.text(city.length > 14 ? city.slice(0,13) + "…" : city, COL.city + 1, y + 5);
        pdf.text(phone.length > 14 ? phone.slice(0,13) : phone, COL.phone + 1, y + 5);

        // Balance with color
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(isReceivable ? 22 : 185, isReceivable ? 101 : 28, isReceivable ? 52 : 28);
        pdf.text(INR(balance) + (isReceivable ? " DR" : " CR"), COL.outstanding, y + 5, { align: "right" });
        y += ROW_H;
    }

    // ─── GRAND TOTAL ──────────────────────────────────────────────────────────
    y += 2;
    pdf.setDrawColor(180, 180, 180);
    pdf.line(ML, y, MR, y);
    y += 5;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...dark);
    pdf.text("TOTAL OUTSTANDING", ML, y);
    pdf.setTextColor(...brandColor);
    const netTotal = totalReceivable - totalPayable;
    pdf.text(INR(Math.abs(netTotal)) + (netTotal >= 0 ? " Net Receivable" : " Net Payable"), MR, y, { align: "right" });
    y += 5;

    // Amount in words
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Amount in Words: ${numberToWords(Math.abs(netTotal))} Only`, ML, y);

    // Footer on last page
    addPageFooter(pdf, W, H, organizationName);

    return pdf.output("blob");
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function addPageFooter(pdf: any, W: number, H: number, orgName: string) {
    pdf.setFillColor(245, 245, 245);
    pdf.rect(0, H - 12, W, 12, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(130, 130, 130);
    pdf.text(`${orgName} — Confidential Financial Report`, W / 2, H - 6, { align: "center" });
    pdf.text("Generated by MandiGrow ERP", W / 2, H - 2, { align: "center" });
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    if (h.length !== 6) return [12, 131, 31];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function numberToWords(n: number): string {
    const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
    const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
    if (n < 20) return ones[Math.floor(n)] || "Zero";
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ` ${ones[n%10]}` : "");
    if (n < 1000) return ones[Math.floor(n/100)] + " Hundred " + numberToWords(n%100);
    if (n < 100000) return numberToWords(Math.floor(n/1000)) + " Thousand " + numberToWords(n%1000);
    if (n < 10000000) return numberToWords(Math.floor(n/100000)) + " Lakh " + numberToWords(n%100000);
    return numberToWords(Math.floor(n/10000000)) + " Crore " + numberToWords(n%10000000);
}
