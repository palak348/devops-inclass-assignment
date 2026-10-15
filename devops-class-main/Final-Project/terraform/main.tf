data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

################################################################################
# Network: 1 VPC, 2 public + 2 private subnets across 2 AZs, 1 NAT gateway
################################################################################
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "6.7.3"

  name = "${var.project}-vpc"
  cidr = var.vpc_cidr
  azs  = local.azs

  # Public subnets: internet-facing load balancer (ingress-nginx) + NAT gateway.
  public_subnets = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, 101 + i)] # 10.20.101.0/24, 10.20.102.0/24
  # Private subnets: the worker nodes - not directly reachable from the internet.
  private_subnets = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, 1 + i)] # 10.20.1.0/24, 10.20.2.0/24

  enable_nat_gateway   = true
  single_nat_gateway   = true # one NAT instead of one per AZ: cheaper for a demo
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Tags the AWS load balancer integration uses to pick subnets.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

################################################################################
# EKS cluster + managed node group
################################################################################
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "21.29.0"

  name               = var.cluster_name
  kubernetes_version = var.kubernetes_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # kubectl / helm from a laptop and from GitHub Actions.
  endpoint_public_access = true
  # The IAM identity running terraform apply becomes cluster admin.
  enable_cluster_creator_admin_permissions = true

  # Cost + clean destroy: no customer-managed KMS key (it would linger 7+ days
  # in "pending deletion") and no CloudWatch control-plane log group.
  encryption_config           = null
  create_kms_key              = false
  create_cloudwatch_log_group = false
  enabled_log_types           = []

  addons = {
    coredns                = {}
    kube-proxy             = {}
    eks-pod-identity-agent = { before_compute = true }
    vpc-cni                = { before_compute = true }
    # Needed for the PostgreSQL PersistentVolumeClaim (EBS volume).
    aws-ebs-csi-driver = {}
  }

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = var.node_instance_types
      capacity_type  = "ON_DEMAND"

      min_size     = var.node_min_size
      desired_size = var.node_desired_size
      max_size     = var.node_max_size

      # Lets the EBS CSI driver (running on the nodes) create/attach volumes.
      iam_role_additional_policies = {
        ebs_csi = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
      }
    }
  }
}
