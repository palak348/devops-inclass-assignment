# =============================================================================
# INPUT VARIABLES
#
# Every value that might differ between environments lives here. The rule of
# thumb: if changing it would require editing main.tf, it should have been a
# variable. A variable with a `default` is optional; one without is required,
# and Terraform will refuse to plan until it is supplied.
# =============================================================================

variable "aws_region" {
  description = "AWS region the bucket is created in."
  type        = string
  default     = "ap-south-1"
}

variable "bucket_prefix" {
  description = "First part of the bucket name. A random suffix is appended, because S3 bucket names share one global namespace across every AWS account on earth."
  type        = string

  validation {
    # S3 bucket names are DNS names: lowercase letters, digits and hyphens
    # only, and they may not start or end with a hyphen. Catching this here
    # produces a readable error at plan time instead of an API error halfway
    # through an apply.
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$", var.bucket_prefix))
    error_message = "bucket_prefix must be 3-42 characters of lowercase letters, digits and hyphens, and may not start or end with a hyphen."
  }
}

variable "environment" {
  description = "Deployment environment this bucket belongs to."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "enable_versioning" {
  description = "Keep previous versions of every object. Versioning is the difference between an overwrite being an inconvenience and being a data loss."
  type        = bool
  default     = true
}

variable "noncurrent_version_expiration_days" {
  description = "How long superseded object versions are kept before the lifecycle rule deletes them. Versioning without this is a bill that only grows."
  type        = number
  default     = 30

  validation {
    condition     = var.noncurrent_version_expiration_days >= 1
    error_message = "noncurrent_version_expiration_days must be at least 1."
  }
}

variable "force_destroy" {
  description = "Allow `terraform destroy` to delete a bucket that still contains objects. True here so the demo tears down cleanly; it would be false for anything real."
  type        = bool
  default     = true
}

variable "default_tags" {
  description = "Tags applied to every taggable resource via the provider's default_tags block."
  type        = map(string)

  default = {
    Project   = "terraform-s3-demo"
    Session   = "18"
    ManagedBy = "Terraform"
  }
}

# ---- backend selection ------------------------------------------------------

variable "use_localstack" {
  description = "Point the AWS provider at LocalStack instead of real AWS. This is the only value that needs to change to run the identical configuration against a real AWS account."
  type        = bool
  default     = true
}

variable "localstack_endpoint" {
  description = "Where LocalStack is listening. Ignored entirely when use_localstack is false."
  type        = string
  default     = "http://localhost:4566"
}
