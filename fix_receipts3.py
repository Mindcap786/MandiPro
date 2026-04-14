import re

filepath = "/Users/shauddin/Desktop/MandiPro/web/app/(main)/receipts/page.tsx"
with open(filepath, "r") as f:
    content = f.read()

pattern = r'\{\s*mode\s*\}\s*\)\s*\)\s*\}'
replacement = '{mode}\n                                    </button>\n                                ))}'

new_content = re.sub(pattern, replacement, content)

if new_content != content:
    with open(filepath, "w") as f:
        f.write(new_content)
    print("Regex fix applied.")
else:
    print("Regex pattern not matched.")
