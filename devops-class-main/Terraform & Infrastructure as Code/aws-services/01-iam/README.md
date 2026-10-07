# AWS IAM — Identity and Access Management

## What is IAM?

IAM is the service that answers one question for every single AWS API call:
**is this caller allowed to do this?**

Every action in AWS — creating a bucket, stopping an instance, reading a
database row — arrives at AWS as an API request signed by some identity. IAM
evaluates that request against the policies attached to that identity and
returns allow or deny. The console, the CLI and Terraform are all just
different ways of producing those same signed requests.

Three properties make IAM unusual among AWS services:

- **It is global.** An IAM user is not in a region. Buckets, instances and
  subnets are regional; identities are not.
- **It is free.** There is no charge for users, roles or policies.
- **It is default-deny.** A brand-new user can do nothing at all until
  something explicitly grants permission.

---

## Users

An **IAM user** is a long-lived identity for a specific person or application.
It has:

- a name, unique within the account
- optionally a **password**, for console sign-in
- optionally **access keys** (an access key ID and a secret access key), for
  the CLI, SDKs and tools like Terraform

The important weakness: access keys are long-lived static credentials. They do
not expire on their own, they get pasted into config files, and they end up
committed to git. Most real AWS credential leaks are IAM user access keys.

### The root user

The account root user is the email address the account was created with. It
can do *everything*, including closing the account, and its permissions cannot
be restricted by any policy.

The correct handling of the root user is:

1. Enable MFA on it.
2. Delete any access keys it has.
3. Create an admin IAM user (or better, an identity in IAM Identity Center).
4. Never sign in as root again except for the handful of tasks that genuinely
   require it — changing the account's support plan, closing the account.

---

## Groups

A **group** is a collection of users that policies attach to. Users in the
group inherit the group's permissions.

Groups exist because attaching policies to individuals does not scale. With ten
developers, granting a new permission means ten edits and the near certainty
that one gets missed. With a `Developers` group it is one edit.

Points that are easy to get wrong:

- A group is **not an identity**. Nothing can "log in as" a group, and a group
  cannot be named in a policy's `Principal`.
- Groups **cannot be nested**. There is no group inside a group.
- A user can belong to multiple groups and receives the union of their
  permissions.

---

## Roles

A **role** is an identity with permissions but **no credentials of its own**.
Instead of a password or access keys, a role is *assumed*: a principal allowed
to assume it calls `sts:AssumeRole` and receives temporary credentials that
expire, typically within an hour.

This is the single most important concept in IAM, because it is how you stop
having static keys at all.

Every role has two policies, and conflating them is the most common IAM
mistake:

| | What it answers | Also called |
|---|---|---|
| **Trust policy** | *Who is allowed to assume this role?* | assume role policy |
| **Permissions policy** | *What can the role do once assumed?* | — |

A role with a perfect permissions policy and no trust policy is useless —
nobody can become it.

### Where roles are used

- **EC2 instance profile** — an instance gets a role, the SDK on it fetches
  temporary credentials from the instance metadata service automatically. No
  keys on the box.
- **Service roles** — Lambda, ECS tasks and CodeBuild each assume a role to act
  on your behalf.
- **Cross-account access** — an account's role trusts another account's
  principals, so there is no need to create users in both.
- **Federation / OIDC** — an external identity provider (Google Workspace,
  Okta, or GitHub Actions) exchanges its token for AWS credentials. This is how
  a CI pipeline should talk to AWS: no secret stored in the repository at all.

---

## Policies

A **policy** is a JSON document listing permissions. A minimal one:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOneBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::palak-tf-demo-dev",
        "arn:aws:s3:::palak-tf-demo-dev/*"
      ],
      "Condition": {
        "IpAddress": { "aws:SourceIp": "203.0.113.0/24" }
      }
    }
  ]
}
```

Element by element:

| Element | Meaning |
|---------|---------|
| `Version` | The policy language version. Always `2012-10-17` — this is not a date you choose. |
| `Sid` | An optional label, for humans. |
| `Effect` | `Allow` or `Deny`. |
| `Action` | The API operations, as `service:Operation`. Wildcards allowed (`s3:Get*`). |
| `Resource` | The ARNs the actions apply to. |
| `Condition` | Optional extra tests — source IP, MFA present, a tag's value, the time of day. |

Note the two separate ARNs above. `arn:aws:s3:::bucket` is the bucket itself
(what `ListBucket` acts on); `arn:aws:s3:::bucket/*` is the objects inside it
(what `GetObject` acts on). Listing only one is a classic cause of mysterious
AccessDenied errors.

### Policy types

| Type | Attached to | Notes |
|------|-------------|-------|
| **Identity-based** | user, group, role | The usual kind. |
| **Resource-based** | the resource (S3 bucket policy, SQS queue policy, KMS key policy) | Has a `Principal` field — identity-based policies do not, because the identity is implied by what it is attached to. |
| **AWS managed** | — | Written and maintained by AWS, e.g. `ReadOnlyAccess`. Convenient; usually far broader than you need. |
| **Customer managed** | — | Yours. Reusable, versioned. The right default. |
| **Inline** | one identity only | Deleted with the identity. Useful when the policy must never be reused elsewhere. |
| **Permissions boundary** | user or role | A ceiling. It does not grant anything; it caps what any other policy can grant. |
| **SCP** (Service Control Policy) | an AWS Organizations OU or account | A ceiling for an entire account, root user included. |

---

## Permissions — how a request is actually evaluated

IAM evaluates every request in a fixed order:

1. **Start at implicit deny.** Nothing is allowed by default.
2. **Is there an explicit `Deny`** in any applicable policy? → **denied**, and
   nothing can override it.
3. Does an SCP, permissions boundary or session policy exclude it? → denied.
4. **Is there an explicit `Allow`?** → allowed.
5. Otherwise → denied by default.

The two rules worth memorising:

- **An explicit deny always wins.** No allow, anywhere, beats it.
- **Absence of an allow is a deny.** Permissions are additive from zero.

---

## Least privilege

**Grant exactly the permissions needed to do the job, on exactly the resources
involved, and nothing more.**

This is a direction of travel, not a box to tick. The practical version:

- Start from **zero** and add what breaks, rather than starting from `*` and
  trimming. Trimming never finishes, because nothing fails when a permission is
  too broad.
- Scope `Resource` to specific ARNs. `"Resource": "*"` combined with
  `"Action": "s3:*"` grants access to every bucket in the account, including
  ones that do not exist yet.
- Prefer `s3:GetObject` to `s3:*`. Prefer a named bucket to a wildcard.
- Use **IAM Access Analyzer** to generate a policy from CloudTrail history — it
  reports what an identity actually used over the last N days, which is almost
  always far less than it was granted.
- Re-check. Permissions accumulate: a role gathers access during an incident
  and nobody takes it away afterwards.

The reason it matters is blast radius. Least privilege does not stop a
credential being stolen — it decides how much damage the thief can do.

---

## IAM best practices

1. **Lock down the root user.** MFA on, no access keys, never used day to day.
2. **MFA everywhere**, especially for anything with write access.
3. **Prefer roles to users.** Temporary credentials that expire beat static
   keys that do not. For workloads this is non-negotiable: EC2 gets an instance
   profile, Lambda gets an execution role, CI gets OIDC federation.
4. **No access keys on an EC2 instance.** If a `.aws/credentials` file is on a
   server, that is a finding.
5. **Use groups for humans**, not per-user policies.
6. **Customer managed policies over inline**, so they can be reviewed and
   reused.
7. **Rotate what must be static**, and audit regularly — the IAM credential
   report lists every user, their key ages and their last activity.
8. **Use conditions.** `aws:MultiFactorAuthPresent`, `aws:SourceIp` and
   `aws:RequestedRegion` turn a broad permission into a narrow one.
9. **Permissions boundaries** when delegating: let a team lead create roles,
   but cap what those roles can ever be granted.
10. **CloudTrail on, in every region.** IAM tells you what is permitted;
    CloudTrail tells you what was done.
11. **Write IAM as code.** A policy in Terraform is reviewable in a pull
    request; a policy clicked into the console is not.

---

## Common use cases

| Scenario | The IAM shape |
|----------|---------------|
| Application on EC2 needs to read a bucket | Instance profile with a role granting `s3:GetObject` on that bucket's ARN |
| Lambda writes to DynamoDB | Execution role with `dynamodb:PutItem` on that table |
| GitHub Actions deploys to AWS | OIDC identity provider + role whose trust policy names the repository — **no stored secret** |
| Vendor needs read-only access | Cross-account role, trust policy naming their account, `ReadOnlyAccess` plus an `ExternalId` condition |
| Developers get console access | `Developers` group, policies on the group, MFA enforced by condition |
| Enforce "no resources outside ap-south-1" | SCP denying on `aws:RequestedRegion` |
| Billing visible to finance, nothing else | Group with `AWSBillingReadOnlyAccess` |

---

## How this connects to the rest of the session

The Terraform demo in this session creates an S3 bucket with a public access
block. That control is IAM-adjacent: it means no bucket policy or ACL can make
the bucket public, regardless of what some future identity-based policy tries
to allow. IAM decides who may act; the public access block decides what the
resource will accept — and defence in depth means using both.
