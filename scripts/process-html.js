#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Process HTML file to use minified assets
 */
function processHTML(inputFile, outputFile) {
  let content = fs.readFileSync(inputFile, 'utf8');
  
  // Replace script and style references with minified versions
  content = content
    // Replace .js with .min.js
    .replace(/src="fog-renderer\.js"/g, 'src="fog-renderer.min.js"')
    .replace(/src="details\.js"/g, 'src="details.min.js"')
    // Replace .css with .min.css
    .replace(/href="styles\.css"/g, 'href="styles.min.css"');
  
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