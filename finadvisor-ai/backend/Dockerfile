FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

SHELL ["/bin/sh", "-c"]
CMD uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}