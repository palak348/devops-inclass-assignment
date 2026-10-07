# terraform-aws-infra — an end-to-end AWS environment

A single Terraform configuration that builds a complete, multi-AZ AWS
environment: network, security, compute and storage, wired together with IAM so
that nothing stores a credential anywhere.

**26 resources. One `terraform apply`.**

Every command below was run and every block of output is real, copied from the
terminal.

---

## Architecture

```
                              ┌─────────────────┐
                              │    Internet     │
                              └────────┬────────┘
                                       │
                            ┌──────────▼──────────┐
                            │  Internet Gateway   │  igw-9f6d4b93
                            └──────────┬──────────┘
                                       │
   ┌───────────────────────────────────┼───────────────────────────────────┐
   │ VPC  10.20.0.0/16                 │                     vpc-8d5f8ea8  │
   │                                   │                                   │
   │   ┌───── route table: public ─────┴────────────┐                      │
   │   │  10.20.0.0/16 → local                      │                      │
   │   │  0.0.0.0/0    → igw-9f6d4b93               │                      │
   │   └──────┬──────────────────────────┬──────────┘                      │
   │          │                          │                                 │
   │  ┌───────▼─────────┐       ┌────────▼────────┐                        │
   │  │ PUBLIC SUBNET   │       │ PUBLIC SUBNET   │                        │
   │  │ 10.20.0.0/24    │       │ 10.20.1.0/24    │                        │
   │  │ ap-south-1a     │       │ ap-south-1b     │                        │
   │  │                 │       │                 │                        │
   │  │  ┌───────────┐  │       │  ┌───────────┐  │                        │
   │  │  │  web-1    │  │       │  │  web-2    │  │   sg-web               │
   │  │  │ t3.micro  │  │       │  │ t3.micro  │  │   :80, :443 from world │
   │  │  │ 10.20.0.4 │  │       │  │ 10.20.1.4 │  │   :22 from VPC only    │
   │  │  └─────┬─────┘  │       │  └─────┬─────┘  │                        │
   │  └────────┼────────┘       └────────┼────────┘                        │
   │           │                         │                                 │
   │           └──────────┬──────────────┘                                 │
   │                      │  :8080, source = sg-web                        │
   │   ┌──────────────────▼──────────────────┐                             │
   │   │           sg-app  (app tier)        │                             │
   │   └──────────────────┬──────────────────┘                             │
   │                      │                                                │
   │   ┌───── route table: private ──────────┐                             │
   │   │  10.20.0.0/16 → local               │   ← no 0.0.0.0/0 entry      │
   │   └──────┬───────────────────┬──────────┘                             │
   │          │                   │                                        │
   │  ┌───────▼─────────┐ ┌───────▼─────────┐                              │
   │  │ PRIVATE SUBNET  │ │ PRIVATE SUBNET  │                              │
   │  │ 10.20.10.0/24   │ │ 10.20.11.0/24   │   unreachable from the       │
   │  │ ap-south-1a     │ │ ap-south-1b     │   internet, in either        │
   │  └─────────────────┘ └─────────────────┘   direction                  │
   │                                                                       │
   └───────────────────────────────────────────────────────────────────────┘
                                       │
                 instance profile      │  sts:AssumeRole
                 s19-infra-dev-web-profile
                                       │
                            ┌──────────▼──────────┐
                            │  IAM role: web      │
                            │  s3:ListBucket      │
                            │  s3:GetObject       │  ← this bucket only
                            └──────────┬──────────┘
                                       │
                            ┌──────────▼──────────────────┐
                            │  S3  s19-app-assets-dev-…   │
                            │  versioned · AES256         │
                            │  all public access blocked  │
                            └─────────────────────────────┘
```

Everything in the diagram is produced by the configuration. Nothing was
clicked.

---

## Files

| File | Holds |
|------|-------|
| `provider.tf` | Version constraints, the `aws` and `random` providers, endpoint wiring |
| `variables.tf` | Every input — typed, described, validated |
| `vpc.tf` | VPC, internet gateway, four subnets, two route tables, associations |
| `security.tf` | The web and app security groups |
| `compute.tf` | AMI data source, EC2 instances, IMDSv2, root volume, user data |
| `storage.tf` | S3 bucket and its settings, plus the whole IAM chain |
| `outputs.tf` | 22 outputs — IDs, addresses, and assertions about what took effect |
| `user-data.sh.tftpl` | Bootstrap script, rendered by `templatefile()` |
| `terraform.tfvars` | The values. No secrets |
| `.terraform.lock.hcl` | Provider checksums — **committed on purpose** |

Terraform concatenates every `.tf` file in the directory; the names mean
nothing to Terraform and a great deal to the next reader. One file per layer of
the architecture means "how is the network built?" is one file, not a search.

---

## What the configuration demonstrates

The session asks for ten things. Where each one lives:

| Required | Where | What it looks like |
|----------|-------|--------------------|
| **Providers** | `provider.tf` | `hashicorp/aws ~> 6.0`, `hashicorp/random ~> 3.6`, with per-service endpoint overrides |
| **Variables** | `variables.tf` | 15 inputs, 5 with `validation` blocks that fail at plan time rather than mid-apply |
| **Resources** | all `.tf` files | 26 across EC2, VPC, IAM and S3 |
| **Outputs** | `outputs.tf` | 22, several of them assertions rather than values |
| **Dependencies** | everywhere | 26 resources, **2** `depends_on` lines — the rest is inferred |
| **AWS infrastructure** | — | VPC, IGW, subnets, route tables, security groups, EC2, S3, IAM |
| **State** | `terraform.tfstate` | 30 entries: 26 resources + 4 data sources |
| **`plan`** | below | `Plan: 26 to add, 0 to change, 0 to destroy.` |
| **`apply`** | below | `Apply complete! Resources: 26 added` |
| **`destroy`** | below | `Destroy complete! Resources: 26 destroyed.` |

---

## Three ideas the configuration is built around

### 1. Dependencies come from references, not declarations

26 resources, and only **two** `depends_on` lines in the entire project.

When `aws_subnet.public` contains `vpc_id = aws_vpc.main.id`, Terraform knows
the VPC must exist first. **Writing the reference is declaring the
dependency.** The full chain for an EC2 instance — VPC → subnet → security
group → role → policy → instance profile → instance — is built entirely from
expressions.

`depends_on` is reserved for ordering that is real but invisible to the graph.
Both uses here are that:

```hcl
# compute.tf — the instance references the profile, and the profile references
# the role, but nothing references the ATTACHMENT. Without this the instance
# could boot before its role actually had permissions.
depends_on = [aws_iam_role_policy_attachment.web_read_assets]
```

```hcl
# storage.tf — upload the object only after the public access block exists, so
# there is never a window where the bucket is less protected than the code says.
depends_on = [aws_s3_bucket_public_access_block.assets]
```

### 2. A subnet is private because of its route table

Not because of a checkbox. The two route tables differ by exactly one entry:

| Route table | Routes |
|-------------|--------|
| `s19-infra-dev-rt-public` | `10.20.0.0/16 → local`, `0.0.0.0/0 → igw-9f6d4b93` |
| `s19-infra-dev-rt-private` | `10.20.0.0/16 → local` |

That is the whole difference, and it is verified below against the real API.
`map_public_ip_on_launch = true` on the public subnets is often mistaken for
the cause — it only decides whether instances get a public address, which is
useless without a route.

### 3. No credential exists anywhere in this project

The instances read the S3 bucket. There is no access key, no `.aws/credentials`
file, nothing in user data. The chain:

```
trust policy  →  IAM role  →  permissions policy  →  instance profile  →  EC2
```

The instance assumes the role at boot and the SDK fetches short-lived
credentials from the metadata service, rotated automatically. The two halves of
a role are kept deliberately distinct, because conflating them is the usual IAM
mistake:

```hcl
# WHO may become this role
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# WHAT it may do once assumed — read, not write; this bucket, not every bucket
data "aws_iam_policy_document" "read_assets" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.assets.arn]
  }
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
  }
}
```

Note the two ARNs — the bucket for `ListBucket`, `bucket/*` for `GetObject`.
Listing only one produces an `AccessDenied` that looks inexplicable.

---

## Where this runs

Against **LocalStack**, an AWS emulator serving the real AWS APIs on
`localhost:4566`. The provider, the resource types, the state file and the API
calls are genuinely AWS's — only the endpoint moves, and it moves because of
one variable:

```hcl
use_localstack = true     # false → the same configuration applies to real AWS
```

```bash
docker run -d --name localstack -p 4566:4566 localstack/localstack:3
```

The endpoint list in `provider.tf` doubles as documentation of the project's
API surface:

```hcl
dynamic "endpoints" {
  for_each = var.use_localstack ? [1] : []

  content {
    ec2 = var.localstack_endpoint
    iam = var.localstack_endpoint
    s3  = var.localstack_endpoint
    sts = var.localstack_endpoint
  }
}
```

---

## The workflow

### `terraform init`

```
Initializing provider plugins...
- Finding hashicorp/aws versions matching "~> 6.0"...
- Finding hashicorp/random versions matching "~> 3.6"...
- Installing hashicorp/aws v6.67.0...
- Installed hashicorp/aws v6.67.0 (signed by HashiCorp)
- Installing hashicorp/random v3.9.1...
- Installed hashicorp/random v3.9.1 (signed by HashiCorp)

Terraform has been successfully initialized!
```

### `terraform fmt -check -diff`

```
$ terraform fmt -check -diff
$ echo $?
0
```

No output, exit 0 — every file is canonical. As a CI gate, a non-zero exit
fails the build, which ends formatting arguments permanently.

### `terraform validate`

```
Success! The configuration is valid.
```

Offline — no credentials needed, no API calls made.

### `terraform plan -out=tfplan`

```
Plan: 26 to add, 0 to change, 0 to destroy.
```

All 26, by name:

```
  # aws_iam_instance_profile.web will be created
  # aws_iam_policy.read_assets will be created
  # aws_iam_role.web will be created
  # aws_iam_role_policy_attachment.web_read_assets will be created
  # aws_instance.web[0] will be created
  # aws_instance.web[1] will be created
  # aws_internet_gateway.main will be created
  # aws_route_table.private will be created
  # aws_route_table.public will be created
  # aws_route_table_association.private[0] will be created
  # aws_route_table_association.private[1] will be created
  # aws_route_table_association.public[0] will be created
  # aws_route_table_association.public[1] will be created
  # aws_s3_bucket.assets will be created
  # aws_s3_bucket_public_access_block.assets will be created
  # aws_s3_bucket_server_side_encryption_configuration.assets will be created
  # aws_s3_bucket_versioning.assets will be created
  # aws_s3_object.index will be created
  # aws_security_group.app will be created
  # aws_security_group.web will be created
  # aws_subnet.private[0] will be created
  # aws_subnet.private[1] will be created
  # aws_subnet.public[0] will be created
  # aws_subnet.public[1] will be created
  # aws_vpc.main will be created
  # random_id.bucket_suffix will be created
```

Two details worth reading in the plan's output section:

```
  + ami_id   = "ami-760aaa0f"
  + ami_name = "amzn-ami-hvm-2017.09.1.20171103-x86_64-gp2"
```

Those are **known before apply** — the AMI data source ran during the plan, so
Terraform already resolved which image will boot. Data sources are read at plan
time; that is what separates them from resources.

```
  + instance_ids = [
      + (known after apply),
      + (known after apply),
    ]
```

Instance IDs cannot be known until AWS assigns them, so Terraform says so
rather than guessing. Everything knowable is shown; everything else is marked.
That is what makes a plan reviewable.

### `terraform apply tfplan`

```
Apply complete! Resources: 26 added, 0 changed, 0 destroyed.

Outputs:

ami_id = "ami-760aaa0f"
ami_name = "amzn-ami-hvm-2017.09.1.20171103-x86_64-gp2"
api_endpoint = "http://localhost:4566"
app_security_group_id = "sg-5ac81df64abdaf029"
availability_zones_used = tolist([
  "ap-south-1a",
  "ap-south-1b",
])
bucket_arn = "arn:aws:s3:::s19-app-assets-dev-bf1a91a8"
bucket_name = "s19-app-assets-dev-bf1a91a8"
bucket_public_access_blocked = true
imdsv2_required = true
instance_ids = [
  "i-ace7434f413ab8f65",
  "i-92d097f6928611caa",
]
instance_private_ips = [
  "10.20.0.4",
  "10.20.1.4",
]
instance_profile_name = "s19-infra-dev-web-profile"
instance_public_ips = [
  "54.214.49.144",
  "54.214.32.158",
]
instance_role_name = "s19-infra-dev-web-role"
instance_subnet_placement = {
  "s19-infra-dev-web-1" = "ap-south-1a"
  "s19-infra-dev-web-2" = "ap-south-1b"
}
internet_gateway_id = "igw-9f6d4b93"
private_subnet_ids = [
  "subnet-d9118124",
  "subnet-4ce12fc2",
]
private_subnets_have_internet_route = false
public_subnet_ids = [
  "subnet-5942cf29",
  "subnet-fa19faf3",
]
resource_count = 26
ssh_allowed_from = "10.20.0.0/16"
vpc_cidr = "10.20.0.0/16"
vpc_id = "vpc-8d5f8ea8"
web_security_group_id = "sg-94dac191921512191"
```

Several of those outputs are **assertions, not values**:

| Output | Value | What it proves |
|--------|-------|----------------|
| `private_subnets_have_internet_route` | `false` | The private subnets genuinely have no path to the internet |
| `imdsv2_required` | `true` | Both instances require the IMDSv2 token handshake |
| `bucket_public_access_blocked` | `true` | All four public-access switches are on |
| `ssh_allowed_from` | `10.20.0.0/16` | Port 22 is not open to the world |
| `instance_subnet_placement` | two different AZs | The architecture actually spans Availability Zones |

An output that restates a variable proves nothing. These read the state back
from the created resources, so they report what took effect rather than what
was intended.

### `terraform state list`

```
data.aws_ami.linux
data.aws_availability_zones.available
data.aws_iam_policy_document.ec2_assume_role
data.aws_iam_policy_document.read_assets
aws_iam_instance_profile.web
aws_iam_policy.read_assets
aws_iam_role.web
aws_iam_role_policy_attachment.web_read_assets
aws_instance.web[0]
aws_instance.web[1]
aws_internet_gateway.main
aws_route_table.private
aws_route_table.public
aws_route_table_association.private[0]
aws_route_table_association.private[1]
aws_route_table_association.public[0]
aws_route_table_association.public[1]
aws_s3_bucket.assets
aws_s3_bucket_public_access_block.assets
aws_s3_bucket_server_side_encryption_configuration.assets
aws_s3_bucket_versioning.assets
aws_s3_object.index
aws_security_group.app
aws_security_group.web
aws_subnet.private[0]
aws_subnet.private[1]
aws_subnet.public[0]
aws_subnet.public[1]
aws_vpc.main
random_id.bucket_suffix
```

**30 entries: 26 resources plus 4 data sources.** Data sources are tracked in
state too, which is why `plan` can detect that an AMI lookup now resolves to a
different image.

Note `aws_instance.web[0]` and `[1]` — `count` produces an indexed list, and
the index is part of the address. Removing the first entry from a `count` list
renumbers everything after it, which is why `for_each` is the better choice
when entries are added and removed over time.

---

## Independent verification

Terraform reporting success is Terraform reporting on itself. These queries go
straight to the AWS API:

### The subnets span two AZs, and only two of them auto-assign public IPs

```
$ awslocal ec2 describe-subnets --region ap-south-1 \
    --filters Name=vpc-id,Values=vpc-8d5f8ea8 \
    --query 'Subnets[].[CidrBlock,AvailabilityZone,MapPublicIpOnLaunch]' --output text

10.20.0.0/24     ap-south-1a    True
10.20.10.0/24    ap-south-1a    False
10.20.1.0/24     ap-south-1b    True
10.20.11.0/24    ap-south-1b    False
```

### The routing is what makes them public or private

```
$ awslocal ec2 describe-route-tables --region ap-south-1 \
    --filters Name=vpc-id,Values=vpc-8d5f8ea8 \
    --query 'RouteTables[].[Tags[?Key==`Name`]|[0].Value,
             Routes[].DestinationCidrBlock|join(`,`,@),
             Routes[].GatewayId|join(`,`,@)]' --output text

None                        10.20.0.0/16              local
s19-infra-dev-rt-private    10.20.0.0/16              local
s19-infra-dev-rt-public     10.20.0.0/16,0.0.0.0/0    local,igw-9f6d4b93
```

The private table has **no `0.0.0.0/0` entry at all**. That single missing line
is the entire definition of a private subnet.

### The instances are running, one per AZ

```
$ awslocal ec2 describe-instances --region ap-south-1 \
    --filters Name=vpc-id,Values=vpc-8d5f8ea8 \
    --query 'Reservations[].Instances[].[InstanceId,InstanceType,
             Placement.AvailabilityZone,PrivateIpAddress,State.Name]' --output text

i-92d097f6928611caa    t3.micro    ap-south-1b    10.20.1.4    running
i-ace7434f413ab8f65    t3.micro    ap-south-1a    10.20.0.4    running
```

Private addresses from the right subnet ranges — `10.20.0.4` from
`10.20.0.0/24`, `10.20.1.4` from `10.20.1.0/24`.

### SSH is not open to the world

```
$ awslocal ec2 describe-security-groups --region ap-south-1 \
    --group-ids sg-94dac191921512191 \
    --query 'SecurityGroups[].IpPermissions[].[FromPort,IpRanges[].CidrIp|join(`,`,@)]' --output text

22     10.20.0.0/16
80     0.0.0.0/0
443    0.0.0.0/0
```

HTTP and HTTPS from anywhere; SSH from inside the VPC only. Opening port 22 to
`0.0.0.0/0` is the most common AWS misconfiguration there is, and the scanners
find it within minutes.

### The app tier's source is a security group, not an address range

```
$ awslocal ec2 describe-security-groups --region ap-south-1 \
    --group-ids sg-5ac81df64abdaf029 \
    --query 'SecurityGroups[].IpPermissions[].[FromPort,
             IpRanges[].CidrIp|join(`,`,@),
             UserIdGroupPairs[].GroupId|join(`,`,@)]' --output text

8080           sg-94dac191921512191
```

The CIDR column is **empty**. The rule does not say "allow 10.20.0.0/24" — it
says "allow anything wearing `sg-web`". Instances can be replaced, scaled and
re-addressed, and the rule still means exactly what it meant on day one.

### The bucket and the IAM chain

```
$ awslocal s3 ls
2026-10-07 16:39:31 s19-app-assets-dev-bf1a91a8

$ awslocal s3 ls s3://s19-app-assets-dev-bf1a91a8 --recursive
2026-10-07 16:39:31        220 assets/index.html

$ awslocal iam list-attached-role-policies --role-name s19-infra-dev-web-role \
    --query 'AttachedPolicies[].PolicyName' --output text
s19-infra-dev-read-assets

$ awslocal iam get-instance-profile \
    --instance-profile-name s19-infra-dev-web-profile \
    --query 'InstanceProfile.Roles[].RoleName' --output text
s19-infra-dev-web-role
```

The full chain, confirmed from the outside: profile → role → policy → bucket.

---

## `terraform destroy`

```
Plan: 0 to add, 0 to change, 26 to destroy.

aws_s3_bucket_versioning.assets: Destroying... [id=s19-app-assets-dev-bf1a91a8]
aws_security_group.app: Destroying... [id=sg-5ac81df64abdaf029]
aws_route_table_association.public[1]: Destroying... [id=rtbassoc-19aa1e15]
aws_route_table_association.private[1]: Destroying... [id=rtbassoc-84cb4e9c]
aws_s3_object.index: Destroying... [id=s19-app-assets-dev-bf1a91a8/assets/index.html]
aws_instance.web[1]: Destroying... [id=i-92d097f6928611caa]
aws_instance.web[0]: Destroying... [id=i-ace7434f413ab8f65]
...
aws_security_group.web: Destruction complete after 0s
aws_s3_bucket.assets: Destruction complete after 0s
aws_vpc.main: Destruction complete after 0s
aws_iam_role.web: Destruction complete after 0s

Destroy complete! Resources: 26 destroyed.
```

And confirmed from outside:

```
$ awslocal ec2 describe-vpcs --region ap-south-1 --query 'Vpcs[].CidrBlock' --output text
172.31.0.0/16
```

Only LocalStack's own default VPC remains. Everything this configuration
created is gone.

**Destroy walks the dependency graph backwards.** Leaves first — route table
associations, the S3 object, the instances — then the things they hung off, and
the VPC last of all, because it cannot be deleted while a subnet still lives in
it. Nothing about that order is coincidence; it is the create order reversed.

The bucket had an object in it and the destroy still worked, because of
`force_destroy = true`. AWS refuses to delete a non-empty bucket and Terraform
will not silently empty one. True is right for a demo and wrong for anything
holding real data, where a careless `destroy` should fail loudly.

---

## Terraform state

`terraform.tfstate` holds 30 entries mapping configuration to reality:
`aws_vpc.main` *is* `vpc-8d5f8ea8`, `aws_instance.web[0]` *is*
`i-ace7434f413ab8f65`.

Three consequences:

1. **Losing it loses the link.** Terraform no longer knows these resources are
   its, and the next apply builds a second copy of everything. Recovery means
   `terraform import`, 26 times.
2. **It holds every attribute in plaintext**, including anything a provider
   marks sensitive. That is why it is gitignored, and why real projects use an
   encrypted remote backend rather than a local file.
3. **It is why `plan` is fast and honest.** Terraform refreshes state against
   the live API first, then diffs — so a change someone made by hand in the
   console shows up as drift rather than being silently overwritten.

The production setup is a **remote backend**: state in a versioned, encrypted
S3 bucket with a DynamoDB table for locking, so two engineers cannot apply at
the same time. The bucket from Session 18 is exactly the shape that backend
needs.

---

## Issues faced & fixes

| # | Problem | Cause | Fix |
|---|---------|-------|-----|
| 1 | `terraform validate` failed: `Call to function "templatefile" failed: ./user-data.sh.tftpl:5,51-54: Invalid expression` | A **comment** in the template contained the literal text `${...}` as an example. `templatefile` does not care that it is inside a comment — it tries to evaluate every `${}` in the file | Escaped it as `$${...}`, which renders as a literal `${...}`. The lesson: in a `.tftpl` file there is no such thing as a comment as far as interpolation is concerned |
| 2 | `terraform init` failed: `dial tcp: lookup registry.terraform.io: no such host` | Transient DNS failure while downloading providers | Re-ran `init`. Worth distinguishing from a real error — a failure during provider installation is never a problem with the configuration |
| 3 | `terraform fmt -check` failed on `outputs.tf` | Hand-aligned inline comments in the `resource_count` expression; `fmt` collapses that alignment | Ran `terraform fmt` and committed the result. The formatter wins — that is the point of having one |
| 4 | `awslocal ec2 describe-subnets` returned nothing although the subnets existed | The CLI defaults to `us-east-1`; the resources are in `ap-south-1` | Added `--region ap-south-1`. An empty result from a regional API almost always means the wrong region, not missing resources |
| 5 | Could not use `data "aws_ami"` with a real AWS image name | LocalStack's mock AMI catalogue only contains 2017-era images | Made the filter a variable (`ami_name_filter`), defaulting to LocalStack's `amzn-ami-hvm-*-x86_64-gp2` and documented that real AWS would use `al2023-ami-*-x86_64`. The data source pattern is unchanged — only the filter string moves |

### A limitation worth stating plainly

LocalStack's EC2 instances are **mocked**. They report `running`, they have IDs
and addresses, and the API behaves correctly — but no operating system boots,
so `user-data.sh.tftpl` is never executed. The script is rendered correctly by
`templatefile()` and passed to the instance; nothing runs it.

What that means for this project:

- Everything about the **infrastructure** — networking, routing, security
  groups, IAM, storage — is genuinely created and verified above.
- Everything **inside** an instance is not. The nginx install and the S3
  download are untested.

Against real AWS the same configuration boots the instances and runs the
script. The honest version of that claim is: the infrastructure is proven, the
bootstrap is written but unexercised.

---

## Command reference

```bash
# LocalStack
docker run -d --name localstack -p 4566:4566 localstack/localstack:3
curl -s http://localhost:4566/_localstack/health

# the workflow
terraform init
terraform fmt -check -diff
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
terraform show
terraform state list
terraform output
terraform output -raw vpc_id
terraform destroy -auto-approve

# verification, outside Terraform (all need --region ap-south-1)
awslocal ec2 describe-vpcs            --region ap-south-1
awslocal ec2 describe-subnets         --region ap-south-1 --filters Name=vpc-id,Values=<vpc>
awslocal ec2 describe-route-tables    --region ap-south-1 --filters Name=vpc-id,Values=<vpc>
awslocal ec2 describe-instances       --region ap-south-1 --filters Name=vpc-id,Values=<vpc>
awslocal ec2 describe-security-groups --region ap-south-1 --group-ids <sg>
awslocal s3 ls
awslocal iam list-attached-role-policies --role-name s19-infra-dev-web-role
```
