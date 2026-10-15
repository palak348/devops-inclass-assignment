# Credentials are NOT configured here. Terraform reads them from the AWS CLI
# profile / environment (aws configure, or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY),
# so no key ever lands in this repository.
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}
