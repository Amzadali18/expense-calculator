# lambda_receipt_processor.py
# AWS Lambda Function Template
# Trigger: S3 Object Creation (ObjectCreated:*)
# Path: receipts/
# Description: Automatically processes uploaded receipts in S3 using Amazon Textract OCR.

import json
import boto3
import urllib.parse

s3_client = boto3.client('s3')
textract_client = boto3.client('textract')

def lambda_handler(event, context):
    """
    AWS Lambda Function triggered whenever a new receipt is uploaded to S3.
    It performs automated Textract analysis to log extracted text to CloudWatch logs.
    """
    # 1. Get the S3 Bucket and Object key from the triggering event
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    
    print(f"AWS Lambda Triggered: New receipt uploaded to s3://{bucket}/{key}")
    
    try:
        # 2. Call Amazon Textract to parse the receipt
        response = textract_client.analyze_expense(
            Document={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            }
        )
        
        # 3. Process Extracted Invoice/Receipt items
        print("--- Textract Extraction Summary ---")
        for expense_doc in response.get('ExpenseDocuments', []):
            # Try to find Merchant Name, Total, and Date
            merchant = "Unknown"
            total = "0.00"
            tx_date = ""
            
            for field in expense_doc.get('SummaryFields', []):
                field_type = field.get('Type', {}).get('Name', '')
                if field_type == 'VENDOR_NAME':
                    merchant = field.get('ValueDetection', {}).get('Text', 'Unknown')
                    print(f"Detected Merchant: {merchant}")
                elif field_type == 'TOTAL':
                    total = field.get('ValueDetection', {}).get('Text', '0.00')
                    print(f"Detected Total Amount: {total}")
                elif field_type == 'TRANSACTION_DATE':
                    tx_date = field.get('ValueDetection', {}).get('Text', '')
                    print(f"Detected Transaction Date: {tx_date}")
                    
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'AWS Lambda & Textract processing completed successfully!',
                'merchant': merchant,
                'total': total,
                'date': tx_date
            })
        }
    except Exception as e:
        print(f"Error executing Lambda processing: {str(e)}")
        raise e
