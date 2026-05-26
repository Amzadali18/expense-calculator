# app.py
# This is the main Flask web server.
# It creates API endpoints that the frontend calls to read/write data.
# Ported fully to AWS DynamoDB, Amazon Rekognition, and Amazon SES.

import os
import uuid
import boto3
from flask import Flask, request, jsonify
from flask_cors import CORS
from firebase_admin import auth
from firebase_config import db  # Runs firebase initialization automatically
from datetime import datetime
from decimal import Decimal
from werkzeug.utils import secure_filename
from boto3.dynamodb.conditions import Key

# Create Flask app
app = Flask(__name__)

# Allow frontend to talk to this server
CORS(app)

# Initialize AWS SDK Clients (boto3 automatically uses the EC2 IAM Role's permissions)
s3_client = boto3.client('s3', region_name='us-east-1')
rekognition_client = boto3.client('rekognition', region_name='us-east-1')
dynamodb_resource = boto3.resource('dynamodb', region_name='us-east-1')

S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "my-expense-receipts-bucket")

# Define Table References
expenses_table = dynamodb_resource.Table('Expenses')
budgets_table = dynamodb_resource.Table('Budgets')


# ─────────────────────────────────────────────
# HELPER: Convert DynamoDB Decimal to JSON-friendly float/int
# ─────────────────────────────────────────────
def decimal_to_native(obj):
    if isinstance(obj, list):
        return [decimal_to_native(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: decimal_to_native(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    return obj


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
        return decoded  # Return full decoded dictionary (uid and email)
    except Exception:
        return None


# ─────────────────────────────────────────────
# ROUTE 1: Add a new expense
# ─────────────────────────────────────────────
@app.route("/expenses", methods=["POST"])
def add_expense():
    """
    Frontend sends expense data here.
    We save it to DynamoDB under the user's ID.
    """
    claims = verify_token(request)
    if not claims:
        return jsonify({"error": "Unauthorized"}), 401

    uid = claims["uid"]
    user_email = claims.get("email")
    data = request.json  # Get data sent from frontend

    # Validate required fields
    if not data.get("amount") or not data.get("category"):
        return jsonify({"error": "Amount and category are required"}), 400

    expense_id = uuid.uuid4().hex
    amount = float(data["amount"])

    # Build the expense document
    expense = {
        "uid": uid,
        "expense_id": expense_id,
        "id": expense_id,
        "title": data.get("title", "Untitled"),
        "amount": Decimal(str(amount)),
        "category": data["category"],
        "date": data.get("date", datetime.now().strftime("%Y-%m-%d")),
        "note": data.get("note", ""),
        "created_at": datetime.utcnow().isoformat()
    }
    
    if data.get("receipt_url"):
        expense["receipt_url"] = data["receipt_url"]

    # Save to DynamoDB
    expenses_table.put_item(Item=expense)


    
    return jsonify({"message": "Expense added!", "id": expense_id}), 201


# ─────────────────────────────────────────────
# ROUTE 2: Get all expenses for the logged-in user
# ─────────────────────────────────────────────
@app.route("/expenses", methods=["GET"])
def get_expenses():
    """
    Returns all expenses for the logged-in user.
    Optionally filter by month using ?month=2024-06
    """
    claims = verify_token(request)
    if not claims:
        return jsonify({"error": "Unauthorized"}), 401

    uid = claims["uid"]
    month_filter = request.args.get("month")  # e.g. "2024-06"

    # Query DynamoDB using the Partition Key
    response = expenses_table.query(
        KeyConditionExpression=Key('uid').eq(uid)
    )
    items = response.get('Items', [])

    # Filter and convert decimals for serialization
    expenses = []
    for item in items:
        item = decimal_to_native(item)
        
        # Map "id" for frontend compatibility
        if "expense_id" in item:
            item["id"] = item["expense_id"]
        
        # If month filter provided, only return matching expenses
        if month_filter and not item.get("date", "").startswith(month_filter):
            continue

        expenses.append(item)

    # Sort descending by date
    expenses.sort(key=lambda x: x.get("date", ""), reverse=True)

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
    """
    claims = verify_token(request)
    if not claims:
        return jsonify({"error": "Unauthorized"}), 401

    uid = claims["uid"]
    data = request.json
    update_data = {}

    # Only update fields that were sent
    if "title" in data: update_data["title"] = data["title"]
    if "amount" in data: update_data["amount"] = Decimal(str(data["amount"]))
    if "category" in data: update_data["category"] = data["category"]
    if "date" in data: update_data["date"] = data["date"]
    if "note" in data: update_data["note"] = data["note"]
    if "receipt_url" in data: update_data["receipt_url"] = data["receipt_url"]

    if not update_data:
        return jsonify({"message": "No changes made"}), 200

    # Dynamic DynamoDB Update Expression
    update_expr = "SET "
    expr_names = {}
    expr_values = {}
    
    for k, v in update_data.items():
        update_expr += f"#{k} = :{k}, "
        expr_names[f"#{k}"] = k
        expr_values[f":{k}"] = v
        
    update_expr = update_expr.rstrip(", ")

    expenses_table.update_item(
        Key={'uid': uid, 'expense_id': expense_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values
    )

    return jsonify({"message": "Expense updated!"}), 200


# ─────────────────────────────────────────────
# ROUTE 4: Delete an expense
# ─────────────────────────────────────────────
@app.route("/expenses/<expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    """
    Delete a specific expense by its ID.
    """
    claims = verify_token(request)
    if not claims:
        return jsonify({"error": "Unauthorized"}), 401

    uid = claims["uid"]
    expenses_table.delete_item(Key={'uid': uid, 'expense_id': expense_id})

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
    claims = verify_token(request)
    if not claims:
        return jsonify({"error": "Unauthorized"}), 401

    uid = claims["uid"]
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))

    response = expenses_table.query(
        KeyConditionExpression=Key('uid').eq(uid)
    )
    items = response.get('Items', [])

    # Group amounts by category
    category_totals = {}
    for item in items:
        if item.get("date", "").startswith(month):
            cat = item.get("category", "Other")
            category_totals[cat] = category_totals.get(cat, 0.0) + float(item.get("amount", 0.0))

    # Round all values
    category_totals = {k: round(v, 2) for k, v in category_totals.items()}

    return jsonify({"month": month, "summary": category_totals}), 200


# ─────────────────────────────────────────────
# ROUTE 6: Set custom budget limit
# ─────────────────────────────────────────────
@app.route("/budget", methods=["POST"])
def set_budget():
    """
    Save the user's custom monthly budget limit.
    """
    claims = verify_token(request)
    if not claims:
        return jsonify({"error": "Unauthorized"}), 401

    uid = claims["uid"]
    data = request.json
    limit = data.get("limit")
    if limit is None or float(limit) <= 0:
        return jsonify({"error": "Invalid budget limit"}), 400

    # Save to DynamoDB: Budgets Table
    budgets_table.put_item(Item={'uid': uid, 'limit': Decimal(str(limit))})

    return jsonify({"message": "Budget limit updated!", "limit": float(limit)}), 200


# ─────────────────────────────────────────────
# ROUTE 7: Get custom budget limit
# ─────────────────────────────────────────────
@app.route("/budget", methods=["GET"])
def get_budget():
    """
    Retrieve the user's custom monthly budget limit. Defaults to 5000.
    """
    claims = verify_token(request)
    if not claims:
        return jsonify({"error": "Unauthorized"}), 401

    uid = claims["uid"]
    response = budgets_table.get_item(Key={'uid': uid})
    limit = 5000.0
    if 'Item' in response:
        limit = float(response['Item'].get('limit', 5000.0))

    return jsonify({"limit": limit}), 200


# ─────────────────────────────────────────────
# ROUTE 8: Upload Receipt Image to S3 and verify with Rekognition
# ─────────────────────────────────────────────
@app.route("/upload-receipt", methods=["POST"])
def upload_receipt():
    claims = verify_token(request)
    if not claims:
        return jsonify({"error": "Unauthorized"}), 401

    uid = claims["uid"]

    if 'receipt' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['receipt']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file:
        file_bytes = file.read()
        file.seek(0)  # Reset pointer for S3 upload

        # ── Amazon Rekognition Safety Shield ──
        try:
            rek_response = rekognition_client.detect_labels(
                Image={'Bytes': file_bytes},
                MaxLabels=15,
                MinConfidence=55
            )
            
            # Enforce a high‑confidence 'receipt' label.
            is_valid_receipt = False
            detected_labels = []
            
            for label in rek_response.get('Labels', []):
                name = label['Name'].lower()
                confidence = label.get('Confidence', 0)
                detected_labels.append(name)
                if name == 'receipt' and confidence >= 80:
                    is_valid_receipt = True
                    break
            
            if not is_valid_receipt:
                return jsonify({
                    "error": f"Security Shield: Uploaded image not recognized as a receipt (detected: {', '.join(detected_labels)})."
                }), 400
        except Exception as re_err:
            # Fallback if Rekognition is down or disabled
            print(f"Skipping Rekognition safety check: {str(re_err)}")

        # ── S3 Upload ──
        filename = secure_filename(file.filename)
        unique_filename = f"receipts/{uid}/{uuid.uuid4().hex}_{filename}"
        
        try:
            # Upload to S3
            s3_client.upload_fileobj(
                file,
                S3_BUCKET,
                unique_filename,
                ExtraArgs={'ContentType': file.content_type, 'ACL': 'public-read'}
            )
            
            # Since Vocareum is us-east-1, we can construct the URL directly
            receipt_url = f"https://{S3_BUCKET}.s3.us-east-1.amazonaws.com/{unique_filename}"
            
            return jsonify({
                "message": "File uploaded",
                "receipt_url": receipt_url
            }), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500





# ─────────────────────────────────────────────
# Programmatic DynamoDB Setup on Startup
# ─────────────────────────────────────────────
def setup_dynamodb_tables():
    """
    Creates DynamoDB tables on startup if they don't already exist.
    Essential for seamless deployment in volatile cloud lab sessions.
    """
    client = boto3.client('dynamodb', region_name='us-east-1')
    
    # Setup Expenses Table
    try:
        client.describe_table(TableName='Expenses')
        print("DynamoDB: 'Expenses' table already exists.")
    except client.exceptions.ResourceNotFoundException:
        print("DynamoDB: Creating 'Expenses' table...")
        client.create_table(
            TableName='Expenses',
            KeySchema=[
                {'AttributeName': 'uid', 'KeyType': 'HASH'},       # User UID
                {'AttributeName': 'expense_id', 'KeyType': 'RANGE'} # Unique Expense ID
            ],
            AttributeDefinitions=[
                {'AttributeName': 'uid', 'AttributeType': 'S'},
                {'AttributeName': 'expense_id', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )

    # Setup Budgets Table
    try:
        client.describe_table(TableName='Budgets')
        print("DynamoDB: 'Budgets' table already exists.")
    except client.exceptions.ResourceNotFoundException:
        print("DynamoDB: Creating 'Budgets' table...")
        client.create_table(
            TableName='Budgets',
            KeySchema=[
                {'AttributeName': 'uid', 'KeyType': 'HASH'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'uid', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )


# Run DynamoDB auto-setup on import/startup
try:
    setup_dynamodb_tables()
except Exception as dberr:
    print(f"Failed to auto-setup DynamoDB tables: {str(dberr)}")

# Start the Flask server
if __name__ == "__main__":
    app.run(debug=True, port=5000)