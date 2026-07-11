import os
import shutil
import django

# Set up Django settings context
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.conf import settings
from graphrag.services.neo4j_client import Neo4jClient

def wipe_all_data():
    print("=== STARTING FULL CLEANUP ===")

    # 1. Wipe Neo4j Database
    try:
        print("Connecting to Neo4j...")
        neo4j_client = Neo4jClient()
        print("Wiping all nodes and relationships in Neo4j...")
        neo4j_client.execute_query("MATCH (n) DETACH DELETE n")
        print("✓ Neo4j database successfully wiped.")
    except Exception as e:
        print(f"✗ Failed to wipe Neo4j: {e}")

    # 2. Delete ChromaDB folder
    chroma_dir = settings.CHROMADB_DIR
    if os.path.exists(chroma_dir):
        try:
            print(f"Removing ChromaDB directory: {chroma_dir}...")
            shutil.rmtree(chroma_dir)
            print("✓ ChromaDB vectors successfully wiped.")
        except Exception as e:
            print(f"✗ Failed to delete ChromaDB folder: {e}")
    else:
        print("ChromaDB directory does not exist, skipping.")

    # 3. Delete Uploaded Documents
    media_root = settings.MEDIA_ROOT
    if os.path.exists(media_root):
        try:
            print(f"Emptying media root directory: {media_root}...")
            shutil.rmtree(media_root)
            os.makedirs(media_root, exist_ok=True)
            print("✓ Uploaded documents successfully wiped.")
        except Exception as e:
            print(f"✗ Failed to empty media root: {e}")
    else:
        print("Media root directory does not exist, skipping.")

    # 4. Delete SQLite Database file
    sqlite_db = settings.DATABASES['default'].get('NAME')
    if sqlite_db and os.path.exists(sqlite_db):
        try:
            print(f"Removing SQLite database: {sqlite_db}...")
            os.remove(sqlite_db)
            print("✓ Django SQLite database successfully wiped.")
        except Exception as e:
            print(f"✗ Failed to delete SQLite file: {e}")
    else:
        print("SQLite database file not found, skipping.")

    print("\n=== CLEANUP COMPLETE ===")
    print("To finalize the fresh start, run the migrations to rebuild your database tables:")
    print("  python manage.py migrate")
    print("=========================")

if __name__ == "__main__":
    wipe_all_data()
