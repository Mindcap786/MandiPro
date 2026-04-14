"use client";

// html2canvas (~250 KB) and jsPDF (~300 KB) are loaded on-demand — only
// when the user clicks Print/Export, not on initial page render.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDocumentFonts() {
    const fontFaceSet = (document as Document & {
        fonts?: {
            ready: Promise<unknown>;
        };
    }).fonts;

    if (!fontFaceSet?.ready) return;

    try {
        await fontFaceSet.ready;
    } catch {
        // Export should keep working even if the browser cannot fully resolve fonts.
    }
}

async function waitForImages(root: ParentNode) {
    const images = Array.from(root.querySelectorAll("img"));

    await Promise.all(
        images.map((img) => {
            if (img.complete) {
                return Promise.resolve();
            }

            return new Promise<void>((resolve) => {
                const done = () => resolve();
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
            });
        })
    );
}

function prepareInvoiceCloneForExport(clone: HTMLElement, renderWidth: number) {
    clone.querySelectorAll(".no-print").forEach((el) => el.remove());

    clone.style.width = `${renderWidth}px`;
    clone.style.maxWidth = "none";
    clone.style.margin = "0";
    clone.style.overflow = "visible";
    clone.style.boxShadow = "none";
    clone.style.border = "none";

    const orgName = clone.querySelector<HTMLElement>("[data-invoice-org-name]");
    if (orgName) {
        orgName.style.overflow = "visible";
        orgName.style.whiteSpace = "normal";
        orgName.style.textOverflow = "clip";
        orgName.style.lineHeight = "1.12";
        orgName.style.paddingBottom = "4px";
    }

    const title = clone.querySelector<HTMLElement>("[data-invoice-title]");
    if (title) {
        title.style.overflow = "visible";
        title.style.lineHeight = "1.08";
        title.style.paddingBottom = "6px";
    }
}

function isCanvasBlank(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;

    const sampleStepX = Math.max(1, Math.floor(canvas.width / 12));
        const sampleStepY = Math.max(1, Math.floor(canvas.height / 16));

    for (let y = 0; y < canvas.height; y += sampleStepY) {
        for (let x = 0; x < canvas.width; x += sampleStepX) {
            const pixel = context.getImageData(x, y, 1, 1).data;
            const r = pixel[0];
            const g = pixel[1];
            const b = pixel[2];
            const a = pixel[3];
            const isTransparent = a === 0;
            const isNearWhite = r > 248 && g > 248 && b > 248;

            if (!isTransparent && !isNearWhite) {
                return false;
            }
        }
    }

    return true;
}

async function renderCanvasFromElement(target: HTMLElement, renderWidth: number) {
    const renderHeight = Math.max(
        Math.ceil(target.scrollHeight || 0),
        Math.ceil(target.getBoundingClientRect().height || 0)
    );

    await waitForImages(target);
    await waitForDocumentFonts();
    await sleep(120);

    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(target, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        foreignObjectRendering: false,
        imageTimeout: 0,
        width: renderWidth,
        height: renderHeight,
        windowWidth: renderWidth,
        windowHeight: renderHeight,
        scrollX: 0,
        scrollY: -window.scrollY,
        onclone: (clonedDocument) => {
            clonedDocument.body.style.margin = "0";
            clonedDocument.body.style.background = "#ffffff";

            const clonedInvoice = clonedDocument.getElementById("invoice-print");
            if (clonedInvoice instanceof HTMLElement) {
                prepareInvoiceCloneForExport(clonedInvoice, renderWidth);
            }
        },
    });
}

async function captureInvoiceCanvas(sourceElement: HTMLElement, renderWidth: number) {
    const primaryCanvas = await renderCanvasFromElement(sourceElement, renderWidth);
    if (!isCanvasBlank(primaryCanvas)) {
        return primaryCanvas;
    }

    const fallbackWrapper = document.createElement("div");
    fallbackWrapper.style.cssText = `position:fixed;left:0;top:0;width:${renderWidth}px;padding:0;margin:0;background:white;opacity:0.01;pointer-events:none;z-index:-1;overflow:visible;`;

    const fallbackClone = sourceElement.cloneNode(true) as HTMLElement;
    prepareInvoiceCloneForExport(fallbackClone, renderWidth);
    fallbackWrapper.appendChild(fallbackClone);
    document.body.appendChild(fallbackWrapper);

    try {
        const fallbackCanvas = await renderCanvasFromElement(fallbackClone, renderWidth);
        if (isCanvasBlank(fallbackCanvas)) {
            throw new Error("Invoice capture produced a blank canvas");
        }
        return fallbackCanvas;
    } finally {
        fallbackWrapper.remove();
    }
}

export async function generateInvoicePDF(
    sale: any,
    organization: any
): Promise<Blob> {
    let sourceElement = document.getElementById("invoice-print") as HTMLElement | null;
    let offScreenRoot: { render: (node: unknown) => void; unmount: () => void } | null = null;
    let offScreenContainer: HTMLElement | null = null;

    if (!sourceElement) {
        const { default: BuyerInvoice } = await import("@/components/sales/invoice-template");
        const { createRoot } = await import("react-dom/client");
        const { LanguageProvider } = await import("@/components/i18n/language-provider");
        const React = await import("react");

        offScreenContainer = document.createElement("div");
        offScreenContainer.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;background:white;z-index:-1;";
        document.body.appendChild(offScreenContainer);

        offScreenRoot = createRoot(offScreenContainer);
        await new Promise<void>((resolve) => {
            offScreenRoot!.render(
                React.createElement(LanguageProvider, null, 
                    React.createElement(BuyerInvoice, { sale, organization })
                )
            );
            setTimeout(resolve, 800);
        });

        sourceElement = offScreenContainer.querySelector("#invoice-print") as HTMLElement | null;
    }

    if (!sourceElement) {
        throw new Error("Invoice content not found for export");
    }

    try {
        await waitForDocumentFonts();

        const renderWidth = Math.max(
            Math.ceil(sourceElement.getBoundingClientRect().width || sourceElement.scrollWidth || 0),
            800
        );

        const canvas = await captureInvoiceCanvas(sourceElement, renderWidth);
        const imageData = canvas.toDataURL("image/jpeg", 0.75);

        const { default: jsPDF } = await import("jspdf");
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imageHeight = (canvas.height * pageWidth) / canvas.width;

        pdf.addImage(imageData, "JPEG", 0, 0, pageWidth, imageHeight);

        let heightLeft = imageHeight - pageHeight;
        let page = 1;

        while (heightLeft > 0) {
            pdf.addPage();
            page += 1;
            pdf.addImage(imageData, "JPEG", 0, -(pageHeight * (page - 1)), pageWidth, imageHeight);
            heightLeft -= pageHeight;
        }

        return pdf.output("blob");
    } finally {
        offScreenRoot?.unmount();
        offScreenContainer?.remove();
    }
}
