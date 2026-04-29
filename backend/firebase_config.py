# firebase_config.py
# This file connects our Flask app to Firebase

import firebase_admin
from firebase_admin import credentials, firestore, auth
import os
from dotenv import load_dotenv

# Load secret keys from .env file
load_dotenv()

# Get the directory where this file (firebase_config.py) lives
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def initialize_firebase():
    """
    Initialize Firebase connection.
    We use a service account key for secure server-side access.
    """
    # Check if Firebase is already initialized (avoid double-init)
    if not firebase_admin._apps:
        # Build an absolute path to serviceAccountKey.json
        # This works no matter where you run the script from
        key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")
        
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    
    # Return Firestore database instance
    return firestore.client()

# Create a global db object we can import anywhere
db = initialize_firebase()