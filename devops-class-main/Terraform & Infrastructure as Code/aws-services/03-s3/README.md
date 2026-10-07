# AWS S3 — Simple Storage Service

## What is S3?

S3 is object storage: you put a blob of bytes in, give it a name, and get it
back later over HTTP. It is not a filesystem and not a block device — there is
no seeking, no partial write, no appending. An object is replaced whole or not
at all.

That constraint is what buys the properties S3 is famous for:

- **Effectively unlimited capacity.** No volume to size, no disk to extend.
- **11 nines of durability** (99.999999999%) — data is replicated across at
  least three Availability Zones automatically.
- **Pay for what you store**, not for what you provisioned.
- **It is an API, not a mount.** Every operation is an HTTPS request, which is
  why IAM can authorise individual objects.

S3 underlies far more than it appears to: EBS snapshots, AMIs, CloudTrail logs,
Terraform remote state and most data lakes are all objects in S3.

---

## Buckets

A **bucket** is the top-level container. Everything else lives inside one.

| Property | Detail |
|----------|--------|
| **Name** | **Globally unique across all of AWS** — not per account, not per region |
| **Naming rules** | 3–63 characters, lowercase letters, digits, hyphens and dots; must start and end with a letter or digit; cannot look like an IP address |
| **Region** | Chosen at creation and permanent. Data does not leave it unless you move it |
| **Limit** | 100 per account by default, raisable to 1,000 |

The global namespace is the thing that surprises people. `my-bucket` was taken
in 2006. This is exactly why the Terraform demo in this session appends a
random suffix:

```hcl
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  bucket_name = "${var.bucket_prefix}-${var.environment}-${random_id.suffix.hex}"
}
```

Avoid dots in bucket names. They break virtual-hosted-style HTTPS, because the
wildcard certificate `*.s3.amazonaws.com` does not cover a name with another
dot in it.

---

## Objects

An **object** is the data plus its metadata.

| Part | Detail |
|------|--------|
| **Key** | The full name, e.g. `logs/2026/10/07/app.log`. Up to 1,024 bytes |
| **Value** | The bytes. 0 bytes to 5 TB |
| **Version ID** | Present when versioning is on |
| **Metadata** | System (`Content-Type`, `Content-Length`) and user-defined (`x-amz-meta-*`) |
| **ETag** | Usually the MD5 of the content; not for multipart uploads |
| **Storage class** | Which tier it sits in |

### There are no folders

This is the single most important thing to understand about S3. The key
`logs/2026/app.log` is one flat string containing slashes. There is no
directory object, nothing to create, nothing to recurse into. The console draws
a folder tree by splitting keys on `/`, which is a presentation trick.

Consequences:

- "Renaming a folder" means copying every object to a new key and deleting the
  old ones. There is no cheap rename.
- An empty "folder" does not exist; it disappears when the last object with
  that prefix is deleted.
- **Prefix design matters.** S3 scales request rate per prefix, so
  `2026-10-07/user1/...` partitions better than `user1/2026-10-07/...` when
  writes are time-ordered.

### Uploads

Objects above 5 GB **must** use multipart upload, and multipart is a good idea
above ~100 MB regardless: parts upload in parallel and a failed part is retried
alone. The catch is that an abandoned multipart upload leaves parts that are
invisible in the console and **still billed** — which is why the demo
configuration includes:

```hcl
abort_incomplete_multipart_upload {
  days_after_initiation = 7
}
```

### Consistency

Since December 2020, S3 is **strongly read-after-write consistent** for all
operations. A successful `PUT` is immediately visible to a subsequent `GET`,
with no caveat. Older documentation describing eventual consistency for
overwrites is out of date.

---

## Storage classes

All classes have the same durability. They trade **retrieval cost and latency**
against **storage cost**.

| Class | Storage cost | Retrieval | Min. duration | For |
|-------|-------------|-----------|---------------|-----|
| **Standard** | highest | instant, free | — | Active data |
| **Intelligent-Tiering** | Standard + small monitoring fee | instant, free | — | Unpredictable access — moves objects between tiers automatically |
| **Standard-IA** | ~45% less | instant, **per-GB fee** | 30 days | Infrequent but needs instant access |
| **One Zone-IA** | ~20% less than IA | instant, per-GB fee | 30 days | Re-creatable data. **One AZ only** — an AZ loss destroys it |
| **Glacier Instant Retrieval** | much less | instant, per-GB fee | 90 days | Archives still queried occasionally |
| **Glacier Flexible Retrieval** | less again | minutes to 12 hours | 90 days | Backups |
| **Glacier Deep Archive** | cheapest | **12 hours** | 180 days | Compliance retention, 7-year tape replacement |

Two traps:

- **Minimum duration charges.** Delete a Standard-IA object after 3 days and
  you are billed for 30. Moving short-lived data to IA to save money can cost
  more.
- **Retrieval fees.** IA and Glacier charge per GB read. Data read often enough
  is cheaper in Standard, even at a higher storage rate.

**Intelligent-Tiering** exists because getting this right by hand is hard. It
monitors access per object and moves it, with no retrieval fees. For data whose
access pattern you genuinely do not know, it is usually the right default.

---

## Versioning

Versioning keeps every version of every object. With it on:

- An overwrite creates a **new version**; the old one remains retrievable.
- A delete does **not** delete — it writes a zero-byte **delete marker** that
  becomes the current version. The object vanishes from listings but every
  version is still there, and still billed.
- Deleting a *specific version ID* is the only permanent delete.

States are **enabled** or **suspended** — never "off" again. Once enabled, a
bucket can only be suspended, and existing versions are kept.

This is the best protection S3 offers against the most common disaster, which
is not AWS losing your data but your own script overwriting it. It is off by
default, which is why the demo turns it on explicitly:

```hcl
resource "aws_s3_bucket_versioning" "demo" {
  bucket = aws_s3_bucket.demo.id
  versioning_configuration {
    status = "Enabled"
  }
}
```

**MFA Delete** goes further: permanently deleting a version, or suspending
versioning, requires an MFA token. It can only be enabled by the root user
using the CLI, which is why it is rare outside compliance settings.

---

## Lifecycle policies

A **lifecycle configuration** is a set of rules that transition or expire
objects automatically by age.

Two actions:

- **Transition** — move to a cheaper storage class after N days
- **Expiration** — delete after N days

Both can target current versions, **noncurrent versions**, or incomplete
multipart uploads, and can be filtered by prefix, tag or object size.

A typical log-retention policy:

```
day 0   → Standard
day 30  → Standard-IA
day 90  → Glacier Flexible Retrieval
day 365 → deleted
```

Versioning without a lifecycle rule is a bill that only grows — every
superseded version is kept forever. The demo pairs them deliberately:

```hcl
rule {
  id     = "expire-noncurrent-versions"
  status = "Enabled"
  filter { prefix = "" }

  noncurrent_version_expiration {
    noncurrent_days = 30
  }
}
```

Rules are evaluated roughly once a day, asynchronously, so an object is not
transitioned at the exact moment it reaches the age threshold.

---

## Encryption

### At rest

| Mode | Key managed by | Notes |
|------|----------------|-------|
| **SSE-S3** (AES256) | AWS | **On by default** for all new objects since Jan 2023. Free |
| **SSE-KMS** | AWS KMS, your key | Auditable in CloudTrail, key policies, rotation. Costs per request |
| **DSSE-KMS** | KMS, applied twice | For regimes that mandate two layers |
| **SSE-C** | **You**, supplied per request | AWS stores nothing. Lose the key, lose the data |

**S3 Bucket Keys** matter with SSE-KMS: without them, every object operation is
a KMS API call, and on a busy bucket the KMS bill can exceed the storage bill.
A bucket key caches a data key and cuts those calls by up to 99%.

Encryption at rest is declared explicitly in the demo even though it is now the
default, because an auditable guarantee in code beats a default that could
change:

```hcl
rule {
  apply_server_side_encryption_by_default {
    sse_algorithm = "AES256"
  }
}
```

### In transit

TLS, via HTTPS. Worth enforcing with a bucket policy that denies any request
where `aws:SecureTransport` is false — otherwise plain HTTP is still accepted.

---

## Bucket policies

A **bucket policy** is a resource-based IAM policy attached to the bucket. The
difference from an identity-based policy is the `Principal` field: a bucket
policy says *who* may act, because it is attached to the thing being acted on
rather than to the actor.

Enforce TLS on every request:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": [
      "arn:aws:s3:::my-bucket",
      "arn:aws:s3:::my-bucket/*"
    ],
    "Condition": { "Bool": { "aws:SecureTransport": "false" } }
  }]
}
```

Note both ARNs again — the bucket for bucket-level actions, `/*` for object
actions.

### Access control, ranked

1. **Block Public Access** — four switches, account or bucket level. These
   *override* everything else; with them on, no policy or ACL can make the
   bucket public. Enabled by default on new buckets since April 2023, and the
   demo sets all four explicitly:

   ```hcl
   block_public_acls       = true
   block_public_policy     = true
   ignore_public_acls      = true
   restrict_public_buckets = true
   ```

2. **IAM policies** — for identities in your own account. The usual tool.
3. **Bucket policies** — for cross-account access, or account-wide conditions
   like the TLS rule above.
4. **ACLs** — the original mechanism, now effectively deprecated. Object
   Ownership defaults to `BucketOwnerEnforced`, which disables ACLs entirely.
   Do not start using them.
5. **Presigned URLs** — a time-limited URL carrying a signature, letting
   someone with no AWS credentials upload or download one object. The right
   answer for "let a user download their own file" — far better than making
   the bucket public.

**Public does not mean a website.** A bucket serving a static site still should
not be public: put CloudFront in front with Origin Access Control, so the
bucket is private and only the CDN can read it.

---

## Common use cases

| Scenario | Shape |
|----------|-------|
| Static website | S3 + CloudFront + OAC. Bucket stays private |
| Application uploads | Presigned PUT URLs; the browser uploads directly, bypassing your servers |
| Backups | Versioning + lifecycle to Glacier + Object Lock for immutability |
| Data lake | Partitioned prefixes, Parquet, queried in place by Athena |
| Log aggregation | ALB / CloudTrail / VPC flow logs write here natively |
| **Terraform remote state** | Versioned bucket, SSE-KMS, plus a DynamoDB table for state locking |
| Large file distribution | S3 + CloudFront, or S3 Transfer Acceleration for global uploads |
| Disaster recovery | Cross-Region Replication to a second region |

---

## How this connects to the rest of the session

The Terraform demo builds exactly the bucket this document argues for: private,
encrypted, versioned, with lifecycle rules to stop versioning becoming a
runaway bill, and all four public-access switches on. Reading `main.tf`
alongside this file should make each resource obvious — every one of them is a
paragraph above, written as code.
