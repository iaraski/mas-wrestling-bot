import asyncio
from supabase import create_client, Client
import os

url = "https://rhretlggdljwnepngndq.supabase.co"
key = "sb_publishable_P_f3nQGstnd3dN3ykuwLAA_hEsl5B9a" # Need service role key for migrations usually, or just use python to call a quick REST API? Wait, the anon key won't work for altering tables. 

# Let's see if there's another way. Does the user have a migrations folder?
