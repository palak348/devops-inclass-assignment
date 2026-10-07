# =============================================================================
# VARIABLE VALUES
#
# terraform.tfvars is loaded automatically - no -var-file flag needed.
#
# IMPORTANT: this file is committed because every value in it is harmless. A
# tfvars file is the usual place credentials get leaked into a repository, so
# the rule is: no secrets here, ever. Secrets belong in environment variables
# (TF_VAR_*) or a secrets manager, and the file belongs in .gitignore the
# moment that changes.
# =============================================================================

aws_region    = "ap-south-1"
bucket_prefix = "palak-tf-demo"
environment   = "dev"

enable_versioning                  = true
noncurrent_version_expiration_days = 30

# A demo bucket should tear down cleanly even with objects in it.
force_destroy = true

default_tags = {
  Project   = "terraform-s3-demo"
  Session   = "18"
  ManagedBy = "Terraform"
  Owner     = "24BCS10504"
}

# ---- backend ----------------------------------------------------------------
# Set use_localstack = false and the identical configuration applies to a real
# AWS account, reading credentials from the environment. Nothing else changes.
use_localstack      = true
localstack_endpoint = "http://localhost:4566"
