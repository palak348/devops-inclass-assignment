variable "aws_region" {
  description = "AWS region for every resource."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Name prefix and Project tag."
  type        = string
  default     = "careslot"
}

variable "environment" {
  description = "Environment tag (dev / staging / prod)."
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "EKS cluster name (the CI deploy job uses the same name)."
  type        = string
  default     = "careslot-eks"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version. Keep it in EKS *standard* support - extended support is billed ~6x higher."
  type        = string
  default     = "1.36"
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed worker node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_min_size" {
  type    = number
  default = 1
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 3
}
