# ---------------------------------------------------------------------------
# Route53 — DNS for onemillionbeers.co.za
#
# The hosted zone is pre-existing (domain registered in AWS Route53).
# All records are managed here; no zone is created by Terraform.
# ---------------------------------------------------------------------------

data "aws_route53_zone" "main" {
  name         = "onemillionbeers.co.za."
  private_zone = false
}

# ---------------------------------------------------------------------------
# Web records — apex and www both resolve to the EC2 Elastic IP
# nginx redirects www → apex (301)
# ---------------------------------------------------------------------------

resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "onemillionbeers.co.za"
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}

resource "aws_route53_record" "www" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.onemillionbeers.co.za"
  type    = "CNAME"
  ttl     = 300
  records = ["onemillionbeers.co.za"]
}

# ---------------------------------------------------------------------------
# SES domain verification — TXT record at _amazonses.<domain>
# ---------------------------------------------------------------------------

resource "aws_route53_record" "ses_verification" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "_amazonses.onemillionbeers.co.za"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main.verification_token]

  depends_on = [aws_ses_domain_identity.main]
}

# ---------------------------------------------------------------------------
# SES DKIM — three CNAME records, one per token
#
# count = 3 is used instead of for_each because dkim_tokens is unknown at
# plan time when the SES identity is being created or replaced.
# SES always generates exactly 3 DKIM tokens.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "ses_dkim" {
  count = 3

  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.onemillionbeers.co.za"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]

  depends_on = [aws_ses_domain_dkim.main]
}

# ---------------------------------------------------------------------------
# MAIL FROM subdomain — MX and SPF records for mail.onemillionbeers.co.za
#
# MX: directs bounce/complaint feedback to SES feedback endpoint
# SPF: authorises SES to send on behalf of this subdomain
# ---------------------------------------------------------------------------

resource "aws_route53_record" "ses_mail_from_mx" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "mail.onemillionbeers.co.za"
  type    = "MX"
  ttl     = 300
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]

  depends_on = [aws_ses_domain_mail_from.main]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "mail.onemillionbeers.co.za"
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]

  depends_on = [aws_ses_domain_mail_from.main]
}
