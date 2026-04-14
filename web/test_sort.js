const legs = [
    { displayDebit: 4000, displayCredit: 0, displayLabel: 'Purchase Payment', sortIndex: 1 },
    { displayDebit: 0, displayCredit: 10000, displayLabel: 'Purchase', sortIndex: 0 }
];

const flowType = 'purchase';

legs.sort((a, b) => {
    if (flowType === 'purchase') {
        const isInvoiceA = Number(a.displayCredit) > 0 || (Number(a.displayDebit) === 0 && Number(a.displayCredit) === 0 && a.displayLabel === 'Purchase');
        const isInvoiceB = Number(b.displayCredit) > 0 || (Number(b.displayDebit) === 0 && Number(b.displayCredit) === 0 && b.displayLabel === 'Purchase');
        
        console.log(`Comparing A (${a.displayLabel}) and B (${b.displayLabel})`);
        console.log(`isInvoiceA: ${isInvoiceA}, isInvoiceB: ${isInvoiceB}`);
        
        if (isInvoiceA && !isInvoiceB) {
            console.log("returning -1");
            return -1;
        }
        if (!isInvoiceA && isInvoiceB) {
            console.log("returning 1");
            return 1;
        }
    }
    return (a.sortIndex || 0) - (b.sortIndex || 0);
});

console.log(legs.map(l => l.displayLabel));
