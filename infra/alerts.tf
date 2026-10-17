# ---------------------------------------------------------------------------
# Alerting — every alarm below emails the operator through one SNS topic, on
# both ALARM and OK, so a recovery is as visible as the failure.
#
# Each alarm targets a failure that has already gone unnoticed in production:
# the site 502ing behind a stale gateway, ingestion silently dead for days, the
# backend OOM-looping, the WhatsApp session stuck needing a QR scan.
#
# Not covered: host memory and disk (needs the CloudWatch agent on the EC2) and
# TLS expiry (Route53 HTTPS checks do not validate the certificate).
# ---------------------------------------------------------------------------

# The same address the collector already sends re-auth emails to, so alerts
# have one source of truth and no address is committed to the repo.
data "aws_ssm_parameter" "alert_email" {
  name = "/omb/ALERT_EMAIL"
}

resource "aws_sns_topic" "alerts" {
  name = "omb-alerts"
}

# Email subscriptions stay "PendingConfirmation" until the link AWS sends is
# clicked; nothing is delivered before then.
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = data.aws_ssm_parameter.alert_email.value
}

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
}

# Looked up rather than referenced as aws_instance.app / aws_db_instance.postgres
# so these alarms can be applied with -target without dragging those resources
# into the plan. aws_instance.app follows the most recent Ubuntu AMI, so any plan
# that includes it proposes replacing the production host.
data "aws_instance" "app" {
  filter {
    name   = "tag:Name"
    values = ["omb-app"]
  }
  filter {
    name   = "instance-state-name"
    values = ["running"]
  }
}

data "aws_db_instance" "postgres" {
  db_instance_identifier = "omb-postgres"
}

# ---------------------------------------------------------------------------
# Site reachability — probed from outside AWS's network, end to end through
# DNS, the EIP, nginx and the upstream container.
# ---------------------------------------------------------------------------

resource "aws_route53_health_check" "api" {
  fqdn              = "onemillionbeers.co.za"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/health"
  failure_threshold = 3
  request_interval  = 30

  tags = { Name = "omb-api-health" }
}

resource "aws_route53_health_check" "frontend" {
  fqdn              = "onemillionbeers.co.za"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 30

  tags = { Name = "omb-frontend-health" }
}

resource "aws_cloudwatch_metric_alarm" "api_down" {
  alarm_name          = "omb-api-down"
  alarm_description   = "https://onemillionbeers.co.za/api/health is failing from Route53's checkers."
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.api.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "frontend_down" {
  alarm_name          = "omb-frontend-down"
  alarm_description   = "https://onemillionbeers.co.za/health is failing from Route53's checkers."
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.frontend.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# nginx logs the default combined format, so the status code is the sixth
# space-delimited field. Catches partial failure the health checks miss.
resource "aws_cloudwatch_log_metric_filter" "nginx_5xx" {
  name           = "omb-nginx-5xx"
  log_group_name = aws_cloudwatch_log_group.nginx.name
  pattern        = "[ip, ident, user, timestamp, request, status=5*, bytes, referer, agent]"

  metric_transformation {
    name          = "Nginx5xx"
    namespace     = "OMB"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "nginx_5xx" {
  alarm_name          = "omb-nginx-5xx"
  alarm_description   = "nginx served 20+ 5xx responses in each of two consecutive 5-minute windows."
  namespace           = "OMB"
  metric_name         = "Nginx5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 20
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------------------------------------------------------------------------
# Ingestion — the site can be perfectly healthy while no beer is being logged.
# That is what happened on 2026-10-03..05: nothing recorded for three days.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_metric_filter" "beers_forwarded" {
  name           = "omb-beers-forwarded"
  log_group_name = aws_cloudwatch_log_group.collector_whatsapp.name
  pattern        = "{ $.msg = \"Beer log forwarded\" }"

  metric_transformation {
    name          = "BeersForwarded"
    namespace     = "OMB"
    value         = "1"
    default_value = "0"
  }
}

# The quietest hour (~05:00 UTC) still averages ~2 beers on a slow day, so four
# consecutive empty hours is not a lull. Missing data is breaching: a collector
# that has stopped logging altogether is the failure this exists to catch.
resource "aws_cloudwatch_metric_alarm" "no_beers" {
  alarm_name          = "omb-no-beers-logged"
  alarm_description   = "No beer has been forwarded to the backend for 4 hours."
  namespace           = "OMB"
  metric_name         = "BeersForwarded"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 4
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# A photo that reached the collector but never became a beer log is lost.
resource "aws_cloudwatch_log_metric_filter" "beers_lost" {
  name           = "omb-beers-lost"
  log_group_name = aws_cloudwatch_log_group.collector_whatsapp.name
  pattern        = "{ $.msg = \"Failed to forward beer log\" || $.msg = \"Backend rejected beer log\" || $.msg = \"Failed to upload photo — discarding\" || $.msg = \"Failed to download media — discarding\" }"

  metric_transformation {
    name          = "BeersLost"
    namespace     = "OMB"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "beers_lost" {
  alarm_name          = "omb-beers-lost"
  alarm_description   = "3+ beer photos failed to download, upload or forward within 15 minutes."
  namespace           = "OMB"
  metric_name         = "BeersLost"
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# Logged for any number that is FAILED or SCAN_QR_CODE. A FAILED session is
# auto-restarted, so one occurrence can heal itself; 15 minutes means it has not.
resource "aws_cloudwatch_log_metric_filter" "whatsapp_session" {
  name           = "omb-whatsapp-session-unhealthy"
  log_group_name = aws_cloudwatch_log_group.collector_whatsapp.name
  pattern        = "{ $.msg = \"WhatsApp session requires attention\" }"

  metric_transformation {
    name          = "WhatsAppSessionUnhealthy"
    namespace     = "OMB"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "whatsapp_session" {
  alarm_name          = "omb-whatsapp-session-unhealthy"
  alarm_description   = "A WhatsApp number has been FAILED or SCAN_QR_CODE for 15 minutes. The other numbers keep ingesting; re-link it at /admin. The email names which one."
  namespace           = "OMB"
  metric_name         = "WhatsAppSessionUnhealthy"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------------------------------------------------------------------------
# Restart loops — the backend was OOM-killed 89 times before anyone noticed.
# Fastify logs one "Server listening" line per interface; matching only the
# loopback one counts each start exactly once. A deploy accounts for one.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_metric_filter" "backend_starts" {
  name           = "omb-backend-starts"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "{ $.msg = \"Server listening at http://127.0.0.1*\" }"

  metric_transformation {
    name          = "BackendStarts"
    namespace     = "OMB"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "backend_restart_loop" {
  alarm_name          = "omb-backend-restart-loop"
  alarm_description   = "Backend started 3+ times in an hour — likely OOM-killed against its mem_limit."
  namespace           = "OMB"
  metric_name         = "BackendStarts"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_log_metric_filter" "collector_starts" {
  name           = "omb-collector-starts"
  log_group_name = aws_cloudwatch_log_group.collector_whatsapp.name
  pattern        = "{ $.msg = \"Starting WhatsApp collector\" }"

  metric_transformation {
    name          = "CollectorStarts"
    namespace     = "OMB"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "collector_restart_loop" {
  alarm_name          = "omb-collector-restart-loop"
  alarm_description   = "WhatsApp collector started 3+ times in an hour — likely crashing or OOM-killed."
  namespace           = "OMB"
  metric_name         = "CollectorStarts"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------------------------------------------------------------------------
# EC2 host
# ---------------------------------------------------------------------------

# Basic monitoring reports every 5 minutes. On 2026-10-06 the instance
# reachability check failed after the host ran out of memory.
resource "aws_cloudwatch_metric_alarm" "ec2_status_check" {
  alarm_name          = "omb-ec2-status-check-failed"
  alarm_description   = "EC2 system or instance status check failing — host unreachable."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  dimensions          = { InstanceId = data.aws_instance.app.id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------------------------------------------------------------------------
# RDS
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "omb-rds-low-storage"
  alarm_description   = "RDS free storage below 2 GB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.postgres.db_instance_identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 2 * 1024 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "omb-rds-high-cpu"
  alarm_description   = "RDS CPU above 80% for 15 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.postgres.db_instance_identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# db.t4g.micro has 1 GiB; the observed weekly low is ~69 MB, so sustained time
# below 50 MB means it is swapping.
resource "aws_cloudwatch_metric_alarm" "rds_memory" {
  alarm_name          = "omb-rds-low-memory"
  alarm_description   = "RDS freeable memory below 50 MB for 15 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  dimensions          = { DBInstanceIdentifier = data.aws_db_instance.postgres.db_instance_identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 50 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------------------------------------------------------------------------
# WAHA — failures it logs that the collector cannot see.
# ---------------------------------------------------------------------------

# The login loop WhatsApp causes when it invalidates NOWEB's built-in web version.
# Plain text, unlike the filters above: WAHA's logs are not JSON.
resource "aws_cloudwatch_log_metric_filter" "waha_connection_failure" {
  name           = "omb-waha-connection-failure"
  log_group_name = aws_cloudwatch_log_group.waha.name
  pattern        = "Connection Failure"

  metric_transformation {
    name          = "WahaConnectionFailure"
    namespace     = "OMB"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "waha_connection_failure" {
  alarm_name        = "omb-waha-connection-failure"
  alarm_description = "WAHA is failing to connect to WhatsApp. If this persists it is usually a stale WhatsApp Web version; check the /omb/waha log group before restarting repeatedly."
  namespace         = "OMB"
  metric_name       = "WahaConnectionFailure"
  statistic         = "Sum"
  # A single reconnect is normal; the loop produces several.
  period              = 900
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}
