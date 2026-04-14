import { describe, expect, it } from "vitest";
import {
    createBankStatementFingerprint,
    parseBankStatementFile,
} from "./bank-statement-import";

describe("bank statement import", () => {
    it("parses semicolon-delimited statements with Amount + Dr/Cr columns", async () => {
        const csv = [
            "Value Date;Narration;Amount;Dr/Cr;Closing Balance;Ref No",
            "24/03/2026;UPI Receipt;2500;CR;12500;UTR001",
            "25/03/2026;NEFT Sent;1800;DR;10700;UTR002",
        ].join("\n");

        const file = new File([csv], "statement.csv", { type: "text/csv" });
        const parsed = await parseBankStatementFile(file);

        expect(parsed.format).toBe("csv");
        expect(parsed.skippedRows).toBe(0);
        expect(parsed.rows).toEqual([
            {
                statement_date: "2026-03-24",
                description: "UPI Receipt",
                debit: 0,
                credit: 2500,
                balance: 12500,
                reference_no: "UTR001",
                is_reconciled: false,
            },
            {
                statement_date: "2026-03-25",
                description: "NEFT Sent",
                debit: 1800,
                credit: 0,
                balance: 10700,
                reference_no: "UTR002",
                is_reconciled: false,
            },
        ]);
    });

    it("parses xlsx statements using the first worksheet", async () => {
        const workbook = buildWorkbook([
            ["Value Date", "Narration", "Amount", "Cr/Dr", "Closing Balance", "Ref No"],
            ["24/03/2026", "Cash Deposit", "3200", "CR", "3200", "DEP001"],
            ["25/03/2026", "ATM Withdrawal", "500", "DR", "2700", "ATM001"],
        ]);

        const workbookBlob = toArrayBuffer(workbook);
        const file = new File([workbookBlob], "statement.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const parsed = await parseBankStatementFile(file);

        expect(parsed.format).toBe("xlsx");
        expect(parsed.rows).toEqual([
            {
                statement_date: "2026-03-24",
                description: "Cash Deposit",
                debit: 0,
                credit: 3200,
                balance: 3200,
                reference_no: "DEP001",
                is_reconciled: false,
            },
            {
                statement_date: "2026-03-25",
                description: "ATM Withdrawal",
                debit: 500,
                credit: 0,
                balance: 2700,
                reference_no: "ATM001",
                is_reconciled: false,
            },
        ]);
    });

    it("normalises fingerprints for duplicate detection", () => {
        const first = createBankStatementFingerprint({
            statement_date: "2026-03-24",
            description: "  UPI Receipt ",
            debit: 0,
            credit: 2500,
            balance: 12500,
            reference_no: " utr001 ",
        });

        const second = createBankStatementFingerprint({
            statement_date: "2026-03-24",
            description: "upi receipt",
            debit: 0,
            credit: 2500,
            balance: 12500,
            reference_no: "UTR001",
        });

        expect(first).toBe(second);
    });
});

function buildWorkbook(rows: string[][]): Uint8Array {
    const strings = Array.from(new Set(rows.flat()));
    const stringIndexes = new Map(strings.map((value, index) => [value, index]));

    const worksheetRows = rows.map((row, rowIndex) => {
        const cells = row.map((value, columnIndex) => {
            const reference = `${columnLabel(columnIndex)}${rowIndex + 1}`;
            const sharedStringIndex = stringIndexes.get(value);
            return `<c r="${reference}" t="s"><v>${sharedStringIndex}</v></c>`;
        }).join("");

        return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");

    const entries = [
        {
            name: "[Content_Types].xml",
            content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`,
        },
        {
            name: "_rels/.rels",
            content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
        },
        {
            name: "xl/workbook.xml",
            content: `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
        },
        {
            name: "xl/_rels/workbook.xml.rels",
            content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`,
        },
        {
            name: "xl/sharedStrings.xml",
            content: `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
  ${strings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("")}
</sst>`,
        },
        {
            name: "xl/worksheets/sheet1.xml",
            content: `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${worksheetRows}</sheetData>
</worksheet>`,
        },
    ];

    return zipStored(entries);
}

function zipStored(entries: Array<{ name: string; content: string }>): Uint8Array {
    const encoder = new TextEncoder();
    const localChunks: Uint8Array[] = [];
    const centralChunks: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const dataBytes = encoder.encode(entry.content);
        const crc = crc32(dataBytes);

        const localHeader = new Uint8Array(30 + nameBytes.length + dataBytes.length);
        const localView = new DataView(localHeader.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, 0, true);
        localView.setUint16(12, 0, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, dataBytes.length, true);
        localView.setUint32(22, dataBytes.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);
        localHeader.set(dataBytes, 30 + nameBytes.length);
        localChunks.push(localHeader);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(centralHeader.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, 0, true);
        centralView.setUint16(14, 0, true);
        centralView.setUint32(16, crc, true);
        centralView.setUint32(20, dataBytes.length, true);
        centralView.setUint32(24, dataBytes.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, offset, true);
        centralHeader.set(nameBytes, 46);
        centralChunks.push(centralHeader);

        offset += localHeader.length;
    }

    const centralDirectoryOffset = offset;
    const centralDirectorySize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
    const endOfCentralDirectory = new Uint8Array(22);
    const endView = new DataView(endOfCentralDirectory.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralDirectorySize, true);
    endView.setUint32(16, centralDirectoryOffset, true);
    endView.setUint16(20, 0, true);

    return concatBytes([...localChunks, ...centralChunks, endOfCentralDirectory]);
}

function crc32(bytes: Uint8Array): number {
    let crc = 0 ^ -1;

    for (let index = 0; index < bytes.length; index += 1) {
        crc ^= bytes[index];
        for (let bit = 0; bit < 8; bit += 1) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xedb88320 & mask);
        }
    }

    return (crc ^ -1) >>> 0;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
    const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
    }

    return output;
}

function columnLabel(index: number): string {
    let value = index + 1;
    let label = "";

    while (value > 0) {
        const remainder = (value - 1) % 26;
        label = String.fromCharCode(65 + remainder) + label;
        value = Math.floor((value - 1) / 26);
    }

    return label;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}
