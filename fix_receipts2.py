filepath = "/Users/shauddin/Desktop/MandiPro/web/app/(main)/receipts/page.tsx"
with open(filepath, "r") as f:
    content = f.read()

bad_str = """                                    >
                                        {mode}
                                     ))}"""

good_str = """                                    >
                                        {mode}
                                    </button>
                                ))}"""

if bad_str in content:
    content = content.replace(bad_str, good_str)
    with open(filepath, "w") as f:
        f.write(content)
    print("Direct string match fixed.")
else:
    # Try with single brace match
    if "                                     ))}" in content:
         content = content.replace("                                     ))}", "                                    </button>\n                                ))}")
         with open(filepath, "w") as f:
             f.write(content)
         print("Fallback match fixed.")
    else:
         print("Not found.")
