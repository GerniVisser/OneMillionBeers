# ---------------------------------------------------------------------------
# CloudFront — img.onemillionbeers.co.za in front of the photos bucket
#
# The bucket stays publicly readable: rows written before the CDN still hold
# direct S3 URLs.
# ---------------------------------------------------------------------------

locals {
  cdn_domain = "img.onemillionbeers.co.za"
}

# CloudFront only accepts certificates from us-east-1, which is var.aws_region today.
resource "aws_acm_certificate" "cdn" {
  domain_name       = local.cdn_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "omb-cdn" }
}

resource "aws_route53_record" "cdn_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 300
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "cdn" {
  certificate_arn         = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [for r in aws_route53_record.cdn_cert_validation : r.fqdn]
}

# S3 sends no Cache-Control, so the edge keeps objects for default_ttl. A revoked
# photo is purged by invalidation; 30 days bounds how long a failed purge can linger.
resource "aws_cloudfront_cache_policy" "photos" {
  name        = "omb-photos"
  min_ttl     = 0
  default_ttl = 2592000
  max_ttl     = 2592000

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# Group avatars are overwritten in place on every group sync.
resource "aws_cloudfront_cache_policy" "avatars" {
  name        = "omb-avatars"
  min_ttl     = 0
  default_ttl = 3600
  max_ttl     = 3600

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# Browser copies cannot be invalidated, so they live a day, not as long as the edge copy.
# A function, not a response headers policy: a policy also stamps the header on
# S3's 403 for a missing object, and the browser then caches the error for a day.
# CloudFront does not run viewer-response functions on origin errors.
resource "aws_cloudfront_function" "cache_control" {
  name    = "omb-photos-cache-control"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var response = event.response;
      if (response.statusCode < 400) {
        var maxAge = event.request.uri.startsWith('/group-avatars/') ? 3600 : 86400;
        response.headers['cache-control'] = { value: 'public, max-age=' + maxAge };
      }
      return response;
    }
  EOT
}

resource "aws_cloudfront_distribution" "photos" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "omb photos"
  aliases         = [local.cdn_domain]

  origin {
    origin_id   = "photos-s3"
    domain_name = aws_s3_bucket.photos.bucket_regional_domain_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "photos-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = aws_cloudfront_cache_policy.photos.id

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.cache_control.arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "group-avatars/*"
    target_origin_id       = "photos-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = aws_cloudfront_cache_policy.avatars.id

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.cache_control.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cdn.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "omb-photos-cdn" }
}

resource "aws_route53_record" "cdn" {
  for_each = toset(["A", "AAAA"])

  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.cdn_domain
  type    = each.key

  alias {
    name                   = aws_cloudfront_distribution.photos.domain_name
    zone_id                = aws_cloudfront_distribution.photos.hosted_zone_id
    evaluate_target_health = false
  }
}
