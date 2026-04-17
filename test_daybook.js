const group = [
    { id: "leg1", account_id: null, contact_id: "party1", credit: "0", debit: "10000", description: "Apple (A)", transaction_type: "purchase" },
    { id: "leg2", account_id: null, contact_id: "party1", credit: "10000", debit: "0", description: "Apple (A)", transaction_type: "purchase" },
    { id: "leg3", account_id: null, contact_id: "party1", credit: "0", debit: "10000", description: "Payment for Arrival ##184 (cash)", transaction_type: "purchase" },
    { id: "leg4", account_id: "cash_acc", contact_id: null, credit: "10000", debit: "0", description: "Payment to shauddin (cash)", transaction_type: "purchase", account: {name: "Cash"} }
];

const isAdvanceSettlementEntry = (entry) => {
    const description = String(entry.description || "").toLowerCase();
    return description.includes('advance paid') || 
           description.includes('advance contra') || 
           description.includes('cash paid to') ||
           description.includes('payment to ') ||
           description.includes('payment for arrival');
};

const visibleLegs = group;
const goodsLeg = visibleLegs.find(l => l.contact_id && Number(l.credit || 0) > 0 && !isAdvanceSettlementEntry(l));
const baseLeg = goodsLeg || visibleLegs.find(l => l.contact_id) || visibleLegs[0];

console.log("goodsLeg ID:", goodsLeg ? goodsLeg.id : "null");
console.log("baseLeg ID:", baseLeg ? baseLeg.id : "null");
