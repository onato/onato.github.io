#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Process HTML file to use minified assets
 */
function processHTML(inputFile, outputFile) {
  let content = fs.readFileSync(inputFile, 'utf8');
  const outDir = path.dirname(outputFile);

  // Short content hash so browsers fetch a changed asset instead of a cached one
  const stamp = (file) => {
    const full = path.join(outDir, file);
    if (!fs.existsSync(full)) return file;
    const hash = crypto.createHash('md5').update(fs.readFileSync(full)).digest('hex').slice(0, 8);
    return `${file}?v=${hash}`;
  };

  // Replace script and style references with minified, stamped versions
  content = content
    .replace(/src="fog-renderer\.js"/g, `src="${stamp('fog-renderer.min.js')}"`)
    .replace(/src="details\.js"/g, `src="${stamp('details.min.js')}"`)
    .replace(/href="styles\.css"/g, `href="${stamp('styles.min.css')}"`);
  
  fs.writeFileSync(outputFile, content, 'utf8');
  
  console.log(`    Processed ${path.basename(inputFile)} → ${path.basename(outputFile)}`);
}

// Main execution
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node process-html.js <input-file> <output-file>');
  process.exit(1);
}

const [inputFile, outputFile] = args;

if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file '${inputFile}' not found`);
  process.exit(1);
}

try {
  processHTML(inputFile, outputFile);
} catch (error) {
  console.error(`Error processing file: ${error.message}`);
  process.exit(1);
}