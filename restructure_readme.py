import os

with open('README.md', 'r') as f:
    readme = f.read()

with open('aegis.md', 'r') as f:
    aegis = f.read()

# Extract title and badges from README.md
badges = "\n".join(readme.split('\n')[0:10])

# Extract API and AI Agent sections from README.md
api_section = "## 📚 API Endpoint Registry" + readme.split('## 📚 API Endpoint Registry')[1]

# Aegis text, skipping the first line (since we have the title/badges)
aegis_body = "\n".join(aegis.split('\n')[2:])

new_readme = badges + "\n" + aegis_body + "\n\n---\n\n" + api_section

with open('README.md', 'w') as f:
    f.write(new_readme)

print("Successfully merged!")
