/**
 * Utility to export an array of objects to a CSV file and trigger a download.
 * @param data Array of objects to export
 * @param filename Desired filename (e.g., 'organizations.csv')
 */
export function exportToCSV(data: any[], filename: string) {
    if (!data || data.length === 0) {
        console.warn("No data provided for export");
        return;
    }

    // 1. Extract Headers
    const headers = Object.keys(data[0]);

    // 2. Build rows
    const rows = data.map(obj => {
        return headers.map(header => {
            let val = obj[header];

            // Handle null/undefined
            if (val === null || val === undefined) val = '';

            // Handle objects/arrays (stringify)
            if (typeof val === 'object') {
                val = JSON.stringify(val);
            }

            // Escape quotes and wrap in quotes if contains comma
            const stringVal = String(val).replace(/"/g, '""');
            return stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')
                ? `"${stringVal}"`
                : stringVal;
        }).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    // 3. Create Blob and Trigger Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
