const fs = require('fs');
const css = fs.readFileSync('css/index.css', 'utf8');

const tableMatches = css.match(/[^\n]*table[^\n]*\{[^}]+\}/gi) || [];
console.log('Table rules found:', tableMatches.length);
tableMatches.slice(0, 10).forEach(m => console.log(m.slice(0, 100)));
