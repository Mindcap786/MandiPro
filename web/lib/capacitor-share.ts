/**
 * Unified download + share helper that works on:
 *   • Web / desktop browsers  — anchor download + navigator.share fallback
 *   • Capacitor iOS / Android — @capacitor/filesystem + @capacitor/share
 *
 * Why: in a Capacitor WebView, `<a download>` is ignored and
 * navigator.share({ files }) silently fails. Native code must write the file
 * to the app sandbox, then hand the file URI to the native share sheet.
 */
import { isNativePlatform } from '@/lib/capacitor-utils';

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const result = reader.result as string; // data:application/pdf;base64,XXX
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.readAsDataURL(blob);
    });
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
    if (isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64 = await blobToBase64(blob);
        const write = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: Directory.Cache,
        });
        // Capacitor has no "Save to Downloads" picker — surface the system
        // share sheet instead so the user can save to Files / Drive / WhatsApp.
        await Share.share({
            title: filename,
            url: write.uri,
            dialogTitle: 'Save or share file',
        });
        return;
    }

    const isMobileWeb = typeof window !== 'undefined' && /android|iphone|ipad/i.test(navigator.userAgent);

    // Path 1: Data URI approach bypasses Android Chrome's ObjectURL UUID bug
    // This allows it to act as a proper background "download" placing it in the Downloads folder
    if (isMobileWeb) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
        return;
    }

    // Path 3: Standard Object URL for Desktop browsers
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 5000);
}

export async function shareBlob(
    blob: Blob,
    filename: string,
    opts: { title?: string; text?: string } = {},
): Promise<void> {
    if (isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64 = await blobToBase64(blob);
        const write = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: Directory.Cache,
        });
        await Share.share({
            title: opts.title ?? filename,
            text: opts.text,
            url: write.uri,
            dialogTitle: opts.title ?? 'Share',
        });
        return;
    }

    // Web path: try the Web Share API (shows native OS share sheet on macOS Safari,
    // iOS Safari, Android Chrome — AirDrop, Mail, Messages, WhatsApp, etc.)
    let fileType = blob.type;
    if (!fileType || fileType === 'application/octet-stream') {
        fileType = 'application/pdf';
    }
    const file = new File([blob], filename, { type: fileType });

    if (typeof navigator !== 'undefined' && navigator.share) {
        try {
            // Pass files — macOS Safari / iOS / Android Chrome will show the native share sheet.
            // On desktop Chrome this will throw; we catch and fall back below.
            await navigator.share({ files: [file], title: opts.title, text: opts.text });
            return;
        } catch (err: any) {
            // User dismissed the share sheet — do NOT fall through to download.
            if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') return;
            console.warn('[capacitor-share] navigator.share failed, falling back:', err);
        }
    }

    // Fallback (desktop Chrome / Firefox): download the PDF, then open the mail
    // client so the user can send it — they just need to attach the downloaded file.
    await downloadBlob(blob, filename);
    const subject = encodeURIComponent(opts.title ?? filename);
    const body = encodeURIComponent(
        (opts.text ? opts.text + '\n\n' : '') +
        `Please find the attached file: ${filename}`
    );
    // Small delay so the save dialog doesn't race with the mailto open
    setTimeout(() => {
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }, 600);
}

/**
 * Silently trigger a browser download without awaiting the save dialog.
 * Use this when you need to open another app (e.g. Mail) immediately after.
 */
export function downloadBlobSilent(blob: Blob, filename: string): void {
    const isMobileWeb = typeof window !== 'undefined' && /android/i.test(navigator.userAgent);
    
    // Android Chrome drops extensions on object URLs. Use Data URIs safely for background silent.
    if (isMobileWeb) {
        const reader = new FileReader();
        reader.onload = () => {
            const a = document.createElement('a');
            a.href = reader.result as string;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => document.body.removeChild(a), 100);
        };
        reader.readAsDataURL(blob);
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 5000);
}

/**
 * Print a PDF blob.
 * Web: opens the blob in a new tab (browser PDF viewer → Ctrl+P / ⌘+P).
 * Native: surfaces the system share sheet so the user can "Print" or save.
 */
export async function printBlob(blob: Blob, filename: string): Promise<boolean> {
    if (isNativePlatform()) {
        // Native has no browser PDF viewer — share sheet lets the user print from Files / AirPrint
        await downloadBlob(blob, filename);
        return true;
    }

    const isMobileWeb = typeof window !== 'undefined' && /android|iphone|ipad/i.test(navigator.userAgent);

    if (isMobileWeb && typeof navigator !== 'undefined' && navigator.share) {
        let fileType = blob.type || 'application/pdf';
        const file = new File([blob], filename, { type: fileType });
        try {
            // Pass files — mobile browsers will show the native share sheet.
            await navigator.share({ files: [file], title: 'Print ' + filename });
            return true;
        } catch (err: any) {
            if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') return false;
            console.warn('[capacitor-share] navigator.share failed, falling back:', err);
        }
    }

    // For all platforms, open the PDF in a new tab without auto-printing
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    
    if (win) {
        // Pop-up allowed
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        return true;
    } else {
        // Pop-up blocked or failed
        console.warn('[capacitor-share] window.open blocked, falling back to download');
        URL.revokeObjectURL(url);
        await downloadBlob(blob, filename);
        return false;
    }
}

/**
 * WhatsApp-first share: native uses the share sheet (user picks WhatsApp);
 * web opens wa.me with the text (file attachment not supported by wa.me link).
 */
export async function shareToWhatsApp(
    blob: Blob,
    filename: string,
    text: string,
): Promise<void> {
    if (isNativePlatform()) {
        await shareBlob(blob, filename, { title: filename, text });
        return;
    }
    // On web, wa.me can't attach files — download the PDF, then open WhatsApp
    // with the message so the user can attach manually.
    await downloadBlob(blob, filename);
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
}