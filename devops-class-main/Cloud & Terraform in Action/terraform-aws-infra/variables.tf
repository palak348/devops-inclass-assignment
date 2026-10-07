# =============================================================================
# INPUT VARIABLES
#
# Nothing below is hardcoded anywhere else in the project. Changing the region,
# the CIDR plan, the instance size or the environment name is a tfvars edit,
# not a code edit - which is what makes the same configuration usable for dev,
# staging and prod.
# =============================================================================

variable "project_name" {
  description = "Short name used as the prefix for every resource's Name tag."
  type        = string
  default     = "s19-infra"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,20}$", var.project_name))
    error_message = "project_name must be 2-21 lowercase letters, digits or hyphens, starting with a letter or digit."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "Region everything is created in."
  type        = string
  default     = "ap-south-1"
}

# ---- network ----------------------------------------------------------------

variable "vpc_cidr" {
  description = "Address range for the whole VPC. /16 gives 65,536 addresses, which is the usual starting point."
  type        = string
  default     = "10.20.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be valid CIDR notation, e.g. 10.20.0.0/16."
  }
}

variable "public_subnet_cidrs" {
  description = "One public subnet per entry, each placed in a different Availability Zone. Two means the architecture survives losing an AZ."
  type        = list(string)
  default     = ["10.20.0.0/24", "10.20.1.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) >= 2
    error_message = "At least two public subnets are required, so they can span two Availability Zones."
  }
}

variable "private_subnet_cidrs" {
  description = "Private subnets - no route to the internet gateway. This is where anything stateful belongs."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}

variable "allowed_ssh_cidr" {
  description = "Who may reach port 22. Deliberately NOT 0.0.0.0/0 - see README. In a real deployment this is an office range, or SSH is removed entirely in favour of SSM Session Manager."
  type        = string
  default     = "10.20.0.0/16"
}

# ---- compute ----------------------------------------------------------------

variable "instance_type" {
  description = "EC2 instance size for the web tier."
  type        = string
  default     = "t3.micro"
}

variable "ami_name_filter" {
  description = "Name pattern for the AMI lookup. The default matches LocalStack's mock Amazon Linux image; against real AWS this would be something like `al2023-ami-*-x86_64`."
  type        = string
  default     = "amzn-ami-hvm-*-x86_64-gp2"
}

variable "web_instance_count" {
  description = "How many web instances to create. They are spread across the public subnets round-robin."
  type        = number
  default     = 2

  validation {
    condition     = var.web_instance_count >= 1 && var.web_instance_count <= 6
    error_message = "web_instance_count must be between 1 and 6."
  }
}

# ---- storage ----------------------------------------------------------------

variable "bucket_prefix" {
  description = "First part of the S3 bucket name. A random suffix is appended because bucket names are globally unique."
  type        = string
  default     = "s19-app-assets"
}

variable "force_destroy_bucket" {
  description = "Let `terraform destroy` delete the bucket even with objects in it. True for a demo; false for anything holding real data."
  type        = bool
  default     = true
}

# ---- tagging ----------------------------------------------------------------

variable "default_tags" {
  description = "Applied to every taggable resource through the provider's default_tags block."
  type        = map(string)

  default = {
    Project   = "session19-cloud-terraform"
    Session   = "19"
    ManagedBy = "Terraform"
    Owner     = "24BCS10504"
  }
}

# ---- backend selection ------------------------------------------------------

variable "use_localstack" {
  description = "Target LocalStack instead of real AWS. The only value that needs to change to run this against a real account."
  type        = bool
  default     = true
}

variable "localstack_endpoint" {
  description = "Where LocalStack is listening."
  type        = string
  default     = "http://localhost:4566"
}
