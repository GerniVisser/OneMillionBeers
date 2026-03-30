output "ec2_public_ip" {
  description = "Elastic IP address of the EC2 instance — set as EC2_HOST in GitHub Secrets; DNS A record for onemillionbeers.co.za is managed by route53.tf"
  value       = aws_eip.app.public_ip
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint — use in DATABASE_URL on EC2"
  value       = aws_db_instance.postgres.endpoint
}

output "s3_bucket_name" {
  description = "Photos S3 bucket name"
  value       = aws_s3_bucket.photos.id
}

output "s3_deploy_bucket_name" {
  description = "Deploy artifacts S3 bucket name"
  value       = aws_s3_bucket.deploy.id
}
