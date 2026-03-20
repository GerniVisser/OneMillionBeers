resource "aws_db_subnet_group" "main" {
  name       = "omb-db-subnet-group"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = { Name = "omb-db-subnet-group" }
}

resource "aws_db_instance" "postgres" {
  identifier = "omb-postgres"

  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro"

  db_name  = "omb"
  username = "omb"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Single-AZ — Multi-AZ doubles cost; unacceptable for MVP
  multi_az            = false
  availability_zone   = "${var.aws_region}a"
  publicly_accessible = false

  allocated_storage     = 20
  max_allocated_storage = 100 # autoscale up to 100 GB
  storage_type          = "gp2"
  storage_encrypted     = true

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # Protect against accidental deletion in production
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "omb-postgres-final"

  tags = { Name = "omb-postgres" }
}
