# =============================================================================
# OUTPUTS
#
# Outputs are the configuration's return values. They serve two purposes:
#
#   1. they tell a human what was built, without reading the state file
#   2. they are what another configuration reads via a remote state data
#      source - outputs are a module's public API
#
# Anything not exposed as an output is an implementation detail.
# =============================================================================

output "bucket_name" {
  description = "Name of the created bucket, including the generated suffix."
  value       = aws_s3_bucket.demo.id
}

output "bucket_arn" {
  description = "ARN of the bucket. This is what goes in an IAM policy's Resource field."
  value       = aws_s3_bucket.demo.arn
}

output "bucket_region" {
  description = "Region the bucket lives in."
  value       = aws_s3_bucket.demo.region
}

output "bucket_domain_name" {
  description = "Endpoint the bucket answers on."
  value       = aws_s3_bucket.demo.bucket_domain_name
}

output "versioning_status" {
  description = "Whether object versioning ended up Enabled or Suspended."
  value       = aws_s3_bucket_versioning.demo.versioning_configuration[0].status
}

output "encryption_algorithm" {
  description = "Server-side encryption algorithm applied to new objects by default."
  value       = one(aws_s3_bucket_server_side_encryption_configuration.demo.rule).apply_server_side_encryption_by_default[0].sse_algorithm
}

output "public_access_blocked" {
  description = "True only when all four public-access switches are on."
  value = alltrue([
    aws_s3_bucket_public_access_block.demo.block_public_acls,
    aws_s3_bucket_public_access_block.demo.block_public_policy,
    aws_s3_bucket_public_access_block.demo.ignore_public_acls,
    aws_s3_bucket_public_access_block.demo.restrict_public_buckets,
  ])
}

output "object_key" {
  description = "Key of the object Terraform uploaded into the bucket."
  value       = aws_s3_object.readme.key
}

output "lifecycle_rule_ids" {
  description = "IDs of the lifecycle rules attached to the bucket. Empty when running against LocalStack, which the lifecycle resource is skipped for - see README, Issues Faced #2."
  value       = flatten([for c in aws_s3_bucket_lifecycle_configuration.demo : [for r in c.rule : r.id]])
}

output "api_endpoint" {
  description = "Which AWS API this configuration was applied against - LocalStack or real AWS."
  value       = var.use_localstack ? var.localstack_endpoint : "https://s3.${var.aws_region}.amazonaws.com"
}
