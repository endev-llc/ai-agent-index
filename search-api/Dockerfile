# Use an official lightweight Python image.
FROM python:3.9-slim

# Set the working directory in the container.
WORKDIR /app

# Copy requirements and install dependencies.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your API code into the container.
COPY . .

# Expose the port your API listens on (now updated to 5001).
EXPOSE 5001

# Define the command to run your API.
CMD ["python", "search_api.py"]
