# Use Python base image
FROM python:3.10-slim

# Set working directory inside container
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy all backend files
COPY . .

# Expose port 5000
EXPOSE 5000

# Run the Flask app
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]