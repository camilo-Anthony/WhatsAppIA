import fs from 'fs';
import path from 'path';

// Regex to match most common emoji characters and Unicode emoji ranges
const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0F}]/gu;

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (emojiRegex.test(content)) {
                // If the file has emojis, replace them
                const newContent = content.replace(emojiRegex, '');
                
                // Extra cleanup: replacing multiple spaces that may result from emoji removal
                const tidyContent = newContent.replace(/\[([a-zA-Z]+)\]\s{2,}/g, '[$1] ');
                
                fs.writeFileSync(fullPath, tidyContent, 'utf8');
                console.log(`Cleaned emojis from: ${fullPath}`);
            }
        }
    }
}

console.log("Starting emoji sweep in src/ directory...");
walkDir(path.join(process.cwd(), 'src'));
console.log("Done wiping emojis.");
