resource "aws_ses_domain_identity" "main" {
  domain = "onemillionbeers.co.za"
}

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

resource "aws_ses_domain_mail_from" "main" {
  domain           = aws_ses_domain_identity.main.domain
  mail_from_domain = "mail.onemillionbeers.co.za"
}
