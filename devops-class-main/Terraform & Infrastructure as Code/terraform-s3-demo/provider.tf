# =============================================================================
# PROVIDER CONFIGURATION
#
# Two things live in this file, and they are easy to confuse:
#
#   terraform {}  - configures Terraform ITSELF: which CLI version is allowed
#                   and which providers to download. Resolved at `init`.
#   provider {}   - configures ONE provider plugin: where to talk to AWS and
#                   as whom. Resolved at `plan`/`apply`.
# =============================================================================

terraform {
  # A lower bound, not a pin. `terraform` is backwards compatible within a
  # major version, so pinning the CLI exactly only causes pain on upgrade.
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # `~> 6.0` means ">= 6.0, < 7.0" - take bug fixes and new resources,
      # never take a major version that may rename or remove things.
      version = "~> 6.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# -----------------------------------------------------------------------------
# The AWS provider.
#
# This project runs against LocalStack, an AWS emulator that serves the real
# AWS APIs on localhost. The provider, the resources and the state file are all
# genuinely the AWS ones - only the endpoint moves. Flipping `use_localstack`
# to false in terraform.tfvars points the exact same configuration at a real
# AWS account, with no other edits.
#
# That is the whole argument for Infrastructure as Code in one variable.
# -----------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  # LocalStack accepts any credentials and has no account to look up, so the
  # three pre-flight calls the provider normally makes are skipped. Against
  # real AWS these are all left on, and credentials come from the environment
  # or ~/.aws/credentials - never from a .tf file.
  access_key                  = var.use_localstack ? "test" : null
  secret_key                  = var.use_localstack ? "test" : null
  skip_credentials_validation = var.use_localstack
  skip_requesting_account_id  = var.use_localstack
  skip_metadata_api_check     = var.use_localstack

  # Real S3 addresses buckets as <bucket>.s3.amazonaws.com (virtual-hosted
  # style). LocalStack is one host, so buckets have to be addressed as
  # localhost:4566/<bucket> instead.
  s3_use_path_style = var.use_localstack

  # A dynamic block generates zero or one `endpoints` blocks depending on the
  # flag. With use_localstack = false the block simply is not emitted and the
  # provider resolves the real AWS endpoints by itself.
  dynamic "endpoints" {
    for_each = var.use_localstack ? [1] : []

    content {
      s3  = var.localstack_endpoint
      sts = var.localstack_endpoint
      iam = var.localstack_endpoint
    }
  }

  # Applied to every taggable resource this provider creates, so no resource
  # has to repeat them. Resource-level tags are merged on top of these.
  default_tags {
    tags = var.default_tags
  }
}
