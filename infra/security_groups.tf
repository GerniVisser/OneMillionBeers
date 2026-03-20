# GitHub Actions IP ranges (maintained by GitHub):
# https://api.github.com/meta → .actions
# Pinned here; update when GitHub publishes new ranges.
locals {
  github_actions_cidrs = [
    "4.148.0.0/16",
    "4.175.114.51/32",
    "13.74.0.0/15",
    "20.1.0.0/16",
    "20.7.0.0/16",
    "20.20.0.0/14",
    "20.24.0.0/14",
    "20.34.0.0/15",
    "20.36.0.0/14",
    "20.40.0.0/13",
    "20.48.0.0/12",
    "20.64.0.0/10",
    "20.128.0.0/16",
    "20.200.0.0/13",
    "20.210.0.0/15",
    "20.220.0.0/14",
    "40.74.0.0/15",
    "40.80.0.0/12",
    "40.96.0.0/12",
    "40.112.0.0/13",
    "40.120.0.0/14",
    "40.124.0.0/16",
    "40.125.0.0/17",
    "51.4.0.0/15",
    "51.8.0.0/16",
    "51.10.0.0/15",
    "51.12.0.0/15",
    "51.18.0.0/16",
    "51.104.0.0/15",
    "51.107.0.0/16",
    "51.116.0.0/16",
    "51.120.0.0/16",
    "51.124.0.0/16",
    "51.132.0.0/16",
    "51.136.0.0/15",
    "51.138.0.0/16",
    "51.140.0.0/14",
    "51.144.0.0/15",
    "52.136.0.0/15",
    "52.140.0.0/14",
    "52.148.0.0/14",
    "52.152.0.0/13",
    "52.160.0.0/11",
    "52.224.0.0/11",
    "68.154.0.0/15",
    "74.241.0.0/16",
    "98.70.0.0/15",
    "158.23.0.0/16",
    "172.178.0.0/15",
    "191.232.0.0/13",
    "192.30.252.0/22",
  ]
}

# EC2 security group
resource "aws_security_group" "ec2" {
  name        = "ec2-omb"
  description = "OneMillionBeers EC2 instance"
  vpc_id      = aws_vpc.main.id

  # HTTP — redirect to HTTPS
  ingress {
    description = "HTTP public"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS — public
  ingress {
    description = "HTTPS public"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH — GitHub Actions IP ranges only
  ingress {
    description = "SSH from GitHub Actions"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = local.github_actions_cidrs
  }

  # All outbound — GHCR pulls, Let's Encrypt, S3, Telegram API, SSM endpoints
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "ec2-omb" }
}

# RDS security group — port 5432 from EC2 only
resource "aws_security_group" "rds" {
  name        = "rds-omb"
  description = "OneMillionBeers RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from EC2"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  tags = { Name = "rds-omb" }
}
