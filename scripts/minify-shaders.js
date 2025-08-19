#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Minifies GLSL shader code by removing comments and collapsing whitespace
 * Since we already use short variable names, we just need basic compression
 */
function minifyShader(shaderCode) {
  return shaderCode
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')
    // Remove multi-line comments  
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Collapse multiple spaces/newlines to single space
    .replace(/\s+/g, ' ')
    // Remove unnecessary spaces around punctuation
    .replace(/ ([;,{}()]) /g, '$1')
    .replace(/([;,{}()]) /g, '$1')
    .replace(/ ([;,{}()])/g, '$1')
    // Remove trailing/leading spaces
    .trim();
}

/**
 * Process a JavaScript file and minify shader template literals
 */
function processFile(inputFile, outputFile) {
  let content = fs.readFileSync(inputFile, 'utf8');
  
  // Find and replace shader template literals (VS and FS)
  content = content.replace(/(const\s+(?:VS|FS)\s*=\s*`)([^`]+)(`)/g, (match, prefix, shaderCode, suffix) => {
    const minified = minifyShader(shaderCode);
    return prefix + minified + suffix;
  });
  
  fs.writeFileSync(outputFile, content, 'utf8');
  
  // Calculate size reduction
  const originalSize = fs.statSync(inputFile).size;
  const newSize = fs.statSync(outputFile).size;
  const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);
  
  console.log(`    Shader minification complete:`);
  console.log(`      Size: ${originalSize} → ${newSize} bytes (${reduction}% reduction)`);
}

// Main execution
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node minify-shaders.js <input-file> <output-file>');
  process.exit(1);
}

const [inputFile, outputFile] = args;

if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file '${inputFile}' not found`);
  process.exit(1);
}

try {
  processFile(inputFile, outputFile);
} catch (error) {
  console.error(`Error processing file: ${error.message}`);
  process.exit(1);
}