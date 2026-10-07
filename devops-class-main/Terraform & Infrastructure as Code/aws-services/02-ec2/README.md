# AWS EC2 — Elastic Compute Cloud

## What is EC2?

EC2 is AWS's virtual machine service. You ask for a server — this much CPU,
this much RAM, this operating system, in this network — and a few seconds later
you have one, billed by the second while it runs.

It is the oldest and least abstracted compute service AWS offers. That is both
its strength and its cost: an EC2 instance is a whole machine, so you can run
literally anything on it, and you are responsible for literally everything
above the hypervisor — patching, hardening, monitoring, scaling.

The mental model that matters:

> An EC2 instance is **an AMI booted on an instance type, inside a subnet,
> wearing a security group, with EBS volumes attached.**

Every one of those five is a separate thing you choose, and each is covered
below.

---

## AMI — Amazon Machine Image

An **AMI** is the template an instance boots from: a root filesystem snapshot
plus metadata saying how to boot it.

| Source | What it is |
|--------|------------|
| **AWS-provided** | Amazon Linux 2023, Ubuntu, Windows Server — maintained and patched by AWS or the OS vendor |
| **Marketplace** | Vendor images, sometimes with a per-hour licence charge on top of the instance |
| **Your own** | Created from a running instance, or built by a tool like Packer |
| **Community** | Published by anyone. Treat with the same suspicion as a random Docker Hub image |

Two things that catch people out:

- **An AMI is regional.** `ami-0abc123` in `ap-south-1` does not exist in
  `us-east-1`. You copy an AMI between regions, which produces a *new ID*. This
  is why hardcoding an AMI ID in Terraform breaks the moment anyone changes
  region, and why the `aws_ami` data source with a name filter is the better
  pattern.
- **AMI IDs change when the image is patched.** "Latest Amazon Linux 2023" is a
  moving target.

**Golden AMI** is the common production pattern: bake your agents, hardening
and base packages into a custom AMI, so instances boot ready rather than
spending five minutes running a configuration script.

---

## Instance types

An instance type is the hardware shape. The naming is systematic — `m7g.xlarge`
decodes as:

| Part | Meaning |
|------|---------|
| `m` | **Family** — the workload class |
| `7` | **Generation** — higher is newer, usually faster *and cheaper* |
| `g` | **Attributes** — `g` = AWS Graviton (ARM), `i` = Intel, `a` = AMD, `n` = extra network, `d` = local NVMe |
| `xlarge` | **Size** — nano, micro, small, medium, large, xlarge, 2xlarge … |

### The families

| Family | For | Example |
|--------|-----|---------|
| **T** — burstable | Workloads that idle and occasionally spike. Earn CPU credits while idle, spend them when busy. Cheapest. | `t3.micro` |
| **M** — general purpose | Balanced CPU to memory. The default when unsure. | `m7i.large` |
| **C** — compute optimised | High CPU per GB. Batch processing, encoding, game servers. | `c7g.xlarge` |
| **R** / **X** — memory optimised | High RAM per core. Databases, caches, in-memory analytics. | `r7i.2xlarge` |
| **I** / **D** — storage optimised | Fast local NVMe. Data warehouses, large transactional databases. | `i4i.large` |
| **P** / **G** — accelerated | GPUs. ML training and inference, rendering. | `g5.xlarge` |

**On `t` instances:** CPU credits are the trap. A `t3.micro` running a
constantly-busy service exhausts its credits and then throttles to a fraction
of a core, or — with unlimited mode on — quietly bills you for the overage. T
instances are for bursty workloads, not small steady ones.

**On Graviton (`g`):** ARM-based, typically ~20% better price/performance. Free
if your software runs on ARM, which for anything in a modern language it
usually does. Worth checking before defaulting to Intel.

### Purchasing options

| Option | Discount | Trade-off |
|--------|----------|-----------|
| **On-Demand** | — | Pay per second, no commitment |
| **Savings Plans / Reserved** | up to ~72% | Commit to 1 or 3 years of spend |
| **Spot** | up to ~90% | AWS reclaims the instance with 2 minutes' notice |
| **Dedicated Host** | — | Costs more; for licensing that is bound to physical cores |

Spot is excellent for anything that can be interrupted and restarted — CI
runners, batch jobs, stateless workers behind a queue. It is wrong for a
database.

---

## Key pairs

A **key pair** is how you prove who you are when connecting over SSH. AWS keeps
the public key and injects it into the instance's
`~/.ssh/authorized_keys` at first boot; you keep the private key.

The rules:

- **AWS never stores the private key.** Download it at creation or it is gone,
  and a lost key means no SSH access to instances already using it.
- **Key pairs are regional**, like AMIs.
- The default username depends on the AMI: `ec2-user` for Amazon Linux,
  `ubuntu` for Ubuntu, `admin` for Debian.
- A `.pem` file must be mode `400` or OpenSSH refuses it.

**The better answer is to not use SSH keys at all.** **AWS Systems Manager
Session Manager** gives a shell through the SSM agent and the AWS API: no key
to lose, no port 22 open to anything, every session logged in CloudTrail, and
access controlled by IAM rather than by who has a file. On a new project, start
there.

---

## Security Groups

A **security group** is a stateful virtual firewall attached to a network
interface, not to the instance as such.

| Property | Behaviour |
|----------|-----------|
| **Default inbound** | deny all |
| **Default outbound** | allow all |
| **Rules** | **allow only** — there is no deny rule |
| **State** | stateful: a reply to an allowed inbound request is automatically allowed out, regardless of outbound rules |
| **Evaluation** | all rules from all attached groups are unioned |
| **Limit** | up to 5 security groups per interface |

That "no deny rule" line is the one people trip over. You cannot block one IP
with a security group — you can only list what is allowed. Blocking is what
**Network ACLs** are for.

A rule's source can be a CIDR block *or another security group*. The second
form is how tiers are wired properly:

```
sg-web   : inbound 443 from 0.0.0.0/0
sg-app   : inbound 8080 from sg-web          ← not a CIDR
sg-db    : inbound 5432 from sg-app
```

Nothing reaches the database unless it comes from something wearing `sg-app`.
Instances can be replaced and IPs can change; the rule still holds. Writing
`0.0.0.0/0` for SSH is the single most common AWS misconfiguration there is.

---

## EBS — Elastic Block Store

**EBS** provides network-attached block devices — virtual disks. An EBS volume
behaves like a physical disk you can detach from one instance and attach to
another.

| Type | Use | Note |
|------|-----|------|
| **gp3** | General purpose SSD. The default. | IOPS and throughput configured *independently of size* — unlike gp2, where you had to over-provision capacity to buy speed |
| **gp2** | Previous-generation SSD | Performance scales with size. Superseded by gp3 |
| **io2 / io2 Block Express** | High-performance SSD | Provisioned IOPS, higher durability. Databases |
| **st1** | Throughput HDD | Big sequential reads — logs, data warehouse |
| **sc1** | Cold HDD | Cheapest, rarely accessed |

Key behaviours:

- **An EBS volume lives in one Availability Zone** and can only attach to an
  instance in that same AZ.
- **Snapshots are incremental**, stored in S3, and *are* cross-AZ and
  cross-region — a snapshot is how a volume moves.
- **Encryption** is a checkbox, uses KMS, and costs nothing in performance.
  There is an account-level setting to encrypt all new volumes by default;
  turn it on.
- **`DeleteOnTermination`** defaults to *true* for the root volume and *false*
  for additional volumes. Forgetting this leaves orphaned volumes quietly
  billing for years.

### EBS vs instance store

**Instance store** is physical disk on the host machine. It is extremely fast
and **ephemeral**: stop the instance and the data is gone, permanently. It is
for caches, scratch space and temporary files — never for anything you need
back.

---

## Public vs private IP

Every instance gets a **private IPv4 address** from its subnet's CIDR range.
That address is the instance's real address; it does not change for the
instance's lifetime, and it is what everything inside the VPC uses.

A **public IPv4 address** is different. It is not configured on the instance at
all — the interface only ever sees the private IP. The internet gateway does
one-to-one NAT between the public and private address as packets pass through.
Run `ip addr` on an EC2 instance with a public IP and the public address is
nowhere to be seen.

| | Private IP | Public IP (auto-assign) | Elastic IP |
|---|---|---|---|
| Changes on stop/start | No | **Yes** | No |
| Reachable from internet | No | Yes | Yes |
| Cost | Free | Charged per hour (since Feb 2024) | Charged, including when not attached |

**Elastic IP** is a static public address you own and can move between
instances. The deliberate billing quirk: an EIP that is *not* attached to a
running instance costs more than one that is, specifically to discourage
hoarding.

In practice you want **neither** on most instances. Put them in private subnets
with no public IP, reach them through a load balancer for inbound traffic and a
NAT gateway for outbound. An instance with no public address cannot be port
scanned.

---

## Instance lifecycle

```
            launch
              │
              ▼
    ┌──> pending ──> running ──────────────┐
    │                 │   │                │
    │          stop ──┘   └── terminate ──>│
    │                 │                    │
    │              stopping                ▼
    │                 │               shutting-down
    │                 ▼                    │
    └── start ──── stopped                 ▼
                      │              terminated
                      └── terminate ──────>┘
```

What each transition actually does:

| State | Billing | What happens |
|-------|---------|--------------|
| **pending** | not billed | Instance is being provisioned |
| **running** | **billed** per second | Normal operation |
| **stopping / stopped** | **EBS still billed**, compute is not | Like powering off a PC. RAM is lost, instance store is lost, public IP is released |
| **rebooting** | billed | Stays on the same host. Keeps its instance store and public IP |
| **terminated** | not billed | Gone permanently. Root volume deleted unless configured otherwise |
| **hibernated** | EBS billed | RAM is written to the root volume and restored on start |

The distinctions that matter:

- **Reboot ≠ stop/start.** A reboot keeps the same physical host, so instance
  store data and the auto-assigned public IP survive. A stop/start moves the
  instance to a different host, and both are lost.
- **Terminate is not recoverable.** Enable termination protection on anything
  that matters.

---

## Common use cases

| Scenario | Shape |
|----------|-------|
| Web application | Auto Scaling group of `m7g` instances across 3 AZs, behind an Application Load Balancer |
| CI build runners | Spot instances in an Auto Scaling group — interruption just means a retried job |
| Legacy application that cannot be containerised | A single right-sized instance; the classic lift-and-shift |
| Batch / data processing | Compute-optimised Spot fleet, scaled from a queue depth |
| ML training | `p`/`g` GPU instances, usually Spot, checkpointing to S3 |
| Bastion host | …ideally not. Use SSM Session Manager and have no bastion at all |
| Self-managed database | Memory-optimised instance with io2 volumes — but ask first whether RDS should do this instead |

---

## How this connects to the rest of the session

Everything above is the layer Kubernetes sat on in the earlier sessions. A
managed node group is an Auto Scaling group of EC2 instances; a PersistentVolume
backed by the EBS CSI driver is an EBS volume; a `LoadBalancer` Service is an
ELB in front of those instances. Knowing what EC2 is doing underneath explains
why a pod cannot move between AZs when its volume cannot — the EBS
single-AZ rule, surfacing one layer up.
