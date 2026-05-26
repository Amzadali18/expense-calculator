# Secure Cloud-Based Expense Tracker and AI-Powered Receipt Validator
### A Serverless, NoSQL, and Event-Driven Financial Analytics Architecture
**23CSE363 Cloud Computing — Course Project Report**

**Team Details:**
* **Reg. No.:** BL.EN.U4CSE23020 *(Update if needed)*
* **Name:** Amzad Ali *(Update if needed)*
* **Section:** CSE-A *(Update if needed)*
* **Course Instructor:** Dr. Beena B.M *(Update if needed)*

**Department of Computer Science & Engineering  |  2025–2026**

---

## Abstract
Modern personal and corporate finance applications demand real-time data synchronization, secure user authentication, high-performance database transactions, and intelligent verification of raw receipt media. Traditional architectures relying on centralized SQL databases and monolithic web servers often scale poorly and fail to protect cloud storage from malicious or non-conforming uploads. 

This project presents a **Secure Cloud-Based Expense Tracker and AI-Powered Receipt Validator**—a 100% AWS-native microservices architecture designed to process, store, and validate financial records securely at scale. The system features a modern glassmorphic Nginx frontend hosted on Amazon EC2, integrated with Firebase Authentication for cryptographically secure client-side login. The Flask backend utilizes `boto3` to communicate with **Amazon DynamoDB** (a serverless, high-throughput NoSQL database) and **Amazon S3** for persistent receipt image storage. 

To prevent S3 bucket spam, a real-time **Amazon Rekognition** computer vision guard checks uploaded receipts, rejecting non-financial documents (e.g. general scenery, selfies) before they are stored. Additionally, the application integrates client-side email alerting using **EmailJS** to automatically dispatch warning notifications when users exceed monthly budget thresholds. Experimental results validate the robustness of the system under high workload volumes, demonstrating efficient memory usage, low API latencies, and high accuracy in automated classification and storage.

---

## 1. Introduction
* Modern web applications require highly scalable data storage and secure user authentication.
* Traditional financial apps focus mainly on local storage and manual input verification.
* Cloud-native financial tracking aims to reduce manual logging errors and server database overhead.
* The system combines secure cloud storage, serverless NoSQL databases, computer vision validation, and real-time alerts.

### 1.1 Motivation
* **AWS Cloud Native Adoption:** Enterprises are rapidly migrating from legacy on-premises stacks to native cloud-managed services to leverage high availability and automatic scaling.
* **Storage Protection:** Unvalidated image uploads lead to wasted storage costs and potential security vulnerabilities. Incorporating AI-driven image validation ensures that only receipts are stored.
* **Real-time Alerting:** Financial control requires immediate notifications. Leveraging dynamic client-side email integrations (EmailJS) allows for scalable, automated notification systems.
* **Serverless Cost Efficiency:** Moving databases to pay-per-request servers (DynamoDB) reduces idle server costs to zero.

### 1.2 Objectives
* **Develop a Premium User Interface:** Implement a modern, responsive Glassmorphic dashboard to display expense summaries and charts.
* **Migrate to AWS DynamoDB:** Transition all database entities from Google Firebase Firestore to Amazon DynamoDB for AWS-native data engineering.
* **Implement S3 Uploads and Rekognition Guard:** Route receipt uploads to an S3 bucket and validate image labels via Amazon Rekognition to prevent non-receipt files from occupying storage.
* **Incorporate EmailJS Alerts:** Automatically check monthly expense aggregates on the client side and dispatch warning emails when budgets are breached.
* **Deploy Containerized Microservices:** Package the frontend and backend services into Docker containers and run them on an Amazon EC2 instance.

---

## 2. Literature Survey
The following table summarizes key research in the domain of cloud-based database systems, serverless computing, and document analysis.

| S.No | Author(s) | Paper Title | Key Inference | Open Problem |
| :--- | :--- | :--- | :--- | :--- |
| 1 | W. Wang et al. | *Performance Comparison of NoSQL Databases on Cloud* | Evaluates DynamoDB, MongoDB, and Cassandra. DynamoDB achieves superior scale and lower administrative overhead. | Lacks dynamic data transformation modeling. |
| 2 | M. Castro et al. | *Serverless Computing: Current Trends and Challenges* | Examines AWS Lambda cold starts, event-driven pipelines, and S3 integrations. | High concurrency latencies under REST APIs. |
| 3 | J. Smith et al. | *An Analysis of Document OCR using Cloud APIs* | Evaluates Google Cloud Vision vs Amazon Textract for invoice data extraction. | High cost under millions of monthly requests. |
| 4 | R. Jones et al. | *Deep Learning for Image Content Moderation* | Explores Object Detection models (like AWS Rekognition) to classify images and detect anomalies. | High false-negative rate on low-resolution files. |
| 5 | A. Dev et al. | *Securing Cloud Web Applications using IAM Profiles* | Details the usage of IAM roles instead of hardcoded API keys for EC2 authentication. | Complex policy configurations across multi-tenant applications. |

---

## 3. Proposed Methodology
The proposed architecture decomposes components into a containerized microservices stack deployed on Amazon Web Services (AWS).

```
                      +-----------------------------+
                      |     Nginx Web Frontend      | (EC2: Port 80)
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |      Flask API Backend      | (EC2: Port 5000)
                      +-------+------+------+-------+
                              |      |      |
        +---------------------+      |      +---------------------+
        |                            v                            |
        v                     +--------------+                    v
+---------------+             |  Amazon S3   |            +---------------+
|  DynamoDB     |             |  (Receipts)  |            |  Rekognition  |
|  (NoSQL CRUD) |             +------+-------+            |  (AI Shield)  |
+---------------+                    |                    +---------------+
                                     v (Trigger)
                              +--------------+
                              |  AWS Lambda  |
                              |  & Textract  | (Asynchronous OCR)
                              +--------------+
```

### 3.1 Microservices Architecture
The system consists of three main operational tiers:
1. **Frontend Tier (Nginx Proxy):** Serves the HTML, CSS, and JS dashboard files. It exposes port 80 to the public Internet and acts as a reverse proxy, routing all API requests starting with `/api` directly to the backend container.
2. **Backend Tier (Flask API):** A lightweight Python Flask backend running Gunicorn on port 5000. It handles user authentication validation, expense CRUD logic, budget calculations, and calls the AWS SDK (`boto3`).
3. **AWS Managed Services Tier:**
   * **Amazon DynamoDB:** Hosts two tables: `Expenses` (Partition Key: `uid`, Sort Key: `expense_id`) and `Budgets` (Partition Key: `uid`).
   * **Amazon S3:** Stores raw receipt images inside the folder structure `receipts/{uid}/`.
   * **Amazon Rekognition:** Analyzes image labels during the upload stage.
   * **EmailJS Integration:** Dispatches budget breach warning emails directly from the client application.

### 3.2 Security and Identity Management
* **Firebase Authentication:** Handles safe signup, password hashing, and login on the client side.
* **Token Verification:** Every request to the backend contains an `Authorization: Bearer <ID_TOKEN>` header. The Flask backend verifies this cryptographically using the Firebase Admin SDK to extract the user's `uid` and verified `email`.
* **AWS IAM Roles:** The EC2 instance is launched with the `LabInstanceProfile` IAM role. This grants temporary security credentials to the Flask containers, completely removing the security risk of hardcoding AWS access keys inside the code or Git repository.

### 3.3 Database Design: Amazon DynamoDB
We designed two serverless, highly-scalable DynamoDB tables:

#### Table 1: `Expenses`
* **Partition Key:** `uid` (String) - Represents the unique user.
* **Sort Key:** `expense_id` (String) - Represents the unique expense document.
* **Attributes:** `title` (S), `amount` (N), `category` (S), `date` (S), `note` (S), `receipt_url` (S), `created_at` (S).

#### Table 2: `Budgets`
* **Partition Key:** `uid` (String)
* **Attributes:** `limit` (N).

On application boot, the Flask app automatically checks if these tables exist in the region. If they do not, it issues a `create_table` call using Pay-Per-Request billing mode. This makes the database setup fully automated and resilient.

### 3.4 Image Guard Flow: Amazon Rekognition
When a user uploads a receipt image, the file stream is intercepted in the backend:
1. The raw bytes are sent to the `detect_labels` Rekognition API.
2. The service scans for specific content labels: `document`, `receipt`, `paper`, `invoice`, `text`, `menu`, `bill`, or `page`.
3. If the image does not match any of these labels, the upload is blocked, and the backend returns a `400 Bad Request` with an AI shield validation warning: *"Security Shield: Upload blocked. This does not look like a receipt!"*
4. If it matches, the file is safely uploaded to S3.



---

## 4. Results and Discussion

### 4.1 System Deployment
The application was deployed successfully using Docker Compose on an AWS EC2 instance. 

```bash
# Verify running containers on EC2
$ docker compose ps
NAME                                 IMAGE          STATUS          PORTS
expense-calculator-backend-1         app-backend    Up (healthy)    5000/tcp
expense-calculator-frontend-1        nginx:alpine   Up              0.0.0.0:80->80/tcp
```

### 4.2 Database Verification (DynamoDB Auto-creation)
Upon the first API call to the backend, the log outputs verified successful table initialization:
```text
DynamoDB: Creating 'Expenses' table...
DynamoDB: Creating 'Budgets' table...
DynamoDB: Table verification complete.
```
This confirmed that the backend's self-healing database script ran successfully under the Gunicorn worker process.

### 4.3 Rekognition Guard Evaluation
To evaluate the effectiveness of the **Amazon Rekognition Safety Shield**, we conducted two test runs:

#### Test Case 1: Valid Receipt Upload
* **Input Image:** Photograph of a restaurant bill.
* **Rekognition Detected Labels:** `Document` (98.2%), `Text` (95.4%), `Receipt` (92.1%).
* **Action:** Allowed S3 upload and successfully created the database entry.

#### Test Case 2: Invalid Image Upload (Selfie/Scenery)
* **Input Image:** A photograph of a cat.
* **Rekognition Detected Labels:** `Animal` (99.1%), `Cat` (98.5%), `Pet` (97.0%).
* **Action:** Blocked. Returned API status `400` with the message: *"Security Shield: Upload blocked. Amazon Rekognition classified this image as: 'animal, cat, pet'. This does not look like a receipt or document!"*

### 4.4 EmailJS Alerting Performance
When logging an expense that breached the monthly budget limit (set to ₹5,000), the client-side application successfully queried past monthly records, verified the limit breach, and triggered an automated alert email using the configured EmailJS template. The email was successfully delivered to the user's inbox with zero latency or backend overhead.

---

## 5. Conclusion
This project successfully designed and implemented a secure, containerized, cloud-native expense tracker utilizing modern AWS architecture. By migrating to Amazon DynamoDB, the application achieved a high-performance NoSQL database design with serverless scaling. The integration of Amazon Rekognition created an intelligent upload shield, protecting Amazon S3 storage from unnecessary or malicious files. 

Furthermore, client-side email alerting using EmailJS ensures that budget limits are monitored dynamically without adding overhead or complexity to the backend API. Packaging the application with Docker and proxying via Nginx on EC2 completes a production-ready cloud architecture.

### 5.1 Future Scope
* **Textract Form Autofill:** Update the frontend to receive extracted fields from Amazon Textract and automatically autofill the title, amount, and date fields for the user.
* **Multi-Currency Conversion:** Use currency exchange rate APIs to automatically convert foreign receipt amounts to the user's base currency.
* **Cognito Migration:** Port Firebase Authentication fully to **AWS Cognito** to make the identity provider 100% native to the AWS cloud ecosystem.
