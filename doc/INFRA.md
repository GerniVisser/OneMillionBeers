# Infrastructure — OneMillionBeers MVP

## Overview

Single EC2 instance running Docker Compose (backend + frontend + collector + gateway/nginx) with managed RDS PostgreSQL and S3 for photo storage. No ECS, no EKS, no ALB — Docker Compose on EC2 preserves the existing deploy pipeline with minimal change.

**AWS region:** `us-east-1`
**Terraform state:** Remote S3 + DynamoDB locking

---

## Architecture

### Network — Custom VPC

```
VPC: 10.0.0.0/16
  ├── Public subnet A   10.0.1.0/24  (us-east-1a)  — EC2, nginx
  ├── Private subnet A  10.0.2.0/24  (us-east-1a)  — RDS primary
  └── Private subnet B  10.0.3.0/24  (us-east-1b)  — RDS subnet group (AWS requires ≥2 AZs)

Internet Gateway → attached to VPC
Route table (public):  0.0.0.0/0 → IGW
Route table (private): local only (no NAT Gateway — saves ~$32/mo)
```

No NAT Gateway. EC2 is in the public subnet with its own internet route. RDS never needs outbound internet access.

### Compute — EC2 t3.small

| Property             | Value                                                        |
| -------------------- | ------------------------------------------------------------ |
| AMI                  | Ubuntu 22.04 LTS                                             |
| Instance type        | t3.small (2 vCPU, 2 GB RAM)                                  |
| Storage              | 30 GB gp3 root volume                                        |
| Elastic IP           | Attached (free while attached; stable DNS target)            |
| IAM Instance Profile | `omb-ec2-role` — grants S3 access without static credentials |
| IMDSv2               | Enforced (prevents SSRF-via-metadata attacks)                |

All four services (backend, frontend, collector, gateway/nginx) run here via Docker Compose. Let's Encrypt via Certbot sidecar — no ALB/ACM required.

### Database — RDS PostgreSQL 16

| Property           | Value                                         |
| ------------------ | --------------------------------------------- |
| Engine             | PostgreSQL 16                                 |
| Instance class     | db.t4g.micro (Graviton ARM, ~$12.42/mo)       |
| Deployment         | Single-AZ (us-east-1a)                        |
| Storage            | 20 GB gp2, autoscale up to 100 GB             |
| Public access      | No                                            |
| Encryption at rest | Enabled (default)                             |
| Automated backups  | 7-day retention (point-in-time recovery)      |
| SSL                | Required (`?sslmode=require` in DATABASE_URL) |

Access: security group allows port 5432 from EC2 security group only.

### Object Storage — S3

| Property     | Value                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| Bucket       | `onemillionbeers-photos-prod`                                               |
| Public read  | Yes — bucket policy grants `s3:GetObject` to `*` (photos are served by URL) |
| Write access | EC2 IAM instance profile only — no static credentials                       |
| Versioning   | Disabled (photos are immutable)                                             |
| CORS         | GET allowed from `https://gernivisser.com`                                  |

### Security Groups

**sg-ec2-omb**

| Direction | Port | Source               | Reason                                      |
| --------- | ---- | -------------------- | ------------------------------------------- |
| Inbound   | 80   | 0.0.0.0/0            | HTTP → HTTPS redirect                       |
| Inbound   | 443  | 0.0.0.0/0            | Public HTTPS                                |
| Inbound   | 22   | GitHub Actions CIDRs | Deploy pipeline SSH                         |
| Outbound  | all  | 0.0.0.0/0            | GHCR pulls, Let's Encrypt, S3, Telegram API |

**Operator shell access: AWS SSM Session Manager**
No inbound port 22 for operators. SSM Session Manager provides shell access via AWS API (outbound HTTPS from EC2). Requires `AmazonSSMManagedInstanceCore` policy on EC2 role and AWS CLI + Session Manager plugin installed locally.

**sg-rds-omb**

| Direction | Port | Source     | Reason                  |
| --------- | ---- | ---------- | ----------------------- |
| Inbound   | 5432 | sg-ec2-omb | Backend connects to RDS |
| Outbound  | —    | —          | None                    |

### IAM

**Role: `omb-ec2-role`** (EC2 instance profile)

- `s3:PutObject` on `arn:aws:s3:::onemillionbeers-photos-prod/*`
- `s3:GetObject` on `arn:aws:s3:::onemillionbeers-photos-prod/*`
- `s3:ListBucket` on `arn:aws:s3:::onemillionbeers-photos-prod`
- `AmazonSSMManagedInstanceCore` managed policy (SSM Session Manager)

No IAM user for GitHub Actions — images go to GHCR (not ECR), EC2 access is via SSH key.

---

## Cost Estimate (Monthly)

| Resource             | Spec                         | Cost        |
| -------------------- | ---------------------------- | ----------- |
| EC2 t3.small         | On-demand, us-east-1         | ~$17.00     |
| EBS gp3 30 GB        | Root volume                  | ~$2.40      |
| Elastic IP           | Attached to running instance | $0.00       |
| RDS db.t4g.micro     | PostgreSQL 16, Single-AZ     | ~$12.42     |
| RDS EBS gp2 20 GB    | DB storage                   | ~$2.30      |
| S3 — photos bucket   | 10 GB photos                 | ~$0.23      |
| S3 — terraform state | KB of state files            | ~$0.00      |
| S3 requests          | 100K PUT + 1M GET            | ~$0.05      |
| DynamoDB — tf locks  | On-demand, near-zero usage   | ~$0.00      |
| Data transfer out    | ~5 GB/mo                     | ~$0.45      |
| **Total**            |                              | **~$35/mo** |

Free tier note: RDS db.t4g.micro and EC2 t3.micro are free-tier eligible for 12 months on new AWS accounts.

---

## Resilience & Failover

### What survives EC2 failure

- **RDS:** all application data safe; managed backups with 7-day point-in-time recovery
- **S3:** all photos safe; 11 nines durability

### Recovery procedure (target: <30 min)

1. Launch new EC2 from AMI snapshot (or fresh instance + user-data bootstrap)
2. Re-associate Elastic IP (DNS unchanged)
3. Restore `/opt/onemillionbeers/.env` from secure backup
4. `docker compose pull && docker compose up -d`
5. Health check passes → service restored

### AMI snapshots (recommended)

Schedule weekly AMI snapshots via AWS Backup (free tier covers 1 backup plan). Reduces recovery to: launch from AMI → re-associate EIP → done (~10 min).

### Container restart policy

All services in `docker-compose.yml` use `restart: unless-stopped`. Containers restart automatically after crash or EC2 reboot.

### SSL certificates

Certbot sidecar handles auto-renewal. Certs stored in Docker volume `certbot-certs`. Survives container restarts. Re-issue required if Elastic IP changes (DNS must point to new IP first).

---

## GitHub Actions — Deploy Integration

### GitHub Secrets (set after `terraform apply`)

| Secret        | Value                                            |
| ------------- | ------------------------------------------------ |
| `EC2_HOST`    | Elastic IP address (from Terraform output)       |
| `EC2_USER`    | `ubuntu`                                         |
| `EC2_SSH_KEY` | Private key PEM (matching key pair in Terraform) |

### Deploy flow

```
Push to main
  → CI passes (test / lint / typecheck / build)
  → Deploy workflow:
      1. Build images tagged :GIT_SHA (first 8 chars)
      2. Push to GHCR (ghcr.io/<owner>/omb-{backend,frontend,collector,gateway}:<SHA>)
      3. SSH to EC2_HOST
      4. Write .env.sha (GIT_SHA + GITHUB_REPOSITORY)
      5. docker compose pull
      6. docker compose up -d
      7. Health check: curl https://gernivisser.com/api/health
```

### Files on EC2 at /opt/onemillionbeers/

```
/opt/onemillionbeers/
  docker-compose.yml   — copied during bootstrap
  .env                 — never committed; secrets; owned by root, chmod 600
  .env.sha             — injected by deploy pipeline (GIT_SHA)
```

### Production .env

```bash
DATABASE_URL=postgres://omb:PASSWORD@<RDS_ENDPOINT>:5432/omb?sslmode=require
COLLECTOR=telegram
TELEGRAM_BOT_TOKEN=<secret>
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_PUBLIC_URL=https://onemillionbeers-photos-prod.s3.amazonaws.com
STORAGE_BUCKET=onemillionbeers-photos-prod
STORAGE_KEY=        # empty — IAM instance profile provides credentials
STORAGE_SECRET=     # empty — IAM instance profile provides credentials
STORAGE_REGION=us-east-1
ORIGIN=https://gernivisser.com
BACKEND_INTERNAL_URL=http://backend:3000
LOG_LEVEL=info
```

`STORAGE_KEY` and `STORAGE_SECRET` are intentionally empty in production. The collector's S3 client omits explicit credentials when these are empty, falling back to the AWS SDK credential chain (EC2 instance profile → IMDS).

---

## Terraform Structure

```
infra/
  providers.tf        — AWS provider, Terraform version constraints, remote state backend
  variables.tf        — aws_region, environment, db_password, ec2_public_key
  terraform.tfvars    — variable values (gitignored)
  vpc.tf              — VPC, subnets, IGW, route tables, associations
  security_groups.tf  — sg-ec2-omb, sg-rds-omb
  iam.tf              — EC2 instance profile, S3 + SSM policies
  ec2.tf              — EC2 instance, Elastic IP, key pair
  rds.tf              — DB subnet group, RDS instance
  s3.tf               — Photos bucket, bucket policy, CORS
  outputs.tf          — ec2_public_ip, rds_endpoint, s3_bucket_name
```

**Remote state:**

- Bucket: `omb-terraform-state` (versioning enabled; must exist before `terraform init`)
- DynamoDB table: `omb-terraform-locks` (partition key: `LockID`, on-demand billing)
- Both in `us-east-1`

---

## Bootstrap Sequence (First-Time Setup)

**1. AWS prerequisites**

```bash
# Create IAM user terraform-admin with AdministratorAccess
# Configure ~/.aws/credentials
```

**2. Bootstrap Terraform remote state (one-time, manual)**

```bash
aws s3api create-bucket --bucket omb-terraform-state --region us-east-1
aws s3api put-bucket-versioning --bucket omb-terraform-state \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket omb-terraform-state \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

aws dynamodb create-table --table-name omb-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

**3. SSH key pair**

```bash
ssh-keygen -t ed25519 -f omb-deploy
# Add public key to terraform.tfvars as ec2_public_key
# Store private key as GitHub Secret EC2_SSH_KEY
```

**4. Terraform**

```bash
cd infra
terraform init
terraform plan   # verify ~15 resources
terraform apply
```

**5. DNS**
Point `gernivisser.com` A record → Elastic IP (from `terraform output ec2_public_ip`).

**6. EC2 bootstrap**

```bash
ssh -i omb-deploy ubuntu@<ELASTIC_IP>
# Install Docker + compose plugin
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker ubuntu

# Create app directory
sudo mkdir -p /opt/onemillionbeers
sudo chown ubuntu:ubuntu /opt/onemillionbeers

# Copy docker-compose.yml from repo
# Create .env with production values (see above)
chmod 600 /opt/onemillionbeers/.env
```

**7. First deploy**

```bash
cd /opt/onemillionbeers
docker compose pull
docker compose up -d
```

**8. SSL**

```bash
docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  -d gernivisser.com
```

**9. GitHub Secrets**
Set `EC2_HOST` (Elastic IP), `EC2_USER` (`ubuntu`), `EC2_SSH_KEY` (private key PEM).

**10. Verify**

```bash
curl https://gernivisser.com/api/health
# → {"status":"ok"}
```

**11. First automated deploy**
Push a commit to main → GitHub Actions completes end-to-end.

---

## Verification Checklist

- [ ] `terraform plan` shows ~15 resources, no errors
- [ ] `terraform apply` completes; outputs show EC2 IP, RDS endpoint, S3 bucket name
- [ ] SSH to EC2 Elastic IP works with deploy key
- [ ] `docker compose up -d` brings all 4 containers healthy
- [ ] `curl https://gernivisser.com/api/health` → `{"status":"ok"}`
- [ ] `curl https://gernivisser.com/health` → 200
- [ ] GitHub Actions deploy completes end-to-end on test push to main
- [ ] Beer photo upload → S3 URL publicly accessible in browser
- [ ] `docker exec backend psql $DATABASE_URL -c "SELECT 1"` succeeds with SSL
