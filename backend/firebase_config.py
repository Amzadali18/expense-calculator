# firebase_config.py
# Connects Flask to Firebase — works both locally and on cloud

import firebase_admin
from firebase_admin import credentials, firestore
import os
import json

def initialize_firebase():
    if not firebase_admin._apps:
        # On Render (cloud): read from environment variable
        cred_json = os.environ.get("FIREBASE_CREDENTIALS")
        if cred_json:
            cred_dict = json.loads(cred_json)
            cred = credentials.Certificate(cred_dict)
        else:
            # On local PC: read from file
            BASE_DIR = os.path.dirname(os.path.abspath(__file__))
            key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")
            cred = credentials.Certificate(key_path)

        firebase_admin.initialize_app(cred)

    return firestore.client()

db = initialize_firebase()