const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.next') && !file.includes('.git')) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
            results.push(file);
        }
    });
    return results;
}

const allFiles = walk(process.cwd());
// Build a map of lowercase path to true path
const fileMap = new Map();
allFiles.forEach(f => {
    const ext = path.extname(f);
    const withoutExt = f.slice(0, -ext.length);
    fileMap.set(f.toLowerCase(), f);
    fileMap.set(withoutExt.toLowerCase(), f);
    if (f.endsWith('index.ts') || f.endsWith('index.tsx') || f.endsWith('index.js')) {
        const withoutIndex = f.slice(0, -(ext.length + 5 || 6)).replace(/\\index$/, '');
        fileMap.set(withoutIndex.toLowerCase(), f);
    }
});

let errors = 0;
allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const importRegex = /from\s+['"]([^'"]+)['']/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        let importPath = match[1];
        if (importPath.startsWith('.') || importPath.startsWith('@/')) {
            let resolved;
            if (importPath.startsWith('@/')) {
                resolved = path.resolve(process.cwd(), importPath.substring(2));
            } else {
                resolved = path.resolve(path.dirname(file), importPath);
            }
            const lower = resolved.toLowerCase();
            // check if it exists in map, and if the case matches exactly
            // Wait, Windows path.resolve might change case of root drive, just check the suffix
            const relativeResolved = path.relative(process.cwd(), resolved).replace(/\\/g, '/');
            const relativeLower = relativeResolved.toLowerCase();

            let foundExact = false;
            let actualPath = null;
            for (let p of allFiles) {
                const relP = path.relative(process.cwd(), p).replace(/\\/g, '/');
                const ext = path.extname(relP);
                const relPNoExt = relP.slice(0, -ext.length);
                if (relP.toLowerCase() === relativeLower || relPNoExt.toLowerCase() === relativeLower || (relPNoExt + '/index').toLowerCase() === relativeLower) {
                    actualPath = relP;
                    // Check if exact match
                    if (relP === relativeResolved || relPNoExt === relativeResolved || relPNoExt + '/index' === relativeResolved) {
                        foundExact = true;
                    } else if (relativeResolved.endsWith('.js') || relativeResolved.endsWith('.ts') || relativeResolved.endsWith('.tsx') || relativeResolved.endsWith('.jsx')) {
                        if (relP === relativeResolved) foundExact = true;
                    } else {
                        // it's an import without extension, if relativeResolved perfectly matches relPNoExt, it's exact
                        if (relPNoExt === relativeResolved || relPNoExt + '/index' === relativeResolved) {
                            foundExact = true;
                        }
                    }
                    break;
                }
            }

            if (actualPath && !foundExact) {
                console.log(`CASE ERROR in ${file}:\n  Import: ${importPath}\n  Resolves to (case-sensitive): ${relativeResolved}\n  Actual file tracked: ${actualPath}`);
                errors++;
            }
        }
    }
});

if (errors === 0) {
    console.log("No case mismatches found in local imports.");
} else {
    console.log(`Found ${errors} case mismatches.`);
}
