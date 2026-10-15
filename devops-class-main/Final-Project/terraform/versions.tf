terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }

  # State stays local (terraform.tfstate is git-ignored). For a team you would
  # use an S3 backend with locking instead.
}
