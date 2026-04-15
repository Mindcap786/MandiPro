import fs from 'fs';
import path from 'path';

const directory = './'; // Adjust if needed

function findNakedT(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== '.next') {
                findNakedT(fullPath);
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.match(/\bt\(/) && !content.includes('useLanguage') && !content.includes('LanguageProvider') && !file.includes('translations.ts')) {
                console.log(fullPath);
            }
        }
    }
}

findNakedT(directory);
