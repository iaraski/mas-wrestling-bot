import os
import sys
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timedelta

# Add backend to path so we can import app modules
backend_dir = Path(__file__).parent / "backend"
sys.path.append(str(backend_dir))

from app.core.supabase import admin_supabase

def check_res(res, name):
    if isinstance(res.data, dict) and "code" in res.data and "message" in res.data:
        raise Exception(f"Failed to insert {name}: {res.data}")

def seed_tournament():
    if not admin_supabase:
        print("Error: admin_supabase is not initialized. Check your .env file for SUPABASE_SERVICE_ROLE_KEY.")
        return

    print("--- Seeding Test Tournament ---")

    # 1. Create Competition
    comp_id = str(uuid4())
    comp_data = {
        "id": comp_id,
        "name": "[TEST] Tournament Brackets",
        "scale": "world",
        "type": "open",
        "mandate_start_date": datetime.now().isoformat() + "Z",
        "mandate_end_date": datetime.now().isoformat() + "Z",
        "start_date": (datetime.now() + timedelta(days=1)).isoformat() + "Z",
        "end_date": (datetime.now() + timedelta(days=2)).isoformat() + "Z",
        "mats_count": 2,
        "description": "Тестовый турнир для проверки генерации сеток",
    }
    
    print(f"Creating competition {comp_id}...")
    res = admin_supabase.table("competitions").insert(comp_data).execute()
    check_res(res, "competition")

    # 2. Create Category
    cat_id = str(uuid4())
    cat_data = {
        "id": cat_id,
        "competition_id": comp_id,
        "gender": "male",
        "age_min": 18,
        "age_max": 99,
        "weight_min": 70,
        "weight_max": 80,
        "competition_day": (datetime.now() + timedelta(days=1)).isoformat() + "Z",
        "mandate_day": datetime.now().isoformat() + "Z",
    }
    print(f"Creating category {cat_id}...")
    res = admin_supabase.table("competition_categories").insert(cat_data).execute()
    check_res(res, "category")

    # 3. Create 10 fake athletes
    num_athletes = 10
    print(f"Creating {num_athletes} fake athletes and applications...")
    
    for i in range(1, num_athletes + 1):
        user_id = str(uuid4())
        email = f"test_fighter_{i}_{user_id[:8]}@test.com"
        full_name = f"Борец Тестовый {i}"
        
        # Insert user
        res = admin_supabase.table("users").insert({
            "id": user_id,
            "email": email
        }).execute()
        check_res(res, f"user {i}")
        
        # Insert profile
        res = admin_supabase.table("profiles").insert({
            "id": str(uuid4()),
            "user_id": user_id,
            "full_name": full_name
        }).execute()
        check_res(res, f"profile {i}")
        
        # Insert athlete
        athlete_id = str(uuid4())
        res = admin_supabase.table("athletes").insert({
            "id": athlete_id,
            "user_id": user_id,
            "coach_name": "Test Coach"
        }).execute()
        check_res(res, f"athlete {i}")
        
        # Insert application
        res = admin_supabase.table("applications").insert({
            "id": str(uuid4()),
            "competition_id": comp_id,
            "category_id": cat_id,
            "athlete_id": athlete_id,
            "status": "weighed",
            "draw_number": i,
            "declared_weight": 70 + (i % 10),
            "actual_weight": 70 + (i % 10),
        }).execute()
        check_res(res, f"application {i}")
        
    print(f"Successfully seeded test tournament '{comp_data['name']}' with {num_athletes} athletes!")
    print(f"Competition ID: {comp_id}")
    print(f"Category ID: {cat_id}")

if __name__ == "__main__":
    seed_tournament()
