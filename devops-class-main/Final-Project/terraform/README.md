# Terraform — AWS VPC + EKS for CareSlot

Creates everything the app needs on AWS, from code, in `ap-south-1` (Mumbai):

```text
AWS (ap-south-1)
└── VPC 10.20.0.0/16                         module terraform-aws-modules/vpc 6.7.3
    ├── public subnets   10.20.101.0/24, 10.20.102.0/24   (2 AZs; load balancer + NAT)
    ├── private subnets  10.20.1.0/24,   10.20.2.0/24     (2 AZs; worker nodes)
    ├── internet gateway + 1 NAT gateway
    └── EKS cluster "careslot-eks" (Kubernetes 1.36)   module terraform-aws-modules/eks 21.29.0
        ├── add-ons: vpc-cni, kube-proxy, coredns, eks-pod-identity-agent, aws-ebs-csi-driver
        └── managed node group "default": m7i-flex.large × 2 (min 1, max 2), AL2023
```

| File | Purpose |
|---|---|
| `versions.tf` | Terraform ≥ 1.7 and AWS provider `~> 6.69` |
| `providers.tf` | AWS provider + default tags. **No credentials** — they come from `aws configure` |
| `variables.tf` | Region, names, Kubernetes version, node sizes (all with defaults) |
| `main.tf` | VPC module + EKS module |
| `outputs.tf` | VPC/subnet IDs, cluster name/endpoint, ready-to-run `configure_kubectl` command |
| `terraform.tfvars.example` | Copy to `terraform.tfvars` to override defaults (the real file is git-ignored) |
| `.terraform.lock.hcl` | Pins the exact provider build, like `package-lock.json` |

## Cost (approximate, ap-south-1, on-demand)

| Resource | ~USD / hour |
|---|---|
| EKS control plane | 0.10 |
| 2 × m7i-flex.large nodes ($0.10075/h each, AWS Price List API) | 0.20 |
| NAT gateway + its public IP | ~0.06 |
| EBS volumes, data transfer | ~0.01 |
| ingress-nginx load balancer (once installed) | ~0.03 |
| **Total** | **≈ 0.40** |

Why `m7i-flex.large` and not `t3.medium`: on an AWS **Free plan** account only Free Tier
eligible instance types can be launched. Checked on the account with
`aws ec2 describe-instance-types --region ap-south-1 --filters Name=free-tier-eligible,Values=true`:
`t3.medium` → not eligible; `m7i-flex.large` (2 vCPU, 8 GiB) → eligible. The account's
On-Demand vCPU quota (`L-1216C47A`) is 5, so the node group is capped at 2 nodes (4 vCPU).
On the Free plan, usage is paid from the sign-up credits; the account itself is never charged.

Choices made to keep it cheap and make `destroy` leave nothing behind:
- one NAT gateway instead of one per AZ;
- no customer-managed KMS key (it would sit in "pending deletion" for 7+ days) and no CloudWatch log group;
- Kubernetes **1.36** is in EKS *standard* support — versions in *extended* support cost $0.60/h for the control plane instead of $0.10/h.

## Run it

```bash
# one-time: AWS CLI + Terraform installed, `aws configure` done with an IAM user
cd terraform
terraform init
terraform fmt -check
terraform validate
terraform plan -out tfplan       # screenshot this (M7)
terraform apply tfplan           # ~15-20 min
$(terraform output -raw configure_kubectl)   # bash; in PowerShell copy the printed command
kubectl get nodes
```

## Destroy — in this order

Kubernetes creates an AWS load balancer for ingress-nginx that Terraform does
not know about. If it still exists, `terraform destroy` cannot delete the VPC.

```bash
helm uninstall careslot -n careslot
helm uninstall monitoring -n monitoring
helm uninstall ingress-nginx -n ingress-nginx     # deletes the AWS load balancer
kubectl delete pvc --all -n careslot             # deletes the EBS volume
# wait ~1 min, check EC2 > Load Balancers is empty, then:
terraform destroy                                 # screenshot the "Destroy complete!" line (M7)
```

Afterwards check the AWS Console (region **Mumbai**): VPC, EKS, EC2, Load Balancers,
Elastic IPs and EBS Volumes should show nothing tagged `Project = careslot`.
