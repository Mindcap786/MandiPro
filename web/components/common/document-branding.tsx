import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';

/**
 * GLOBAL BRANDING COMPONENTS
 * --------------------------
 * These components are used to inject platform-wide branding 
 * (watermarks and dynamic footers) into invoices and reports.
 */

interface WatermarkProps {
    text?: string;
    enabled?: boolean;
}

/**
 * HTML/Print Watermark
 * For use in standard React components (e.g., BuyerInvoice)
 */
export const DocumentWatermark: React.FC<WatermarkProps> = ({ text, enabled }) => {
    if (!enabled || !text) return null;

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none z-0">
            <span className="text-[120px] font-black text-slate-300/10 -rotate-45 whitespace-nowrap uppercase tracking-tighter">
                {text}
            </span>
        </div>
    );
};

/**
 * PDF Watermark
 * For use in @react-pdf/renderer documents
 */
const pdfStyles = StyleSheet.create({
    watermarkContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: -1,
        opacity: 0.1,
    },
    watermarkText: {
        fontSize: 80,
        fontWeight: 'bold',
        color: '#94a3b8',
        transform: 'rotate(-45deg)',
        textTransform: 'uppercase',
    },
    footerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 8,
        marginTop: 20,
    },
    footerText: {
        fontSize: 7,
        color: '#94a3b8',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    }
});

export const PDFWatermark: React.FC<WatermarkProps> = ({ text, enabled }) => {
    if (!enabled || !text) return null;

    return (
        <View style={pdfStyles.watermarkContainer}>
            <Text style={pdfStyles.watermarkText}>{text}</Text>
        </View>
    );
};

/**
 * Standard PDF Footer with three-part branding
 */
interface PDFFooterProps {
    presentedBy?: string;
    poweredBy?: string;
    developedBy?: string;
}

export const PDFFooter: React.FC<PDFFooterProps> = ({ presentedBy, poweredBy, developedBy }) => {
    return (
        <View style={pdfStyles.footerContainer}>
            <Text style={pdfStyles.footerText}>{presentedBy || 'Presented by MandiGrow'}</Text>
            <Text style={pdfStyles.footerText}>{poweredBy || 'Powered by MindT Corporation'}</Text>
            <Text style={pdfStyles.footerText}>{developedBy || 'Developed by MindT Solutions'}</Text>
        </View>
    );
};
