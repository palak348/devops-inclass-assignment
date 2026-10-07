# terraform-s3-demo — the complete Terraform workflow

A Terraform project that creates an S3 bucket and everything a bucket should
have: versioning, encryption, a public access block, lifecycle rules and an
object. Every command below was run, and every block of output is the real
output, copied from the terminal.

---

## Where this runs

The configuration targets **LocalStack**, an AWS emulator that serves the real
AWS APIs on `localhost:4566`. The AWS provider, the resource types, the state
file and the API calls are all genuinely the AWS ones — only the endpoint
moves.

That choice is made by one variable:

```hcl
use_localstack = true
```

Set it to `false` and the identical configuration applies to a real AWS
account, reading credentials from the environment. Nothing else changes. The
mechanism is a `dynamic` block in `provider.tf`:

```hcl
dynamic "endpoints" {
  for_each = var.use_localstack ? [1] : []

  content {
    s3  = var.localstack_endpoint
    sts = var.localstack_endpoint
    iam = var.localstack_endpoint
  }
}
```

With the flag off, the block is not emitted at all and the provider resolves
AWS's real endpoints itself.

---

## Files

| File | Holds |
|------|-------|
| `provider.tf` | `terraform {}` version constraints, the `aws` and `random` providers, endpoint and credential wiring |
| `variables.tf` | Every input, with types, descriptions, defaults and validation rules |
| `main.tf` | The resources: bucket, versioning, encryption, public access block, lifecycle, object |
| `outputs.tf` | What the configuration returns — names, ARNs, and the settings that actually took effect |
| `terraform.tfvars` | The values. Loaded automatically. Contains **no secrets** |
| `.gitignore` | Keeps state, provider binaries and plan files out of git |
| `.terraform.lock.hcl` | Provider checksums. **Committed on purpose** — it is what makes `init` reproducible |

### Why the split

Terraform concatenates every `.tf` file in the directory; the filenames mean
nothing to Terraform. They mean a great deal to the next person reading it. The
convention above lets someone answer "what does this create?" by opening one
file, and "what can I change?" by opening another.

---

## What it builds

| Resource | Purpose |
|----------|---------|
| `random_id.suffix` | 4 random bytes appended to the bucket name |
| `aws_s3_bucket.demo` | The bucket |
| `aws_s3_bucket_versioning.demo` | Keeps old versions of every object |
| `aws_s3_bucket_server_side_encryption_configuration.demo` | AES256 at rest |
| `aws_s3_bucket_public_access_block.demo` | All four public-access switches on |
| `aws_s3_bucket_lifecycle_configuration.demo` | Expires old versions, aborts stalled uploads |
| `aws_s3_object.readme` | An object, so `destroy` has to deal with a non-empty bucket |

### Why the random suffix

S3 bucket names are unique **across all of AWS**, not per account. `my-bucket`
was taken in 2006. `random_id` generates the suffix once, stores it in state,
and keeps it stable across applies — so the bucket is not destroyed and
recreated on every run:

```hcl
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  bucket_name = "${var.bucket_prefix}-${var.environment}-${random_id.suffix.hex}"
}
```

### Why there is almost no `depends_on`

There are seven resources and only two `depends_on` lines. Terraform builds its
dependency graph by reading expressions: when `aws_s3_bucket_versioning.demo`
contains `bucket = aws_s3_bucket.demo.id`, Terraform knows the bucket must
exist first. **Writing the reference is declaring the dependency.**

`depends_on` is only for ordering that is real but invisible to the graph —
here, uploading the object *after* the public access block is in place, so
there is never a window where the bucket is less protected than the code says.

---

## Setup

```bash
# Terraform
terraform version
# Terraform v1.16.5
# on windows_amd64

# LocalStack
docker run -d --name localstack-s18 -p 4566:4566 -e SERVICES=s3 localstack/localstack:3

curl -s http://localhost:4566/_localstack/health
# {"services": {"s3": "available"}, ...}
```

---

## The workflow

### 1. `terraform init`

Downloads the providers named in `required_providers` and writes the lock file.
It is the only command that touches the network for plugins, and it must be run
once per directory — and again whenever providers or backends change.

```
Initializing the backend...

Initializing provider plugins...
- Finding hashicorp/random versions matching "~> 3.6"...
- Finding hashicorp/aws versions matching "~> 6.0"...
- Installing hashicorp/random v3.9.1...
- Installed hashicorp/random v3.9.1 (signed by HashiCorp)
- Installing hashicorp/aws v6.67.0...
- Installed hashicorp/aws v6.67.0 (signed by HashiCorp)

Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!
```

Note the version resolution: the constraint said `~> 6.0`, and Terraform chose
`6.67.0` — the newest release that satisfies it. The lock file records that
exact version plus its checksums, so the next `init` on another machine
installs the same bytes. That is why `.terraform.lock.hcl` is committed and
`.terraform/` is not.

### 2. `terraform fmt`

Rewrites files into canonical style — alignment, indentation, spacing. Running
it with `-check -diff` makes it a CI gate rather than a formatter:

```
$ terraform fmt -check -diff
$ echo $?
0
```

No output and exit code 0 means every file is already canonical. In a pipeline,
a non-zero exit fails the build, which ends formatting arguments permanently.

### 3. `terraform validate`

Checks the configuration is internally coherent — syntax, argument names,
types, references to resources that exist. It does **not** talk to AWS, so it
catches typos without needing credentials:

```
$ terraform validate
Success! The configuration is valid.
```

`validate` would not catch "this bucket name is already taken". That is
`plan`'s job.

### 4. `terraform plan`

Refreshes state, compares it to the configuration, and prints what it would
change. Nothing is modified. `-out` saves the plan so that `apply` executes
*exactly* what was reviewed:

```
Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_s3_bucket.demo will be created
  + resource "aws_s3_bucket" "demo" {
      + arn                         = (known after apply)
      + bucket                      = (known after apply)
      + bucket_domain_name          = (known after apply)
      + bucket_regional_domain_name = (known after apply)
      + force_destroy               = true
      + hosted_zone_id              = (known after apply)
      + id                          = (known after apply)
      + object_lock_enabled         = (known after apply)
      + region                      = "ap-south-1"
      ...
    }

Plan: 6 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + api_endpoint          = "http://localhost:4566"
  + bucket_arn            = (known after apply)
  + bucket_domain_name    = (known after apply)
  + bucket_name           = (known after apply)
  + bucket_region         = "ap-south-1"
  + encryption_algorithm  = "AES256"
  + lifecycle_rule_ids    = []
  + object_key            = "hello/readme.txt"
  + public_access_blocked = true
  + versioning_status     = "Enabled"

Saved the plan to: tfplan
```

**`(known after apply)`** is the thing worth understanding here. Terraform
cannot know the ARN before the bucket exists, so it tracks it as an unknown
value and resolves it during apply. Values that *are* known — `region`,
`force_destroy`, the literal outputs — are shown now, which is why a plan can
be reviewed meaningfully before anything is created.

The three symbols:

| Symbol | Meaning |
|--------|---------|
| `+` | create |
| `-` | destroy |
| `~` | update in place |
| `-/+` | **destroy and recreate** — the one to read carefully |

### 5. `terraform apply`

Executes the saved plan. No second confirmation prompt, because the plan was
already reviewed:

```
random_id.suffix: Creating...
random_id.suffix: Creation complete after 0s [id=R1myjQ]
aws_s3_bucket.demo: Creating...
aws_s3_bucket.demo: Creation complete after 1s [id=palak-tf-demo-dev-4759b28d]
aws_s3_bucket_public_access_block.demo: Creating...
aws_s3_bucket_versioning.demo: Creating...
aws_s3_bucket_server_side_encryption_configuration.demo: Creating...
aws_s3_bucket_server_side_encryption_configuration.demo: Creation complete after 0s [id=palak-tf-demo-dev-4759b28d]
aws_s3_bucket_public_access_block.demo: Creation complete after 0s [id=palak-tf-demo-dev-4759b28d]
aws_s3_object.readme: Creating...
aws_s3_object.readme: Creation complete after 0s [id=palak-tf-demo-dev-4759b28d/hello/readme.txt]
aws_s3_bucket_versioning.demo: Creation complete after 2s [id=palak-tf-demo-dev-4759b28d]

Apply complete! Resources: 6 added, 0 changed, 0 destroyed.

Outputs:

api_endpoint = "http://localhost:4566"
bucket_arn = "arn:aws:s3:::palak-tf-demo-dev-4759b28d"
bucket_domain_name = "palak-tf-demo-dev-4759b28d.s3.amazonaws.com"
bucket_name = "palak-tf-demo-dev-4759b28d"
bucket_region = "ap-south-1"
encryption_algorithm = "AES256"
lifecycle_rule_ids = []
object_key = "hello/readme.txt"
public_access_blocked = true
versioning_status = "Enabled"
```

The ordering in that log is the dependency graph executing. `random_id` and the
bucket go first because everything depends on them; the three bucket settings
then run **in parallel**, because none of them references the others. Terraform
walks the graph and parallelises everything it is allowed to — the default is
10 concurrent operations.

Note `aws_s3_object.readme` starting only after the public access block
finished. That is the `depends_on` doing its job.

### 6. `terraform show`

Prints the full state in human-readable form — every attribute of every
resource, including the ones AWS filled in:

```
# aws_s3_bucket.demo:
resource "aws_s3_bucket" "demo" {
    acceleration_status         = null
    arn                         = "arn:aws:s3:::palak-tf-demo-dev-4759b28d"
    bucket                      = "palak-tf-demo-dev-4759b28d"
    bucket_domain_name          = "palak-tf-demo-dev-4759b28d.s3.amazonaws.com"
    bucket_namespace            = "global"
    bucket_region               = "ap-south-1"
    bucket_regional_domain_name = "palak-tf-demo-dev-4759b28d.s3.ap-south-1.amazonaws.com"
    force_destroy               = true
    hosted_zone_id              = "Z11RGJOFQNVJUP"
    id                          = "palak-tf-demo-dev-4759b28d"
    object_lock_enabled         = false
    policy                      = null
    region                      = "ap-south-1"
    request_payer               = "BucketOwner"
    ...
}
```

`terraform state list` gives the short version:

```
aws_s3_bucket.demo
aws_s3_bucket_public_access_block.demo
aws_s3_bucket_server_side_encryption_configuration.demo
aws_s3_bucket_versioning.demo
aws_s3_object.readme
random_id.suffix
```

### 7. `terraform output`

Returns just the declared outputs — the configuration's public interface:

```
api_endpoint = "http://localhost:4566"
bucket_arn = "arn:aws:s3:::palak-tf-demo-dev-4759b28d"
bucket_domain_name = "palak-tf-demo-dev-4759b28d.s3.amazonaws.com"
bucket_name = "palak-tf-demo-dev-4759b28d"
bucket_region = "ap-south-1"
encryption_algorithm = "AES256"
lifecycle_rule_ids = []
object_key = "hello/readme.txt"
public_access_blocked = true
versioning_status = "Enabled"
```

`-raw` returns one value with no quotes, which is what you pipe into other
commands:

```
$ terraform output -raw bucket_name
palak-tf-demo-dev-4759b28d
```

Several of these outputs are deliberately not just names. `versioning_status`,
`encryption_algorithm` and `public_access_blocked` report what **actually took
effect**, read back from the resources rather than echoed from the variables —
so the output proves the setting rather than restating the intent.

---

## Independent verification

Terraform reporting success is Terraform reporting on itself. These checks go
straight to the S3 API, with Terraform not involved:

```
$ awslocal s3 ls
2026-10-07 16:18:51 palak-tf-demo-dev-4759b28d

$ awslocal s3 ls s3://palak-tf-demo-dev-4759b28d --recursive
2026-10-07 16:18:51        190 hello/readme.txt

$ awslocal s3 cp s3://palak-tf-demo-dev-4759b28d/hello/readme.txt -
Created by Terraform.

Bucket      : palak-tf-demo-dev-4759b28d
Region      : ap-south-1
Environment : dev

This file exists so that `terraform destroy` has to deal with a
non-empty bucket.

$ awslocal s3api get-bucket-versioning --bucket palak-tf-demo-dev-4759b28d
{
    "Status": "Enabled"
}

$ awslocal s3api get-bucket-encryption --bucket palak-tf-demo-dev-4759b28d
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": false
            }
        ]
    }
}

$ awslocal s3api get-public-access-block --bucket palak-tf-demo-dev-4759b28d
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```

Object content interpolated from Terraform variables, versioning on, AES256 at
rest, all four public-access switches true. The configuration did what it said.

---

## Drift detection

Running `plan` again against unchanged configuration should report no changes.
It did not:

```
  # aws_s3_bucket.demo will be updated in-place
  ~ resource "aws_s3_bucket" "demo" {
        id       = "palak-tf-demo-dev-4759b28d"
      ~ tags     = {
          + "Name"    = "palak-tf-demo-dev-4759b28d"
          + "Purpose" = "Session 18 Terraform demo"
        }
      ~ tags_all = {
          + "ManagedBy" = "Terraform"
          + "Name"      = "palak-tf-demo-dev-4759b28d"
          + "Owner"     = "24BCS10504"
          + "Project"   = "terraform-s3-demo"
          + "Purpose"   = "Session 18 Terraform demo"
          + "Session"   = "18"
        }
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

The cause, confirmed against the API:

```
$ awslocal s3api get-bucket-tagging --bucket palak-tf-demo-dev-4759b28d
An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation:
The TagSet does not exist
```

LocalStack accepts the tags on write and does not return them on read, so
Terraform sees the tags missing on every refresh and plans to add them again,
forever. It is a LocalStack fidelity gap rather than a configuration error —
real S3 returns tags, and the second plan there says `No changes`.

It is also the clearest possible demonstration of **what `plan` is for**.
Terraform does not trust its own state: it re-reads the real world first, and
reports the difference. If someone had edited the bucket in the console, this
is exactly how it would surface.

---

## 8. `terraform destroy`

```
random_id.suffix: Refreshing state... [id=R1myjQ]
aws_s3_bucket.demo: Refreshing state... [id=palak-tf-demo-dev-4759b28d]
aws_s3_bucket_public_access_block.demo: Refreshing state... [id=palak-tf-demo-dev-4759b28d]
aws_s3_bucket_server_side_encryption_configuration.demo: Refreshing state... [id=palak-tf-demo-dev-4759b28d]
aws_s3_bucket_versioning.demo: Refreshing state... [id=palak-tf-demo-dev-4759b28d]
aws_s3_object.readme: Refreshing state... [id=palak-tf-demo-dev-4759b28d/hello/readme.txt]

...

aws_s3_bucket_versioning.demo: Destroying... [id=palak-tf-demo-dev-4759b28d]
aws_s3_object.readme: Destroying... [id=palak-tf-demo-dev-4759b28d/hello/readme.txt]
aws_s3_bucket_server_side_encryption_configuration.demo: Destroying... [id=palak-tf-demo-dev-4759b28d]
aws_s3_bucket_versioning.demo: Destruction complete after 0s
aws_s3_bucket_server_side_encryption_configuration.demo: Destruction complete after 0s
aws_s3_object.readme: Destruction complete after 0s
aws_s3_bucket_public_access_block.demo: Destroying... [id=palak-tf-demo-dev-4759b28d]
aws_s3_bucket_public_access_block.demo: Destruction complete after 0s
aws_s3_bucket.demo: Destroying... [id=palak-tf-demo-dev-4759b28d]
aws_s3_bucket.demo: Destruction complete after 0s
random_id.suffix: Destroying... [id=R1myjQ]
random_id.suffix: Destruction complete after 0s

Destroy complete! Resources: 6 destroyed.
```

And confirmed from outside Terraform:

```
$ awslocal s3 ls
$
```

Nothing left.

Destroy walks the dependency graph **backwards**: the object and the bucket
settings go first, then the bucket, then `random_id`. Deleting the bucket while
an object still referenced it would fail, so the order is not cosmetic.

The bucket had an object in it, and the destroy still succeeded, because of:

```hcl
force_destroy = var.force_destroy   # true in terraform.tfvars
```

Without it, AWS refuses to delete a non-empty bucket and Terraform does not
silently empty one for you. True is right for a demo; for anything holding real
data it should be false, so that a careless `destroy` fails loudly instead of
deleting everything.

---

## State

`terraform.tfstate` is the mapping between the configuration and the real
world. It records that `aws_s3_bucket.demo` *is* the bucket
`palak-tf-demo-dev-4759b28d`, with every attribute AWS returned.

Three consequences:

1. **Losing it means losing the link.** Terraform no longer knows the bucket is
   its, and a new apply tries to create a second one. Recovery means
   `terraform import`, resource by resource.
2. **It contains everything, in plaintext** — including values a provider marks
   sensitive. It is in `.gitignore` for exactly that reason, and it is why real
   projects use a remote backend with encryption rather than a local file.
3. **It is why `plan` is fast.** Terraform refreshes against the API and diffs
   against state, rather than reconstructing the world from nothing.

The production pattern — the one this bucket would itself be used for — is a
**remote backend**: state in a versioned, encrypted S3 bucket, with a DynamoDB
table providing a lock so two engineers cannot apply simultaneously. The local
file is fine for a single-person demo and wrong for a team.

---

## Issues faced & fixes

| # | Problem | Cause | Fix |
|---|---------|-------|-----|
| 1 | `terraform apply` hung on `aws_s3_bucket_lifecycle_configuration` for exactly 3 minutes, then failed: `timeout while waiting for state to become 'true' ... GetBucketLifecycleConfiguration, context deadline exceeded` | After writing a lifecycle configuration the AWS provider re-reads it and waits until the response matches what it sent. LocalStack's response is missing fields real S3 returns, so the comparison never succeeds | First tried writing the filter explicitly as `filter { prefix = "" }` instead of `filter {}`, to make the round trip symmetric. It did not help — the gap is in fields the config does not control |
| 2 | Same resource, after the first fix | Confirmed the rules *are* written correctly — the raw API response below proves it. Only the provider's verification loop fails | Gave the resource `count = var.use_localstack ? 0 : 1`, with the reason in a comment. It is skipped on LocalStack and applies normally against real AWS. Suppressing a tool limitation is not the same as suppressing a finding |
| 3 | A second `plan` on unchanged configuration reported `1 to change` instead of `No changes` | LocalStack accepts `PutBucketTagging` but returns `NoSuchTagSet` on read, so Terraform sees the tags as missing every time | Left as-is and documented. It is a LocalStack gap, not a config error — and it demonstrates drift detection better than anything contrived would |
| 4 | `localstack/localstack:latest` exited immediately with code 55: `License activation failed! No credentials were found` | The current LocalStack images are the Pro build and need an auth token | Pinned to `localstack/localstack:3`, the last community image |
| 5 | Writing large `.tf` and `.md` files through a shell heredoc failed with `unexpected EOF while looking for matching quote` | Backticks and quotes in the content were being interpreted before the heredoc terminated | Wrote the files directly instead of piping them through the shell |

### Evidence for #2

The lifecycle rules were genuinely created — this is the raw API response
during the failed apply:

```xml
<LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Rule>
    <ID>expire-noncurrent-versions</ID>
    <Filter><Prefix /></Filter>
    <Status>Enabled</Status>
    <NoncurrentVersionExpiration><NoncurrentDays>30</NoncurrentDays></NoncurrentVersionExpiration>
  </Rule>
  <Rule>
    <ID>abort-incomplete-uploads</ID>
    <Filter><Prefix /></Filter>
    <Status>Enabled</Status>
    <AbortIncompleteMultipartUpload><DaysAfterInitiation>7</DaysAfterInitiation></AbortIncompleteMultipartUpload>
  </Rule>
</LifecycleConfiguration>
```

Both rules, correct, present. The apply failed anyway, because the provider
asks "does what I read back match what I wrote?" and the answer under LocalStack
is no.

---

## Command reference

```bash
terraform init                 # download providers, write the lock file
terraform fmt                  # canonical formatting
terraform fmt -check -diff     # CI gate: non-zero exit if anything is unformatted
terraform validate             # syntax and type checking, offline
terraform plan                 # show what would change
terraform plan -out=tfplan     # save the plan so apply runs exactly it
terraform apply tfplan         # execute a saved plan, no prompt
terraform apply -auto-approve  # plan and apply in one step, no prompt
terraform show                 # full state, human readable
terraform state list           # just the resource addresses
terraform output               # all outputs
terraform output -raw NAME     # one output, unquoted, for piping
terraform destroy              # remove everything in state
```
