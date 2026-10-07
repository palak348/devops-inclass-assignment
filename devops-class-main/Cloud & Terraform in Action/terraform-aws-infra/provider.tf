# =============================================================================
# PROVIDERS
#
# Session 18 built one resource type with one provider. This project needs
# EC2, VPC, IAM and S3 - all of which live in the same `aws` provider, which
# is why only one provider block appears here despite four services being
# used. A "provider" is a plugin for an API, not for a service.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region

  access_key                  = var.use_localstack ? "test" : null
  secret_key                  = var.use_localstack ? "test" : null
  skip_credentials_validation = var.use_localstack
  skip_requesting_account_id  = var.use_localstack
  skip_metadata_api_check     = var.use_localstack
  s3_use_path_style           = var.use_localstack

  # One endpoint override per service this project touches. Everything else
  # resolves to real AWS - which is the point: the list makes the project's
  # API surface explicit.
  dynamic "endpoints" {
    for_each = var.use_localstack ? [1] : []

    content {
      ec2 = var.localstack_endpoint
      iam = var.localstack_endpoint
      s3  = var.localstack_endpoint
      sts = var.localstack_endpoint
    }
  }

  default_tags {
    tags = var.default_tags
  }
}
