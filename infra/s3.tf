resource "aws_s3_bucket" "photos" {
  bucket = "onemillionbeers-photos-prod"

  tags = { Name = "omb-photos" }
}

# Block public ACLs — access is via bucket policy only
resource "aws_s3_bucket_public_access_block" "photos" {
  bucket = aws_s3_bucket.photos.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false # policy below grants public read
  restrict_public_buckets = false
}

# Public read — photos are served directly by URL
resource "aws_s3_bucket_policy" "photos" {
  bucket = aws_s3_bucket.photos.id

  # Ensure public access block is applied before the policy
  depends_on = [aws_s3_bucket_public_access_block.photos]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.photos.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket_cors_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  cors_rule {
    allowed_methods = ["GET"]
    allowed_origins = ["https://gernivisser.com"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}

# Versioning disabled — photos are immutable
resource "aws_s3_bucket_versioning" "photos" {
  bucket = aws_s3_bucket.photos.id

  versioning_configuration {
    status = "Disabled"
  }
}
