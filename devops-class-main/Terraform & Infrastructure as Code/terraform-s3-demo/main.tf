# =============================================================================
# RESOURCES
#
# A bucket is not one resource. Modern AWS splits each concern - versioning,
# encryption, public access, lifecycle - into its own resource that points back
# at the bucket. It is more lines than the old all-in-one `aws_s3_bucket`, and
# it is better: each setting can be read, changed and diffed on its own.
#
# Note that nothing below declares `depends_on`. Terraform reads
# `aws_s3_bucket.demo.id` inside each resource and infers the dependency graph
# from those references. Writing the reference IS declaring the dependency.
# =============================================================================

# -----------------------------------------------------------------------------
# A random suffix.
#
# S3 bucket names are globally unique - not per account, not per region, but
# across all of AWS. "my-bucket" was taken years ago. random_id generates the
# suffix once, stores it in state, and keeps it stable across applies, so the
# bucket is not destroyed and recreated on every run.
# -----------------------------------------------------------------------------
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  # Computed once and reused, rather than repeating the expression. A `local`
  # is a named expression - unlike a variable, it cannot be overridden from
  # outside, which is exactly what you want for a derived value.
  bucket_name = "${var.bucket_prefix}-${var.environment}-${random_id.suffix.hex}"
}

# -----------------------------------------------------------------------------
# The bucket itself.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "demo" {
  bucket = local.bucket_name

  # Without this, destroying a non-empty bucket fails: AWS refuses to delete a
  # bucket that still holds objects, and Terraform will not silently empty one
  # for you. True is right for a demo, wrong for production data.
  force_destroy = var.force_destroy

  tags = {
    Name    = local.bucket_name
    Purpose = "Session 18 Terraform demo"
  }
}

# -----------------------------------------------------------------------------
# Versioning.
#
# With versioning on, an overwrite or a delete does not destroy data - it
# creates a new version and leaves the old one retrievable. This is the single
# most useful thing you can switch on for a bucket holding anything you care
# about, and it is off by default.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_versioning" "demo" {
  bucket = aws_s3_bucket.demo.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

# -----------------------------------------------------------------------------
# Encryption at rest.
#
# S3 encrypts new objects with SSE-S3 (AES-256) by default now, but declaring
# it makes the intent explicit and auditable: a reviewer can see the guarantee
# in the code instead of trusting a default that could change.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_server_side_encryption_configuration" "demo" {
  bucket = aws_s3_bucket.demo.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# -----------------------------------------------------------------------------
# Public access block.
#
# Four separate switches, all on. This is the control that would have prevented
# most of the "company leaks data in open S3 bucket" stories: it blocks public
# ACLs and public bucket policies outright, so a later mistake in a policy
# cannot expose the bucket.
#
# Defence in depth - the bucket is private anyway; this makes it hard to make
# it public by accident.
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_public_access_block" "demo" {
  bucket = aws_s3_bucket.demo.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# Lifecycle rules.
#
# Versioning keeps every old version forever unless something cleans up, and
# you pay storage on all of them. These two rules are the cleanup:
#
#   1. superseded versions are deleted after N days
#   2. failed multipart uploads - invisible in the console, still billed - are
#      aborted after 7 days
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_lifecycle_configuration" "demo" {
  # Created only against real AWS. LocalStack writes the rules correctly but
  # does not return every field the provider re-reads to confirm the write, so
  # the provider's consistency wait never converges and the apply fails after
  # three minutes. See README, Issues Faced #2, which includes the raw API
  # response proving the rules did land.
  count = var.use_localstack ? 0 : 1

  bucket = aws_s3_bucket.demo.id

  # The lifecycle configuration must be applied after versioning, or the
  # noncurrent-version rule has nothing to act on. The reference below creates
  # that ordering.
  depends_on = [aws_s3_bucket_versioning.demo]

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    # `filter {}` and `filter { prefix = "" }` both mean "every object in
    # the bucket". The explicit form is used because the provider re-reads
    # the rule after writing it and compares the two - see README, Issues
    # Faced #1.
    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# -----------------------------------------------------------------------------
# An object in the bucket.
#
# Included to prove two things at once: that the bucket is real and writable,
# and that `force_destroy = true` does its job - without it, `terraform
# destroy` would fail here because the bucket is no longer empty.
# -----------------------------------------------------------------------------
resource "aws_s3_object" "readme" {
  bucket       = aws_s3_bucket.demo.id
  key          = "hello/readme.txt"
  content_type = "text/plain"

  content = <<-TXT
    Created by Terraform.

    Bucket      : ${local.bucket_name}
    Region      : ${var.aws_region}
    Environment : ${var.environment}

    This file exists so that `terraform destroy` has to deal with a
    non-empty bucket.
  TXT

  # Without this, the object could be uploaded before the public access block
  # is in place - a brief window where the bucket is less protected than the
  # code says it is. The reference closes that window.
  depends_on = [aws_s3_bucket_public_access_block.demo]
}
