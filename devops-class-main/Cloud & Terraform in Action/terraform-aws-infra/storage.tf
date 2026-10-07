# =============================================================================
# STORAGE AND ACCESS
#
# An S3 bucket, plus the IAM machinery that lets the EC2 instances read it
# WITHOUT any credentials being stored on the instances.
#
# That IAM chain is the most important thing in this file:
#
#   trust policy  →  role  →  permissions policy  →  instance profile  →  EC2
#
# The instance assumes the role at boot and the SDK fetches short-lived
# credentials from the instance metadata service. Nothing long-lived is ever
# written to disk.
# =============================================================================

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

locals {
  bucket_name = "${var.bucket_prefix}-${var.environment}-${random_id.bucket_suffix.hex}"
}

# -----------------------------------------------------------------------------
# The bucket.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "assets" {
  bucket        = local.bucket_name
  force_destroy = var.force_destroy_bucket

  tags = {
    Name = local.bucket_name
    Tier = "storage"
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Four switches, all on. These override any bucket policy or ACL, so a later
# mistake cannot accidentally expose the bucket.
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# An object, so the bucket is demonstrably writable and `destroy` has to cope
# with a non-empty bucket.
resource "aws_s3_object" "index" {
  bucket       = aws_s3_bucket.assets.id
  key          = "assets/index.html"
  content_type = "text/html"

  content = <<-HTML
    <!doctype html>
    <html lang="en">
      <head><meta charset="utf-8"><title>${local.name_prefix}</title></head>
      <body>
        <h1>${local.name_prefix}</h1>
        <p>Uploaded by Terraform into ${local.bucket_name}.</p>
      </body>
    </html>
  HTML

  depends_on = [aws_s3_bucket_public_access_block.assets]
}

# =============================================================================
# IAM - how the instances read the bucket without credentials
# =============================================================================

# -----------------------------------------------------------------------------
# The TRUST policy: who is allowed to become this role.
#
# This is the half of a role that people forget. A role with a perfect
# permissions policy and no trust policy is useless, because nothing can
# assume it. Here the principal is the EC2 service itself.
#
# `aws_iam_policy_document` builds the JSON rather than embedding a heredoc -
# it is validated at plan time and a typo becomes an error rather than a
# silently broken policy.
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    sid     = "AllowEC2ToAssume"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "web" {
  name               = "${local.name_prefix}-web-role"
  description        = "Assumed by the web instances so they can read the assets bucket"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = {
    Name = "${local.name_prefix}-web-role"
  }
}

# -----------------------------------------------------------------------------
# The PERMISSIONS policy: what the role may do once assumed.
#
# Least privilege in practice - read, not write; this bucket, not every
# bucket. Note the two ARNs: the bucket itself for ListBucket, and
# `bucket/*` for GetObject. Listing only one is a classic cause of
# AccessDenied errors that look inexplicable.
# -----------------------------------------------------------------------------
data "aws_iam_policy_document" "read_assets" {
  statement {
    sid    = "ListTheBucket"
    effect = "Allow"

    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.assets.arn]
  }

  statement {
    sid    = "ReadObjects"
    effect = "Allow"

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
  }
}

resource "aws_iam_policy" "read_assets" {
  name        = "${local.name_prefix}-read-assets"
  description = "Read-only access to the assets bucket, and nothing else"
  policy      = data.aws_iam_policy_document.read_assets.json
}

resource "aws_iam_role_policy_attachment" "web_read_assets" {
  role       = aws_iam_role.web.name
  policy_arn = aws_iam_policy.read_assets.arn
}

# -----------------------------------------------------------------------------
# The instance profile: the wrapper that lets an EC2 instance wear a role.
#
# An EC2 instance cannot reference a role directly - it references an instance
# profile, which contains exactly one role. It is a piece of plumbing with no
# behaviour of its own, and forgetting it is a common first-time error.
# -----------------------------------------------------------------------------
resource "aws_iam_instance_profile" "web" {
  name = "${local.name_prefix}-web-profile"
  role = aws_iam_role.web.name
}
