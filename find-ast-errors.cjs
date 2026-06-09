const ts = require('typescript');
const fs = require('fs');

const fileName = 'src/pages/OratorioFeriale.tsx';
const sourceText = fs.readFileSync(fileName, 'utf8');

const sourceFile = ts.createSourceFile(
  fileName,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

let jsxStack = [];

function getLineNo(pos) {
  const { line } = ts.getLineAndCharacterOfPosition(sourceFile, pos);
  return line + 1;
}

function visit(node) {
  // Check JsxOpeningElement or JsxClosingElement
  if (ts.isJsxElement(node)) {
    const opening = node.openingElement;
    const closing = node.closingElement;
    
    const openingTag = opening.tagName.getText(sourceFile);
    const line = getLineNo(node.getStart(sourceFile));
    
    // console.log(`JsxElement <${openingTag}> on line ${line}`);
    
    // Check children
    ts.forEachChild(node, visit);
    
    return;
  }
  
  if (ts.isJsxOpeningElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const line = getLineNo(node.getStart(sourceFile));
    console.log(`Open tag <${tagName}> on line ${line}`);
  }
  
  if (ts.isJsxClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const line = getLineNo(node.getStart(sourceFile));
    console.log(`Close tag </${tagName}> on line ${line}`);
  }

  ts.forEachChild(node, visit);
}

console.log("Starting AST JSX Walk in Dashboard range (lines 3288 - 4228)...");
// We can locate the dashboard range and print all open/close events
// Let's filter visit to print within our range:
function visitWithRange(node) {
  const start = getLineNo(node.getStart(sourceFile));
  if (start >= 3288 && start <= 4240) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(sourceFile);
      const end = getLineNo(node.getEnd());
      console.log(`Element <${tag}> from line ${start} to ${end}`);
    } else if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      console.log(`Self-Closing <${tag}/> on line ${start}`);
    }
  }
  ts.forEachChild(node, visitWithRange);
}

visitWithRange(sourceFile);
