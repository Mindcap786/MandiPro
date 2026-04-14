const fs = require('fs');
const file = '/Users/shauddin/Desktop/MandiPro/web/components/inventory/quick-consignment-form.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Replace the single hook with three hooks
const singleHook = `    const { isVisible, isMandatory, getLabel } = useFieldGovernance('arrivals_direct')`;
const threeHooks = `
    const { isMandatory: isMandatoryDirect, getLabel: getLabelDirect } = useFieldGovernance('arrivals_direct')
    const { isMandatory: isMandatoryFarmer, getLabel: getLabelFarmer } = useFieldGovernance('arrivals_farmer')
    const { isMandatory: isMandatorySupplier, getLabel: getLabelSupplier } = useFieldGovernance('arrivals_supplier')
`;
content = content.replace(singleHook, threeHooks);

// 2. Replace the static validation logic with dynamic validation
const oldValidation = `
        // Check Mandatory Fields (Governance)
        if (isMandatory('storage_location') && !values.storage_location) {
            toast({
                title: "Incomplete Entry",
                description: \`\${getLabel('storage_location', 'Storage Location')} is required.\`,
                variant: "destructive"
            });
            form.setFocus('storage_location');
            return;
        }
`;

const newValidation = `
        // Check Mandatory Fields (Governance) per row type
        let needsLocation = false;
        let locationLabel = 'Storage Location';

        for (const row of values.rows) {
            if (row.arrival_type === 'direct' && isMandatoryDirect('storage_location')) {
                needsLocation = true; locationLabel = getLabelDirect('storage_location', 'Storage Location'); break;
            }
            if (row.arrival_type === 'commission' && isMandatoryFarmer('storage_location')) {
                needsLocation = true; locationLabel = getLabelFarmer('storage_location', 'Storage Location'); break;
            }
            if (row.arrival_type === 'commission_supplier' && isMandatorySupplier('storage_location')) {
                needsLocation = true; locationLabel = getLabelSupplier('storage_location', 'Storage Location'); break;
            }
        }

        if (needsLocation && !values.storage_location) {
            toast({
                title: "Incomplete Entry",
                description: \`\${locationLabel} is required for the selected purchase type.\`,
                variant: "destructive"
            });
            form.setFocus('storage_location');
            return;
        }
`;

// Only replace if the old validation exists exactly, otherwise try to target it conceptually
if (content.includes(oldValidation.trim())) {
    content = content.replace(oldValidation.trim(), newValidation.trim());
} else {
    // try to find it via substring
    const start = content.indexOf('// Check Mandatory Fields (Governance)');
    if (start > -1) {
        const end = content.indexOf('setIsSubmitting(true)');
        if (end > start) {
            content = content.substring(0, start) + newValidation + '\n        ' + content.substring(end);
        }
    }
}

fs.writeFileSync(file, content, 'utf8');
console.log("Governance logic fixed to check all row types.");
