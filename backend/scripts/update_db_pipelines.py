import sqlite3

conn = sqlite3.connect('rag_studio.db')
cursor = conn.cursor()
cursor.execute("UPDATE pipeline_configs SET generation_provider = 'groq', generation_model = 'qwen/qwen3.8-27b'")
conn.commit()
print("Updated pipelines:", cursor.rowcount)
for row in cursor.execute("SELECT id, name, generation_provider, generation_model FROM pipeline_configs").fetchall():
    print(row)
conn.close()
