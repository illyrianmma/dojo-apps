const fs = require('fs');
const path = require('path');

const verPath = path.join(__dirname, 'public', 'VERSION.txt');
let ver = 'NO_VERSION_FILE';
try { ver = fs.readFileSync(verPath, 'utf8').trim(); } catch {}

console.log(`[dojo] VERSION: ${ver}`);
require('./server.js');
