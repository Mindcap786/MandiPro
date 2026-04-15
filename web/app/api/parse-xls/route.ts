import { NextRequest, NextResponse } from "next/server";
import { read, utils } from "xlsx";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        
        // Use SheetJS to read the file
        const workbook = read(arrayBuffer, { type: "buffer" });
        
        // Grab the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to a 2D array of strings
        const jsonRows = utils.sheet_to_json<string[]>(worksheet, {
            header: 1, // 2D array
            defval: "", // Default value for empty cells
            raw: false, // Output formatted strings
        });

        return NextResponse.json({ rows: jsonRows });
    } catch (error: any) {
        console.error("XLS Parsing error:", error);
        return NextResponse.json({ error: error.message || "Failed to parse XLS file" }, { status: 500 });
    }
}
