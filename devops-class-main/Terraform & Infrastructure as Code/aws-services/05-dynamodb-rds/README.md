# AWS Database Services — DynamoDB and RDS

Two managed database services that solve different problems. The choice between
them is not "NoSQL is modern, SQL is legacy" — it is about whether your access
patterns are known and narrow, or open-ended.

---

# DynamoDB

## NoSQL

**NoSQL** describes databases that do not use the relational model. DynamoDB
specifically is a **key-value and document** store.

What you give up compared to a relational database:

- No joins
- No foreign keys or referential integrity
- No `GROUP BY`, no aggregate functions, no ad-hoc `WHERE` across arbitrary
  columns
- No schema enforcement beyond the key attributes

What you get:

- **Single-digit millisecond latency at any scale.** Performance does not
  degrade as the table grows from a thousand items to a billion
- **No server to manage, patch, or size.** There is no instance
- **Automatic replication across three AZs**
- **Scaling with no downtime** — on-demand mode needs no capacity planning at
  all

The trade is real: DynamoDB is fast because it refuses to do the expensive
things. A query that would be a three-table join in SQL has to be designed for
in advance, usually by denormalising.

**The design rule:** in SQL you model the data and then write queries. In
DynamoDB you list the queries and *then* model the data. Getting this backwards
is why most unhappy DynamoDB projects are unhappy.

---

## Tables

A **table** is a collection of items. Unlike SQL, a table has **no fixed
schema** — the only thing declared at creation is the **primary key**.

| Property | Detail |
|----------|--------|
| Primary key | Declared at creation, **immutable** |
| Other attributes | Any item may have any attributes |
| Size limit | None on the table |
| Region | Regional, replicated across 3 AZs automatically |

### Capacity modes

| Mode | Billing | Use when |
|------|---------|----------|
| **On-demand** | Per request | Traffic is unpredictable, spiky, or new. No capacity planning |
| **Provisioned** | Per hour for reserved RCU/WCU | Traffic is steady and predictable. Cheaper at sustained load, and supports auto scaling |

Start on-demand. Move to provisioned only once there is enough history to know
the shape of the load.

---

## Items

An **item** is one record — the rough equivalent of a row.

- Maximum size: **400 KB**, including attribute names
- Each item is uniquely identified by its primary key
- Items in the same table need not share any attributes beyond the key

The 400 KB limit shapes designs. Anything larger — an image, a document, a
large blob — goes in **S3**, and the item holds the S3 key. This is a standard
pattern, not a workaround.

---

## Attributes

**Attributes** are the name-value pairs inside an item.

| Category | Types |
|----------|-------|
| **Scalar** | String, Number, Binary, Boolean, Null |
| **Document** | List, Map — nestable, like JSON |
| **Set** | String Set, Number Set, Binary Set — unordered, no duplicates |

Key attributes must be scalar (String, Number, or Binary) and must be present
on every item. Everything else is optional per item.

---

## Partition key

The **partition key** (also called the hash key) is the mandatory part of the
primary key. DynamoDB hashes it to decide which physical partition stores the
item.

This makes partition key choice the most consequential decision in the whole
design:

- **High cardinality, evenly accessed** is what you want. `user_id`,
  `order_id`, `device_id`.
- **Low cardinality is a hot partition.** Using `status` as a partition key,
  with values `active` and `inactive`, forces half your traffic onto one
  partition — which has its own throughput ceiling regardless of what the table
  is provisioned for.
- Partition keys **cannot be range-queried**. You can look up one exact value,
  never "all keys starting with X".

If the natural key is skewed, **write sharding** helps: append a random suffix
(`active#1` … `active#10`) and query all shards in parallel.

---

## Sort key

The **sort key** (range key) is optional. With one, the primary key becomes
composite: partition key + sort key, and that *pair* must be unique.

The sort key is what makes DynamoDB more than a hash map. Within a single
partition key you can:

- range query — `BETWEEN`, `<`, `>`
- prefix match — `begins_with`
- retrieve in sorted order, ascending or descending
- fetch the top N by taking a limit

A common design:

| Partition key | Sort key | Item |
|---------------|----------|------|
| `USER#1024` | `PROFILE` | the user's profile |
| `USER#1024` | `ORDER#2026-10-01` | an order |
| `USER#1024` | `ORDER#2026-10-07` | a later order |

One query on `USER#1024` with `begins_with(sk, "ORDER#")` returns that user's
orders, already sorted by date, in one request. This is **single-table
design**: multiple entity types in one table, distinguished by key prefix, so
related data is co-located and retrievable together — the DynamoDB substitute
for a join.

### Secondary indexes

| Index | Key | Notes |
|-------|-----|-------|
| **LSI** — Local Secondary Index | same partition key, different sort key | Must be created with the table. Shares the partition's capacity |
| **GSI** — Global Secondary Index | **any** partition and sort key | Added any time. Own capacity. **Eventually consistent only** |

GSIs are how you support a second access pattern — "find the order by its
tracking number" when the table is keyed by user.

### Query vs Scan

- **Query** — uses the partition key. Efficient. Reads only matching items.
- **Scan** — reads **every item in the table**, then filters. Slow, expensive,
  and scales with table size.

A filter expression on a Scan does not save anything: you are billed for every
item read, before filtering. If the application needs a Scan in its hot path,
the data model is wrong.

---

## DynamoDB use cases

| Scenario | Why |
|----------|-----|
| Session store | Key-value by session ID, TTL auto-expires rows |
| Shopping cart | Key by user, low latency, high write rate |
| IoT telemetry | Huge write volume, partition by device, sort by timestamp |
| Gaming leaderboards | Composite key, sort by score |
| **Terraform state locking** | Strongly consistent conditional write — exactly what a lock needs |
| User profiles / preferences | Simple lookup by user ID |
| Event sourcing | Append-only, partition by aggregate, sort by sequence |

**Poor fits:** reporting and analytics, anything needing ad-hoc queries,
anything with complex many-to-many relationships, or any workload whose access
patterns are not yet known.

### Features worth knowing

- **TTL** — a timestamp attribute; DynamoDB deletes expired items free of
  charge
- **Streams** — a change log of the table, consumable by Lambda. The basis for
  most event-driven designs on DynamoDB
- **Global Tables** — multi-region, multi-active replication
- **PITR** — point-in-time recovery to any second in the last 35 days
- **DAX** — an in-memory cache that cuts read latency to microseconds

---

# RDS

## Relational database

**RDS** is managed relational database hosting. You still get a real database
engine with SQL, schemas, joins, transactions and foreign keys — AWS takes over
the operational work:

- provisioning and OS patching
- engine minor-version upgrades
- automated backups and point-in-time recovery
- replication, failover and monitoring

What AWS does **not** take over: schema design, query tuning, indexing and
connection management. RDS removes the sysadmin, not the DBA.

---

## Supported engines

| Engine | Notes |
|--------|-------|
| **PostgreSQL** | The usual default for new work. Rich types, strong extension ecosystem |
| **MySQL** | Widest compatibility with existing applications |
| **MariaDB** | MySQL fork |
| **Oracle** | Licensing is the complication — bring your own or licence-included |
| **SQL Server** | Several editions, licence-included |
| **Amazon Aurora** | AWS's own MySQL- and PostgreSQL-compatible engine |

### Aurora

Aurora deserves separate mention because it is architecturally different: the
storage layer is distributed across three AZs with six copies, decoupled from
compute. Consequences:

- Up to 15 read replicas with ~millisecond replica lag
- Failover in seconds rather than a minute or more
- Storage grows automatically to 128 TB
- **Aurora Serverless v2** scales capacity up and down with load

It costs more per hour than plain RDS and is worth it for anything where
availability or read scaling matters.

---

## DB instances

A **DB instance** is the running database — an EC2-class machine you do not
administer.

| Choice | Detail |
|--------|--------|
| **Instance class** | `db.t4g` burstable, `db.m` general purpose, `db.r` memory optimised. Databases are usually memory-bound, so `db.r` is common |
| **Storage** | gp3 (general purpose SSD), io1/io2 (provisioned IOPS), or magnetic (legacy) |
| **Storage autoscaling** | Grows the volume automatically up to a ceiling you set. Turn this on |
| **Multi-AZ** | Synchronous standby in another AZ |
| **Endpoint** | A DNS name — `mydb.abc123.ap-south-1.rds.amazonaws.com`. Always connect via this, never an IP, because failover changes the IP behind it |

---

## Security

Layered, and all of it worth setting:

| Layer | Control |
|-------|---------|
| **Network placement** | Put the instance in **private subnets** with no public accessibility. This is the most important single setting |
| **Security group** | Allow 5432/3306 **only from the application's security group**, never a CIDR, never `0.0.0.0/0` |
| **DB subnet group** | The set of subnets RDS may place the instance and its standby in — needs at least two AZs |
| **IAM** | Controls who may manage the instance. With **IAM database authentication**, it can also control who may log in — temporary tokens instead of passwords |
| **Encryption at rest** | KMS. **Must be enabled at creation** — an unencrypted instance cannot be encrypted later, only restored from a snapshot into a new encrypted instance |
| **Encryption in transit** | TLS, using the RDS CA bundle. Enforce it with `rds.force_ssl` |
| **Master password** | Store in **Secrets Manager**, with rotation. Never in application config, never in Terraform variables committed to a repository |

The single most common RDS mistake is `publicly_accessible = true` with an open
security group. A database should be reachable from the application tier and
nothing else.

---

## Backups

Two separate mechanisms, often confused:

| | Automated backups | Manual snapshots |
|---|---|---|
| Taken | Daily, during a backup window, plus continuous transaction logs | When you ask |
| Retention | **0–35 days** | Until explicitly deleted |
| Deleted with the instance | **Yes** (unless a final snapshot is taken) | No |
| Enables PITR | **Yes** | No |

**Point-in-time recovery** restores to any second within the retention window,
by replaying transaction logs onto the nearest daily backup. Note that a
restore always creates a **new instance** — it never overwrites the existing
one, so recovery means restore, verify, then repoint the application.

Setting retention to 0 disables automated backups entirely. That is a
production outage waiting to happen.

---

## Multi-AZ

**Multi-AZ** maintains a **synchronous standby replica** in a different
Availability Zone.

- The standby is **not readable**. It serves availability, not scale — this is
  the most common misconception
- Failover is automatic, typically 60–120 seconds, and the **endpoint DNS
  repoints** to the new primary
- Triggered by AZ failure, instance failure, storage failure, or by patching —
  AWS patches the standby, fails over, then patches the old primary, which is
  how maintenance happens with ~a minute of downtime instead of an outage
- Synchronous replication means a small write-latency cost

**Multi-AZ DB cluster** is a newer variant with two *readable* standbys and
faster failover.

---

## Read replicas

**Read replicas** are **asynchronous** copies that serve read traffic.

| | Multi-AZ standby | Read replica |
|---|---|---|
| Replication | Synchronous | **Asynchronous** |
| Readable | **No** | **Yes** |
| Purpose | Availability | **Scaling reads** |
| Cross-region | No | **Yes** |
| Failover | Automatic | Manual promotion |

Properties that matter:

- **Replica lag is real.** A write to the primary is not instantly visible on a
  replica. Anything read-after-write — "save, then show the saved page" — must
  read from the primary
- Up to 5 replicas per instance (15 for Aurora)
- A replica can be **promoted** to a standalone primary, which is a disaster
  recovery path and a migration trick
- Cross-region replicas serve both low-latency reads for distant users and
  regional DR

The two are complementary, not alternatives: Multi-AZ for surviving failure,
read replicas for carrying read load.

---

## RDS use cases

| Scenario | Why |
|----------|-----|
| Traditional web application | Needs joins, transactions, ad-hoc queries |
| Reporting and BI | SQL aggregation is what relational engines are for |
| Lift-and-shift of an existing database | Same engine, no application rewrite |
| Anything with complex relationships | Foreign keys and referential integrity enforced by the engine |
| Financial / transactional systems | ACID across multiple tables |
| An application whose queries are not yet known | SQL lets you ask new questions without remodelling |

**Poor fits:** extreme write throughput at unbounded scale; key-value lookups
that need single-digit-millisecond latency under any load; schemaless data with
wildly varying shape.

---

# Choosing between them

| Question | DynamoDB | RDS |
|----------|----------|-----|
| Are the access patterns known and fixed? | Required | Not required |
| Do you need joins or ad-hoc queries? | No | Yes |
| Latency at scale | Single-digit ms, flat | Degrades without tuning |
| Scaling | Automatic, effectively unbounded | Vertical, plus read replicas |
| Operational burden | Near zero — no instance | Lower than self-managed, not zero |
| Cost model | Per request / per capacity unit | Per instance-hour, always on |
| Schema changes | Trivial — no schema | Migrations |

In practice, serious systems use both: RDS for the transactional core where
relationships matter, DynamoDB for the high-volume, narrow-access-pattern
pieces — sessions, carts, event logs, feature flags.

---

## How this connects to the rest of the session

The Terraform demo creates S3, not a database, but the pattern is identical:
declare the resource, let Terraform reconcile it, keep the configuration in
version control. The same `main.tf` could just as easily hold an
`aws_dynamodb_table` or an `aws_db_instance` — and in a real project it would,
because the state bucket this session builds is conventionally paired with a
DynamoDB table for state locking. That table is the one DynamoDB use case every
Terraform user meets first.
