import { NextRequest, NextResponse } from "next/server";
const pdfParse = require("pdf-parse");;

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // @ts-ignore - pdf-parse types are missing the call signature
        const data = await pdfParse(buffer);

        return NextResponse.json({ text: data.text });
    } catch (error) {
        console.error("PDF Parsing error:", error);
        return NextResponse.json({ error: "Failed to parse PDF" }, { status: 500 });
    }
}
