"use client";

/**
 * generate-stock-pdf.tsx
 * Programmatic stock audit PDF — no html2canvas.
 * Output: ~60-120 KB crisp text report per commodity listing.
 */

const safe = (v: any, fb = "—") =>
    v !== null && v !== undefined && String(v).trim() !== "" ? String(v) : fb;

function formatDate(d: any) {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return String(d); }
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    if (h.length !== 6) return [12, 131, 31];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

export async function generateStockAuditPDF(
    stockItems: any[],
    organizationName: string,
    branding?: any
): Promise<Blob> {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const W  = pdf.internal.pageSize.getWidth();   // 297
    const H  = pdf.internal.pageSize.getHeight();  // 210
    const ML = 10;
    const MR = W - 10;
    const brandColor: [number,number,number] = branding?.brand_color
        ? hexToRgb(branding.brand_color) : [12, 131, 31];
    const dark: [number,number,number] = [26, 26, 46];
    const dateStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // ─── HEADER ──────────────────────────────────────────────────────────────
    pdf.setFillColor(...brandColor);
    pdf.rect(0, 0, W, 22, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
    pdf.text(`${organizationName} — Stock Audit Report`, ML, 9);
    pdf.setFontSize(8); pdf.setFont("helvetica", "normal");
    pdf.text(`Generated: ${dateStr} IST`, ML, 16);
    pdf.text("INVENTORY AUDIT — ALL COMMODITIES", MR, 16, { align: "right" });

    let y = 28;

    // ─── SUMMARY CHIPS ────────────────────────────────────────────────────────
    const totalUnits = stockItems.reduce((s, c) =>
        s + (Array.isArray(c.lots) ? c.lots.reduce((a: number, l: any) => a + Number(l.current_quantity || l.quantity || 0), 0) : Number(c.total_quantity || c.current_quantity || 0)), 0);
    const totalValue = stockItems.reduce((s, c) => s + (Number(c.total_value) || 0), 0);
    const totalCommodities = stockItems.length;
    const criticalCount = stockItems.filter(c => {
        const qty = Number(c.total_quantity || c.current_quantity || 0);
        const cap = Number(c.capacity || 0);
        return cap > 0 && (qty / cap) < 0.3;
    }).length;

    const chips: Array<{ label: string; value: string; bg: [number,number,number]; tc: [number,number,number] }> = [
        { label: "Total Commodities", value: String(totalCommodities), bg: [220,252,231], tc: [21,128,61] },
        { label: "Total Units Held", value: totalUnits.toLocaleString("en-IN"), bg: [219,234,254], tc: [29,78,216] },
        { label: "Stock Valuation", value: totalValue > 0 ? `INR ${totalValue.toLocaleString("en-IN")}` : "—", bg: [237,233,254], tc: [109,40,217] },
        { label: "Critical Stock", value: String(criticalCount), bg: [254,226,226], tc: [185,28,28] },
        { label: "Audit Date", value: new Date().toLocaleDateString("en-IN"), bg: [255,247,237], tc: [154,52,18] },
    ];
    const chipW = (MR - ML - chips.length * 3) / chips.length;
    chips.forEach((chip, i) => {
        const cx = ML + i * (chipW + 3);
        pdf.setFillColor(...chip.bg);
        pdf.roundedRect(cx, y, chipW, 13, 2, 2, "F");
        pdf.setFontSize(6.5); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...chip.tc);
        pdf.text(chip.label, cx + chipW / 2, y + 4.5, { align: "center" });
        pdf.setFontSize(10);
        pdf.text(chip.value, cx + chipW / 2, y + 10.5, { align: "center" });
    });
    y += 18;

    // ─── TABLE HEADER ─────────────────────────────────────────────────────────
    const COL = {
        no:      ML,
        comm:    ML + 8,
        type:    ML + 60,
        loc:     ML + 90,
        lots:    ML + 120,
        qty:     ML + 138,
        value:   ML + 162,
        status:  ML + 192,
        arrival: ML + 225,
        notes:   MR,
    };
    const ROW_H = 7.5;

    const drawHeader = () => {
        pdf.setFillColor(245, 245, 245);
        pdf.rect(ML, y, MR - ML, ROW_H, "F");
        pdf.setDrawColor(210, 210, 210);
        pdf.rect(ML, y, MR - ML, ROW_H, "S");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.5); pdf.setTextColor(80, 80, 80);
        pdf.text("NO.",         COL.no + 1,    y + 5.2);
        pdf.text("COMMODITY",   COL.comm + 1,  y + 5.2);
        pdf.text("SOURCE TYPE", COL.type + 1,  y + 5.2);
        pdf.text("LOCATION",    COL.loc + 1,   y + 5.2);
        pdf.text("LOTS",        COL.lots + 1,  y + 5.2);
        pdf.text("TOTAL QTY",   COL.qty + 1,   y + 5.2);
        pdf.text("VALUE (INR)", COL.value + 1, y + 5.2);
        pdf.text("STATUS",      COL.status + 1,y + 5.2);
        pdf.text("LAST ARRIVAL",COL.arrival + 1,y + 5.2);
        pdf.text("ALERTS",      COL.notes,     y + 5.2, { align: "right" });
        return y + ROW_H;
    };

    y = drawHeader();

    // ─── ROWS ─────────────────────────────────────────────────────────────────
    for (let i = 0; i < stockItems.length; i++) {
        if (y > H - 22) {
            addPageFooter(pdf, W, H, organizationName);
            pdf.addPage();
            y = 15;
            y = drawHeader();
        }

        const c = stockItems[i];
        const lots = Array.isArray(c.lots) ? c.lots : [];
        const totalQty = lots.length > 0
            ? lots.reduce((s: number, l: any) => s + Number(l.current_quantity || l.quantity || 0), 0)
            : Number(c.total_quantity || c.current_quantity || c.quantity || 0);
        const capacity = Number(c.capacity || 0);
        const pct = capacity > 0 ? totalQty / capacity : 1;

        const statusLabel =       pct < 0.1 ? "EMPTY"
            : pct < 0.3 ? "CRITICAL"
            : pct < 0.6 ? "LIMITED"
            : pct < 0.85 ? "STABLE"
            : "FULL";
        const statusColor: [number,number,number] =
            statusLabel === "EMPTY" ? [100, 100, 100]
            : statusLabel === "CRITICAL" ? [185, 28, 28]
            : statusLabel === "LIMITED" ? [217, 119, 6]
            : statusLabel === "STABLE"  ? [21, 128, 61]
            : [12, 131, 31];

        const comm   = safe(c.name || c.commodity_name || c.item_name);
        const srcType = safe(c.arrival_type || c.type);
        const loc     = safe(c.location || c.yard || c.storage_location);
        const lastArr = formatDate(c.last_arrival_date || c.created_at);

        // Alerts
        const alerts: string[] = [];
        if (statusLabel === "CRITICAL" || statusLabel === "EMPTY") alerts.push("⚠ LOW");
        if (c.has_aging || c.aging_days > 7) alerts.push("⏱ AGING");
        if (c.is_graded === false) alerts.push("UNGRADED");

        // Alternate row
        if (i % 2 === 0) {
            pdf.setFillColor(250, 250, 250);
            pdf.rect(ML, y, MR - ML, ROW_H, "F");
        }
        pdf.setDrawColor(235, 235, 235);
        pdf.line(ML, y + ROW_H, MR, y + ROW_H);

        pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...dark);
        pdf.text(String(i + 1), COL.no + 1, y + 5.2);
        pdf.setFont("helvetica", "bold");
        const truncComm = comm.length > 18 ? comm.slice(0, 16) + "…" : comm;
        pdf.text(truncComm, COL.comm + 1, y + 5.2);
        pdf.setFont("helvetica", "normal");
        pdf.text(srcType.length > 14 ? srcType.slice(0,13)+"…" : srcType, COL.type + 1, y + 5.2);
        pdf.text(loc.length > 10 ? loc.slice(0, 9)+"…" : loc, COL.loc + 1, y + 5.2);
        pdf.text(String(lots.length || 1), COL.lots + 1, y + 5.2);

        // Qty with bold
        pdf.setFont("helvetica", "bold");
        pdf.text(totalQty.toLocaleString("en-IN"), COL.qty + 1, y + 5.2);

        // Value
        const v = Number(c.total_value) || 0;
        if (v > 0) {
            pdf.setTextColor(21, 128, 61); // emerald green
            pdf.text(v.toLocaleString("en-IN"), COL.value + 1, y + 5.2);
            pdf.setTextColor(...dark); // reset dark
        } else {
            pdf.text("—", COL.value + 1, y + 5.2);
        }

        // Status badge
        pdf.setTextColor(...statusColor);
        pdf.setFont("helvetica", "bold");
        pdf.text(statusLabel, COL.status + 1, y + 5.2);

        pdf.setTextColor(...dark);
        pdf.setFont("helvetica", "normal");
        pdf.text(lastArr, COL.arrival + 1, y + 5.2);

        if (alerts.length > 0) {
            pdf.setTextColor(185, 28, 28);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(6.5);
            pdf.text(alerts.join(", "), COL.notes, y + 5.2, { align: "right" });
        }

        y += ROW_H;
    }

    // ─── TOTALS FOOTER ────────────────────────────────────────────────────────
    y += 3;
    if (y > H - 25) { addPageFooter(pdf, W, H, organizationName); pdf.addPage(); y = 15; }
    pdf.setDrawColor(180, 180, 180);
    pdf.line(ML, y, MR, y);
    y += 5;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(...dark);
    pdf.text(`Total: ${totalCommodities} Items | ${totalUnits.toLocaleString("en-IN")} Units | Valued: INR ${totalValue.toLocaleString("en-IN")}`, ML, y);
    pdf.setTextColor(...brandColor);
    pdf.text(`Audit Date: ${new Date().toLocaleDateString("en-IN")}`, MR, y, { align: "right" });

    addPageFooter(pdf, W, H, organizationName);
    return pdf.output("blob");
}

function addPageFooter(pdf: any, W: number, H: number, orgName: string) {
    pdf.setFillColor(245, 245, 245);
    pdf.rect(0, H - 10, W, 10, "F");
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(6); pdf.setTextColor(130, 130, 130);
    pdf.text(`${orgName} — Stock Audit Report | CONFIDENTIAL | Generated by MandiGrow ERP`, W / 2, H - 4, { align: "center" });
}
