const fs = require('fs');

const content = fs.readFileSync('src/pages/OratorioFeriale.tsx', 'utf8');

const lines = content.split('\n');
const startLine = 3409;
const endLine = 4225;

console.log(`Analyzing lines ${startLine} to ${endLine} for HTML tags...`);

let openTags = [];

for (let i = startLine - 1; i < endLine; i++) {
  const line = lines[i];
  const lineNo = i + 1;
  const trimmed = line.trim();
  
  // Skip comments
  if (trimmed.startsWith('{/*') || trimmed.startsWith('*') || trimmed.endsWith('*/') || trimmed.startsWith('//')) {
    continue;
  }
  
  // Clean line from Javascript logic inside attributes like {(e) => ...}
  // To keep it simple, we replace content inside quotes and inside {...} with spaces
  let cleanLine = line;
  
  // Replace anything inside quotes with spaces to avoid string tag false positives
  cleanLine = cleanLine.replace(/"[^"]*"/g, '""');
  cleanLine = cleanLine.replace(/'[^']*'/g, "''");
  cleanLine = cleanLine.replace(/`[^`]*`/g, "``");
  
  // Parse HTML tags using a state machine
  let index = 0;
  while (index < cleanLine.length) {
    if (cleanLine.charAt(index) === '<') {
      // Check if it's a comment
      if (cleanLine.substr(index, 4) === '<!--') {
        index = cleanLine.indexOf('-->', index);
        if (index === -1) break;
        index += 3;
        continue;
      }
      
      const isClosing = cleanLine.charAt(index + 1) === '/';
      const tagStartIndex = index + (isClosing ? 2 : 1);
      
      // Read tag name
      let tagEndIndex = tagStartIndex;
      while (tagEndIndex < cleanLine.length && /[a-zA-Z0-9]/.test(cleanLine.charAt(tagEndIndex))) {
        tagEndIndex++;
      }
      const tagName = cleanLine.substring(tagStartIndex, tagEndIndex);
      
      if (tagName && /^[a-z]/.test(tagName)) { // only lowercase standard HTML tags
        // Find closing bracket '>' of this tag
        const closeBracketIndex = cleanLine.indexOf('>', tagEndIndex);
        if (closeBracketIndex !== -1) {
          const isSelfClosing = cleanLine.charAt(closeBracketIndex - 1) === '/' || 
                              ['input', 'textarea', 'img', 'br', 'hr'].includes(tagName);
          
          if (!isClosing && !isSelfClosing) {
            openTags.push({ name: tagName, line: lineNo });
          } else if (isClosing) {
            if (openTags.length === 0) {
              console.warn(`[Line ${lineNo}] Found closing tag </${tagName}> but no tags are open`);
            } else {
              const last = openTags.pop();
              if (last.name !== tagName) {
                console.warn(`[Line ${lineNo}] Tag mismatch: closed </${tagName}> but expected </${last.name}> (opened on Line ${last.line})`);
              }
            }
          }
          index = closeBracketIndex + 1;
          continue;
        }
      }
    }
    index++;
  }
}

console.log(`\nRemaining open tags: ${openTags.length}`);
openTags.forEach(t => {
  console.log(`- <${t.name}> opened on Line ${t.line}`);
});
