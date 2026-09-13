import os

with open('README.md', 'r') as f:
    readme = f.read()

with open('flarebase.md', 'r') as f:
    flarebase = f.read()

# Extract title and badges from README.md
badges = "\n".join(readme.split('\n')[0:10])

# Extract API and AI Agent sections from README.md
api_section = "## 📚 API Endpoint Registry" + readme.split('## 📚 API Endpoint Registry')[1]

# FlareBase text, skipping the first line (since we have the title/badges)
flarebase_body = "\n".join(flarebase.split('\n')[2:])

new_readme = badges + "\n" + flarebase_body + "\n\n---\n\n" + api_section

with open('README.md', 'w') as f:
    f.write(new_readme)

print("Successfully merged!")
