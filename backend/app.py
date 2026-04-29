# app.py
# This is the main Flask web server.
# It creates API endpoints that the frontend calls to read/write data.

from flask import Flask, request, jsonify
from flask_cors import CORS
from firebase_admin import firestore, auth
from firebase_config import db
from datetime import datetime

# Create Flask app
app = Flask(__name__)

# Allow frontend (running on different port) to talk to this server
CORS(app)

# ─────────────────────────────────────────────
# HELPER: Verify the user's login token
# ─────────────────────────────────────────────
def verify_token(request):
    """
    Firebase sends a token when user logs in.
    We verify it here to make sure the request is from a real user.
    """
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return None
    try:
        decoded = auth.verify_id_token(token)
        return decoded["uid"]  # Return the user's unique ID
    except Exception:
        return None


# ─────────────────────────────────────────────
# ROUTE 1: Add a new expense
# ─────────────────────────────────────────────
@app.route("/expenses", methods=["POST"])
def add_expense():
    """
    Frontend sends expense data here.
    We save it to Firestore under the user's ID.
    """
    uid = verify_token(request)
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json  # Get data sent from frontend

    # Validate required fields
    if not data.get("amount") or not data.get("category"):
        return jsonify({"error": "Amount and category are required"}), 400

    # Build the expense document
    expense = {
        "title":       data.get("title", "Untitled"),
        "amount":      float(data["amount"]),
        "category":    data["category"],
        "date":        data.get("date", datetime.now().strftime("%Y-%m-%d")),
        "note":        data.get("note", ""),
        "created_at":  firestore.SERVER_TIMESTAMP,  # Auto timestamp
    }

    # Save to Firestore: users → {uid} → expenses → {auto-id}
    doc_ref = db.collection("users").document(uid).collection("expenses").add(expense)
    
    return jsonify({"message": "Expense added!", "id": doc_ref[1].id}), 201


# ─────────────────────────────────────────────
# ROUTE 2: Get all expenses for the logged-in user
# ─────────────────────────────────────────────
@app.route("/expenses", methods=["GET"])
def get_expenses():
    """
    Returns all expenses for the logged-in user.
    Optionally filter by month using ?month=2024-06
    """
    uid = verify_token(request)
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401

    month_filter = request.args.get("month")  # e.g. "2024-06"

    # Get all expense documents for this user
    expenses_ref = db.collection("users").document(uid).collection("expenses")
    docs = expenses_ref.order_by("date", direction=firestore.Query.DESCENDING).stream()

    expenses = []
    for doc in docs:
        e = doc.to_dict()
        e["id"] = doc.id  # Include document ID so we can edit/delete

        # If month filter provided, only return matching expenses
        if month_filter and not e.get("date", "").startswith(month_filter):
            continue

        # Convert Firestore timestamp to string
        if e.get("created_at"):
            e["created_at"] = str(e["created_at"])

        expenses.append(e)

    # Calculate total
    total = sum(e["amount"] for e in expenses)

    return jsonify({"expenses": expenses, "total": round(total, 2)}), 200


# ─────────────────────────────────────────────
# ROUTE 3: Update an existing expense
# ─────────────────────────────────────────────
@app.route("/expenses/<expense_id>", methods=["PUT"])
def update_expense(expense_id):
    """
    Update a specific expense by its ID.
    Only the owner can update their own expenses.
    """
    uid = verify_token(request)
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    update_data = {}

    # Only update fields that were sent
    if "title"    in data: update_data["title"]    = data["title"]
    if "amount"   in data: update_data["amount"]   = float(data["amount"])
    if "category" in data: update_data["category"] = data["category"]
    if "date"     in data: update_data["date"]     = data["date"]
    if "note"     in data: update_data["note"]     = data["note"]

    # Update in Firestore
    db.collection("users").document(uid).collection("expenses").document(expense_id).update(update_data)

    return jsonify({"message": "Expense updated!"}), 200


# ─────────────────────────────────────────────
# ROUTE 4: Delete an expense
# ─────────────────────────────────────────────
@app.route("/expenses/<expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    """
    Delete a specific expense by its ID.
    """
    uid = verify_token(request)
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401

    db.collection("users").document(uid).collection("expenses").document(expense_id).delete()

    return jsonify({"message": "Expense deleted!"}), 200


# ─────────────────────────────────────────────
# ROUTE 5: Get monthly summary (for chart)
# ─────────────────────────────────────────────
@app.route("/summary", methods=["GET"])
def get_summary():
    """
    Returns totals grouped by category for a given month.
    Used to draw the pie/bar chart on the dashboard.
    """
    uid = verify_token(request)
    if not uid:
        return jsonify({"error": "Unauthorized"}), 401

    month = request.args.get("month", datetime.now().strftime("%Y-%m"))

    docs = db.collection("users").document(uid).collection("expenses").stream()

    # Group amounts by category
    category_totals = {}
    for doc in docs:
        e = doc.to_dict()
        if e.get("date", "").startswith(month):
            cat = e.get("category", "Other")
            category_totals[cat] = category_totals.get(cat, 0) + e.get("amount", 0)

    # Round all values
    category_totals = {k: round(v, 2) for k, v in category_totals.items()}

    return jsonify({"month": month, "summary": category_totals}), 200


# Start the Flask server
if __name__ == "__main__":
    app.run(debug=True, port=5000)