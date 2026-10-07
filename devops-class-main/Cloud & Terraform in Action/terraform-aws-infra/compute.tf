# =============================================================================
# COMPUTE
#
# The EC2 instances, and the AMI lookup that finds an image to boot.
#
# This file is where every other file converges. An instance here references
# a subnet (vpc.tf), a security group (security.tf), an instance profile
# (storage.tf) and a data source below - four dependencies declared purely by
# writing the references down.
# =============================================================================

# -----------------------------------------------------------------------------
# AMI lookup.
#
# AMI IDs are regional AND change whenever the image is patched, so hardcoding
# `ami-0abc123` breaks on the first region change and quietly goes stale
# everywhere else. Looking it up by name filter means the configuration always
# resolves to a current image.
#
# `most_recent = true` is deliberate here but is a real trade-off: it means an
# apply months from now may pick a different image and replace the instances.
# Production systems usually pin a known AMI ID per environment and update it
# through a conscious change instead.
# -----------------------------------------------------------------------------
data "aws_ami" "linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = [var.ami_name_filter]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# -----------------------------------------------------------------------------
# Web instances.
#
# Spread across the public subnets round-robin: with 2 instances and 2 subnets
# that is one per Availability Zone, which is the point of having two subnets.
# `element()` wraps, so raising web_instance_count to 3 puts the third back in
# the first subnet rather than failing.
# -----------------------------------------------------------------------------
resource "aws_instance" "web" {
  count = var.web_instance_count

  ami           = data.aws_ami.linux.id
  instance_type = var.instance_type

  subnet_id              = element(aws_subnet.public[*].id, count.index)
  vpc_security_group_ids = [aws_security_group.web.id]

  # The instance wears the role from storage.tf. This is what replaces putting
  # access keys on the box: the SDK reads short-lived credentials from the
  # metadata service, and they rotate automatically.
  iam_instance_profile = aws_iam_instance_profile.web.name

  # Require IMDSv2. The session-token handshake is what stops a server-side
  # request forgery bug in the application from being used to read the
  # instance's credentials - the attack behind several large AWS breaches.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size           = 8
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  # Bootstrap script, run once at first boot. `templatefile` keeps the script
  # in its own file instead of a heredoc buried in HCL, so it can be linted and
  # read on its own terms.
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    bucket_name = aws_s3_bucket.assets.id
    environment = var.environment
    name_prefix = local.name_prefix
  })

  # Changing user_data on an existing instance does nothing by default - the
  # script only runs at first boot. This forces a replacement when it changes,
  # so the configuration and the running machine cannot silently diverge.
  user_data_replace_on_change = true

  tags = {
    Name = "${local.name_prefix}-web-${count.index + 1}"
    Tier = "web"
  }

  # The instance must not be created before the policy is attached to its
  # role. Terraform can see the instance → profile → role chain, but not
  # role → policy attachment, so this one ordering has to be stated.
  depends_on = [aws_iam_role_policy_attachment.web_read_assets]
}
