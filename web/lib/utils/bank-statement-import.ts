import { format as formatDate, isValid, parse as parseDate } from "date-fns";

export const SUPPORTED_BANK_STATEMENT_FORMATS = ["CSV", "TSV", "TXT", "XLSX", "XLS", "PDF"] as const;

export type ImportedBankStatementRow = {
    statement_date: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    reference_no: string;
    is_reconciled: false;
};

export type ParsedBankStatementFile = {
    format: "csv" | "tsv" | "txt" | "xlsx" | "xls" | "pdf";
    rows: ImportedBankStatementRow[];
    skippedRows: number;
};

const HEADER_ALIASES = {
    date: [
        "date",
        "txn date",
        "transaction date",
        "value date",
        "posting date",
    ],
    description: [
        "description",
        "narration",
        "remarks",
        "particulars",
        "details",
        "transaction details",
        "transaction remarks",
        "transaction description",
    ],
    debit: [
        "debit",
        "debit amount",
        "withdrawal",
        "withdrawal amount",
        "paid out",
        "money out",
        "dr",
    ],
    credit: [
        "credit",
        "credit amount",
        "deposit",
        "deposit amount",
        "paid in",
        "money in",
        "cr",
    ],
    amount: [
        "amount",
        "transaction amount",
        "txn amount",
    ],
    direction: [
        "dr cr",
        "dr/cr",
        "cr dr",
        "cr/dr",
        "type",
        "entry type",
        "transaction type",
    ],
    balance: [
        "balance",
        "closing balance",
        "closing bal",
        "running balance",
        "running bal",
        "available balance",
    ],
    reference: [
        "reference",
        "reference no",
        "ref",
        "ref no",
        "ref number",
        "cheque no",
        "check no",
        "transaction id",
        "utr",
    ],
} as const;

type ZipEntry = {
    name: string;
    compressionMethod: number;
    compressedSize: number;
    localHeaderOffset: number;
    uncompressedSize: number;
};

export async function parseBankStatementFile(file: File): Promise<ParsedBankStatementFile> {
    let extension = getFileExtension(file.name);

    if (extension === "pdf") {
        const formData = new FormData();
        formData.append("file", file);
        
        const res = await fetch("/api/parse-pdf", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Failed to parse PDF file. Ensure it is a valid text-based PDF statement.");
        const data = await res.json();
        
        const text: string = data.text || "";
        const lines = text.split(/\r?\n/).filter((line: string) => line.trim().length > 0);
        const rows = lines.map((line: string) => line.split(/\s{2,}|\t/));
        
        return {
            format: "pdf",
            ...normaliseWorksheetRows(rows),
        };
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Magic byte detection
    if (bytes.length >= 4) {
        if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
             if (extension !== "xlsx") {
                 extension = "xlsx"; // Auto-correct to xlsx
             }
        } else if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
             extension = "xls"; // Auto-correct to legacy xls
        }
        
        const firstFewChars = String.fromCharCode(...Array.from(bytes.slice(0, 15))).toLowerCase();
        if (firstFewChars.includes("<html") || firstFewChars.includes("<!docty")) {
            throw new Error("This file is actually a webpage (HTML) disguised as a spreadsheet by your bank. Please open it in your spreadsheet app and choose File -> Export To -> CSV.");
        }
    }

    if (extension === "xls") {
        const formData = new FormData();
        // Send original file blob but process as xls
        formData.append("file", new File([buffer], "statement.xls", { type: "application/vnd.ms-excel" }));
        
        const res = await fetch("/api/parse-xls", { method: "POST", body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to parse legacy XLS file.");
        }
        const data = await res.json();
        
        return {
            format: "xls",
            ...normaliseWorksheetRows(data.rows || []),
        };
    }

    if (extension === "xlsx") {
        const worksheetRows = await parseXlsxWorksheet(buffer);
        return {
            format: "xlsx",
            ...normaliseWorksheetRows(worksheetRows),
        };
    }

    if (!["csv", "tsv", "txt"].includes(extension)) {
        throw new Error("Unsupported file type. Use PDF, CSV, TSV, TXT, XLS, or XLSX bank exports.");
    }

    let text = "";
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        text = new TextDecoder("utf-16le").decode(buffer);
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        text = new TextDecoder("utf-16be").decode(buffer);
    } else {
        text = new TextDecoder("utf-8").decode(buffer);
    }
    
    text = text.replace(/\0/g, "");

    const delimiter = extension === "tsv" ? "\t" : detectDelimiter(text);

    if (!delimiter) {
        throw new Error("Could not detect the file columns. Export the statement as CSV, TSV, TXT, or XLSX.");
    }

    return {
        format: extension as ParsedBankStatementFile["format"],
        ...normaliseWorksheetRows(parseDelimitedText(text, delimiter)),
    };
}

export function createBankStatementFingerprint(row: Pick<ImportedBankStatementRow, "statement_date" | "description" | "debit" | "credit" | "balance" | "reference_no">): string {
    const normalisedDescription = normaliseText(row.description);
    const normalisedReference = normaliseText(row.reference_no);

    return [
        row.statement_date,
        normalisedDescription,
        normaliseNumber(row.debit),
        normaliseNumber(row.credit),
        normaliseNumber(row.balance),
        normalisedReference,
    ].join("|");
}

function getFileExtension(filename: string): string {
    const trimmed = filename.trim().toLowerCase();
    const parts = trimmed.split(".");
    return parts.length > 1 ? parts.pop() ?? "" : "";
}

function normaliseWorksheetRows(rawRows: string[][]): Omit<ParsedBankStatementFile, "format"> {
    const rows = rawRows
        .map((row) => trimTrailingEmptyCells(row.map(sanitiseCell)))
        .filter((row) => row.some(Boolean));

    if (rows.length === 0) {
        throw new Error("The statement file is empty.");
    }

    const headerRowIndex = findHeaderRowIndex(rows);
    const headerRow = rows[headerRowIndex];
    const headers = headerRow.map(normaliseHeader);

    const dateIdx = findColumnIndex(headers, HEADER_ALIASES.date);
    const descriptionIdx = findColumnIndex(headers, HEADER_ALIASES.description);
    let debitIdx = findColumnIndex(headers, HEADER_ALIASES.debit);
    let creditIdx = findColumnIndex(headers, HEADER_ALIASES.credit);
    const amountIdx = findColumnIndex(headers, HEADER_ALIASES.amount);
    const directionIdx = findColumnIndex(headers, HEADER_ALIASES.direction);
    const balanceIdx = findColumnIndex(headers, HEADER_ALIASES.balance);
    const referenceIdx = findColumnIndex(headers, HEADER_ALIASES.reference);

    if (amountIdx >= 0 && directionIdx >= 0) {
        if (debitIdx === directionIdx) {
            debitIdx = -1;
        }
        if (creditIdx === directionIdx) {
            creditIdx = -1;
        }
    }

    if (dateIdx < 0 || (debitIdx < 0 && creditIdx < 0 && amountIdx < 0)) {
        throw new Error(`Expected columns: Date + (Debit/Credit or Amount). Actually found headers: [${headers.join(", ")}].`);
    }

    let skippedRows = 0;
    const parsedRows: ImportedBankStatementRow[] = [];

    for (const row of rows.slice(headerRowIndex + 1)) {
        if (!row.some(Boolean)) {
            continue;
        }

        const parsedDate = parseFlexibleDate(row[dateIdx]);
        if (!parsedDate) {
            skippedRows += 1;
            continue;
        }

        let debit = debitIdx >= 0 ? Math.abs(parseSignedAmount(row[debitIdx])) : 0;
        let credit = creditIdx >= 0 ? Math.abs(parseSignedAmount(row[creditIdx])) : 0;

        if (debit === 0 && credit === 0 && amountIdx >= 0) {
            const amount = parseSignedAmount(row[amountIdx]);
            const direction = directionIdx >= 0 ? normaliseHeader(row[directionIdx]) : "";

            if (direction.includes("dr") || direction.includes("debit") || direction.includes("withdraw")) {
                debit = Math.abs(amount);
            } else if (direction.includes("cr") || direction.includes("credit") || direction.includes("deposit")) {
                credit = Math.abs(amount);
            } else if (amount < 0) {
                debit = Math.abs(amount);
            } else {
                credit = Math.abs(amount);
            }
        }

        const balance = balanceIdx >= 0 ? parseSignedAmount(row[balanceIdx]) : 0;
        const description = pickFirstValue(
            descriptionIdx >= 0 ? row[descriptionIdx] : "",
            row[1],
            referenceIdx >= 0 ? row[referenceIdx] : "",
            "Bank Transaction",
        ).slice(0, 200);
        const reference = (referenceIdx >= 0 ? row[referenceIdx] : "").slice(0, 50);

        if (debit === 0 && credit === 0 && balance === 0 && !description.trim()) {
            skippedRows += 1;
            continue;
        }

        parsedRows.push({
            statement_date: parsedDate,
            description,
            debit,
            credit,
            balance,
            reference_no: reference,
            is_reconciled: false,
        });
    }

    if (parsedRows.length === 0) {
        const firstDataRow = rows[Math.min(headerRowIndex + 1, Math.max(0, rows.length - 1))] || [];
        throw new Error(`No statement rows could be parsed. First data row sample we tried to parse: ${JSON.stringify(firstDataRow)} (dateIdx: ${dateIdx}, refIdx: ${referenceIdx}, cr/dr/amt: ${creditIdx}/${debitIdx}/${amountIdx})`);
    }

    return {
        rows: parsedRows,
        skippedRows,
    };
}

function detectDelimiter(text: string): string | null {
    const sampleLines = text
        .replace(/^\ufeff/, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 5);

    if (sampleLines.length === 0) {
        return null;
    }

    const candidates = [",", ";", "\t"];
    let winningDelimiter: string | null = null;
    let winningScore = 0;

    for (const delimiter of candidates) {
        const score = sampleLines.reduce((sum, line) => sum + countDelimiterOutsideQuotes(line, delimiter), 0);
        if (score > winningScore) {
            winningScore = score;
            winningDelimiter = delimiter;
        }
    }

    return winningScore > 0 ? winningDelimiter : null;
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
    let count = 0;
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === "\"") {
            if (inQuotes && line[index + 1] === "\"") {
                index += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }

        if (char === delimiter && !inQuotes) {
            count += 1;
        }
    }

    return count;
}

function parseDelimitedText(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;
    const source = text.replace(/^\ufeff/, "");

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];

        if (char === "\"") {
            if (inQuotes && source[index + 1] === "\"") {
                currentCell += "\"";
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === delimiter && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && source[index + 1] === "\n") {
                index += 1;
            }
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = "";
            continue;
        }

        currentCell += char;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    return rows;
}

function findHeaderRowIndex(rows: string[][]): number {
    let bestIndex = 0;
    let bestScore = -1;
    const scanWindow = Math.min(rows.length, 50);

    for (let index = 0; index < scanWindow; index += 1) {
        const headers = rows[index].map(normaliseHeader);
        const score = [
            findColumnIndex(headers, HEADER_ALIASES.date) >= 0,
            findColumnIndex(headers, HEADER_ALIASES.description) >= 0,
            findColumnIndex(headers, HEADER_ALIASES.debit) >= 0,
            findColumnIndex(headers, HEADER_ALIASES.credit) >= 0,
            findColumnIndex(headers, HEADER_ALIASES.amount) >= 0,
            findColumnIndex(headers, HEADER_ALIASES.balance) >= 0,
            findColumnIndex(headers, HEADER_ALIASES.reference) >= 0,
        ].filter(Boolean).length;

        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    }

    return bestIndex;
}

function findColumnIndex(headers: string[], aliases: readonly string[]): number {
    const normalisedAliases = aliases.map(normaliseHeader);

    for (let headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
        const header = headers[headerIndex];
        if (!header) {
            continue;
        }

        for (const alias of normalisedAliases) {
            if (header === alias || header.includes(alias)) {
                return headerIndex;
            }
        }
    }

    return -1;
}

function parseFlexibleDate(value: string | undefined): string | null {
    const raw = sanitiseCell(value);
    if (!raw) {
        return null;
    }

    if (/^\d+(\.\d+)?$/.test(raw)) {
        const excelDate = parseExcelSerialDate(Number(raw));
        if (excelDate) {
            return excelDate;
        }
    }

    const withoutTime = raw
        .replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[APMapm]{2})?$/, "")
        .replace(/,/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const formats = [
        "dd/MM/yyyy",
        "d/M/yyyy",
        "dd-MM-yyyy",
        "d-M-yyyy",
        "dd.MM.yyyy",
        "d.M.yyyy",
        "dd/MM/yy",
        "d/M/yy",
        "dd-MM-yy",
        "d-M-yy",
        "dd.MM.yy",
        "d.M.yy",
        "dd MMM yyyy",
        "d MMM yyyy",
        "dd MMM yy",
        "d MMM yy",
        "dd-MMM-yyyy",
        "d-MMM-yyyy",
        "dd-MMM-yy",
        "d-MMM-yy",
        "yyyy-MM-dd",
        "yyyy/MM/dd",
    ];

    for (const formatString of formats) {
        const parsed = parseDate(withoutTime, formatString, new Date());
        if (isValid(parsed)) {
            return formatDate(parsed, "yyyy-MM-dd");
        }
    }

    const fallback = new Date(withoutTime);
    if (isValid(fallback)) {
        return formatDate(fallback, "yyyy-MM-dd");
    }

    return null;
}

function parseExcelSerialDate(value: number): string | null {
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }

    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + Math.round(value * 86400000));

    return isValid(parsed) ? formatDate(parsed, "yyyy-MM-dd") : null;
}

function parseSignedAmount(value: string | undefined): number {
    const raw = sanitiseCell(value);
    if (!raw) {
        return 0;
    }

    const hasParentheses = raw.includes("(") && raw.includes(")");
    const isNegative = hasParentheses || /^-/.test(raw);
    const cleaned = raw
        .replace(/[₹$€£,\s]/g, "")
        .replace(/[()]/g, "")
        .replace(/(dr|cr)$/i, "")
        .replace(/^(dr|cr)/i, "");

    const numericValue = Number.parseFloat(cleaned);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return isNegative ? -Math.abs(numericValue) : numericValue;
}

async function parseXlsxWorksheet(arrayBuffer: ArrayBuffer): Promise<string[][]> {
    const entries = await unzipEntries(arrayBuffer);
    const workbookXml = entries.get("xl/workbook.xml");
    if (!workbookXml) {
        throw new Error("Could not read the Excel workbook.");
    }

    const workbookDoc = parseXml(workbookXml);
    const firstSheet = workbookDoc.getElementsByTagName("sheet")[0];
    if (!firstSheet) {
        throw new Error("No worksheet found in the Excel file.");
    }

    const relationId = firstSheet.getAttribute("r:id");
    const workbookRelsXml = entries.get("xl/_rels/workbook.xml.rels");
    let worksheetPath = "xl/worksheets/sheet1.xml";

    if (relationId && workbookRelsXml) {
        const relsDoc = parseXml(workbookRelsXml);
        const relationships = Array.from(relsDoc.getElementsByTagName("Relationship"));
        const match = relationships.find((relationship) => relationship.getAttribute("Id") === relationId);
        const target = match?.getAttribute("Target");
        if (target) {
            worksheetPath = resolveWorkbookPath(target);
        }
    }

    const worksheetXml = entries.get(worksheetPath);
    if (!worksheetXml) {
        throw new Error("Could not read the first worksheet in the Excel file.");
    }

    const sharedStringsXml = entries.get("xl/sharedStrings.xml");
    const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];

    return parseWorksheetRows(worksheetXml, sharedStrings);
}

function resolveWorkbookPath(target: string): string {
    const trimmedTarget = target.replace(/^\/+/, "");
    if (trimmedTarget.startsWith("xl/")) {
        return trimmedTarget;
    }
    return `xl/${trimmedTarget.replace(/^\.?\//, "")}`;
}

async function unzipEntries(arrayBuffer: ArrayBuffer): Promise<Map<string, string>> {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const directoryOffset = findZipDirectoryOffset(view);
    const entryCount = view.getUint16(directoryOffset + 10, true);
    const centralDirectoryOffset = view.getUint32(directoryOffset + 16, true);

    const entries = new Map<string, string>();
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
        if (view.getUint32(offset, true) !== 0x02014b50) {
            throw new Error("The Excel file is corrupted.");
        }

        const entry = readCentralDirectoryEntry(view, bytes, offset);
        const fileBytes = await readZipEntry(bytes, entry);
        entries.set(entry.name, new TextDecoder().decode(fileBytes));

        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        offset += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}

function findZipDirectoryOffset(view: DataView): number {
    for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            return offset;
        }
    }

    throw new Error("Could not read the Excel file structure.");
}

function readCentralDirectoryEntry(view: DataView, bytes: Uint8Array, offset: number): ZipEntry {
    const nameLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameEnd));

    return {
        name,
        compressionMethod: view.getUint16(offset + 10, true),
        compressedSize: view.getUint32(offset + 20, true),
        localHeaderOffset: view.getUint32(offset + 42, true),
        uncompressedSize: view.getUint32(offset + 24, true),
    };
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = entry.localHeaderOffset;

    if (view.getUint32(offset, true) !== 0x04034b50) {
        throw new Error("The Excel worksheet data is corrupted.");
    }

    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);

    if (entry.compressionMethod === 0) {
        return compressed;
    }

    if (entry.compressionMethod === 8) {
        return inflateZipEntry(compressed, entry.uncompressedSize);
    }

    throw new Error("This Excel compression method is not supported yet. Please export as CSV.");
}

async function inflateZipEntry(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
    if (typeof DecompressionStream === "undefined") {
        throw new Error("This browser cannot read compressed Excel files. Please export the statement as CSV.");
    }

    const formats = ["deflate-raw", "deflate"];

    for (const format of formats) {
        try {
            const blobPart = toArrayBuffer(data);
            const stream = new Blob([blobPart]).stream().pipeThrough(new DecompressionStream(format as any));
            const buffer = await new Response(stream).arrayBuffer();
            const inflated = new Uint8Array(buffer);

            if (expectedSize === 0 || inflated.length === expectedSize) {
                return inflated;
            }
        } catch {
            continue;
        }
    }

    throw new Error("Could not decompress the Excel worksheet. Please export the statement as CSV.");
}

function parseXml(source: string): Document {
    return new DOMParser().parseFromString(source, "application/xml");
}

function parseSharedStrings(xml: string): string[] {
    const document = parseXml(xml);
    return Array.from(document.getElementsByTagName("si")).map((item) => item.textContent ?? "");
}

function parseWorksheetRows(xml: string, sharedStrings: string[]): string[][] {
    const document = parseXml(xml);
    const rows = Array.from(document.getElementsByTagName("row"));

    return rows.map((row) => {
        const cells = Array.from(row.getElementsByTagName("c"));
        const parsedRow: string[] = [];

        for (const cell of cells) {
            const reference = cell.getAttribute("r") ?? "";
            const columnIndex = getColumnIndexFromReference(reference);
            while (parsedRow.length < columnIndex) {
                parsedRow.push("");
            }
            parsedRow[columnIndex] = getWorksheetCellValue(cell, sharedStrings);
        }

        return trimTrailingEmptyCells(parsedRow);
    });
}

function getColumnIndexFromReference(reference: string): number {
    const letters = reference.replace(/[^A-Z]/gi, "").toUpperCase();
    if (!letters) {
        return 0;
    }

    let index = 0;
    for (let position = 0; position < letters.length; position += 1) {
        index = index * 26 + (letters.charCodeAt(position) - 64);
    }
    return index - 1;
}

function getWorksheetCellValue(cell: Element, sharedStrings: string[]): string {
    const type = cell.getAttribute("t");
    const valueNode = cell.getElementsByTagName("v")[0];
    const inlineNode = cell.getElementsByTagName("is")[0];
    const rawValue = valueNode?.textContent ?? "";

    if (type === "s") {
        return sharedStrings[Number(rawValue)] ?? "";
    }

    if (type === "inlineStr") {
        return inlineNode?.textContent ?? "";
    }

    if (type === "b") {
        return rawValue === "1" ? "TRUE" : "FALSE";
    }

    return rawValue;
}

function trimTrailingEmptyCells(row: string[]): string[] {
    let end = row.length;
    while (end > 0 && !sanitiseCell(row[end - 1])) {
        end -= 1;
    }
    return row.slice(0, end);
}

function sanitiseCell(value: string | undefined): string {
    return (value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/^\ufeff/, "")
        .trim();
}

function normaliseHeader(value: string | undefined): string {
    return sanitiseCell(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function normaliseText(value: string | undefined): string {
    return sanitiseCell(value)
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function normaliseNumber(value: number): string {
    return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function pickFirstValue(...values: (string | undefined)[]): string {
    for (const value of values) {
        const trimmed = sanitiseCell(value);
        if (trimmed) {
            return trimmed;
        }
    }
    return "";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}
