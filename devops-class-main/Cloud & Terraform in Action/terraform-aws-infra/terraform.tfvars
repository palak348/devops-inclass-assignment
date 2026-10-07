# =============================================================================
# VARIABLE VALUES
#
# Loaded automatically - no -var-file flag needed.
#
# No secrets here, ever. This file is committed, and a tfvars file is the
# usual place credentials get leaked into a repository. Secrets belong in
# environment variables (TF_VAR_*) or a secrets manager.
# =============================================================================

project_name = "s19-infra"
environment  = "dev"
aws_region   = "ap-south-1"

# ---- network ----------------------------------------------------------------
# Two public and two private subnets, spread across two Availability Zones.
vpc_cidr             = "10.20.0.0/16"
public_subnet_cidrs  = ["10.20.0.0/24", "10.20.1.0/24"]
private_subnet_cidrs = ["10.20.10.0/24", "10.20.11.0/24"]

# NOT 0.0.0.0/0. SSH is reachable only from inside the VPC.
allowed_ssh_cidr = "10.20.0.0/16"

# ---- compute ----------------------------------------------------------------
instance_type      = "t3.micro"
web_instance_count = 2

# Matches LocalStack's mock Amazon Linux image. Against real AWS this would be
# something like "al2023-ami-*-x86_64".
ami_name_filter = "amzn-ami-hvm-*-x86_64-gp2"

# ---- storage ----------------------------------------------------------------
bucket_prefix        = "s19-app-assets"
force_destroy_bucket = true

# ---- backend ----------------------------------------------------------------
use_localstack      = true
localstack_endpoint = "http://localhost:4566"
