# AWS VPC — Virtual Private Cloud

## What is VPC?

A VPC is your own isolated network inside AWS. You choose the IP address range,
carve it into subnets, decide what routes where, and control traffic at two
separate layers.

Nothing in AWS runs outside a VPC. EC2 instances, RDS databases, Lambda
functions with VPC access, EKS nodes — all of them have an elastic network
interface in a subnet in a VPC. Every AWS account gets a default VPC per
region, which is convenient for experiments and wrong for production: its
subnets are all public and auto-assign public IPs.

The mental model:

> A **VPC** is a private IP range in one region. It is divided into **subnets**,
> each in one Availability Zone. A **route table** decides where each subnet's
> traffic goes. **Security groups** and **NACLs** decide what is allowed.

A VPC spans every AZ in its region. A subnet never spans more than one.

---

## CIDR

**CIDR** notation writes an IP range as an address plus a prefix length:
`10.0.0.0/16`.

The prefix length says how many leading bits are fixed. The rest is free for
hosts:

| CIDR | Fixed bits | Addresses | Typical use |
|------|-----------|-----------|-------------|
| `/16` | 16 | 65,536 | A whole VPC |
| `/20` | 20 | 4,096 | A large subnet |
| `/24` | 24 | 256 | A normal subnet |
| `/28` | 28 | 16 | The smallest AWS allows |

Rules and gotchas:

- **VPC CIDR must be between /16 and /28**, and cannot be changed after
  creation — though secondary CIDR blocks can be added.
- Use **RFC 1918 private ranges**: `10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`.
- **AWS reserves 5 addresses in every subnet.** A `/24` gives you 251 usable
  hosts, not 256:

  | Address | Reserved for |
  |---------|-------------|
  | `.0` | Network address |
  | `.1` | VPC router |
  | `.2` | DNS |
  | `.3` | Future use |
  | `.255` | Broadcast (unused, still reserved) |

- **Plan for peering.** Overlapping CIDRs cannot be peered or connected over a
  Transit Gateway, ever. If every environment is `10.0.0.0/16`, they can never
  talk to each other. Allocate deliberately: `10.0.0.0/16` dev,
  `10.1.0.0/16` staging, `10.2.0.0/16` prod.

---

## Subnets

A **subnet** is a slice of the VPC's range, pinned to **one Availability
Zone**. Subnets are the unit of availability: to survive an AZ failure you need
resources in subnets in different AZs, which is why almost every reference
architecture has subnets in at least two or three.

**What makes a subnet public or private is its route table — nothing else.**
There is no "public" checkbox:

| | Public subnet | Private subnet |
|---|---|---|
| Route for `0.0.0.0/0` | → Internet Gateway | → NAT Gateway, or none |
| Inbound from internet | Possible | Impossible |
| Outbound to internet | Direct | Via NAT, source-translated |
| Typically holds | Load balancers, NAT gateways, bastions | Application servers, databases, caches |

The standard three-tier layout, per AZ:

```
VPC 10.0.0.0/16
│
├── AZ ap-south-1a
│   ├── 10.0.0.0/24    public   → IGW        (ALB, NAT GW)
│   ├── 10.0.10.0/24   private  → NAT GW     (app servers)
│   └── 10.0.20.0/24   private  → (no route) (RDS)
│
└── AZ ap-south-1b
    ├── 10.0.1.0/24    public   → IGW
    ├── 10.0.11.0/24   private  → NAT GW
    └── 10.0.21.0/24   private  → (no route)
```

The database tier has no internet route at all, in either direction. That is
not a restriction to work around — it is the point.

---

## Route tables

A **route table** is a list of destination CIDRs and where to send traffic for
each. Every subnet is associated with exactly one; unassociated subnets fall
back to the VPC's **main** route table.

Rules:

- **The local route always exists** and cannot be removed: the VPC's own CIDR →
  `local`. This is why everything in a VPC can reach everything else in it by
  default, subject to security groups.
- **Most specific prefix wins.** A route for `10.0.5.0/24` beats `0.0.0.0/0`.
- One route table can serve many subnets; a subnet cannot have two.

A public subnet's table:

| Destination | Target |
|-------------|--------|
| `10.0.0.0/16` | `local` |
| `0.0.0.0/0` | `igw-xxxxx` |

A private subnet's table:

| Destination | Target |
|-------------|--------|
| `10.0.0.0/16` | `local` |
| `0.0.0.0/0` | `nat-xxxxx` |

Change one line in the first table and the subnet stops being public. That is
genuinely the whole difference.

---

## Internet Gateway

An **Internet Gateway (IGW)** connects a VPC to the internet. It is horizontally
scaled and redundant by design — there is no bandwidth limit and nothing to
size.

It does two jobs:

1. Provides the route target for internet-bound traffic.
2. Performs **one-to-one NAT** between an instance's private IP and its public
   or Elastic IP.

That second job is why an EC2 instance never sees its own public address. The
IGW rewrites the header in flight.

**One IGW per VPC.** For an instance to actually reach the internet, three
things must all be true:

1. The subnet's route table has `0.0.0.0/0 → igw`.
2. The instance has a public or Elastic IP.
3. Security group and NACL allow the traffic.

Missing any one is the usual cause of "my instance has a public IP but I cannot
reach it".

---

## NAT Gateway

A **NAT Gateway** lets instances in *private* subnets make outbound connections
— to download packages, call an external API, reach AWS public endpoints — while
remaining unreachable from the internet.

It translates many private source addresses to one Elastic IP. Return traffic
for connections it initiated comes back; unsolicited inbound traffic has no
translation entry and is dropped. Outbound only, by construction.

| Property | Detail |
|----------|--------|
| **Placement** | In a **public** subnet, with a route to the IGW |
| **AZ scope** | Lives in one AZ. For resilience, one per AZ, each referenced by that AZ's private route table |
| **Scaling** | Automatic, up to 100 Gbps |
| **Cost** | **Hourly charge + per-GB processing** — one of the easiest AWS bills to accidentally run up |

A NAT gateway in only one AZ is a single point of failure *and* a cross-AZ data
transfer charge for every other AZ's traffic.

### VPC Endpoints — the way to avoid NAT costs

If private instances only need AWS services, a **VPC endpoint** keeps traffic on
the AWS network and off the NAT gateway entirely:

| Type | Services | Cost |
|------|----------|------|
| **Gateway endpoint** | S3, DynamoDB only | **Free** — a route table entry |
| **Interface endpoint** (PrivateLink) | Most other services | Hourly + per-GB, still usually cheaper than NAT |

An S3 gateway endpoint is free, takes one line of Terraform, and removes the
per-GB NAT charge for every S3 read. For a workload that moves data to and from
S3 it is the single highest-value change available.

---

## Security Groups

Covered in detail in `../02-ec2/README.md`. In the VPC context, what matters:

- Attached to **network interfaces**, not subnets.
- **Stateful** — return traffic is automatically allowed.
- **Allow rules only.** No deny.
- Sources can be **other security groups**, which is how tiers are wired
  without hardcoding IPs.
- Evaluated as a union of all attached groups.

---

## Network ACLs

A **NACL** is a stateless firewall at the **subnet** boundary.

| | Security Group | Network ACL |
|---|---|---|
| Attached to | Network interface | Subnet |
| State | **Stateful** | **Stateless** |
| Rules | Allow only | **Allow and deny** |
| Evaluation | All rules unioned | **In number order, first match wins** |
| Default (custom) | Deny all inbound, allow all outbound | **Deny everything, both ways** |
| Default (the default NACL) | — | Allow everything, both ways |

Two consequences follow from "stateless":

1. **You must write both directions.** Allowing inbound 443 is not enough — the
   reply leaves from port 443 to an ephemeral port on the client, so an
   outbound rule for ports **1024–65535** is also required. Forgetting this is
   the most common NACL mistake.
2. **Rule order matters.** Rules are numbered and evaluated lowest first; the
   first match wins and evaluation stops. A deny at rule 100 beats an allow at
   rule 200.

**When to use which:** security groups for essentially everything. NACLs for
the one thing security groups cannot do — an explicit **deny**, such as
blocking a specific hostile IP range at the subnet edge — and as a coarse
backstop between tiers. A NACL is a blunt instrument; reaching for it first
usually means a security group was the right answer.

---

## Public vs private subnet — the summary

| | Public | Private |
|---|---|---|
| Defined by | `0.0.0.0/0 → IGW` in its route table | no IGW route |
| Inbound from internet | Yes, if SG/NACL allow | **No. Not reachable** |
| Outbound to internet | Direct, via IGW | Via NAT gateway, or not at all |
| Needs a public IP | Yes, for the instance to be reachable | No |
| Put here | ALB, NAT gateway, bastion | App servers, databases, caches, EKS nodes |

The design rule that follows: **put as little as possible in public subnets.**
A load balancer and a NAT gateway is usually the complete list. Everything that
runs your actual code belongs in a private subnet, reachable only through the
load balancer and able to reach out only through NAT. An instance with no route
from the internet cannot be scanned, brute forced, or hit by an opportunistic
exploit — which is a stronger guarantee than any firewall rule.

---

## Common use cases

| Scenario | Shape |
|----------|-------|
| Three-tier web app | Public subnets for the ALB; private for app servers; isolated private for RDS; 2–3 AZs throughout |
| Private EKS cluster | Nodes in private subnets, NAT for image pulls, interface endpoints for the EKS API |
| Connect two VPCs | VPC Peering (simple, non-transitive) or Transit Gateway (hub and spoke, scales) |
| Connect to on-premises | Site-to-Site VPN over the internet, or Direct Connect for a dedicated line |
| Expose a service to another account | PrivateLink — the consumer gets an interface endpoint, no peering, no CIDR overlap problem |
| Cut NAT costs | S3 and DynamoDB gateway endpoints; interface endpoints for the rest |
| Audit traffic | VPC Flow Logs to S3 or CloudWatch Logs |

---

## How this connects to the rest of the session

The Kubernetes NetworkPolicies in Session 17 are this model one layer up: a
default-deny policy with explicit allows is a security group, and the
pod-to-pod isolation it enforces is the same idea as a private subnet with no
internet route. The difference is scope — a NetworkPolicy governs pods inside a
cluster, a security group governs network interfaces inside a VPC — but the
principle is identical, and so is the failure mode: it is always the direction
you forgot to allow.
