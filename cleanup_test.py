import os
import sys
from pathlib import Path

# Add backend to path so we can import app modules
backend_dir = Path(__file__).parent / "backend"
sys.path.append(str(backend_dir))

from app.core.supabase import admin_supabase

def cleanup_test_tournaments():
    if not admin_supabase:
        print("Error: admin_supabase is not initialized.")
        return

    print("--- Cleaning up Test Tournaments ---")
    
    # 1. Find all test competitions
    resp = admin_supabase.table("competitions").select("id").ilike("name", "%TEST%").execute()
    comps = resp.data
    
    if not comps:
        print("No test tournaments found.")
        return
        
    comp_ids = [c["id"] for c in comps]
    print(f"Found {len(comp_ids)} test competitions: {comp_ids}")
    
    for comp_id in comp_ids:
        # Get all applications for this competition to find athletes
        app_resp = admin_supabase.table("applications").select("athlete_id").eq("competition_id", comp_id).execute()
        athlete_ids = [a["athlete_id"] for a in app_resp.data] if app_resp.data else []
        
        user_ids = []
        if athlete_ids:
            # Get user IDs from athletes
            # We must chunk it or loop if it's too big, but 10-100 is fine
            for a_id in athlete_ids:
                ath_resp = admin_supabase.table("athletes").select("user_id").eq("id", a_id).execute()
                if ath_resp.data:
                    user_ids.append(ath_resp.data[0]["user_id"])
                    
        print(f"Cleaning up {len(athlete_ids)} athletes and {len(user_ids)} users...")
        
        # Delete applications
        admin_supabase.table("applications").delete().eq("competition_id", comp_id).execute()
        
        # Delete athletes
        for a_id in athlete_ids:
            admin_supabase.table("athletes").delete().eq("id", a_id).execute()
            
        # Delete profiles & users
        for u_id in user_ids:
            admin_supabase.table("profiles").delete().eq("user_id", u_id).execute()
            admin_supabase.table("users").delete().eq("id", u_id).execute()
            
        # Delete categories
        admin_supabase.table("competition_categories").delete().eq("competition_id", comp_id).execute()
        
        # Delete competition
        admin_supabase.table("competitions").delete().eq("id", comp_id).execute()
        
        print(f"Cleanup for {comp_id} completed.")

if __name__ == "__main__":
    cleanup_test_tournaments()
