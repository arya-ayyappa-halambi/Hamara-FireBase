const fs = require('fs');
let content = fs.readFileSync('src/scripts/migrate-schema.ts', 'utf8');
content = "import dotenv from 'dotenv';\ndotenv.config();\n" + content;
fs.writeFileSync('src/scripts/migrate-schema.ts', content);
