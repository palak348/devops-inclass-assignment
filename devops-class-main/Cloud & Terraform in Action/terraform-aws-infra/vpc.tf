# =============================================================================
# NETWORK
#
# The foundation everything else sits on. Order of construction:
#
#   VPC  →  Internet Gateway  →  Subnets  →  Route Tables  →  Associations
#
# Nothing below says `depends_on`. Each resource references the one before it,
# and that reference IS the dependency - Terraform builds the graph from the
# expressions, not from annotations.
# =============================================================================

# -----------------------------------------------------------------------------
# A data source: read something that already exists rather than create it.
#
# Hardcoding "ap-south-1a" would break the moment the region changed. Asking
# AWS which AZs exist means the configuration is portable to any region.
# -----------------------------------------------------------------------------
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # Pair each subnet CIDR with an AZ, cycling if there are more subnets than
  # AZs. `element` wraps around; `count.index` alone would fail past the end.
  azs = data.aws_availability_zones.available.names
}

# -----------------------------------------------------------------------------
# The VPC.
#
# enable_dns_hostnames is what makes instances resolvable by name inside the
# VPC, and is required for most AWS endpoint features. It is off by default,
# which surprises people.
# -----------------------------------------------------------------------------
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

# -----------------------------------------------------------------------------
# Internet Gateway.
#
# One per VPC. It does two jobs: it is the route target for internet-bound
# traffic, and it performs the one-to-one NAT between an instance's private
# address and its public one. That second job is why an EC2 instance never
# sees its own public IP on its interface.
# -----------------------------------------------------------------------------
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-igw"
  }
}

# -----------------------------------------------------------------------------
# Public subnets.
#
# `count` creates one resource per entry in the list, addressable as
# aws_subnet.public[0], [1], ... Each lands in a different AZ, which is the
# entire reason for having more than one.
# -----------------------------------------------------------------------------
resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = element(local.azs, count.index)

  # Instances launched here get a public IP automatically. This is the flag
  # people think makes a subnet "public" - it does not. The route table does.
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.name_prefix}-public-${element(local.azs, count.index)}"
    Tier = "public"
  }
}

# -----------------------------------------------------------------------------
# Private subnets.
#
# Identical to the public ones except for two things: no auto-assigned public
# IP, and - crucially - their route table has no internet gateway route. That
# second difference is the whole definition of "private".
# -----------------------------------------------------------------------------
resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = element(local.azs, count.index)

  map_public_ip_on_launch = false

  tags = {
    Name = "${local.name_prefix}-private-${element(local.azs, count.index)}"
    Tier = "private"
  }
}

# -----------------------------------------------------------------------------
# Public route table: send everything not local to the internet gateway.
#
# Every route table implicitly contains `10.20.0.0/16 → local`, which cannot
# be removed. That implicit route is why everything inside a VPC can reach
# everything else by default, subject to security groups.
# -----------------------------------------------------------------------------
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${local.name_prefix}-rt-public"
  }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# -----------------------------------------------------------------------------
# Private route table: no 0.0.0.0/0 entry at all.
#
# In production this would point at a NAT gateway so private instances could
# make outbound calls. It is left out here deliberately - a NAT gateway is one
# of the easiest AWS bills to run up by accident, and the architecture reads
# more clearly without it: these subnets genuinely cannot reach the internet
# in either direction.
# -----------------------------------------------------------------------------
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.name_prefix}-rt-private"
  }
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
