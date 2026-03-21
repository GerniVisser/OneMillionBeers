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
