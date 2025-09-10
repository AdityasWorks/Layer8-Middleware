function convertPlainTextToMarkdown(text) {
  if (!text) return text;
  
  const lines = text.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      result.push('');
      continue;
    }
    
    // Convert emoji headers to H2
    if (line.match(/^[🔐📌💡⚠️✅❌🚀🎯📝]/)) {
      result.push(`## ${line}`);
      continue;
    }
    
    // Convert lines ending with colon to H3 (like "Open a Browser:")
    if (line.endsWith(':') && line.length < 60 && !line.includes('http') && !line.includes('@')) {
      result.push(`### ${line}`);
      continue;
    }
    
    // Convert numbered steps (1. 2. 3.) to ordered lists
    if (line.match(/^(\d+)[\.\)]\s+(.+)/)) {
      const match = line.match(/^(\d+)[\.\)]\s+(.+)/);
      result.push(`${match[1]}. ${match[2]}`);
      continue;
    }
    
    // Convert action instructions to bullet points
    if (line.match(/^(Click|Go to|Type|Follow|Enter|Open|Access|Select|Choose|Navigate|Press|Wait|Look|See|Find|Locate|Identify|Ensure|Make sure|If you|For a|A prompt|Or a|On the|In the|At the|Check|Verify|Confirm)/i)) {
      result.push(`- ${line}`);
      continue;
    }
    
    // Convert URLs to markdown links
    if (line.match(/https?:\/\/[^\s]+/)) {
      line = line.replace(/(https?:\/\/[^\s]+)/g, '[$1]($1)');
    }
    
    // Convert email addresses to code format
    if (line.includes('@') && line.includes('.')) {
      line = line.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '`$1`');
    }
    
    // Convert quoted text to bold
    if (line.match(/"[^"]+"/)) {
      line = line.replace(/"([^"]+)"/g, '**"$1"**');
    }
    
    // Convert standalone button names to bold
    if (line.match(/^(Next|Previous|Submit|Cancel|OK|Yes|No|Save|Delete|Edit|Close|Open|Start|Stop|Continue|Skip|Finish|Done)$/i)) {
      result.push(`**${line}**`);
      continue;
    }
    
    // Add as regular paragraph
    result.push(line);
  }
  
  return result.join('\n\n');
}


// Convert JSX formatters to vanilla JavaScript DOM manipulation
window.formatMessage = (text, container) => {
  if (!text) return;
  
  container.innerHTML = '';
  container.className = 'formatted-text';
  
  // CONVERT PLAIN TEXT TO MARKDOWN FIRST
  const markdownText = convertPlainTextToMarkdown(text);
  console.log("Converted to markdown:", markdownText.substring(0, 200) + "...");
  
  // Handle code blocks with triple backticks
  const parts = markdownText.split("```");
  
  if (parts.length === 1) {
    // No code blocks, just handle other markdown
    const markdownContent = formatMarkdown(markdownText);
    appendContentToContainer(markdownContent, container);
    return;
  }
  
  parts.forEach((part, index) => {
    const div = document.createElement('div');
    
    if (index % 2 === 0) {
      // Regular text
      const markdownContent = formatMarkdown(part);
      appendContentToContainer(markdownContent, div);
    } else {
      // Code block
      const lines = part.split('\n');
      let language = '';
      let codeContent = part;
      
      if (lines[0] && lines[0].trim() && !lines[0].trim().includes(' ')) {
        language = lines[0].trim();
        codeContent = lines.slice(1).join('\n');
      }
      
      const pre = document.createElement('pre');
      pre.className = `code-block ${language ? `language-${language}` : ''}`;
      
      if (language) {
        const langDiv = document.createElement('div');
        langDiv.className = 'code-language';
        langDiv.textContent = language;
        pre.appendChild(langDiv);
      }
      
      const code = document.createElement('code');
      code.textContent = codeContent;
      pre.appendChild(code);
      
      div.appendChild(pre);
    }
    
    container.appendChild(div);
  });
};

const preprocessText = (text) => {
  return text.replace(/<sup>2<\/sup>/g, '²')
             .replace(/<sup>3<\/sup>/g, '³')
             .replace(/<sup>n<\/sup>/g, 'ⁿ')
             .replace(/<sup>(\d+)<\/sup>/g, (match, p1) => {
               const superscriptMap = {
                 '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
                 '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
               };
               return p1.split('').map(digit => superscriptMap[digit] || digit).join('');
             });
};

// Main function to handle markdown conversion
const formatMarkdown = (text) => {
  if (!text) return [];
  
  text = preprocessText(text);
  const { processedText, tables } = extractTables(text);
  const lines = processedText.split('\n');
  const result = [];
  
  let currentList = null;
  let listType = null;
  let blockquoteContent = [];
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Handle table placeholders
    const tablePlaceholderMatch = trimmedLine.match(/^TABLE_PLACEHOLDER_(\d+)$/);
    if (tablePlaceholderMatch) {
      const tableIndex = parseInt(tablePlaceholderMatch[1]);
      if (tables[tableIndex]) {
        finishCurrentElements();
        result.push({
          type: 'table',
          content: tables[tableIndex],
          key: `table-${i}`
        });
      }
      continue;
    }

    // Process headings
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      finishCurrentElements();
      const level = headingMatch[1].length;
      result.push({
        type: `h${level}`,
        content: formatInlineMarkdown(headingMatch[2]),
        key: `heading-${i}`
      });
      continue;
    }

    // Process horizontal rules
    if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '___') {
      finishCurrentElements();
      result.push({
        type: 'hr',
        key: `hr-${i}`
      });
      continue;
    }

    // Process blockquotes
    if (trimmedLine.startsWith('> ')) {
      inBlockquote = true;
      blockquoteContent.push(formatInlineMarkdown(trimmedLine.substring(2)));
      continue;
    } else if (inBlockquote) {
      finishBlockquote();
    }

    // Process lists
    const unorderedMatch = trimmedLine.match(/^[*•-]\s+(.*)/);
    const orderedMatch = trimmedLine.match(/^(\d+)\.\s+(.*)/);

    if (unorderedMatch || orderedMatch) {
      const newListType = unorderedMatch ? 'ul' : 'ol';

      if (!currentList || listType !== newListType) {
        if (currentList) {
          result.push(currentList);
        }
        currentList = {
          type: newListType,
          items: [],
          key: `list-${i}`
        };
        listType = newListType;
      }

      const content = unorderedMatch ? unorderedMatch[1] : orderedMatch[2];
      currentList.items.push({
        content: formatInlineMarkdown(content),
        key: `item-${i}`
      });
    } else {
      if (currentList) {
        result.push(currentList);
        currentList = null;
        listType = null;
      }

      if (trimmedLine) {
        result.push({
          type: 'p',
          content: formatInlineMarkdown(trimmedLine),
          key: `p-${i}`
        });
      } else if (i > 0 && i < lines.length - 1 && lines[i - 1].trim() && lines[i + 1].trim()) {
        result.push({
          type: 'br',
          key: `br-${i}`
        });
      }
    }

    function finishCurrentElements() {
      if (currentList) {
        result.push(currentList);
        currentList = null;
        listType = null;
      }
      if (inBlockquote) {
        finishBlockquote();
      }
    }

    function finishBlockquote() {
      if (blockquoteContent.length > 0) {
        result.push({
          type: 'blockquote',
          content: blockquoteContent,
          key: `blockquote-${i}`
        });
        blockquoteContent = [];
        inBlockquote = false;
      }
    }
  }

  // Finish any remaining elements
  if (currentList) {
    result.push(currentList);
  }
  if (inBlockquote && blockquoteContent.length > 0) {
    result.push({
      type: 'blockquote',
      content: blockquoteContent,
      key: `blockquote-end`
    });
  }

  return result;
};

// Helper function to append content array to container
const appendContentToContainer = (contentArray, container) => {
  contentArray.forEach((item) => {
    const element = createElementFromItem(item);
    if (element) {
      container.appendChild(element);
    }
  });
};

// Create DOM element from content item
const createElementFromItem = (item) => {
  if (!item) return null;

  switch (item.type) {
    case 'p':
      const p = document.createElement('p');
      appendInlineContent(item.content, p);
      return p;

    case 'br':
      return document.createElement('br');

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      const heading = document.createElement(item.type);
      heading.className = `markdown-${item.type}`;
      appendInlineContent(item.content, heading);
      return heading;

    case 'hr':
      const hr = document.createElement('hr');
      hr.className = 'markdown-hr';
      return hr;

    case 'ul':
    case 'ol':
      const list = document.createElement(item.type);
      list.className = `markdown-${item.type}`;
      item.items.forEach(listItem => {
        const li = document.createElement('li');
        appendInlineContent(listItem.content, li);
        list.appendChild(li);
      });
      return list;

    case 'blockquote':
      const blockquote = document.createElement('blockquote');
      blockquote.className = 'markdown-blockquote';
      item.content.forEach((line, index) => {
        const p = document.createElement('p');
        appendInlineContent(line, p);
        blockquote.appendChild(p);
      });
      return blockquote;

    case 'table':
      return createTableElement(item.content);

    default:
      return null;
  }
};

// Create table element
const createTableElement = (tableData) => {
  const table = document.createElement('table');
  table.className = 'markdown-table';

  if (tableData.hasHeader && tableData.headers.length > 0) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    tableData.headers.forEach((header, cellIndex) => {
      const th = document.createElement('th');
      th.className = 'markdown-th';
      th.textContent = header;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  const tbody = document.createElement('tbody');
  tableData.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.forEach((cell, cellIndex) => {
      const td = document.createElement('td');
      td.className = 'markdown-td';
      const cellContent = formatInlineMarkdown(cell);
      appendInlineContent(cellContent, td);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
};

// Process inline formatting like bold, italic, code, and superscript
const formatInlineMarkdown = (text) => {
  if (!text) return [text];

  // Handle inline code with backticks
  let parts = processInlineCode(text);
  
  // Handle bold text (**text**)
  parts = processBoldText(parts);
  
  // Handle italic text (*text*)
  parts = processItalicText(parts);

  // Handle superscript text
  parts = processSuperscriptText(parts);

  return parts;
};

// Helper function to append inline content (mix of text and elements)
const appendInlineContent = (content, element) => {
  if (!content) return;
  
  if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        element.appendChild(document.createTextNode(item));
      } else if (item && item.nodeType) {
        element.appendChild(item);
      }
    });
  } else if (typeof content === 'string') {
    element.textContent = content;
  } else if (content && content.nodeType) {
    element.appendChild(content);
  }
};

// Helper function to process superscript text
const processSuperscriptText = (parts) => {
  const processedParts = [];

  parts.forEach((part) => {
    if (typeof part === 'string') {
      // Process HTML sup tags
      const htmlSupRegex = /<sup>([^<]+)<\/sup>/g;
      
      // Process programming-style superscripts (e.g., O(n^2), log^2 n)
      const singleCaretRegex = /(\w|\))\^(\w+|\d+)/g;
      
      // Process caret-style superscripts like text^superscript^
      const caretSupRegex = /\^([^\^]+)\^/g;
      
      let processedText = part.replace(singleCaretRegex, (match, base, exp) => {
        return `${base}<sup>${exp}</sup>`;
      });
      
      let lastIndex = 0;
      let match;
      let resultParts = [];
      
      // Process HTML tags
      while ((match = htmlSupRegex.exec(processedText)) !== null) {
        if (match.index > lastIndex) {
          resultParts.push(processedText.substring(lastIndex, match.index));
        }
        const sup = document.createElement('sup');
        sup.textContent = match[1];
        resultParts.push(sup);
        lastIndex = match.index + match[0].length;
      }
      
      if (lastIndex < processedText.length) {
        resultParts.push(processedText.substring(lastIndex));
      }
      
      if (resultParts.length === 0) {
        resultParts = [processedText];
      }
      
      // Process caret-style superscripts
      const finalParts = [];
      resultParts.forEach(subPart => {
        if (typeof subPart === 'string') {
          let caretLastIndex = 0;
          let caretMatch;
          let caretParts = [];
          
          while ((caretMatch = caretSupRegex.exec(subPart)) !== null) {
            if (caretMatch.index > caretLastIndex) {
              caretParts.push(subPart.substring(caretLastIndex, caretMatch.index));
            }
            const sup = document.createElement('sup');
            sup.textContent = caretMatch[1];
            caretParts.push(sup);
            caretLastIndex = caretMatch.index + caretMatch[0].length;
          }
          
          if (caretLastIndex < subPart.length) {
            caretParts.push(subPart.substring(caretLastIndex));
          }
          
          if (caretParts.length > 0) {
            finalParts.push(...caretParts);
          } else {
            finalParts.push(subPart);
          }
        } else {
          finalParts.push(subPart);
        }
      });
      
      processedParts.push(...finalParts);
    } else {
      processedParts.push(part);
    }
  });

  return processedParts;
};

// Helper function to process inline code
const processInlineCode = (text) => {
  if (typeof text !== 'string') return [text];
  
  const codeRegex = /`([^`]+)`/g;
  let parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const code = document.createElement('code');
    code.className = 'inline-code';
    code.textContent = match[1];
    parts.push(code);

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  if (parts.length === 0) {
    parts = [text];
  }

  return parts;
};

// Helper function to process bold text
const processBoldText = (parts) => {
  const processedParts = [];

  parts.forEach((part) => {
    if (typeof part === 'string') {
      const boldRegex = /\*\*([^*]+)\*\*/g;
      let boldParts = [];
      let boldLastIndex = 0;
      let boldMatch;

      while ((boldMatch = boldRegex.exec(part)) !== null) {
        if (boldMatch.index > boldLastIndex) {
          boldParts.push(part.substring(boldLastIndex, boldMatch.index));
        }

        const strong = document.createElement('strong');
        strong.textContent = boldMatch[1];
        boldParts.push(strong);

        boldLastIndex = boldMatch.index + boldMatch[0].length;
      }

      if (boldLastIndex < part.length) {
        boldParts.push(part.substring(boldLastIndex));
      }

      if (boldParts.length === 0) {
        processedParts.push(part);
      } else {
        processedParts.push(...boldParts);
      }
    } else {
      processedParts.push(part);
    }
  });

  return processedParts;
};

// Helper function to process italic text
const processItalicText = (parts) => {
  const processedParts = [];

  parts.forEach((part) => {
    if (typeof part === 'string') {
      const italicRegex = /\*([^*]+)\*/g;
      let italicParts = [];
      let italicLastIndex = 0;
      let italicMatch;

      while ((italicMatch = italicRegex.exec(part)) !== null) {
        if (italicMatch.index > italicLastIndex) {
          italicParts.push(part.substring(italicLastIndex, italicMatch.index));
        }

        const em = document.createElement('em');
        em.textContent = italicMatch[1];
        italicParts.push(em);

        italicLastIndex = italicMatch.index + italicMatch[0].length;
      }

      if (italicLastIndex < part.length) {
        italicParts.push(part.substring(italicLastIndex));
      }

      if (italicParts.length === 0) {
        processedParts.push(part);
      } else {
        processedParts.push(...italicParts);
      }
    } else {
      processedParts.push(part);
    }
  });

  return processedParts;
};

// Function to extract tables from text
const extractTables = (text) => {
  const lines = text.split('\n');
  const tables = [];
  let processedLines = [];
  let tableLines = [];
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(line);
    } else {
      if (inTable) {
        if (tableLines.length >= 2) {
          const parsedTable = parseTable(tableLines);
          tables.push(parsedTable);
          processedLines.push(`TABLE_PLACEHOLDER_${tables.length - 1}`);
        } else {
          processedLines.push(...tableLines);
        }
        tableLines = [];
        inTable = false;
      }
      processedLines.push(lines[i]);
    }
  }
  
  if (inTable && tableLines.length >= 2) {
    const parsedTable = parseTable(tableLines);
    tables.push(parsedTable);
    processedLines.push(`TABLE_PLACEHOLDER_${tables.length - 1}`);
  } else if (inTable) {
    processedLines.push(...tableLines);
  }
  
  return {
    processedText: processedLines.join('\n'),
    tables
  };
};

// Function to parse markdown table
const parseTable = (tableRows) => {
  if (!tableRows || tableRows.length < 2) return { hasHeader: false, headers: [], rows: [] };

  const processedRows = tableRows.map(row => {
    const cells = row.split('|');
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    return cells.map(cell => cell.trim());
  });

  let hasHeader = false;
  let headerIndex = -1;
  
  for (let i = 0; i < processedRows.length; i++) {
    const isDelimiterRow = processedRows[i].every(cell => {
      return cell.match(/^[-:\s]+$/);
    });
    
    if (isDelimiterRow && i > 0) {
      hasHeader = true;
      headerIndex = i - 1;
      break;
    }
  }

  let headers = [];
  let rows = [];

  if (hasHeader && headerIndex >= 0) {
    headers = processedRows[headerIndex];
    rows = processedRows.filter((_, index) => index !== headerIndex && index !== headerIndex + 1);
  } else {
    rows = processedRows;
  }

  return { hasHeader, headers, rows };
};

// Utility functions
window.addClassNameBasedOnContent = (content) => {
  if (content.includes('```')) {
    return 'contains-code';
  }
  if (content.match(/^#+\s/m)) {
    return 'contains-headings';
  }
  if (content.match(/\*\*.*\*\*/)) {
    return 'contains-emphasis';
  }
  if (content.includes('|') && content.match(/\|[\s-:]*\|/)) {
    return 'contains-table';
  }
  return '';
};

window.getFormattedDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString();
};