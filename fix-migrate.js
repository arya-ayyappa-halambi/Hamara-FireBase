const fs = require('fs');
let code = fs.readFileSync('src/scripts/migrate-schema.ts', 'utf8');
code = code.replace(
  "const contextId = log.projectId ? log.projectId : 'SYSTEM';",
  "let contextId = log.projectId ? log.projectId : 'SYSTEM';\n      if (contextId !== 'SYSTEM') {\n        const projExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(contextId);\n        if (!projExists) contextId = 'SYSTEM';\n      }"
);
fs.writeFileSync('src/scripts/migrate-schema.ts', code);
