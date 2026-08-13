const fs = require('fs');
let content = fs.readFileSync('src/server.ts', 'utf8');
content = content.replace("const required = ['JWT_SECRET'] as const;", "const required = ['JWT_SECRET', 'EMAIL_HASH_PEPPER'] as const;");
content = content.replace("const secret = process.env.JWT_SECRET!;\n  if (secret.length < 32) {\n    console.error('❌ JWT_SECRET is too short. Use at least 32 characters.');\n    process.exit(1);\n  }", "const secret = process.env.JWT_SECRET!;\n  if (secret.length < 32) {\n    console.error('❌ JWT_SECRET is too short. Use at least 32 characters.');\n    process.exit(1);\n  }\n\n  const pepper = process.env.EMAIL_HASH_PEPPER!;\n  if (pepper.length < 32) {\n    console.error('❌ EMAIL_HASH_PEPPER is too short. Use at least 32 characters.');\n    process.exit(1);\n  }");
fs.writeFileSync('src/server.ts', content);
