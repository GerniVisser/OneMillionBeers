resource "aws_cloudwatch_log_group" "nginx" {
  name              = "/omb/nginx"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/omb/backend"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "collector_telegram" {
  name              = "/omb/collector-telegram"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "collector_whatsapp" {
  name              = "/omb/collector-whatsapp"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "waha" {
  name              = "/omb/waha"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/omb/frontend"
  retention_in_days = 14
}
