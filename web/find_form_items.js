const fs = require('fs');

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Split by FormField
    const formFields = content.split('<FormField');

    for (let i = 1; i < formFields.length; i++) {
        const field = formFields[i];

        // Find end of FormField element.
        // It could be self closing (/>) or </FormField>
        let endIdx = -1;
        let selfClosing = field.indexOf('/>');
        let fullClosing = field.indexOf('</FormField>');

        if (selfClosing !== -1 && (fullClosing === -1 || selfClosing < fullClosing)) {
            endIdx = selfClosing;
        } else {
            endIdx = fullClosing;
        }

        if (endIdx === -1) continue;

        const fieldContent = field.substring(0, endIdx);

        if (!fieldContent.includes('<FormItem') && !fieldContent.includes('FormItem>')) {
            console.log(`Missing FormItem in ${filePath}`);
            // Print the first few lines of the fieldContent to identify it
            console.log(fieldContent.split('\n').slice(0, 5).join('\n'));
            console.log('---');
        }
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = `${dir}/${file}`;
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            checkFile(fullPath);
        }
    }
}

walkDir('./components/arrivals');
walkDir('./app/(main)/arrivals');
