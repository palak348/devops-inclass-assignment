# =============================================================================
# SECURITY GROUPS
#
# A security group is a stateful allow-list attached to a network interface.
# Three properties drive everything below:
#
#   1. There is no deny rule. You list what is permitted; everything else is
#      refused. (Blocking a specific address is what a Network ACL is for.)
#   2. It is stateful - a reply to an allowed inbound request is automatically
#      allowed back out, whatever the egress rules say.
#   3. A rule's source can be ANOTHER SECURITY GROUP rather than a CIDR. That
#      is what makes the tiering below hold as instances come and go.
# =============================================================================

# -----------------------------------------------------------------------------
# Web tier - the only thing exposed to the internet.
# -----------------------------------------------------------------------------
resource "aws_security_group" "web" {
  name        = "${local.name_prefix}-web-sg"
  description = "Public web tier: HTTP/HTTPS from anywhere, SSH from inside the VPC only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Note what this is NOT: 0.0.0.0/0. Opening SSH to the whole internet is the
  # most common AWS misconfiguration there is, and the bots find it in minutes.
  # The default here is the VPC's own range; the better answer still is to drop
  # this rule entirely and use SSM Session Manager, which needs no open port.
  ingress {
    description = "SSH from an explicitly allowed range only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # Egress is wide open, which is the AWS default. Tightening it is worthwhile
  # in a hardened environment but breaks package installs and agent check-ins,
  # so it is a deliberate decision rather than a default to leave on autopilot.
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-web-sg"
    Tier = "web"
  }
}

# -----------------------------------------------------------------------------
# Application tier - reachable ONLY from the web tier.
#
# `security_groups = [aws_security_group.web.id]` is the important line. It
# does not say "allow 10.20.0.0/24"; it says "allow anything wearing the web
# security group". Instances can be replaced, scaled and re-addressed and the
# rule still means exactly what it meant on day one.
# -----------------------------------------------------------------------------
resource "aws_security_group" "app" {
  name        = "${local.name_prefix}-app-sg"
  description = "Private application tier: reachable only from the web tier"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Application port, from the web tier only"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-app-sg"
    Tier = "app"
  }
}
