const fs = require('fs');
const file = '/Users/shauddin/Desktop/MandiPro/web/components/inventory/quick-consignment-form.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add import
if (!content.includes('useFieldGovernance')) {
    content = content.replace(
        `import { SearchableSelect } from "@/components/ui/searchable-select"`,
        `import { SearchableSelect } from "@/components/ui/searchable-select"\nimport { useFieldGovernance } from "@/hooks/useFieldGovernance"`
    );
}

// 2. Remove notes from schema
content = content.replace(`    notes: z.string().optional(),\n`, ``);
content = content.replace(`arrival_type: "direct", less_percent: 0, less_units: 0, notes: ""`, `arrival_type: "direct", less_percent: 0, less_units: 0`);

// 3. Add hook inside component
if (!content.includes('const { isVisible, isMandatory, getLabel } = useFieldGovernance')) {
    content = content.replace(
        `    const { profile } = useAuth()`,
        `    const { profile } = useAuth()\n    const { isVisible, isMandatory, getLabel } = useFieldGovernance('arrivals_direct')`
    );
}

// 4. Update validation in onSubmit
const onSubmitStart = `    const onSubmit = async (values: FormValues) => {\n        if (!profile?.organization_id) return`;
const validationCode = `
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
content = content.replace(onSubmitStart, onSubmitStart + validationCode);

// 5. Remove 'Internal Notes' from UI and adjust grid
const notesUIStart = `                                            {/* Notes */}`;
const notesUIEnd = `                                                    )}
                                                />
                                            </div>`;

const notesStartIndex = content.indexOf(notesUIStart);
const notesEndIndex = content.indexOf(notesUIEnd) + notesUIEnd.length;

if (notesStartIndex > -1 && notesEndIndex > notesStartIndex) {
    // Remove the notes block
    content = content.substring(0, notesStartIndex) + content.substring(notesEndIndex);
}

// 6. Center the inputs in the grid by changing col-span-8 to col-span-12
content = content.replace(
    `<div className="lg:col-span-8 flex flex-col md:flex-row gap-6">`,
    `<div className="lg:col-span-12 flex flex-col md:flex-row gap-6 max-w-3xl mx-auto w-full">`
);

fs.writeFileSync(file, content, 'utf8');
console.log("Parity changes applied.");
