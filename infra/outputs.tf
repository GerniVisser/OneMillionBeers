output "ec2_public_ip" {
  description = "Elastic IP address of the EC2 instance — set as EC2_HOST in GitHub Secrets and as DNS A record"
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

output "ses_domain_verification_token" {
  description = "Add as a TXT record: _amazonses.gernivisser.com → this value"
  value       = aws_ses_domain_identity.main.verification_token
}

output "ses_dkim_tokens" {
  description = "Add three CNAME records: <token>._domainkey.gernivisser.com → <token>.dkim.amazonses.com"
  value       = aws_ses_domain_dkim.main.dkim_tokens
}

output "ses_mail_from_mx_record" {
  description = "Add MX record: mail.gernivisser.com → 10 feedback-smtp.us-east-1.amazonses.com"
  value       = "10 feedback-smtp.${var.aws_region}.amazonses.com"
}

output "ses_mail_from_spf_record" {
  description = "Add TXT record: mail.gernivisser.com → this value"
  value       = "v=spf1 include:amazonses.com ~all"
}
