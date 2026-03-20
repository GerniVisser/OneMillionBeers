variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (prod, staging)"
  type        = string
  default     = "prod"
}

variable "db_password" {
  description = "RDS master password for the omb user"
  type        = string
  sensitive   = true
}

variable "ec2_public_key" {
  description = "ED25519 public key for EC2 SSH access (content of omb-deploy.pub)"
  type        = string
}
