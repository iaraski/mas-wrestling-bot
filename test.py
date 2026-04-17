import os
import sys
from pathlib import Path

# Add backend to path so we can import app modules
backend_dir = Path(__file__).parent / "backend"
sys.path.append(str(backend_dir))

from app.core.supabase import admin_supabase

def test():
    resp = admin_supabase.table("competitions").select("id, name").execute()
    print(resp.data)

if __name__ == "__main__":
    test()
