data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "omb-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# S3 access for the photos bucket
data "aws_iam_policy_document" "s3_photos" {
  statement {
    actions = [
      "s3:PutObject",
      "s3:GetObject",
    ]
    resources = ["${aws_s3_bucket.photos.arn}/*"]
  }

  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.photos.arn]
  }
}

resource "aws_iam_policy" "s3_photos" {
  name   = "omb-s3-photos"
  policy = data.aws_iam_policy_document.s3_photos.json
}

resource "aws_iam_role_policy_attachment" "s3_photos" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.s3_photos.arn
}

# SSM Parameter Store — read app secrets at boot
data "aws_iam_policy_document" "ssm_params" {
  statement {
    actions   = ["ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:${var.aws_region}:*:parameter/omb/*"]
  }
}

resource "aws_iam_policy" "ssm_params" {
  name   = "omb-ssm-params"
  policy = data.aws_iam_policy_document.ssm_params.json
}

resource "aws_iam_role_policy_attachment" "ssm_params" {
  role       = aws_iam_role.ec2.name
  policy_arn = aws_iam_policy.ssm_params.arn
}

# SSM Session Manager — operator shell access without inbound port 22
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "omb-ec2-profile"
  role = aws_iam_role.ec2.name
}
