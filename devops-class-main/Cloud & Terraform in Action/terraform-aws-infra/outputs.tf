# =============================================================================
# OUTPUTS
#
# The configuration's return values - what another configuration, a CI job or
# a human needs in order to use what was built. Anything not listed here is an
# implementation detail.
# =============================================================================

# ---- network ----------------------------------------------------------------

output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "Address range of the VPC."
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets, in the order they were declared."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets."
  value       = aws_subnet.private[*].id
}

output "availability_zones_used" {
  description = "Which AZs the subnets actually landed in. Proof the architecture spans more than one."
  value       = distinct(aws_subnet.public[*].availability_zone)
}

output "internet_gateway_id" {
  description = "ID of the internet gateway."
  value       = aws_internet_gateway.main.id
}

output "private_subnets_have_internet_route" {
  description = "False by design - the private route table has no 0.0.0.0/0 entry, which is what makes those subnets private."
  value       = length([for r in aws_route_table.private.route : r if r.cidr_block == "0.0.0.0/0"]) > 0
}

# ---- security ---------------------------------------------------------------

output "web_security_group_id" {
  description = "Security group attached to the web instances."
  value       = aws_security_group.web.id
}

output "app_security_group_id" {
  description = "Security group for the application tier - reachable only from the web tier."
  value       = aws_security_group.app.id
}

output "ssh_allowed_from" {
  description = "The CIDR permitted to reach port 22. Deliberately not 0.0.0.0/0."
  value       = var.allowed_ssh_cidr
}

# ---- compute ----------------------------------------------------------------

output "ami_id" {
  description = "AMI the instances booted from, resolved by the data source rather than hardcoded."
  value       = data.aws_ami.linux.id
}

output "ami_name" {
  description = "Name of the resolved AMI."
  value       = data.aws_ami.linux.name
}

output "instance_ids" {
  description = "IDs of the web instances."
  value       = aws_instance.web[*].id
}

output "instance_private_ips" {
  description = "Private addresses - the instances' real addresses, stable for their lifetime."
  value       = aws_instance.web[*].private_ip
}

output "instance_public_ips" {
  description = "Public addresses, assigned by the internet gateway's one-to-one NAT. These change on stop/start."
  value       = aws_instance.web[*].public_ip
}

output "instance_subnet_placement" {
  description = "Which AZ each instance landed in - the spread across Availability Zones."
  value = {
    for i, inst in aws_instance.web :
    inst.tags["Name"] => inst.availability_zone
  }
}

output "imdsv2_required" {
  description = "True when the instances require IMDSv2, which blocks the SSRF-to-credential-theft path."
  value       = alltrue([for i in aws_instance.web : i.metadata_options[0].http_tokens == "required"])
}

# ---- storage and IAM --------------------------------------------------------

output "bucket_name" {
  description = "Name of the assets bucket."
  value       = aws_s3_bucket.assets.id
}

output "bucket_arn" {
  description = "ARN of the assets bucket - what appears in the IAM policy's Resource field."
  value       = aws_s3_bucket.assets.arn
}

output "bucket_public_access_blocked" {
  description = "True only when all four public-access switches are on."
  value = alltrue([
    aws_s3_bucket_public_access_block.assets.block_public_acls,
    aws_s3_bucket_public_access_block.assets.block_public_policy,
    aws_s3_bucket_public_access_block.assets.ignore_public_acls,
    aws_s3_bucket_public_access_block.assets.restrict_public_buckets,
  ])
}

output "instance_role_name" {
  description = "Role the instances assume. No access keys exist anywhere in this project."
  value       = aws_iam_role.web.name
}

output "instance_profile_name" {
  description = "Instance profile wrapping that role."
  value       = aws_iam_instance_profile.web.name
}

# ---- meta -------------------------------------------------------------------

output "resource_count" {
  description = "How many resources this configuration manages."
  value = (
    1 + # vpc
    1 + # internet gateway
    length(aws_subnet.public) +
    length(aws_subnet.private) +
    2 + # route tables
    length(aws_route_table_association.public) +
    length(aws_route_table_association.private) +
    2 + # security groups
    length(aws_instance.web) +
    5 + # bucket + versioning + sse + pab + object
    4 + # role, policy, attachment, instance profile
    1   # random_id
  )
}

output "api_endpoint" {
  description = "Which AWS API this was applied against."
  value       = var.use_localstack ? var.localstack_endpoint : "https://ec2.${var.aws_region}.amazonaws.com"
}
